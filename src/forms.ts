// The fields each form sends, which its action validates and its page types
// its form with. The browser imports this module only with `import type`.
import { Schema as S } from 'effect'
import { between, checkbox, currentPassword, email, password, requiredString } from '@popcomputer/web/schema'

/** A role in a team: an owner runs everything, an admin runs retros and invites, a member takes part. */
export const Role = S.Literals(['owner', 'admin', 'member'])

/** Where a retro is: writing notes, voting on them, talking them through, or done. */
export const Phase = S.Literals(['collecting', 'voting', 'discussing', 'closed'])

/** A retro's three columns. */
export const NoteColumn = S.Literals(['went_well', 'to_improve', 'action'])

const name = requiredString.check(S.isMaxLength(100, { message: 'Use at most 100 characters.' }))

export const TeamForm = S.Struct({ name: name.check(S.isMaxLength(60, { message: 'Use at most 60 characters.' })) })

export const RetroForm = S.Struct({
  title: name,
  votesPerPerson: between(1, 10, 'Give each person from 1 to 10 votes.').check(S.isInt({ message: 'Give each person a whole number of votes.' })),
})

export const PhaseForm = S.Struct({ phase: Phase })

export const NoteForm = S.Struct({
  column: NoteColumn,
  body: requiredString.check(S.isMaxLength(500, { message: 'Use at most 500 characters.' })),
})

export const ActionDone = S.Struct({ done: checkbox })

/** The role an owner gives another member. Nobody is made an owner this way. */
export const RoleForm = S.Struct({ role: S.Literals(['admin', 'member']) })

/** An invite link's token, from its path. */
export const InviteToken = S.Struct({ token: requiredString })

// A password signs in exactly as it was chosen: currentPassword never trims it.
export const SignIn = S.Struct({ email, password: currentPassword })

export const Register = S.Struct({
  name,
  email,
  password: password({ min: 12, max: 128 }),
})
