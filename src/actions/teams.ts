import { and, asc, count, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'
import { DateTime, Duration, Effect } from 'effect'
import {
  action,
  authorize,
  back,
  bound,
  dbBatch,
  dbMutation,
  dbQuery,
  flash,
  forbidden,
  redirect,
  render,
  uniqueFieldErrors,
  validateRequest,
} from '@popcomputer/web/effect'
import { rowOf } from '@popcomputer/web/drizzle'
import { InviteToken, RoleForm, TeamForm } from '../forms'
import { can, CurrentMember, roleCan } from '../memberships'
import { paths } from '../paths'
import { invites, memberships, notes, retros, teams, user } from '../schema'

/** An invite link works for a week. */
const inviteLasts = Duration.days(7)

/** A team's address: its name, made safe for a URL, and four letters of its own. */
export function slugFor(name: string): string {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => 'abcdefghjkmnpqrstuvwxyz23456789'[byte % 31]).join('')
  return `${base || 'team'}-${suffix}`
}

/** A token no one can guess: 24 random bytes, base64url. */
const newToken = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

/** The member's teams, with their role in each. */
export const showDashboard = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    const rows = yield* dbQuery((db) =>
      db.select({ id: teams.id, slug: teams.slug, name: teams.name, role: memberships.role })
        .from(memberships)
        .innerJoin(teams, eq(teams.id, memberships.teamId))
        .where(eq(memberships.userId, auth.user.id))
        .orderBy(asc(teams.name))
    )
    const ids = rows.map((row) => row.id)
    const [people, active] = ids.length === 0
      ? [[], []]
      : yield* Effect.all([
          dbQuery((db) =>
            db.select({ teamId: memberships.teamId, count: count() })
              .from(memberships)
              .where(inArray(memberships.teamId, ids))
              .groupBy(memberships.teamId)
          ),
          dbQuery((db) =>
            db.select({ teamId: retros.teamId, count: count() })
              .from(retros)
              .where(and(inArray(retros.teamId, ids), ne(retros.phase, 'closed')))
              .groupBy(retros.teamId)
          ),
        ], { concurrency: 'unbounded' })

    return yield* render('Dashboard', {
      teams: rows.map((row) => ({
        ...row,
        memberCount: people.find((entry) => entry.teamId === row.id)?.count ?? 0,
        activeRetros: active.find((entry) => entry.teamId === row.id)?.count ?? 0,
      })),
    })
  })
)

/** A new team, with the member who made it as its owner, written together. */
export const createTeam = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    const input = yield* validateRequest(TeamForm)
    const id = crypto.randomUUID()
    const slug = slugFor(input.name)

    yield* dbBatch((db) => [
      db.insert(teams).values({ id, slug, name: input.name }),
      db.insert(memberships).values({ teamId: id, userId: auth.user.id, role: 'owner' }),
    ]).pipe(uniqueFieldErrors({ name: 'That address is taken. Try again.' }, { constraints: { slug: 'name' } }))
    yield* flash('success', `${input.name} is ready. Invite your team from Members.`)

    return yield* redirect(paths.team, { team: slug })
  })
)

/** The team's retros, newest first, and the action items still open. */
export const showTeam = action(
  Effect.gen(function* () {
    const member = yield* CurrentMember
    const { team } = member

    const [retroRows, noteCounts, openActions, [people]] = yield* Effect.all([
      dbQuery((db) =>
        db.select({ id: retros.id, title: retros.title, phase: retros.phase, createdAt: retros.createdAt, closedAt: retros.closedAt })
          .from(retros)
          .where(eq(retros.teamId, team.id))
          .orderBy(desc(retros.createdAt))
      ),
      dbQuery((db) =>
        db.select({ retroId: notes.retroId, count: count() })
          .from(notes)
          .innerJoin(retros, eq(retros.id, notes.retroId))
          .where(eq(retros.teamId, team.id))
          .groupBy(notes.retroId)
      ),
      dbQuery((db) =>
        db.select({
          id: notes.id,
          body: notes.body,
          doneAt: notes.doneAt,
          createdAt: notes.createdAt,
          retroId: retros.id,
          retroTitle: retros.title,
        })
          .from(notes)
          .innerJoin(retros, eq(retros.id, notes.retroId))
          .where(and(eq(retros.teamId, team.id), eq(notes.column, 'action'), isNull(notes.doneAt)))
          .orderBy(desc(notes.createdAt))
      ),
      dbQuery((db) => db.select({ count: count() }).from(memberships).where(eq(memberships.teamId, team.id))),
    ], { concurrency: 'unbounded' })

    return yield* render('Teams/Show', {
      team,
      role: member.role,
      memberCount: people?.count ?? 0,
      retros: retroRows.map((retro) => ({
        ...retro,
        noteCount: noteCounts.find((entry) => entry.retroId === retro.id)?.count ?? 0,
      })),
      openActions: openActions.map(({ retroId, retroTitle, ...item }) => ({ ...item, retro: { id: retroId, title: retroTitle } })),
    })
  })
)

/** Who's in the team, and, for those who may invite, the team's invite link. */
export const listMembers = action(
  Effect.gen(function* () {
    const member = yield* CurrentMember
    const now = DateTime.toDateUtc(yield* DateTime.now)

    const [rows, invite] = yield* Effect.all([
      dbQuery((db) =>
        db.select({
          userId: memberships.userId,
          role: memberships.role,
          createdAt: memberships.createdAt,
          name: user.name,
          email: sql<string>`CASE WHEN ${user.isAnonymous} THEN 'Guest' ELSE ${user.email} END`,
        })
          .from(memberships)
          .innerJoin(user, eq(user.id, memberships.userId))
          .where(eq(memberships.teamId, member.teamId))
          .orderBy(sql`CASE ${memberships.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`, asc(user.name))
      ),
      roleCan(member.role, 'members.invite')
        ? dbQuery((db) =>
            db.select({ token: invites.token, expiresAt: invites.expiresAt })
              .from(invites)
              .where(and(eq(invites.teamId, member.teamId), gt(invites.expiresAt, now)))
              .orderBy(desc(invites.expiresAt))
              .limit(1)
          )
        : Effect.succeed([]),
    ], { concurrency: 'unbounded' })

    return yield* render('Teams/Members', {
      team: member.team,
      role: member.role,
      you: member.userId,
      members: rows,
      invite: invite[0] ?? null,
    })
  })
)

/** A new invite link, which replaces the team's last one. */
export const newInvite = action(
  Effect.gen(function* () {
    const member = yield* can('members.invite')
    const expiresAt = DateTime.toDateUtc(DateTime.addDuration(yield* DateTime.now, inviteLasts))

    yield* dbBatch((db) => [
      db.delete(invites).where(eq(invites.teamId, member.teamId)),
      db.insert(invites).values({ token: newToken(), teamId: member.teamId, createdBy: member.userId, expiresAt }),
    ])
    yield* flash('success', 'Invite link ready. It works for a week, until you make another.')

    return yield* back(paths.teamMembers, { team: member.team.slug })
  })
)

/** Makes a member an admin, or an admin a member. Only the owner may. */
export const changeRole = action(
  Effect.gen(function* () {
    const { team } = yield* can('members.role')
    const target = yield* bound('member')
    const input = yield* validateRequest(RoleForm)

    if (target.role === 'owner') return yield* forbidden('The owner’s role doesn’t change.')

    yield* dbMutation((db) =>
      db.update(memberships)
        .set({ role: input.role })
        .where(and(eq(memberships.teamId, target.teamId), eq(memberships.userId, target.userId)))
    )
    yield* flash('success', input.role === 'admin' ? 'They can now run retros and invite people.' : 'They’re a member now.')

    return yield* back(paths.teamMembers, { team: team.slug })
  })
)

/**
 * Takes someone out of the team: anyone may leave, an admin may remove a
 * member, and the owner anyone but themselves.
 */
export const removeMember = action(
  Effect.gen(function* () {
    const member = yield* CurrentMember
    const target = yield* bound('member')
    const leaving = target.userId === member.userId

    if (target.role === 'owner') return yield* forbidden('The owner stays with the team.')
    if (!leaving) {
      yield* can('members.remove')
      if (member.role === 'admin' && target.role === 'admin') return yield* forbidden('Only the owner removes an admin.')
    }

    yield* dbMutation((db) =>
      db.delete(memberships).where(and(eq(memberships.teamId, target.teamId), eq(memberships.userId, target.userId)))
    )

    if (leaving) {
      yield* flash('success', `You left ${member.team.name}.`)
      return yield* redirect(paths.dashboard)
    }

    yield* flash('success', 'Removed from the team.')
    return yield* back(paths.teamMembers, { team: member.team.slug })
  })
)

/** The live invite a link names, or nothing once it's expired or replaced. */
const liveInvite = (token: string) =>
  Effect.gen(function* () {
    const now = DateTime.toDateUtc(yield* DateTime.now)
    const [invite] = yield* dbQuery((db) =>
      db.select({ teamId: teams.id, name: teams.name, slug: teams.slug })
        .from(invites)
        .innerJoin(teams, eq(teams.id, invites.teamId))
        .where(and(eq(invites.token, token), gt(invites.expiresAt, now)))
    )
    return { invite, now }
  })

/** An invite link: which team it's for, and a button to join. */
export const showInvite = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    const { token } = yield* validateRequest(InviteToken)
    const { invite } = yield* liveInvite(token)

    if (invite === undefined) return yield* render('Teams/InviteExpired', {}, { status: 404 })

    const [[people], mine] = yield* Effect.all([
      dbQuery((db) => db.select({ count: count() }).from(memberships).where(eq(memberships.teamId, invite.teamId))),
      dbQuery((db) =>
        db.select({ role: memberships.role })
          .from(memberships)
          .where(and(eq(memberships.teamId, invite.teamId), eq(memberships.userId, auth.user.id)))
      ),
    ], { concurrency: 'unbounded' })

    return yield* render('Teams/Join', {
      team: { name: invite.name, slug: invite.slug },
      memberCount: people?.count ?? 0,
      alreadyMember: mine.length > 0,
      token,
    })
  })
)

/**
 * Joins the team an invite link is for, as a member. The membership is
 * written only while the invite is live, in the insert itself.
 */
export const acceptInvite = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    const { token } = yield* validateRequest(InviteToken)
    const { invite, now } = yield* liveInvite(token)

    if (invite === undefined) return yield* render('Teams/InviteExpired', {}, { status: 404 })

    yield* dbMutation((db) =>
      db.insert(memberships)
        .select(
          db.select(rowOf(memberships, { teamId: invites.teamId, userId: auth.user.id, role: 'member', createdAt: now }))
            .from(invites)
            .where(and(eq(invites.token, token), gt(invites.expiresAt, now)))
        )
        .onConflictDoNothing()
    )
    yield* flash('success', `Welcome to ${invite.name}.`)

    return yield* redirect(paths.team, { team: invite.slug })
  })
)
