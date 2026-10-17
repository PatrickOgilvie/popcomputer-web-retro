import type { Phase, Role } from '~/forms'
import { cn } from '~/components/cn'

type PhaseName = typeof Phase.Type
type RoleName = typeof Role.Type

export const cardClassName =
  'rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900'

export const phases: ReadonlyArray<PhaseName> = ['collecting', 'voting', 'discussing', 'closed']

export const phaseStyles: Readonly<Record<PhaseName, { label: string; badge: string; dot: string }>> = {
  collecting: {
    label: 'Writing notes',
    badge: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-900',
    dot: 'bg-sky-500',
  },
  voting: {
    label: 'Voting',
    badge: 'bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:ring-violet-900',
    dot: 'bg-violet-500',
  },
  discussing: {
    label: 'Discussing',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900',
    dot: 'bg-amber-500',
  },
  closed: {
    label: 'Closed',
    badge: 'bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700',
    dot: 'bg-zinc-400',
  },
}

export function PhaseBadge({ phase }: { readonly phase: PhaseName }) {
  const style = phaseStyles[phase]
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 ring-inset', style.badge)}>
      <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {style.label}
    </span>
  )
}

const roleLabels: Readonly<Record<RoleName, string>> = { owner: 'Owner', admin: 'Admin', member: 'Member' }

export function RoleBadge({ role }: { readonly role: RoleName }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset',
        role === 'owner'
          ? 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900'
          : role === 'admin'
            ? 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-900'
            : 'bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700'
      )}
    >
      {roleLabels[role]}
    </span>
  )
}

/** Whether a role runs retros and invites people; the server checks it again. */
export const runsRetros = (role: RoleName): boolean => role === 'owner' || role === 'admin'

/** Initials for an avatar: `Grace Hopper` is `GH`. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return `${words[0]?.[0] ?? '?'}${words.length > 1 ? (words.at(-1)?.[0] ?? '') : ''}`.toUpperCase()
}
