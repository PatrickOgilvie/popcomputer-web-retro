// Each page's props, as the Effect Schema `render` checks and encodes them
// with: a column the schema does not name never reaches the browser.
import { Schema as S, Struct } from 'effect'
import { tableSchema } from '@popcomputer/web/schema'
import { Role } from './forms'
import * as schema from './schema'

const teamFields = tableSchema(schema.teams)
const retroFields = tableSchema(schema.retros)
const noteFields = tableSchema(schema.notes)

export const Team = teamFields.mapFields(Struct.pick(['id', 'slug', 'name', 'createdAt']))

export const TeamSummary = teamFields.mapFields((fields) => ({
  ...Struct.pick(fields, ['id', 'slug', 'name']),
  role: Role,
  memberCount: S.Number,
  activeRetros: S.Number,
}))

export const RetroSummary = retroFields.mapFields((fields) => ({
  ...Struct.pick(fields, ['id', 'title', 'phase', 'createdAt', 'closedAt']),
  noteCount: S.Number,
}))

export const Retro = retroFields.mapFields(
  Struct.pick(['id', 'title', 'phase', 'votesPerPerson', 'createdAt', 'closedAt'])
)

/** An action item from any of the team's retros, with the retro it came from. */
export const ActionItem = noteFields.mapFields((fields) => ({
  ...Struct.pick(fields, ['id', 'body', 'doneAt', 'createdAt']),
  retro: S.Struct({ id: S.String, title: S.String }),
}))

/**
 * A note as the board shows it. Never its author: the board is anonymous.
 * Another member's text is null while notes are being written, and the vote
 * totals are null while voting, so neither can sway anyone early.
 */
export const BoardNote = noteFields.mapFields((fields) => ({
  ...Struct.pick(fields, ['id', 'column', 'doneAt', 'createdAt']),
  body: S.NullOr(S.String),
  mine: S.Boolean,
  votes: S.NullOr(S.Number),
  myVotes: S.Number,
}))

/** A member, as the team's other members see them. */
export const Member = tableSchema(schema.memberships).mapFields((fields) => ({
  ...Struct.pick(fields, ['userId', 'role', 'createdAt']),
  name: S.String,
  email: S.String,
}))

export const pages = {
  'Auth/Login': S.Struct({}),
  Dashboard: S.Struct({ teams: S.Array(TeamSummary) }),
  'Teams/Show': S.Struct({
    team: Team,
    role: Role,
    memberCount: S.Number,
    retros: S.Array(RetroSummary),
    openActions: S.Array(ActionItem),
  }),
  'Teams/Members': S.Struct({
    team: Team,
    role: Role,
    you: S.String,
    members: S.Array(Member),
    /** The team's current invite link, for those who may invite; null for the rest. */
    invite: S.NullOr(tableSchema(schema.invites).mapFields(Struct.pick(['token', 'expiresAt']))),
  }),
  'Teams/Join': S.Struct({
    team: teamFields.mapFields(Struct.pick(['name', 'slug'])),
    memberCount: S.Number,
    alreadyMember: S.Boolean,
    token: S.String,
  }),
  'Teams/InviteExpired': S.Struct({}),
  'Retros/Show': S.Struct({
    team: teamFields.mapFields(Struct.pick(['slug', 'name'])),
    retro: Retro,
    role: Role,
    notes: S.Array(BoardNote),
    votesLeft: S.Number,
  }),
}
