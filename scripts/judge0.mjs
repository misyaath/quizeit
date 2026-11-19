import { setTimeout as delay } from 'node:timers/promises'
import { codingLanguages, codingOptions, maxRunOutput } from '../src/coding.js'
import { ApiError } from './openai.mjs'
import { projectSource } from './project-source.mjs'
import { defaults } from '../src/execution-settings.js'

const encode = value => Buffer.from(value, 'utf8').toString('base64')
const decode = value => typeof value === 'string' ? Buffer.from(value, 'base64').toString('utf8') : ''
const normalize = value => value.replace(/\r\n/g, '\n').trimEnd()

export function createJudge0({
  url = process.env.JUDGE0_URL || 'http://127.0.0.1:' + (process.env.JUDGE0_PORT || '2358'),
  token = process.env.JUDGE0_TOKEN,
  fetchJudge = fetch,
} = {}) {
  const base = url.replace(/\/+$/, '')
  let active = 0
  let configuration
  let configAt = 0
  let runtimes
  let runtimesAt = 0

  async function request(path, signal, payload) {
    try {
      const response = await fetchJudge(base + path, {
        signal, redirect: 'error',
        headers: { ...(token && { 'X-Auth-Token': token }), ...(payload && { 'Content-Type': 'application/json' }) },
        ...(payload && { method: 'POST', body: JSON.stringify(payload) }),
      })
      if (!response.ok) throw new ApiError(502, 'Judge0 rejected the request (HTTP ' + response.status + '). Check its configuration.')
      return await response.json()
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (signal.aborted) throw new ApiError(504, 'Judge0 took too long to return a result. Try again.')
      throw new ApiError(503, 'Judge0 is unavailable. Start the Docker services and try again.')
    }
  }

  async function installedRuntimes() {
    if (!runtimes || Date.now() - runtimesAt > 60_000) {
      const found = await request('/languages', AbortSignal.timeout(5000))
      if (!Array.isArray(found)) throw new ApiError(502, 'Judge0 did not return its runtime list.')
      runtimes = found.filter(item => Number.isInteger(item?.id) && typeof item.name === 'string')
        .sort((a, b) => b.id - a.id)
      runtimesAt = Date.now()
    }
    return runtimes
  }

  function runtimeFor(language, installed) {
    const entry = codingLanguages[language]
    const matches = installed.filter(item => entry.runtime.test(item.name))
    return matches.find(item => entry.preferred?.test(item.name)) ?? matches[0]
  }

  async function effectiveLimits(requested) {
    if (!configuration || Date.now() - configAt > 60_000) {
      configuration = await request('/config_info', AbortSignal.timeout(4000)).catch(() => ({}))
      configAt = Date.now()
    }
    const cap = (value, key) => Number.isFinite(configuration[key]) && configuration[key] > 0
      ? Math.min(value, configuration[key]) : value
    const wallSeconds = cap(requested.wallSeconds, 'max_wall_time_limit')
    return {
      cpuSeconds: Math.min(wallSeconds, cap(requested.cpuSeconds, 'max_cpu_time_limit')),
      wallSeconds, memoryKiB: cap(requested.memoryMiB * 1024, 'max_memory_limit'),
    }
  }

  async function runTest(runtime, source, test, limits) {
    const signal = AbortSignal.timeout((limits.wallSeconds + 20) * 1000)
    const created = await request('/submissions?base64_encoded=true&wait=false', signal, {
      language_id: runtime.id, source_code: encode(source), stdin: encode(test.stdin),
      enable_network: false, cpu_time_limit: limits.cpuSeconds, cpu_extra_time: 0,
      wall_time_limit: limits.wallSeconds, memory_limit: limits.memoryKiB,
      max_file_size: 128, number_of_runs: 1,
    })
    if (!/^[a-z0-9-]{8,100}$/i.test(created?.token ?? '')) throw new ApiError(502, 'Judge0 did not return a submission token.')
    let result
    while (!signal.aborted) {
      result = await request('/submissions/' + created.token + '?base64_encoded=true&fields=status,stdout,stderr,compile_output,time,memory', signal)
      if (![1, 2].includes(result?.status?.id)) break
      await delay(350)
    }
    if (signal.aborted) throw new ApiError(504, 'Judge0 took too long to return a result. Try again.')
    const status = result?.status?.id
    if (!Number.isInteger(status) || status === 13) throw new ApiError(502, 'Judge0 could not run this program. Check the worker and try again.')
    const stdout = decode(result.stdout)
    const passed = status === 3 && (test.expected === undefined || normalize(stdout) === normalize(test.expected))
    const time = Number.isFinite(Number(result.time)) && result.time != null ? Number(result.time) : null
    const memory = Number.isFinite(Number(result.memory)) && result.memory != null ? Number(result.memory) : null
    return test.hidden ? { result: { label: test.label, hidden: true, passed }, time, memory } : {
      time, memory, result: {
      label: test.label, passed,
      status: status === 3 && !passed ? 'Wrong output' : String(result.status.description).slice(0, 100),
      stdout: stdout.slice(0, maxRunOutput), expected: test.expected,
      stderr: decode(result.stderr).slice(0, maxRunOutput), compileOutput: decode(result.compile_output).slice(0, maxRunOutput),
      time, memory,
      },
    }
  }

  async function runCode(question, language, source, examplesOnly, { stdin, files, limits = defaults } = {}) {
    if (active >= 2) throw new ApiError(429, 'The code runner is busy. Try again in a moment.')
    active++
    try {
      const runtime = runtimeFor(language, await installedRuntimes())
      if (!runtime) throw new ApiError(422, codingLanguages[language].label + ' is not installed on this Judge0 worker.')
      const custom = stdin !== undefined
      const selected = custom ? [{ label: 'Custom input', stdin }] : question.tests.filter(test => !examplesOnly || !test.hidden)
      const executable = projectSource(language, source, files)
      const applied = await effectiveLimits(limits)
      const outcomes = []
      for (const test of selected) outcomes.push(await runTest(runtime, executable, test, applied))
      const tests = outcomes.map(item => item.result)
      return { language, runtime: runtime.name, ...(custom && { mode: 'custom' }), passed: tests.every(test => test.passed), tests,
        limits: applied, cpuSeconds: outcomes.reduce((total, item) => total + (item.time ?? 0), 0),
        peakMemoryKiB: Math.max(0, ...outcomes.map(item => item.memory ?? 0)),
      }
    } finally {
      active--
    }
  }
  runCode.listLanguages = async () => {
    const installed = await installedRuntimes()
    return codingOptions().flatMap(option => {
      const runtime = runtimeFor(option.id, installed)
      return runtime ? [{ ...option, runtime: runtime.name }] : []
    })
  }
  return runCode
}
