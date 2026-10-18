import { Effect } from 'effect'
import { sweepSignInFailures } from '@popcomputer/web/auth'
import { app, routes } from './app'
import { sweepGuests } from './guests'
import './routes'

export default {
  fetch: app.fetch,
  // The daily Cron Trigger wrangler.jsonc declares: it clears the counts of
  // failed sign-ins whose window has passed, and guests older than a week,
  // with the teams only they were in.
  scheduled: routes.scheduled(() => Effect.all([sweepSignInFailures, sweepGuests], { discard: true })),
}
