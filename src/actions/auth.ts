import { Effect } from 'effect'
import { action, intendedUrl, invalid } from '@popcomputer/web/effect'
import { betterAuthRedirect } from '@popcomputer/web/auth'
import { seedDemo } from '../demo'
import { paths } from '../paths'

/**
 * Starts the demo: signs the visitor in as a guest of their own, through
 * Better Auth's anonymous plugin, gives them their teams and retros, and sends them
 * where they were going. A guest is a sign-in like any other, so the sign-in
 * limits count it by address.
 */
export const startDemo = action(
  Effect.gen(function* () {
    const destination = yield* intendedUrl(paths.dashboard)

    return yield* betterAuthRedirect('signInAnonymous', {}, {
      redirectTo: (result) => seedDemo(result.user.id).pipe(Effect.as(destination)),
    })
  }).pipe(
    Effect.catchTag('AuthRateLimitError', (error) =>
      invalid({ form: `Lots of demos have started from here just now. Try again in ${error.retryAfterSeconds ?? 60} seconds.` })
    )
  )
)
