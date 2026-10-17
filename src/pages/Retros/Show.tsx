import { Head, router, useForm, usePage, usePoll } from '@inertiajs/react'
import { href } from '@popcomputer/web/paths'
import type { FormInput, PagePropsFor, WebPage } from '@popcomputer/web/react'
import { ArrowRight, Check, EyeOff, Lightbulb, ListChecks, Plus, Smile, Trash2, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { buttonClassName } from '~/components/button'
import { cn } from '~/components/cn'
import ConfirmationDialog from '~/components/ConfirmationDialog'
import FieldError from '~/components/FieldError'
import { fieldControlClassName } from '~/components/fieldStyles'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import { PhaseBadge, phases, phaseStyles, runsRetros } from '~/components/retro-ui'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import type { NoteColumn, NoteForm } from '~/forms'
import { paths } from '~/paths'

type Props = PagePropsFor<'Retros/Show'>
type Note = Props['notes'][number]
type Column = typeof NoteColumn.Type
type Phase = Props['retro']['phase']

const columns: ReadonlyArray<{
  readonly key: Column
  readonly title: string
  readonly icon: LucideIcon
  readonly card: string
  readonly accent: string
}> = [
  {
    key: 'went_well',
    title: 'Went well',
    icon: Smile,
    card: 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-900',
    accent: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    key: 'to_improve',
    title: 'To improve',
    icon: Lightbulb,
    card: 'bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900',
    accent: 'text-amber-700 dark:text-amber-400',
  },
  {
    key: 'action',
    title: 'Actions',
    icon: ListChecks,
    card: 'bg-sky-50 ring-sky-200 dark:bg-sky-950/40 dark:ring-sky-900',
    accent: 'text-sky-700 dark:text-sky-400',
  },
]

const guidance: Readonly<Record<Phase, string>> = {
  collecting: 'Write what went well, what to improve, and any actions. Everyone’s notes stay hidden until voting starts.',
  voting: 'Spend your votes on the notes that matter most; put more than one on a note to weigh it up.',
  discussing: 'Notes are in vote order. Talk the top ones through, and agree actions as you go.',
  closed: 'This retro is closed. Its open actions wait on the team page until someone ticks them off.',
}

/** Whether a column takes new notes in this phase, as the trigger has it. */
const takesNotes = (phase: Phase, column: Column) => phase === 'collecting' || (phase === 'discussing' && column === 'action')

function Composer({ path, column }: { readonly path: string; readonly column: Column }) {
  const { data, setData, post, processing, errors, clearErrors, reset } = useForm<FormInput<typeof NoteForm>>({
    column,
    body: '',
  })
  const id = `note-${column}`

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Each column's form has an error bag of its own, so a refusal shows here only.
    post(path, { errorBag: column, preserveScroll: true, onSuccess: () => reset('body') })
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        New note
      </label>
      <textarea
        id={id}
        rows={2}
        maxLength={500}
        placeholder="Add a note…"
        value={data.body}
        disabled={processing}
        className={cn(fieldControlClassName, 'min-h-16 resize-y py-2 text-pretty')}
        aria-invalid={errors.body ? true : undefined}
        aria-describedby={errors.body ? `${id}-error` : undefined}
        onChange={(event) => {
          setData('body', event.target.value)
          clearErrors('body')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }}
      />
      <FieldError id={`${id}-error`} message={errors.body} />
      <button
        type="submit"
        disabled={processing || data.body.trim() === ''}
        className={buttonClassName({ variant: 'secondary', size: 'sm', className: 'self-end' })}
      >
        <Plus aria-hidden="true" />
        Add
      </button>
    </form>
  )
}

function VoteDots({ count, label }: { readonly count: number; readonly label: string }) {
  return (
    <span className="flex items-center gap-1" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="size-2.5 rounded-full bg-violet-600 dark:bg-violet-400" aria-hidden="true" />
      ))}
    </span>
  )
}

function NoteCard({
  note,
  phase,
  tone,
  canVote,
  notePath,
  onDelete,
}: {
  readonly note: Note
  readonly phase: Phase
  readonly tone: string
  readonly canVote: boolean
  readonly notePath: (note: Note, suffix?: 'votes' | 'done') => string
  readonly onDelete: (note: Note) => void
}) {
  if (note.body === null) {
    return (
      <li
        className="flex h-20 flex-col justify-center gap-2 rounded-lg bg-zinc-100 px-3 ring-1 ring-zinc-200 ring-inset dark:bg-zinc-800/60 dark:ring-zinc-700"
        aria-label="Someone’s note, hidden until voting"
      >
        <span className="h-2 w-3/4 rounded-full bg-zinc-300/70 dark:bg-zinc-700" />
        <span className="h-2 w-1/2 rounded-full bg-zinc-300/70 dark:bg-zinc-700" />
      </li>
    )
  }

  const isAction = note.column === 'action'
  const done = note.doneAt !== null
  const options = { preserveScroll: true }

  return (
    <li className={cn('group flex flex-col gap-2 rounded-lg p-3 ring-1 ring-inset', tone)}>
      <div className="flex items-start gap-2">
        {isAction ? (
          <input
            type="checkbox"
            checked={done}
            aria-label={done ? `Reopen: ${note.body}` : `Done: ${note.body}`}
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-emerald-600"
            onChange={() => router.put(notePath(note, 'done'), { done: !done }, options)}
          />
        ) : null}
        <p className={cn('min-w-0 flex-1 text-sm whitespace-pre-line text-pretty', done && 'text-zinc-500 line-through')}>
          {note.body}
        </p>
        {note.mine && phase !== 'closed' ? (
          <button
            type="button"
            aria-label="Take your note down"
            className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded text-zinc-500 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-black/5 hover:text-zinc-900 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-orange-600 pointer-coarse:opacity-100 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={() => onDelete(note)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="flex min-h-6 items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span>{note.mine ? 'You' : null}</span>
        {phase === 'voting' ? (
          <span className="flex items-center gap-2">
            {note.myVotes > 0 ? (
              <button
                type="button"
                className="flex h-6 items-center rounded-full px-1.5 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-orange-600 dark:hover:bg-white/10"
                aria-label={`Take back a vote. You've put ${note.myVotes} here.`}
                onClick={() => router.delete(notePath(note, 'votes'), options)}
              >
                <VoteDots count={note.myVotes} label="" />
              </button>
            ) : null}
            <button
              type="button"
              disabled={!canVote}
              className="flex h-6 items-center gap-1 rounded-full bg-white px-2 font-medium text-violet-700 shadow-xs ring-1 ring-violet-200 hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-orange-600 disabled:opacity-40 dark:bg-zinc-900 dark:text-violet-300 dark:ring-violet-900 dark:hover:bg-violet-950"
              aria-label="Vote for this note"
              onClick={() => router.post(notePath(note, 'votes'), {}, options)}
            >
              <Plus className="size-3" aria-hidden="true" />
              Vote
            </button>
          </span>
        ) : note.votes !== null && note.votes > 0 ? (
          <span className="flex items-center gap-1.5 font-medium text-violet-700 tabular-nums dark:text-violet-300">
            <span className="size-2.5 rounded-full bg-violet-600 dark:bg-violet-400" aria-hidden="true" />
            {note.votes} {note.votes === 1 ? 'vote' : 'votes'}
          </span>
        ) : null}
      </div>
    </li>
  )
}

/** The board: three columns of notes, moved through the retro's phases. */
const ShowRetro: WebPage<'Retros/Show'> = ({ team, retro, role, notes, votesLeft }) => {
  const { errors } = usePage().props
  const [deleting, setDeleting] = useState<Note | null>(null)
  const runner = runsRetros(role)
  const index = phases.indexOf(retro.phase)
  const next = phases[index + 1]

  // Others' notes and votes arrive every few seconds, until the retro closes.
  usePoll(3000, { only: ['retro', 'notes', 'votesLeft'] }, { autoStart: retro.phase !== 'closed' })

  const notePath = (note: Note, suffix?: 'votes' | 'done') => {
    const params = { team: team.slug, retro: retro.id, note: note.id }
    return suffix === 'votes' ? href(paths.noteVotes, params) : suffix === 'done' ? href(paths.noteDone, params) : href(paths.note, params)
  }

  function movePhase(phase: Phase) {
    router.put(href(paths.retroPhase, { team: team.slug, retro: retro.id }), { phase }, { preserveScroll: true })
  }

  const hidden = notes.filter((note) => note.body === null).length

  return (
    <>
      <Head title={retro.title} />
      <Layout>
        <PageHeader
          title={retro.title}
          breadcrumbs={[
            { label: 'Teams', href: paths.dashboard },
            { label: team.name, href: href(paths.team, { team: team.slug }) },
            { label: retro.title },
          ]}
          meta={
            <>
              <PhaseBadge phase={retro.phase} />
              <span className="tabular-nums">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                {hidden > 0 ? ` · ${hidden} hidden` : ''}
              </span>
            </>
          }
          actions={
            runner && next !== undefined ? (
              <button type="button" className={buttonClassName()} onClick={() => movePhase(next)}>
                {next === 'voting' ? 'Start voting' : next === 'discussing' ? 'Reveal the votes' : 'Close the retro'}
                <ArrowRight aria-hidden="true" />
              </button>
            ) : undefined
          }
        />

        <nav aria-label="Phases" className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900">
          <ol className="grid flex-1 grid-cols-2 gap-1 sm:grid-cols-4">
            {phases.map((phase, step) => {
              const current = phase === retro.phase
              return (
                <li key={phase}>
                  <button
                    type="button"
                    disabled={!runner || current}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex h-9 w-full items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-orange-600 disabled:cursor-default',
                      current
                        ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                        : step < index
                          ? 'bg-zinc-100 text-zinc-700 enabled:hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:enabled:hover:bg-zinc-700'
                          : 'text-zinc-500 enabled:hover:bg-zinc-100 enabled:hover:text-zinc-950 dark:text-zinc-400 dark:enabled:hover:bg-zinc-800 dark:enabled:hover:text-white'
                    )}
                    onClick={() => movePhase(phase)}
                  >
                    {step < index ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    {step + 1}. {phaseStyles[phase].label}
                  </button>
                </li>
              )
            })}
          </ol>
          {retro.phase === 'voting' ? (
            <p className="flex shrink-0 items-center gap-2 text-sm font-medium text-violet-700 tabular-nums sm:pl-3 dark:text-violet-300">
              <span className="flex gap-1" aria-hidden="true">
                {Array.from({ length: retro.votesPerPerson }, (_, dot) => (
                  <span
                    key={dot}
                    className={cn(
                      'size-2.5 rounded-full',
                      dot < votesLeft ? 'bg-violet-600 dark:bg-violet-400' : 'ring-1 ring-violet-400 ring-inset dark:ring-violet-500'
                    )}
                  />
                ))}
              </span>
              {votesLeft} of {retro.votesPerPerson} votes left
            </p>
          ) : null}
        </nav>

        <p className="-mt-4 flex items-start gap-2 text-sm text-pretty text-zinc-600 dark:text-zinc-400">
          {retro.phase === 'collecting' ? <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : null}
          {guidance[retro.phase]}
        </p>

        {typeof errors.votes === 'string' ? (
          <p role="alert" className="flex items-center gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {errors.votes}
          </p>
        ) : null}

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
          {columns.map((column) => {
            const columnNotes = notes.filter((note) => note.column === column.key)
            return (
              <section
                key={column.key}
                aria-labelledby={`column-${column.key}`}
                className="flex flex-col gap-3 rounded-xl bg-zinc-100 p-3 dark:bg-zinc-900/70"
              >
                <h2 id={`column-${column.key}`} className={cn('flex items-center gap-2 px-1 text-sm font-semibold', column.accent)}>
                  <column.icon className="size-4" aria-hidden="true" />
                  {column.title}
                  <span className="text-xs font-medium text-zinc-500 tabular-nums">{columnNotes.length}</span>
                </h2>
                {takesNotes(retro.phase, column.key) ? (
                  <Composer path={href(paths.notes, { team: team.slug, retro: retro.id })} column={column.key} />
                ) : null}
                {columnNotes.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    No notes yet
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {columnNotes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        phase={retro.phase}
                        tone={column.card}
                        canVote={votesLeft > 0}
                        notePath={notePath}
                        onDelete={setDeleting}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>

        <ConfirmationDialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title="Take your note down?"
          description="It’s removed from the board, with any votes on it."
          confirmLabel="Take it down"
          busyLabel="Removing…"
          onConfirm={() => {
            if (deleting === null) return
            router.delete(notePath(deleting), { preserveScroll: true, onFinish: () => setDeleting(null) })
          }}
        />

        <UnderTheHood route="GET /teams/{team:slug}/retros/{retro}" action="showRetro">
          <Guarantee>
            While notes are written, another member’s text is null in the props: it never leaves the server, and
            no author is ever sent.
          </Guarantee>
          <Guarantee>
            Triggers hold each member to the vote budget, and take votes only while voting, however many clicks
            arrive at once.
          </Guarantee>
          <Guarantee>
            The board refreshes every three seconds with an Inertia partial reload of its notes and votes.
          </Guarantee>
        </UnderTheHood>
      </Layout>
    </>
  )
}

export default ShowRetro
