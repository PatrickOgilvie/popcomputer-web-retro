import { Head, Link, router, useForm } from '@inertiajs/react'
import { href } from '@popcomputer/web/paths'
import type { FormInput, WebPage } from '@popcomputer/web/react'
import { ListChecks, NotebookPen, Plus, Users } from 'lucide-react'
import type { FormEvent } from 'react'

import { buttonClassName } from '~/components/button'
import { cn } from '~/components/cn'
import EmptyState from '~/components/EmptyState'
import FieldError from '~/components/FieldError'
import { fieldControlClassName, fieldLabelClassName } from '~/components/fieldStyles'
import { formatDate, formatRelativeTime } from '~/components/format'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import { cardClassName, PhaseBadge, RoleBadge, runsRetros } from '~/components/retro-ui'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import type { RetroForm } from '~/forms'
import { paths } from '~/paths'

function NewRetroForm({ team }: { readonly team: string }) {
  const { data, setData, post, processing, errors, clearErrors } = useForm<FormInput<typeof RetroForm>>({
    title: '',
    votesPerPerson: 3,
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    post(href(paths.retros, { team }))
  }

  return (
    <form noValidate onSubmit={submit} className={cn(cardClassName, 'flex flex-col gap-3 p-5 sm:flex-row sm:items-end')}>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label htmlFor="retro-title" className={fieldLabelClassName}>
          New retro
        </label>
        <input
          id="retro-title"
          name="title"
          autoComplete="off"
          maxLength={100}
          placeholder="Sprint 43"
          value={data.title}
          disabled={processing}
          className={cn(fieldControlClassName, 'h-10')}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? 'retro-title-error' : undefined}
          onChange={(event) => {
            setData('title', event.target.value)
            clearErrors('title')
          }}
        />
        <FieldError id="retro-title-error" message={errors.title} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="retro-votes" className={fieldLabelClassName}>
          Votes each
        </label>
        <select
          id="retro-votes"
          name="votesPerPerson"
          value={String(data.votesPerPerson)}
          disabled={processing}
          className={cn(fieldControlClassName, 'h-10 w-24')}
          onChange={(event) => setData('votesPerPerson', Number(event.target.value))}
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={processing} className={buttonClassName()}>
        <Plus aria-hidden="true" />
        Start retro
      </button>
    </form>
  )
}

/** A team: its retros, and the action items they left open. */
const ShowTeam: WebPage<'Teams/Show'> = ({ team, role, memberCount, retros, openActions }) => (
  <>
    <Head title={team.name} />
    <Layout>
      <PageHeader
        title={team.name}
        breadcrumbs={[{ label: 'Teams', href: paths.dashboard }, { label: team.name }]}
        meta={
          <>
            <RoleBadge role={role} />
            <span className="tabular-nums">
              {memberCount} {memberCount === 1 ? 'person' : 'people'}
            </span>
          </>
        }
        actions={
          <Link href={href(paths.teamMembers, { team: team.slug })} className={buttonClassName({ variant: 'secondary' })}>
            <Users aria-hidden="true" />
            Members
          </Link>
        }
      />

      {runsRetros(role) ? <NewRetroForm team={team.slug} /> : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="retros-title" className={cardClassName}>
          <h2 id="retros-title" className="border-b border-zinc-200 px-5 py-3.5 text-sm font-semibold dark:border-zinc-800">
            Retros
          </h2>
          {retros.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={NotebookPen}
                headingLevel="h3"
                title="No retros yet"
                description={
                  runsRetros(role)
                    ? 'Start one above. Everyone writes notes, then votes, then you talk the top ones through.'
                    : 'An admin or the team’s owner starts them. They’ll show up here.'
                }
                action={null}
              />
            </div>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {retros.map((retro) => (
                <li key={retro.id} className="relative flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={href(paths.retro, { team: team.slug, retro: retro.id })}
                      className="block truncate text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-orange-600"
                    >
                      {retro.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                      {retro.noteCount} {retro.noteCount === 1 ? 'note' : 'notes'} ·{' '}
                      {retro.closedAt === null ? `started ${formatRelativeTime(retro.createdAt)}` : `closed ${formatDate(retro.closedAt)}`}
                    </p>
                  </div>
                  <PhaseBadge phase={retro.phase} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="actions-title" className={cardClassName}>
          <h2 id="actions-title" className="flex items-center gap-2 border-b border-zinc-200 px-5 py-3.5 text-sm font-semibold dark:border-zinc-800">
            <ListChecks className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            Open action items
            <span className="text-xs font-medium text-zinc-500 tabular-nums">{openActions.length}</span>
          </h2>
          {openActions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-zinc-500 dark:text-zinc-400">
              Nothing open. Actions agreed in a retro wait here until someone ticks them off.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {openActions.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                  <input
                    type="checkbox"
                    checked={false}
                    aria-label={`Done: ${item.body}`}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-emerald-600"
                    onChange={() =>
                      router.put(
                        href(paths.noteDone, { team: team.slug, retro: item.retro.id, note: item.id }),
                        { done: true },
                        { preserveScroll: true }
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-pretty">{item.body}</p>
                    <Link
                      href={href(paths.retro, { team: team.slug, retro: item.retro.id })}
                      className="mt-0.5 inline-block rounded-sm text-xs text-zinc-500 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-orange-600 dark:text-zinc-400 dark:hover:text-white"
                    >
                      From {item.retro.title}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <UnderTheHood route="GET /teams/{team:slug}" action="showTeam">
        <Guarantee>
          The team’s binding says <code>guarded: true</code>: it loads only through the membership guard, which
          answers anyone else with a 404.
        </Guarantee>
        <Guarantee>
          Each action names the permission it needs, <code>can('retros.run')</code>: a member without it gets a 403.
        </Guarantee>
        <Guarantee>Retros and their notes load only under their team, so another team’s ids are 404s here.</Guarantee>
      </UnderTheHood>
    </Layout>
  </>
)

export default ShowTeam
