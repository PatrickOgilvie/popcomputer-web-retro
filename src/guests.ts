// Guests: each visitor who starts the demo gets an account of their own, with
// a friendly name and nothing to remember, which is swept away after a week.
import { and, eq, lt, notExists, notLike, sql } from 'drizzle-orm'
import { DateTime, Duration, Effect } from 'effect'
import { dbBatch } from '@popcomputer/web/effect'
import { memberships, teams, user } from './schema'

/** How long a guest and their data last. */
export const GUEST_DAYS = 7

const adjectives = ['Brave', 'Bright', 'Calm', 'Clever', 'Curious', 'Eager', 'Gentle', 'Happy', 'Jolly', 'Keen', 'Lively', 'Lucky', 'Merry', 'Nimble', 'Quick', 'Sunny', 'Swift', 'Witty']
const animals = ['Badger', 'Falcon', 'Fox', 'Hare', 'Heron', 'Lynx', 'Otter', 'Owl', 'Panda', 'Puffin', 'Robin', 'Seal', 'Squirrel', 'Swan', 'Tiger', 'Wren']

function pick(words: ReadonlyArray<string>): string {
  const [random = 0] = crypto.getRandomValues(new Uint32Array(1))
  return words[random % words.length] ?? 'Guest'
}

/** A guest's name, such as Curious Otter: Better Auth's anonymous plugin asks for one per guest. */
export const guestName = (): string => `${pick(adjectives)} ${pick(animals)}`

/** The seed's teammates, who belong to every guest's teams and never sign in. */
export const DEMO_PREFIX = 'demo-'

/**
 * Deletes guests older than a week, and their memberships with them, then
 * every team nobody but the seed's teammates is left in, with its retros.
 * The daily Cron Trigger runs it.
 */
export const sweepGuests = Effect.gen(function* () {
  const cutoff = DateTime.toDateUtc(DateTime.subtractDuration(yield* DateTime.now, Duration.days(GUEST_DAYS)))

  yield* dbBatch((db) => [
    db.delete(user).where(and(eq(user.isAnonymous, true), lt(user.createdAt, cutoff))),
    db.delete(teams).where(
      notExists(
        db.select({ one: sql`1` })
          .from(memberships)
          .where(and(eq(memberships.teamId, teams.id), notLike(memberships.userId, `${DEMO_PREFIX}%`)))
      )
    ),
  ])
})
