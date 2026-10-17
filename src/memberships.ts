import { and, eq } from 'drizzle-orm'
import { Context, Effect } from 'effect'
import { authorize, bound, dbQuery, forbidden, guard, notFound } from '@popcomputer/web/effect'
import { memberships, type teams } from './schema'

export type Membership = typeof memberships.$inferSelect
export type Role = Membership['role']

/** The visitor's membership of the team the path names, and the team. */
export class CurrentMember extends Context.Service<
  CurrentMember,
  Membership & { readonly team: typeof teams.$inferSelect }
>()('app/CurrentMember') {}

/**
 * Lets a team's members in, and nobody else: a visitor who isn't a member
 * gets the 404 a missing team gets, so a team's existence stays private.
 * Every route under `/teams/{team:slug}` is provided it.
 */
export const RequireMember = guard(
  CurrentMember,
  Effect.gen(function* () {
    const auth = yield* authorize()
    const team = yield* bound('team')
    const [membership] = yield* dbQuery((db) =>
      db.select().from(memberships).where(and(eq(memberships.teamId, team.id), eq(memberships.userId, auth.user.id)))
    )

    if (membership === undefined) return yield* notFound('Team')

    return CurrentMember.of({ ...membership, team })
  })
)

/** What a route does, rather than who may do it: each role's are one row below. */
export type Permission = 'members.invite' | 'members.remove' | 'members.role' | 'retros.run'

const permissions: Readonly<Record<Role, ReadonlyArray<Permission>>> = {
  owner: ['members.invite', 'members.remove', 'members.role', 'retros.run'],
  admin: ['members.invite', 'members.remove', 'retros.run'],
  member: [],
}

/** Whether a role may do something, for pages that show or hide a control. */
export const roleCan = (role: Role, permission: Permission): boolean => permissions[role].includes(permission)

/** The member, once their role allows `permission`; a 403 otherwise. */
export const can = (permission: Permission) =>
  Effect.gen(function* () {
    const member = yield* CurrentMember

    if (!roleCan(member.role, permission)) return yield* forbidden('Your role in this team doesn’t allow that.')

    return member
  })
