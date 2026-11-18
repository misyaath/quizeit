import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const envFile = 'local-data/judge0.env'
const compose = ['compose', '--env-file', envFile, '-p', 'azure-study-judge0', '-f', 'compose.judge0.yml']

function docker(args, capture = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  return result.stdout?.trim()
}

if (process.argv.includes('--stop')) {
  docker([...compose, 'stop'])
} else {
  const cgroupVersion = docker(['info', '--format', '{{.CgroupVersion}}'], true)
  const secrets = ['JUDGE0_TOKEN', 'JUDGE0_POSTGRES_PASSWORD', 'JUDGE0_REDIS_PASSWORD']
  mkdirSync('local-data', { recursive: true, mode: 0o700 })
  try {
    const contents = secrets.map(key => key + '=' + randomBytes(32).toString('hex')).join('\n')
    writeFileSync(envFile, contents + '\n', { mode: 0o600, flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }

  if (cgroupVersion === '2') {
    compose.push('-f', 'compose.judge0.cgroup-v2.yml')
    docker([...compose, 'build', 'server'])
  }
  docker([...compose, 'up', '-d', '--no-build', '--wait', '--wait-timeout', '90'])
  console.log('Judge0 is available at http://127.0.0.1:2358.')
}
