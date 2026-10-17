import { Head, Link, useForm, usePage } from '@inertiajs/react'
import { href } from '@popcomputer/web/paths'
import type { FormInput, WebPage } from '@popcomputer/web/react'
import { Plus, Users } from 'lucide-react'
import type { FormEvent } from 'react'

import { buttonClassName } from '~/components/button'
import { cn } from '~/components/cn'
import EmptyState from '~/components/EmptyState'
import FieldError from '~/components/FieldError'
import { fieldControlClassName } from '~/components/fieldStyles'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import { cardClassName, RoleBadge } from '~/components/retro-ui'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import type { TeamForm } from '~/forms'
import { paths } from '~/paths'

function NewTeamForm({ autoFocus = false }: { readonly autoFocus?: boolean }) {
  const { data, setData, post, processing, errors, clearErrors } = useForm<FormInput<typeof TeamForm>>({ name: '' })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    post(paths.teams)
  }

  return (
    <form noValidate onSubmit={submit} className="flex w-full flex-col gap-2 sm:max-w-md">
      <label htmlFor="team-name" className="text-sm font-medium">
        New team
      </label>
      <div className="flex gap-2">
        <input
          id="team-name"
          name="name"
          autoComplete="off"
          maxLength={60}
          autoFocus={autoFocus}
          placeholder="Platform squad"
          value={data.name}
          disabled={processing}
          className={cn(fieldControlClassName, 'h-10')}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'team-name-error' : undefined}
          onChange={(event) => {
            setData('name', event.target.value)
            clearErrors('name')
          }}
        />
        <button type="submit" disabled={processing} className={buttonClassName()}>
          <Plus aria-hidden="true" />
          Create
        </button>
      </div>
      <FieldError id="team-name-error" message={errors.name} />
    </form>
  )
}

/** The member's teams, and a form that starts another. */
const Dashboard: WebPage<'Dashboard'> = ({ teams }) => {
  const { auth } = usePage().props
  const firstName = auth.user?.name.trim().split(/\s+/)[0] || 'there'

  return (
    <>
      <Head title="Teams" />
      <Layout>
        <PageHeader
          title={`Hi, ${firstName}`}
          description={
            teams.length === 0
              ? 'Start a team, then share its invite link. Everyone who joins can write notes and vote.'
              : 'Your teams and their retros.'
          }
        />

        {teams.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Start your first team"
            description="You’ll be its owner: you run retros, invite people and choose who else may."
            action={<NewTeamForm autoFocus />}
          />
        ) : (
          <>
            <ul aria-label="Your teams" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((team) => (
                <li
                  key={team.id}
                  className={cn(cardClassName, 'relative flex flex-col gap-4 p-5 hover:border-zinc-300 dark:hover:border-zinc-700')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={href(paths.team, { team: team.slug })}
                      className="min-w-0 text-base font-semibold break-words after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-orange-600"
                    >
                      {team.name}
                    </Link>
                    <RoleBadge role={team.role} />
                  </div>
                  <p className="text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
                    {team.memberCount} {team.memberCount === 1 ? 'person' : 'people'}
                    {team.activeRetros > 0 ? (
                      <span className="font-medium text-violet-700 dark:text-violet-400">
                        {' '}· {team.activeRetros} retro{team.activeRetros === 1 ? '' : 's'} open
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
            <section className={cn(cardClassName, 'p-5')}>
              <NewTeamForm />
            </section>
          </>
        )}

        <UnderTheHood route="POST /teams" action="createTeam">
          <Guarantee>
            The team and its owner’s membership are written in one <code>dbBatch</code>: never one without the other.
          </Guarantee>
          <Guarantee>The role lives on the membership, so you can own one team and be a member of another.</Guarantee>
          <Guarantee>A trigger keeps each team to one owner, whatever writes the row.</Guarantee>
        </UnderTheHood>
      </Layout>
    </>
  )
}

export default Dashboard
