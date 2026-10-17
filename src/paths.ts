// Every route's path, declared once: routes register on them, actions
// redirect to them and pages link to them with href.
export const paths = {
  dashboard: '/',
  login: '/login',
  register: '/register',
  logout: '/logout',

  teams: '/teams',
  team: '/teams/{team:slug}',
  teamMembers: '/teams/{team:slug}/members',
  teamMember: '/teams/{team:slug}/members/{member:userId}',
  teamInvite: '/teams/{team:slug}/invite',
  join: '/join/{token}',

  retros: '/teams/{team:slug}/retros',
  retro: '/teams/{team:slug}/retros/{retro}',
  retroPhase: '/teams/{team:slug}/retros/{retro}/phase',
  notes: '/teams/{team:slug}/retros/{retro}/notes',
  note: '/teams/{team:slug}/retros/{retro}/notes/{note}',
  noteVotes: '/teams/{team:slug}/retros/{retro}/notes/{note}/votes',
  noteDone: '/teams/{team:slug}/retros/{retro}/notes/{note}/done',

  sessions: '/sessions',
  otherSessions: '/sessions/others',
  session: '/sessions/{session}',
} as const
