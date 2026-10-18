// What each guest gets when they start the demo: a team of their own with
// three teammates, last sprint's retro closed with its actions, and this
// sprint's open for notes, the teammates' already written and hidden; and a
// second team, where the guest is a member rather than the owner.
import { and, eq } from 'drizzle-orm'
import { DateTime, Effect } from 'effect'
import { dbBatch, type BatchStatement, type DatabaseType } from '@popcomputer/web/effect'
import type { NoteColumn, Phase } from './forms'
import { DEMO_PREFIX } from './guests'
import { memberships, notes, retros, teams, user, votes } from './schema'
import { slugFor } from './actions/teams'

type Column = typeof NoteColumn.Type

/** The seed's teammates: people of its own, in every guest's teams, who never sign in. */
export const teammates = {
  grace: { id: `${DEMO_PREFIX}grace`, name: 'Grace Hopper', email: 'grace@teammates.invalid' },
  alan: { id: `${DEMO_PREFIX}alan`, name: 'Alan Turing', email: 'alan@teammates.invalid' },
  katherine: { id: `${DEMO_PREFIX}katherine`, name: 'Katherine Johnson', email: 'katherine@teammates.invalid' },
} as const

type Teammate = keyof typeof teammates

const DAY = 24 * 60 * 60 * 1000

interface DemoNote {
  readonly column: Column
  readonly body: string
  /** A teammate, or the guest. */
  readonly by: Teammate | 'guest'
  readonly votes?: ReadonlyArray<Teammate | 'guest'>
  readonly done?: boolean
}

/**
 * A retro's statements, in the order its triggers allow: its notes while it
 * collects them, its votes while it's voting, then the phase it's left in.
 */
function retroStatements(
  db: DatabaseType,
  retro: { id: string; teamId: string; title: string; createdBy: string; createdAt: Date },
  board: ReadonlyArray<DemoNote>,
  phase: typeof Phase.Type,
  guest: string,
  closedAt: Date | null = null
): Array<BatchStatement> {
  const person = (who: Teammate | 'guest') => (who === 'guest' ? guest : teammates[who].id)
  const ids = board.map(() => crypto.randomUUID())
  const where = eq(retros.id, retro.id)

  return [
    db.insert(retros).values({ ...retro, phase: 'collecting' }),
    ...board.map((note, index) =>
      db.insert(notes).values({
        id: ids[index],
        retroId: retro.id,
        authorId: person(note.by),
        column: note.column,
        body: note.body,
        createdAt: new Date(retro.createdAt.getTime() + index * 60_000),
      })
    ),
    db.update(retros).set({ phase: 'voting' }).where(where),
    ...board.flatMap((note, index) =>
      (note.votes ?? []).map((voter) =>
        db.insert(votes).values({ retroId: retro.id, noteId: ids[index] ?? '', userId: person(voter) })
      )
    ),
    db.update(retros).set({ phase, closedAt }).where(where),
    ...board.flatMap((note, index) =>
      note.done === true && closedAt !== null
        ? [db.update(notes).set({ doneAt: closedAt }).where(and(eq(notes.id, ids[index] ?? ''), eq(notes.retroId, retro.id)))]
        : []
    ),
  ]
}

/** Gives a new guest their teams and retros, in one batch: all of it, or none. */
export const seedDemo = (guest: string) =>
  Effect.gen(function* () {
    const now = DateTime.toDateUtc(yield* DateTime.now).getTime()
    const platform = crypto.randomUUID()
    const guild = crypto.randomUUID()

    yield* dbBatch((db) => [
      ...Object.values(teammates).map((teammate) => db.insert(user).values({ ...teammate, emailVerified: false }).onConflictDoNothing()),

      db.insert(teams).values({ id: platform, slug: slugFor('Platform'), name: 'Platform' }),
      db.insert(memberships).values({ teamId: platform, userId: guest, role: 'owner' }),
      db.insert(memberships).values({ teamId: platform, userId: teammates.grace.id, role: 'admin' }),
      db.insert(memberships).values({ teamId: platform, userId: teammates.alan.id, role: 'member' }),
      db.insert(memberships).values({ teamId: platform, userId: teammates.katherine.id, role: 'member' }),
      ...retroStatements(
        db,
        { id: crypto.randomUUID(), teamId: platform, title: 'Sprint 41', createdBy: guest, createdAt: new Date(now - 14 * DAY) },
        [
          { column: 'went_well', body: 'The new deploy pipeline saved us hours.', by: 'grace', votes: ['guest', 'alan', 'katherine'] },
          { column: 'went_well', body: 'Pairing on the billing bug.', by: 'alan', votes: ['grace'] },
          { column: 'to_improve', body: 'Flaky end-to-end tests blocked two releases.', by: 'katherine', votes: ['guest', 'grace', 'alan', 'katherine'] },
          { column: 'to_improve', body: 'Too many meetings on Wednesdays.', by: 'guest', votes: ['alan', 'guest'] },
          { column: 'action', body: 'Quarantine the flaky tests and fix one a day.', by: 'grace', done: true },
          { column: 'action', body: 'Make Wednesday afternoons meeting-free.', by: 'guest' },
        ],
        'closed',
        guest,
        new Date(now - 13 * DAY)
      ),
      // This sprint's: the teammates have written their notes, and voted, but
      // the guest sees blank cards until they start the voting.
      ...retroStatements(
        db,
        { id: crypto.randomUUID(), teamId: platform, title: 'Sprint 42', createdBy: guest, createdAt: new Date(now - 60 * 60 * 1000) },
        [
          { column: 'went_well', body: 'Meeting-free Wednesdays actually happened.', by: 'alan', votes: ['grace'] },
          { column: 'went_well', body: 'Shipped the search rewrite a day early.', by: 'grace', votes: ['katherine', 'alan'] },
          { column: 'to_improve', body: 'Code review takes two days on average.', by: 'katherine', votes: ['grace', 'alan', 'katherine'] },
          { column: 'to_improve', body: 'We still don’t have staging data that looks real.', by: 'grace', votes: ['grace', 'katherine'] },
        ],
        'collecting',
        guest
      ),

      db.insert(teams).values({ id: guild, slug: slugFor('Design guild'), name: 'Design guild' }),
      db.insert(memberships).values({ teamId: guild, userId: teammates.grace.id, role: 'owner' }),
      db.insert(memberships).values({ teamId: guild, userId: guest, role: 'member' }),
      db.insert(memberships).values({ teamId: guild, userId: teammates.alan.id, role: 'member' }),
      ...retroStatements(
        db,
        { id: crypto.randomUUID(), teamId: guild, title: 'Design system review', createdBy: teammates.grace.id, createdAt: new Date(now - 2 * DAY) },
        [
          { column: 'went_well', body: 'Every product now uses the same buttons.', by: 'grace', votes: ['alan'] },
          { column: 'to_improve', body: 'Nobody knows which icon set is current.', by: 'alan', votes: ['grace'] },
          { column: 'to_improve', body: 'Dark mode still misses half the charts.', by: 'grace' },
        ],
        'voting',
        guest
      ),
    ])
  })
