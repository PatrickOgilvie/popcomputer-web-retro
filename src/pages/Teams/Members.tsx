import { Head, router, useForm } from '@inertiajs/react'
import { href } from '@popcomputer/web/paths'
import type { PagePropsFor, WebPage } from '@popcomputer/web/react'
import { Check, Copy, Link2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { buttonClassName } from '~/components/button'
import { cn } from '~/components/cn'
import ConfirmationDialog from '~/components/ConfirmationDialog'
import { fieldControlClassName } from '~/components/fieldStyles'
import { formatDate } from '~/components/format'
import Layout from '~/components/Layout'
import PageHeader from '~/components/PageHeader'
import { cardClassName, initials, RoleBadge } from '~/components/retro-ui'
import UnderTheHood, { Guarantee } from '~/components/UnderTheHood'
import { paths } from '~/paths'

type Props = PagePropsFor<'Teams/Members'>
type Member = Props['members'][number]

function InviteCard({ team, invite }: { readonly team: string; readonly invite: Props['invite'] }) {
  const { post, processing } = useForm({})
  const [copied, setCopied] = useState(false)
  const url = invite === null ? null : new URL(href(paths.join, { token: invite.token }), window.location.origin).href

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <section aria-labelledby="invite-title" className={cn(cardClassName, 'p-5')}>
      <h2 id="invite-title" className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="size-4 text-zinc-500" aria-hidden="true" />
        Invite link
      </h2>
      <p className="mt-1 text-sm text-pretty text-zinc-600 dark:text-zinc-400">
        {invite === null
          ? 'Anyone with a link joins as a member once they sign in. Links last a week.'
          : `Anyone with this link joins as a member once they sign in, until ${formatDate(invite.expiresAt)}. A new link turns this one off.`}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {url !== null ? (
          <>
            <input
              readOnly
              value={url}
              aria-label="Invite link"
              className={cn(fieldControlClassName, 'h-10 min-w-0 flex-1 font-mono text-xs sm:text-xs')}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className={buttonClassName({ variant: 'secondary' })}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url)
                  setCopied(true)
                } catch {
                  setCopied(false)
                }
              }}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={processing}
          className={buttonClassName({ variant: url === null ? 'primary' : 'ghost' })}
          onClick={() => post(href(paths.teamInvite, { team }), { preserveScroll: true })}
        >
          <RefreshCw aria-hidden="true" />
          {url === null ? 'Create a link' : 'New link'}
        </button>
      </div>
    </section>
  )
}

function MemberRow({
  member,
  team,
  viewerRole,
  isYou,
  onRemove,
}: {
  readonly member: Member
  readonly team: string
  readonly viewerRole: Props['role']
  readonly isYou: boolean
  readonly onRemove: (member: Member) => void
}) {
  const path = href(paths.teamMember, { team, member: member.userId })
  const canChangeRole = viewerRole === 'owner' && member.role !== 'owner'
  const canRemove =
    member.role !== 'owner' && (isYou || viewerRole === 'owner' || (viewerRole === 'admin' && member.role === 'member'))

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        aria-hidden="true"
      >
        {initials(member.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.name}
          {isYou ? <span className="font-normal text-zinc-500"> (you)</span> : null}
        </p>
        <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{member.email}</p>
      </div>
      <div className="flex items-center gap-2">
        {canChangeRole ? (
          <select
            aria-label={`${member.name}’s role`}
            value={member.role}
            className={cn(fieldControlClassName, 'h-8 w-auto py-0 pr-8 text-sm')}
            onChange={(event) => router.put(path, { role: event.target.value }, { preserveScroll: true })}
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </select>
        ) : (
          <RoleBadge role={member.role} />
        )}
        {canRemove ? (
          <button
            type="button"
            className={buttonClassName({ variant: 'ghost', size: 'sm', className: 'text-red-700 dark:text-red-400' })}
            onClick={() => onRemove(member)}
          >
            {isYou ? 'Leave' : 'Remove'}
          </button>
        ) : null}
      </div>
    </li>
  )
}

/** Who's in the team, their roles, and the link that brings more in. */
const Members: WebPage<'Teams/Members'> = ({ team, role, you, members, invite }) => {
  const [removing, setRemoving] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const mayInvite = role === 'owner' || role === 'admin'
  const leaving = removing !== null && removing.userId === you

  return (
    <>
      <Head title={`${team.name} members`} />
      <Layout>
        <PageHeader
          title="Members"
          breadcrumbs={[
            { label: 'Teams', href: paths.dashboard },
            { label: team.name, href: href(paths.team, { team: team.slug }) },
            { label: 'Members' },
          ]}
          description={
            role === 'owner'
              ? 'Admins run retros and invite people. As the owner, you choose who’s an admin.'
              : 'The owner and admins run retros; everyone writes notes and votes.'
          }
        />

        {mayInvite ? <InviteCard team={team.slug} invite={invite} /> : null}

        <section aria-labelledby="members-title" className={cardClassName}>
          <h2 id="members-title" className="border-b border-zinc-200 px-5 py-3.5 text-sm font-semibold dark:border-zinc-800">
            {members.length} {members.length === 1 ? 'person' : 'people'}
          </h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                team={team.slug}
                viewerRole={role}
                isYou={member.userId === you}
                onRemove={setRemoving}
              />
            ))}
          </ul>
        </section>

        <ConfirmationDialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open) setRemoving(null)
          }}
          title={leaving ? `Leave ${team.name}?` : `Remove ${removing?.name ?? ''}?`}
          description={
            leaving
              ? 'You’ll lose access to its retros until someone invites you again.'
              : 'They’ll lose access to the team’s retros. Their notes stay, still anonymous.'
          }
          confirmLabel={leaving ? 'Leave team' : 'Remove'}
          busyLabel={leaving ? 'Leaving…' : 'Removing…'}
          busy={busy}
          onConfirm={() => {
            if (removing === null) return
            router.delete(href(paths.teamMember, { team: team.slug, member: removing.userId }), {
              preserveScroll: true,
              onStart: () => setBusy(true),
              onFinish: () => {
                setBusy(false)
                setRemoving(null)
              },
            })
          }}
        />

        <UnderTheHood route="PUT /teams/{team:slug}/members/{member:userId}" action="changeRole">
          <Guarantee>
            <code>{'{member:userId}'}</code> binds this team’s membership of that person: another team’s is a 404.
          </Guarantee>
          <Guarantee>
            <code>can('members.role')</code> lets only the owner change roles; everyone else gets a 403.
          </Guarantee>
          <Guarantee>A trigger refuses a second owner, or a change to the owner’s role, whatever writes it.</Guarantee>
        </UnderTheHood>
      </Layout>
    </>
  )
}

export default Members
