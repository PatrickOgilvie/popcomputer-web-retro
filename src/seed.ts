import { eq } from 'drizzle-orm'
import { createAuth } from './auth'
import type { Database } from './db'
import type { Bindings } from './env'
import type { NoteColumn } from './forms'
import { memberships, notes, retros, teams, votes } from './schema'

/** The member `bun run db:seed` creates, to sign in as locally. */
export const seedMember = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'at least twelve characters',
} as const

/** Ada's teammates, who sign in with the same password. */
const teammates = [
  { name: 'Grace Hopper', email: 'grace@example.com', password: seedMember.password },
  { name: 'Alan Turing', email: 'alan@example.com', password: seedMember.password },
  { name: 'Katherine Johnson', email: 'katherine@example.com', password: seedMember.password },
] as const

type Column = typeof NoteColumn.Type

const DAY = 24 * 60 * 60 * 1000

/**
 * What the local database holds after `bun run db:seed`: Ada owns a team with
 * three teammates, with last sprint's retro closed and its actions half done,
 * and this sprint's open for voting; and she's a member of a second team.
 * Each step goes through the phase the retro's triggers allow, as the app's
 * own actions do. It runs in Bun on the local D1 database once the
 * migrations are applied, never on the deployed one.
 */
export async function seed(db: Database, env: Bindings): Promise<void> {
  // Through Better Auth, as the sign-up form does, so the passwords sign in.
  const auth = createAuth({ db, secret: env.BETTER_AUTH_SECRET, baseURL: 'http://localhost' })
  const people: Array<string> = []
  for (const person of [seedMember, ...teammates]) {
    const { user } = await auth.api.signUpEmail({ body: { ...person } })
    people.push(user.id)
  }
  const [ada = '', grace = '', alan = '', katherine = ''] = people
  const now = Date.now()

  await db.insert(teams).values([
    { id: 'team-platform', slug: 'platform-7k2m', name: 'Platform' },
    { id: 'team-design', slug: 'design-guild-q8wr', name: 'Design guild' },
  ])
  await db.insert(memberships).values([
    { teamId: 'team-platform', userId: ada, role: 'owner' },
    { teamId: 'team-platform', userId: grace, role: 'admin' },
    { teamId: 'team-platform', userId: alan, role: 'member' },
    { teamId: 'team-platform', userId: katherine, role: 'member' },
  ])
  await db.insert(memberships).values([
    { teamId: 'team-design', userId: grace, role: 'owner' },
    { teamId: 'team-design', userId: ada, role: 'member' },
  ])

  /** Writes a retro's notes, then its votes, each in the phase that takes them. */
  async function runRetro(
    id: string,
    title: string,
    startedDaysAgo: number,
    board: ReadonlyArray<{ column: Column; body: string; by: string; votes?: ReadonlyArray<string>; done?: boolean }>
  ) {
    await db.insert(retros).values({ id, teamId: 'team-platform', title, createdBy: ada, createdAt: new Date(now - startedDaysAgo * DAY) })
    const ids = board.map(() => crypto.randomUUID())
    for (const [index, note] of board.entries()) {
      await db.insert(notes).values({
        id: ids[index],
        retroId: id,
        authorId: note.by,
        column: note.column,
        body: note.body,
        createdAt: new Date(now - startedDaysAgo * DAY + index * 60_000),
      })
    }
    await db.update(retros).set({ phase: 'voting' }).where(eq(retros.id, id))
    for (const [index, note] of board.entries()) {
      for (const voter of note.votes ?? []) await db.insert(votes).values({ retroId: id, noteId: ids[index] ?? '', userId: voter })
    }
    return board.flatMap((note, index) => (note.done === true ? [ids[index] ?? ''] : []))
  }

  const doneInLastSprint = await runRetro('retro-sprint-41', 'Sprint 41', 14, [
    { column: 'went_well', body: 'The new deploy pipeline saved us hours.', by: grace, votes: [ada, alan, katherine] },
    { column: 'went_well', body: 'Pairing on the billing bug.', by: alan, votes: [grace] },
    { column: 'to_improve', body: 'Flaky end-to-end tests blocked two releases.', by: katherine, votes: [ada, grace, alan, katherine, ada] },
    { column: 'to_improve', body: 'Too many meetings on Wednesdays.', by: ada, votes: [alan, katherine] },
    { column: 'action', body: 'Quarantine the flaky tests and fix one a day.', by: grace, done: true },
    { column: 'action', body: 'Make Wednesday afternoons meeting-free.', by: ada },
  ])
  await db.update(retros).set({ phase: 'closed', closedAt: new Date(now - 13 * DAY) }).where(eq(retros.id, 'retro-sprint-41'))
  for (const id of doneInLastSprint) await db.update(notes).set({ doneAt: new Date(now - 5 * DAY) }).where(eq(notes.id, id))

  await runRetro('retro-sprint-42', 'Sprint 42', 0, [
    { column: 'went_well', body: 'Meeting-free Wednesdays actually happened.', by: alan, votes: [grace] },
    { column: 'went_well', body: 'Shipped the search rewrite a day early.', by: grace, votes: [katherine, alan] },
    { column: 'to_improve', body: 'Code review takes two days on average.', by: katherine, votes: [grace, alan] },
    { column: 'to_improve', body: 'On-call handover notes are hard to find.', by: alan },
    { column: 'to_improve', body: 'We still don’t have staging data that looks real.', by: grace, votes: [katherine] },
  ])

  console.log(`Sign in as ${seedMember.email}, with the password "${seedMember.password}".`)
}
