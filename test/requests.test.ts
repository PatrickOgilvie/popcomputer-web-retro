/**
 * Generated requests to every route, from a signed-out visitor, Ada and
 * Grace: any method, each path with each record it may name, the path spelled
 * other ways, and bodies, queries and headers a browser or an attacker sends.
 * Whatever arrives, each answer keeps the framework's rules (no 500, another
 * site's write refused, a signed-in page never kept by a shared cache, ...),
 * no one sees a note its author hasn't revealed, another team's retros, an
 * invite link their role doesn't show them or a session's token, no one
 * changes a team's records but the people its roles let, and a refused
 * request writes nothing.
 *
 * The forms come from the routes: an action that takes `form(Schema)` is
 * sent fields that pass it, so a new one is fuzzed once it is registered. A
 * new placeholder in src/paths.ts is a type error at `params` until it is
 * given values here.
 */
import { expect, test } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import { Redacted } from 'effect'
import {
  brokenPromises,
  fuzz,
  fuzzRequest,
  fuzzTimeout,
  leaks,
  refusedWrites,
  sendFuzzRequest,
  show,
  strangerWrites,
  type FuzzRequest,
  type Refusal,
  type RowsChange,
} from '@popcomputer/web/fuzz'
import { signedIn, testEnv } from '@popcomputer/web/testing'
import { routes } from '../src/app'
import { createDb, type Database } from '../src/db'
import { paths } from '../src/paths'
import { invites, memberships, notes, retros, session, teams, user, votes } from '../src/schema'
import { app, freshBindings } from './app'

// Text only one member may see: an answer that shows it to anyone else leaked
// it. Each one's note in the retro still collecting notes, which no one else
// sees until the voting starts, Grace's an action item, which the team page
// lists once it's revealed; the Platform team's invite link, which only
// Ada, its owner, may see, and Grace, a member, may not; Grace's own team's
// retro and its notes; and each one's session token, which no page shows.
const canaries = {
  ada: { note: 'canary-ada-note-7f3a', invite: 'canary-ada-invite-2b9e', token: 'token-ada-0c51' },
  grace: { note: 'canary-grace-note-91c2', retro: 'canary-grace-retro-44d0', notes: 'canary-grace-notes-e6a1', token: 'token-grace-5e8d' },
}

const since = new Date(Date.UTC(2026, 0, 1))
const until = new Date(Date.UTC(2100, 0, 1))

/** The seed's invite links that still work: the others expired at `since`. */
const live = new Set([canaries.ada.invite, 'invite-grace'])

const userRow = (id: string, name: string) => ({
  id,
  name,
  email: `${id}@example.com`,
  emailVerified: true,
  image: null,
  createdAt: since,
  updatedAt: since,
  isAnonymous: false,
})

const member = (id: 'ada' | 'grace', name: string) => ({
  user: userRow(id, name),
  session: {
    id: `s-${id}`,
    userId: id,
    token: canaries[id].token,
    expiresAt: until,
    createdAt: since,
    updatedAt: since,
    ipAddress: null,
    userAgent: null,
  },
})

const people = { ada: member('ada', 'Ada'), grace: member('grace', 'Grace') }

type Person = keyof typeof people

/** A member as the request sees them signed in: the session's token is Redacted there. */
const signedInAs = (person: Person) => {
  const { user, session } = people[person]

  return { user, session: { ...session, token: Redacted.make(session.token) } }
}

/**
 * Two teams. Platform: Ada owns it, Alan is an admin and Grace a member, so
 * Grace takes part but runs nothing. Grace's own team, which Ada isn't in,
 * with a live invite link and an expired one. Alan never signs in.
 */
async function seed(db: Database): Promise<void> {
  await db.insert(user).values([people.ada.user, people.grace.user, userRow('alan', 'Alan')])
  await db.insert(session).values([people.ada.session, people.grace.session])
  await db.insert(teams).values([
    { id: 't-platform', slug: 'platform', name: 'Platform' },
    { id: 't-grace', slug: 'grace-team', name: 'Design guild' },
  ])
  await db.insert(memberships).values([
    { teamId: 't-platform', userId: 'ada', role: 'owner' },
    { teamId: 't-platform', userId: 'alan', role: 'admin' },
    { teamId: 't-platform', userId: 'grace', role: 'member' },
    { teamId: 't-grace', userId: 'grace', role: 'owner' },
    { teamId: 't-grace', userId: 'alan', role: 'member' },
  ])
  await db.insert(invites).values([
    { token: canaries.ada.invite, teamId: 't-platform', createdBy: 'ada', expiresAt: until },
    { token: 'invite-grace', teamId: 't-grace', createdBy: 'grace', expiresAt: until },
    { token: 'invite-old', teamId: 't-grace', createdBy: 'grace', expiresAt: since },
  ])
  // Each retro starts collecting, as the triggers ask, then moves on.
  await db.insert(retros).values([
    { id: 'r-voting', teamId: 't-platform', title: 'Sprint 42', votesPerPerson: 2, createdBy: 'ada' },
    { id: 'r-writing', teamId: 't-platform', title: 'Sprint 43', createdBy: 'ada' },
    { id: 'r-grace', teamId: 't-grace', title: canaries.grace.retro, createdBy: 'grace' },
  ])
  await db.insert(notes).values([
    { id: 'n-ada', retroId: 'r-voting', authorId: 'ada', column: 'went_well', body: 'Shipped on time' },
    { id: 'n-grace', retroId: 'r-voting', authorId: 'grace', column: 'to_improve', body: 'Flaky tests' },
    { id: 'n-action', retroId: 'r-writing', authorId: 'alan', column: 'action', body: 'Fix the flaky tests' },
    { id: 'n-ada-hidden', retroId: 'r-writing', authorId: 'ada', column: 'to_improve', body: canaries.ada.note },
    { id: 'n-grace-hidden', retroId: 'r-writing', authorId: 'grace', column: 'action', body: canaries.grace.note },
    { id: 'n-grace-team', retroId: 'r-grace', authorId: 'grace', column: 'went_well', body: canaries.grace.notes },
  ])
  await db.update(retros).set({ phase: 'voting' }).where(inArray(retros.id, ['r-voting', 'r-grace']))
  await db.insert(votes).values([
    { retroId: 'r-voting', noteId: 'n-ada', userId: 'grace' },
    { retroId: 'r-voting', noteId: 'n-grace', userId: 'ada' },
  ])
  await db.update(retros).set({ phase: 'discussing' }).where(eq(retros.id, 'r-grace'))
}

const requests = fuzzRequest({
  paths,
  routes,
  // Each team's records, so each also names the other team's under the
  // wrong one: a stranger's team is the 404 a missing one is, and another
  // team's retro or note under this team's address is too. Few values, as a
  // nested path reaches its action only when all three agree.
  params: {
    team: ['platform', 'grace-team'],
    retro: ['r-voting', 'r-writing', 'r-grace'],
    note: ['n-ada', 'n-grace', 'n-action', 'n-grace-hidden', 'n-grace-team'],
    member: ['ada', 'grace', 'alan', 'missing'],
    token: ['invite-grace', 'invite-old', 'missing'],
  },
  people: ['ada', 'grace'],
})

/** What the request may change: the users, and each table the routes write, as their rows. */
async function snapshot(db: Database) {
  const [users, teamRows, membershipRows, inviteRows, retroRows, noteRows, voteRows] = await Promise.all([
    db.select({ id: user.id }).from(user).orderBy(user.id),
    db.select({ id: teams.id, slug: teams.slug, name: teams.name }).from(teams).orderBy(teams.id),
    db.select({ teamId: memberships.teamId, userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .orderBy(memberships.teamId, memberships.userId),
    db.select({ token: invites.token, teamId: invites.teamId, expiresAt: invites.expiresAt }).from(invites).orderBy(invites.token),
    db.select({
      id: retros.id,
      teamId: retros.teamId,
      title: retros.title,
      phase: retros.phase,
      votesPerPerson: retros.votesPerPerson,
      closedAt: retros.closedAt,
    })
      .from(retros)
      .orderBy(retros.id),
    db.select({ id: notes.id, retroId: notes.retroId, authorId: notes.authorId, column: notes.column, body: notes.body, doneAt: notes.doneAt })
      .from(notes)
      .orderBy(notes.id),
    db.select({ id: votes.id, retroId: votes.retroId, noteId: votes.noteId, userId: votes.userId }).from(votes).orderBy(votes.id),
  ])

  return { users, teams: teamRows, memberships: membershipRows, invites: inviteRows, retros: retroRows, notes: noteRows, votes: voteRows }
}

type World = Awaited<ReturnType<typeof snapshot>>

/** Who is in which team, without their role: whether a membership may exist at all. */
type Membership = { readonly teamId: string; readonly userId: string }

const membershipKey = (row: Membership) => `${row.teamId}/${row.userId}`
const membershipOf = (row: Membership): Membership => ({ teamId: row.teamId, userId: row.userId })

/** A note as its author wrote it: whether it's ticked off is anyone's in the team. */
const withoutDoneAt = (note: World['notes'][number]) => ({ id: note.id, retroId: note.retroId, authorId: note.authorId, column: note.column, body: note.body })

/**
 * Who may change what. A retro's records are shared within its team rather
 * than owned by one member, so no binding says `ownedBy`, and
 * `ownership(routes, table)` has no owner to read. Instead each table's rule
 * is the app's own, from the roles the sender held before the request:
 *
 * - a retro and an invite link are written by the team's owner and admins;
 * - a note is put up and taken down by its author, and ticked off by anyone
 *   in its team;
 * - a vote is cast and taken back by its member;
 * - a membership is made by its member, starting a team or joining one
 *   through its live invite link; ended by its member leaving, by the
 *   team's owner, or by an admin for a member; and its role changed by the
 *   team's owner; the owner's own never changes or ends;
 * - a team is made by its owner, and never changed.
 *
 * A record removed with its retro or note is judged by that removal, and the
 * teams a visitor gets by starting the demo are the new guest's.
 * `strangerWrites` reads each table with keys whose owner is the sender
 * where the rule lets them write the row, and otherwise those it names.
 */
function teamWrites(sent: FuzzRequest<Person>, before: World, after: World): string[] {
  const sender = sent.person
  const roleIn = (teamId: string | undefined) => before.memberships.find((row) => row.teamId === teamId && row.userId === sender)?.role
  const inTeam = (teamId: string | undefined) => roleIn(teamId) !== undefined
  const runs = (teamId: string | undefined) => roleIn(teamId) === 'owner' || roleIn(teamId) === 'admin'
  const teamOf = (retroId: string) => [...before.retros, ...after.retros].find((retro) => retro.id === retroId)?.teamId
  const ownerOf = (teamId: string) => after.memberships.find((row) => row.teamId === teamId && row.role === 'owner')?.userId
  const team = (teamId: string | undefined) => `team ${teamId ?? 'unknown'}`

  // The teams the request made. A visitor who starts the demo becomes a new
  // guest, whose teams and everything in them are theirs: left out below.
  const newcomers = new Set(after.users.map((row) => row.id).filter((id) => !before.users.some((was) => was.id === id)))
  const made = after.teams.map((row) => row.id).filter((id) => !before.teams.some((was) => was.id === id))
  const demo = new Set(sender === null ? made.filter((id) => newcomers.has(ownerOf(id) ?? '')) : [])
  const started = made.filter((id) => !demo.has(id))

  /** A table's rows on each side, without the demo's, nor those `removedWith` says went with their retro or note. */
  const rows = <Row>(table: (world: World) => ReadonlyArray<Row>, teamId: (row: Row) => string | undefined, removedWith: (row: Row) => boolean = () => false) => {
    const kept = (world: World) => table(world).filter((row) => !demo.has(teamId(row) ?? '') && !removedWith(row))

    return { before: kept(before), after: kept(after) }
  }
  /** Only the rows both sides hold, for a field whose rule isn't the row's own. */
  const both = <Row>(change: RowsChange<Row>, key: (row: Row) => string): RowsChange<Row> => ({
    before: change.before.filter((row) => change.after.some((now) => key(now) === key(row))),
    after: change.after.filter((row) => change.before.some((was) => key(was) === key(row))),
  })
  /** strangerWrites' keys: a row's owner is the sender where `may` lets them write it, and otherwise whom `owner` names. */
  const keys = <Row>(id: (row: Row) => string, may: (row: Row) => boolean, owner: (row: Row) => string) => ({
    id,
    owner: (row: Row) => (sender !== null && may(row) ? sender : owner(row)),
  })

  const retroGone = (retroId: string) => !after.retros.some((retro) => retro.id === retroId)
  const noteGone = (noteId: string) => !after.notes.some((note) => note.id === noteId)

  // A membership of a team that was there before is made only through one of its live invite links.
  const [, spelled = ''] = /^\/+join\/+([^/]+)\/*$/i.exec(sent.path) ?? []
  const token = URL.canParse(`http://localhost/${spelled}`) ? decodeURIComponent(new URL(`http://localhost/${spelled}`).pathname.slice(1)) : spelled
  const joins = (teamId: string) => before.invites.some((invite) => invite.teamId === teamId && live.has(invite.token) && invite.token === token)
  const mayJoin = (row: Membership) => row.userId === sender && (started.includes(row.teamId) || joins(row.teamId))
  const mayEnd = (row: Membership) => {
    const role = before.memberships.find((was) => membershipKey(was) === membershipKey(row))?.role

    if (role === 'owner') return false

    return row.userId === sender || roleIn(row.teamId) === 'owner' || (roleIn(row.teamId) === 'admin' && role === 'member')
  }
  const existed = (row: Membership) => before.memberships.some((was) => membershipKey(was) === membershipKey(row))

  const membershipRows = rows((world) => world.memberships, (row) => row.teamId)
  const noteRows = rows((world) => world.notes, (row) => teamOf(row.retroId), (row) => retroGone(row.retroId))

  return [
    ...started.filter((id) => ownerOf(id) !== sender).map((id) => `${sender ?? 'a visitor'} made ${id}, owned by ${ownerOf(id) ?? 'no one'}`),
    ...strangerWrites(sent, rows((world) => world.teams, (row) => row.id), keys((row) => row.id, (row) => started.includes(row.id), (row) => team(row.id))),
    ...strangerWrites(
      sent,
      { before: membershipRows.before.map(membershipOf), after: membershipRows.after.map(membershipOf) },
      keys(membershipKey, (row) => (existed(row) ? mayEnd(row) : mayJoin(row)), (row) => team(row.teamId))
    ),
    ...strangerWrites(
      sent,
      both(membershipRows, membershipKey),
      keys<World['memberships'][number]>(membershipKey, (row) => roleIn(row.teamId) === 'owner' && row.role !== 'owner', (row) => team(row.teamId))
    ),
    ...strangerWrites(sent, rows((world) => world.invites, (row) => row.teamId), keys((row) => row.token, (row) => runs(row.teamId), (row) => team(row.teamId))),
    ...strangerWrites(sent, rows((world) => world.retros, (row) => row.teamId), keys((row) => row.id, (row) => runs(row.teamId), (row) => team(row.teamId))),
    ...strangerWrites(
      sent,
      { before: noteRows.before.map(withoutDoneAt), after: noteRows.after.map(withoutDoneAt) },
      keys((row) => row.id, (row) => row.authorId === sender && inTeam(teamOf(row.retroId)), (row) => row.authorId ?? 'no one')
    ),
    ...strangerWrites(sent, both(noteRows, (row) => row.id), keys((row) => row.id, (row) => inTeam(teamOf(row.retroId)), (row) => team(teamOf(row.retroId)))),
    ...strangerWrites(
      sent,
      rows((world) => world.votes, (row) => teamOf(row.retroId), (row) => retroGone(row.retroId) || noteGone(row.noteId)),
      keys((row) => String(row.id), (row) => row.userId === sender && inTeam(teamOf(row.retroId)), (row) => row.userId)
    ),
  ]
}

/**
 * How many cases were answered, rendered a page, and wrote each kind of
 * record. An app that refuses everything keeps every rule, so each must
 * happen: a failed form's 303 back reaches nothing.
 */
const reached = { cases: 0, rendered: 0, teams: 0, members: 0, invites: 0, retros: 0, notes: 0, votes: 0 }

async function send(sent: FuzzRequest<Person>): Promise<Refusal> {
  const bindings = await freshBindings()
  const db = createDb(bindings.DB)

  await seed(db)

  const before = await snapshot(db)
  const env = sent.person === null ? testEnv(bindings) : testEnv(signedIn(signedInAs(sent.person)), bindings)
  const answer = await sendFuzzRequest(app, sent, env)

  // A request fetch refuses to make never reaches the Worker.
  if (answer === undefined) return undefined

  const after = await snapshot(db)
  // The demo a visitor starts writes every table, so it counts for none of them.
  const wrote = (table: Exclude<keyof World, 'users'>) => after.users.length === before.users.length && show(before[table]) !== show(after[table])

  reached.cases += 1
  if (answer.response.status === 200) reached.rendered += 1
  if (wrote('teams')) reached.teams += 1
  if (wrote('memberships')) reached.members += 1
  if (wrote('invites')) reached.invites += 1
  if (wrote('retros')) reached.retros += 1
  if (wrote('notes')) reached.notes += 1
  if (wrote('votes')) reached.votes += 1

  const broken = [
    ...brokenPromises(sent, answer),
    ...leaks(sent, answer, { ada: Object.values(canaries.ada), grace: Object.values(canaries.grace) }),
    ...teamWrites(sent, before, after),
    ...refusedWrites(answer, { before: [before], after: [after] }),
  ]

  return broken.length === 0 ? undefined : `${sent.method} ${sent.path}: ${broken.join('; ')}`
}

test('any request keeps the rules, and the team and retro forms reach their actions', async () => {
  await fuzz(requests, send, { runs: 200 })

  // A replay runs one case; a full run must have done each.
  if (reached.cases < 100) return

  expect(Object.entries(reached).filter(([, count]) => count === 0).map(([what]) => what)).toEqual([])
}, fuzzTimeout)
