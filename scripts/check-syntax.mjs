import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const files = [
  path.join('bin', 'cli.js'),
  ...fs.readdirSync('src')
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => path.join('src', name)),
]

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
