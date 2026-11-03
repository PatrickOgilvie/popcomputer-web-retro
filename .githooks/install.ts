/**
 * Installs the commit gate, `.githooks/pre-commit`, when `bun install` runs
 * in a git repository whose hooks nothing else installed. A repository whose
 * `core.hooksPath` names another directory, such as Lefthook's or Husky's,
 * keeps it: commit the gate's checks there instead.
 */
import { spawnSync } from 'node:child_process'

const git = (...args: string[]) => spawnSync('git', args, { encoding: 'utf8' })

if (git('rev-parse', '--is-inside-work-tree').stdout.trim() === 'true') {
  const current = git('config', '--get', 'core.hooksPath').stdout.trim()

  if (current === '') git('config', 'core.hooksPath', '.githooks')
  else if (current !== '.githooks') console.warn(`core.hooksPath is ${current}: run the checks in .githooks/pre-commit from there.`)
}
