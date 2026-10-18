import { action, render, RequireAuthLayer, RequireGuestLayer } from '@popcomputer/web/effect'
import { betterAuthLogoutAction } from '@popcomputer/web/auth'
import { startDemo } from './actions/auth'
import {
  addNote,
  changePhase,
  createRetro,
  deleteNote,
  deleteRetro,
  markDone,
  showRetro,
  unvote,
  vote,
} from './actions/retros'
import {
  acceptInvite,
  changeRole,
  createTeam,
  listMembers,
  newInvite,
  removeMember,
  showDashboard,
  showInvite,
  showTeam,
} from './actions/teams'
import { routes } from './app'
import { RequireMember } from './memberships'
import { paths } from './paths'

// Nobody registers: the sign-in page starts the demo, as a guest.
routes
  .provide(RequireGuestLayer)
  .get(paths.login, action(render('Auth/Login')))
  .post(paths.login, startDemo)

routes.post(paths.logout, betterAuthLogoutAction({ redirectTo: paths.login }))

routes
  .provide(RequireAuthLayer)
  .get(paths.dashboard, showDashboard)
  .post(paths.teams, createTeam, { form: paths.dashboard })
  // A guest who opens an invite link signs in first, then comes back to it.
  .get(paths.join, showInvite)
  .post(paths.join, acceptInvite)

// Everything inside a team is its members' alone: the guard answers anyone
// else with the 404 a missing team gets, before any of these actions runs.
routes
  .prefix('/teams/{team:slug}')
  .provide(RequireAuthLayer)
  .provide(RequireMember)
  .get(paths.team, showTeam)
  .get(paths.teamMembers, listMembers)
  .put(paths.teamMember, changeRole, { form: paths.teamMembers })
  .delete(paths.teamMember, removeMember, { form: paths.teamMembers })
  .post(paths.teamInvite, newInvite, { form: paths.teamMembers })
  .post(paths.retros, createRetro, { form: paths.team })
  .get(paths.retro, showRetro)
  .delete(paths.retro, deleteRetro, { form: paths.retro })
  .put(paths.retroPhase, changePhase, { form: paths.retro })
  .post(paths.notes, addNote, { form: paths.retro })
  .delete(paths.note, deleteNote, { form: paths.retro })
  .post(paths.noteVotes, vote, { form: paths.retro })
  .delete(paths.noteVotes, unvote, { form: paths.retro })
  .put(paths.noteDone, markDone, { form: paths.retro })
