import { and, asc, count, eq, inArray, max } from 'drizzle-orm'
import { DateTime, Effect } from 'effect'
import {
  action,
  authorize,
  back,
  bound,
  constraintFieldErrors,
  dbMutation,
  dbQuery,
  flash,
  invalid,
  redirect,
  render,
  validateRequest,
} from '@popcomputer/web/effect'
import { ActionDone, NoteForm, PhaseForm, RetroForm } from '../forms'
import { can, CurrentMember } from '../memberships'
import { paths } from '../paths'
import { notes, retros, votes } from '../schema'

/** A new retro for the team, open for notes. */
export const createRetro = action(
  Effect.gen(function* () {
    const member = yield* can('retros.run')
    const input = yield* validateRequest(RetroForm)
    const [created] = yield* dbMutation((db) =>
      db.insert(retros).values({ ...input, teamId: member.teamId, createdBy: member.userId }).returning({ id: retros.id })
    )

    if (created === undefined) return yield* Effect.die(new Error('The retro insert returned no row.'))

    return yield* redirect(paths.retro, { team: member.team.slug, retro: created.id })
  })
)

/**
 * The board. While notes are being written, another member's note shows as
 * a blank card: its text never leaves the server. While voting, each member
 * sees only their own votes; the totals arrive when the discussion starts.
 */
export const showRetro = action(
  Effect.gen(function* () {
    const member = yield* CurrentMember
    const retro = yield* bound('retro')

    const [rows, totals, mine] = yield* Effect.all([
      dbQuery((db) =>
        db.select({
          id: notes.id,
          column: notes.column,
          body: notes.body,
          authorId: notes.authorId,
          doneAt: notes.doneAt,
          createdAt: notes.createdAt,
        })
          .from(notes)
          .where(eq(notes.retroId, retro.id))
          .orderBy(asc(notes.createdAt))
      ),
      dbQuery((db) =>
        db.select({ noteId: votes.noteId, count: count() }).from(votes).where(eq(votes.retroId, retro.id)).groupBy(votes.noteId)
      ),
      dbQuery((db) =>
        db.select({ noteId: votes.noteId, count: count() })
          .from(votes)
          .where(and(eq(votes.retroId, retro.id), eq(votes.userId, member.userId)))
          .groupBy(votes.noteId)
      ),
    ], { concurrency: 'unbounded' })

    const hidesText = retro.phase === 'collecting'
    const showsTotals = retro.phase === 'discussing' || retro.phase === 'closed'
    const totalFor = (id: string) => totals.find((entry) => entry.noteId === id)?.count ?? 0
    const board = rows.map(({ authorId, body, ...note }) => {
      const isMine = authorId === member.userId
      return {
        ...note,
        body: hidesText && !isMine ? null : body,
        mine: isMine,
        votes: showsTotals ? totalFor(note.id) : null,
        myVotes: mine.find((entry) => entry.noteId === note.id)?.count ?? 0,
      }
    })
    // Talked through in the order the votes put them.
    if (showsTotals) board.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))

    return yield* render('Retros/Show', {
      team: { slug: member.team.slug, name: member.team.name },
      retro,
      role: member.role,
      notes: board,
      votesLeft: retro.votesPerPerson - mine.reduce((total, entry) => total + entry.count, 0),
    })
  })
)

const phaseNames = { collecting: 'Writing notes', voting: 'Voting', discussing: 'Discussing', closed: 'Closed' } as const

/** Moves the retro to another phase. Admins and the owner run retros. */
export const changePhase = action(
  Effect.gen(function* () {
    const member = yield* can('retros.run')
    const retro = yield* bound('retro')
    const { phase } = yield* validateRequest(PhaseForm)
    const now = DateTime.toDateUtc(yield* DateTime.now)

    yield* dbMutation((db) =>
      db.update(retros)
        .set({ phase, closedAt: phase === 'closed' ? (retro.closedAt ?? now) : null })
        .where(and(eq(retros.id, retro.id), eq(retros.teamId, member.teamId)))
    )
    yield* flash('success', `${phaseNames[phase]}.`)

    return yield* back(paths.retro, { team: member.team.slug, retro: retro.id })
  })
)

export const deleteRetro = action(
  Effect.gen(function* () {
    const member = yield* can('retros.run')
    const retro = yield* bound('retro')

    yield* dbMutation((db) => db.delete(retros).where(and(eq(retros.id, retro.id), eq(retros.teamId, member.teamId))))
    yield* flash('success', `Deleted ${retro.title}.`)

    return yield* redirect(paths.team, { team: member.team.slug })
  })
)

/**
 * Puts a note up. The trigger in migrations/0001_retro_rules.sql takes it
 * only in a phase that's open for that column; each column's form names an
 * error bag, so a refusal shows under the column it came from.
 */
export const addNote = action(
  Effect.gen(function* () {
    const member = yield* CurrentMember
    const retro = yield* bound('retro')
    const input = yield* validateRequest(NoteForm)

    yield* dbMutation((db) =>
      db.insert(notes).values({ ...input, retroId: retro.id, authorId: member.userId })
    ).pipe(
      constraintFieldErrors({
        notes_closed: { body: 'This column isn’t taking notes in this phase.' },
      })
    )

    return yield* back(paths.retro, { team: member.team.slug, retro: retro.id })
  })
)

/** Takes down one of the member's own notes, until the retro closes. */
export const deleteNote = action(
  Effect.gen(function* () {
    const member = yield* CurrentMember
    const retro = yield* bound('retro')
    const note = yield* bound('note')
    yield* authorize(() => note.authorId === member.userId && retro.phase !== 'closed', 'Only its author takes a note down, before the retro closes.')

    yield* dbMutation((db) => db.delete(notes).where(and(eq(notes.id, note.id), eq(notes.retroId, retro.id))))

    return yield* back(paths.retro, { team: member.team.slug, retro: retro.id })
  })
)

/** One more of the member's dots on a note. The database holds the budget, and the phase. */
export const vote = action(
  Effect.gen(function* () {
    const member = yield* CurrentMember
    const retro = yield* bound('retro')
    const note = yield* bound('note')

    yield* dbMutation((db) => db.insert(votes).values({ retroId: retro.id, noteId: note.id, userId: member.userId })).pipe(
      constraintFieldErrors({
        votes_budget: { votes: `You’ve used all ${retro.votesPerPerson} of your votes. Take one back to move it.` },
        votes_closed: { votes: 'Voting isn’t open on this retro.' },
      })
    )

    return yield* back(paths.retro, { team: member.team.slug, retro: retro.id })
  })
)

/** Takes back one of the member's dots on a note, while voting is open. */
export const unvote = action(
  Effect.gen(function* () {
    const member = yield* CurrentMember
    const retro = yield* bound('retro')
    const note = yield* bound('note')

    if (retro.phase !== 'voting') return yield* invalid({ votes: 'Voting isn’t open on this retro.' })

    yield* dbMutation((db) =>
      db.delete(votes).where(
        inArray(
          votes.id,
          db.select({ id: max(votes.id) }).from(votes).where(and(eq(votes.noteId, note.id), eq(votes.userId, member.userId)))
        )
      )
    )

    return yield* back(paths.retro, { team: member.team.slug, retro: retro.id })
  })
)

/** Ticks an action item off, or opens it again. Anyone in the team may. */
export const markDone = action(
  Effect.gen(function* () {
    const member = yield* CurrentMember
    const retro = yield* bound('retro')
    const note = yield* bound('note')
    const { done } = yield* validateRequest(ActionDone)
    const now = DateTime.toDateUtc(yield* DateTime.now)

    yield* dbMutation((db) =>
      db.update(notes)
        .set({ doneAt: done ? (note.doneAt ?? now) : null })
        .where(and(eq(notes.id, note.id), eq(notes.retroId, retro.id), eq(notes.column, 'action')))
    )

    return yield* back(paths.retro, { team: member.team.slug, retro: retro.id })
  })
)
