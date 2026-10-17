import { Head, Link, useForm } from '@inertiajs/react'
import { href } from '@popcomputer/web/paths'
import type { WebPage } from '@popcomputer/web/react'
import { Users } from 'lucide-react'

import { buttonClassName } from '~/components/button'
import Layout from '~/components/Layout'
import { cardClassName } from '~/components/retro-ui'
import { paths } from '~/paths'

/** An invite link's page: which team it's for, and a button to join. */
const Join: WebPage<'Teams/Join'> = ({ team, memberCount, alreadyMember, token }) => {
  const { post, processing } = useForm({})

  return (
    <>
      <Head title={`Join ${team.name}`} />
      <Layout>
        <section className={`${cardClassName} mx-auto flex w-full max-w-md flex-col items-center p-8 text-center`}>
          <span className="flex size-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950">
            <Users className="size-6 text-orange-700 dark:text-orange-300" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-balance">
            {alreadyMember ? `You’re already in ${team.name}` : `Join ${team.name}`}
          </h1>
          <p className="mt-2 text-sm text-zinc-600 tabular-nums dark:text-zinc-400">
            {memberCount} {memberCount === 1 ? 'person' : 'people'} so far. Members write notes, vote, and see the team’s retros.
          </p>
          {alreadyMember ? (
            <Link href={href(paths.team, { team: team.slug })} className={buttonClassName({ className: 'mt-6' })}>
              Open {team.name}
            </Link>
          ) : (
            <button
              type="button"
              disabled={processing}
              className={buttonClassName({ className: 'mt-6' })}
              onClick={() => post(href(paths.join, { token }))}
            >
              {processing ? 'Joining…' : `Join ${team.name}`}
            </button>
          )}
        </section>
      </Layout>
    </>
  )
}

export default Join
