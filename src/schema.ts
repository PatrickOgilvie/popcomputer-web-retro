import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from './auth-schema'
import { NoteColumn, Phase, Role } from './forms'

export * from './auth-schema'

const createdAt = () => integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date())

export const teams = sqliteTable(
  'teams',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** Its address, `/teams/{slug}`: the name, and a few letters that make it unique. */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('teams_slug_unique').on(table.slug),
    check('teams_name_length', sql`length(${table.name}) BETWEEN 1 AND 60`),
  ]
)

/**
 * Who is in a team, and their role there. A role belongs to the membership,
 * not the user: an owner of one team is a member of another.
 */
export const memberships = sqliteTable(
  'memberships',
  {
    teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: Role.literals }).notNull().default('member'),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    index('memberships_user_idx').on(table.userId),
    check('memberships_role', sql`${table.role} IN ('owner', 'admin', 'member')`),
  ]
)

/** A team's invite link: anyone signed in who has it joins, until it expires. */
export const invites = sqliteTable(
  'invites',
  {
    token: text('token').primaryKey(),
    teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('invites_team_idx').on(table.teamId, table.expiresAt)]
)

export const retros = sqliteTable(
  'retros',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    phase: text('phase', { enum: Phase.literals }).notNull().default('collecting'),
    votesPerPerson: integer('votes_per_person').notNull().default(3),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('retros_team_created_idx').on(table.teamId, table.createdAt),
    check('retros_title_length', sql`length(${table.title}) BETWEEN 1 AND 100`),
    check('retros_phase', sql`${table.phase} IN ('collecting', 'voting', 'discussing', 'closed')`),
    check('retros_votes_per_person', sql`${table.votesPerPerson} BETWEEN 1 AND 10`),
  ]
)

/**
 * A sticky note on a retro. Its author is kept so they can take it down, and
 * never shown: the board is anonymous. An action item can be ticked off.
 */
export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    retroId: text('retro_id').notNull().references(() => retros.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    column: text('board_column', { enum: NoteColumn.literals }).notNull(),
    body: text('body').notNull(),
    doneAt: integer('done_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('notes_retro_idx').on(table.retroId, table.createdAt),
    check('notes_body_length', sql`length(${table.body}) BETWEEN 1 AND 500`),
    check('notes_column', sql`${table.column} IN ('went_well', 'to_improve', 'action')`),
    check('notes_only_actions_are_done', sql`${table.column} = 'action' OR ${table.doneAt} IS NULL`),
  ]
)

/**
 * One dot of a member's dot-voting: several on one note stack up. The
 * triggers in migrations/0001_retro_rules.sql hold each member to the
 * retro's budget, and take votes only while it's voting.
 */
export const votes = sqliteTable(
  'votes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    retroId: text('retro_id').notNull().references(() => retros.id, { onDelete: 'cascade' }),
    noteId: text('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('votes_retro_user_idx').on(table.retroId, table.userId),
    index('votes_note_idx').on(table.noteId),
  ]
)
