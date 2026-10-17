import { describe, expect, test } from 'bun:test'

import { reloadWorkerModules } from './reload-worker'

const entry = '/app/src/worker.ts'

/** Runs the plugin's hot-update hook as Vite would, and what it sent the environment. */
function hotUpdate(environment: string, file: string, modules: ReadonlyArray<unknown> = [{}]) {
  const sent: Array<unknown> = []
  const hook = reloadWorkerModules(entry).hotUpdate as (this: unknown, options: unknown) => unknown
  const result = hook.call(
    { environment: { name: environment, hot: { send: (payload: unknown) => sent.push(payload) } } },
    { file, modules, type: 'update', timestamp: Date.now() }
  )

  return { result, sent }
}

describe('reloading the Worker in development', () => {
  test('a change to one of its modules reloads them all, in place of a hot update', () => {
    const { result, sent } = hotUpdate('my_app', '/app/src/actions/projects.ts')

    expect(sent).toEqual([{ type: 'full-reload' }])
    expect(result).toEqual([])
  })

  test('its main module keeps the hot update, which runs it again alone', () => {
    expect(hotUpdate('my_app', entry)).toEqual({ result: undefined, sent: [] })
  })

  test('the browser’s modules, and files the Worker never loaded, are left to Vite', () => {
    expect(hotUpdate('client', '/app/src/pages/Dashboard.tsx')).toEqual({ result: undefined, sent: [] })
    expect(hotUpdate('my_app', '/app/README.md', [])).toEqual({ result: undefined, sent: [] })
  })
})
