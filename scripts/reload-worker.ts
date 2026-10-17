import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Runs the Worker's modules afresh when one of them changes in development.
 *
 * The Cloudflare plugin's Worker entry accepts Vite's hot updates, and a hot
 * update runs again only the module that changed and the modules that import
 * it. Changing an action would run src/routes.ts again against the src/app.ts
 * already loaded, registering every route a second time on its `routes`, and
 * every request would then fail with "GET /login is registered twice". A full
 * reload clears the Worker's modules and runs them all again, on a new app.
 *
 * The Worker's main module, `entry`, keeps Vite's own update: it runs again
 * alone, on the app and routes already loaded, and the Cloudflare plugin
 * restarts the dev server when what it exports changes.
 */
export function reloadWorkerModules(entry: string): Plugin {
  const main = resolve(entry)

  return {
    name: 'reload-worker-modules',
    hotUpdate({ file, modules }) {
      // The browser's modules update as usual, and a file the Worker never
      // loaded changes nothing in it.
      if (this.environment.name === 'client' || modules.length === 0 || resolve(file) === main) return

      this.environment.hot.send({ type: 'full-reload' })
      return []
    },
  }
}
