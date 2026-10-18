import { Head, useForm, usePage } from '@inertiajs/react'
import type { FormEvent } from 'react'

import AuthShell from '~/components/AuthShell'
import { buttonClassName } from '~/components/button'
import { Guarantee } from '~/components/UnderTheHood'
import { paths } from '~/paths'

/** The way in: one button that signs the visitor in as a guest, with a team and retros of their own. */
export default function Login() {
  const { errors } = usePage().props
  const { post, processing } = useForm({})

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    post(paths.login)
  }

  return (
    <>
      <Head title="Try the retro board" />
      <AuthShell
        title="Try the retro board"
        description="One click signs you in as a guest of your own, with a team of your own: last sprint’s retro, and this sprint’s waiting for your notes. No email, no password."
        footnote="Guests, and everything they change, are deleted after a week."
        route="POST /login"
        action="startDemo"
        guarantees={
          <>
            <Guarantee>
              Better Auth’s anonymous plugin makes the guest, through its own handler, so the sign-in limits count it
              by address.
            </Guarantee>
            <Guarantee>Your teams and retros are written in one dbBatch as you sign in, through the phases the retro’s triggers allow.</Guarantee>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {typeof errors.form === 'string' ? (
            <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-pretty text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              {errors.form}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={processing}
            aria-busy={processing}
            className={buttonClassName({ className: 'h-11 w-full text-base' })}
          >
            <span aria-live="polite">{processing ? 'Starting…' : 'Start the demo'}</span>
          </button>
        </form>
      </AuthShell>
    </>
  )
}
