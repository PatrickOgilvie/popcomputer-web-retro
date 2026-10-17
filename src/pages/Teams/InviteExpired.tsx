import { Head, Link } from '@inertiajs/react'
import type { WebPage } from '@popcomputer/web/react'
import { Link2Off } from 'lucide-react'

import { buttonClassName } from '~/components/button'
import Layout from '~/components/Layout'
import { cardClassName } from '~/components/retro-ui'
import { paths } from '~/paths'

/** An invite link that has expired, or that a newer one replaced. */
const InviteExpired: WebPage<'Teams/InviteExpired'> = () => (
  <>
    <Head title="Invite expired" />
    <Layout>
      <section className={`${cardClassName} mx-auto flex w-full max-w-md flex-col items-center p-8 text-center`}>
        <span className="flex size-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          <Link2Off className="size-6 text-zinc-600 dark:text-zinc-300" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">This invite link doesn’t work any more</h1>
        <p className="mt-2 text-sm text-pretty text-zinc-600 dark:text-zinc-400">
          Links last a week, and a new one turns the old one off. Ask whoever sent it for a fresh link.
        </p>
        <Link href={paths.dashboard} className={buttonClassName({ variant: 'secondary', className: 'mt-6' })}>
          Your teams
        </Link>
      </section>
    </Layout>
  </>
)

export default InviteExpired
