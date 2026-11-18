import { codingLanguages } from '../src/coding.js'

export function projectSource(language, source, files) {
  if (!Object.keys(files ?? {}).length) return source
  const entry = codingLanguages[language].filename
  const payload = Buffer.from(JSON.stringify({ ...files, [entry]: source })).toString('base64')
  // These launchers materialize the question's files inside the existing Judge0 sandbox.
  // Filenames have already been checked against the question's file list.
  switch (language) {
    case 'python':
      return `import base64, json, os, pathlib, runpy, sys, tempfile
root = pathlib.Path(tempfile.mkdtemp(dir=".")).resolve()
for name, text in json.loads(base64.b64decode("${payload}")).items():
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
os.chdir(root)
sys.path.insert(0, str(root))
runpy.run_path(str(root / "${entry}"), run_name="__main__")
`
    case 'javascript':
      return `const fs = require('fs'), path = require('path');
const root = fs.mkdtempSync(path.join(process.cwd(), 'project-'));
const files = JSON.parse(Buffer.from('${payload}', 'base64').toString('utf8'));
for (const [name, text] of Object.entries(files)) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text, 'utf8');
}
process.chdir(root);
const entry = path.join(root, '${entry}');
process.argv[1] = entry;
require(entry);
`
    case 'php':
      return `<?php
$root = getcwd() . '/quiz-project';
mkdir($root);
$files = json_decode(base64_decode('${payload}'), true);
foreach ($files as $name => $text) {
    $target = $root . '/' . $name;
    if (!is_dir(dirname($target))) {
        mkdir(dirname($target), 0700, true);
    }
    file_put_contents($target, $text);
}
chdir($root);
require $root . '/${entry}';
`
  }
}
