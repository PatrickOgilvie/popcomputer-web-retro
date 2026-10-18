import './styles.css'
import { createInertiaApp } from '@inertiajs/react'
import type { PageName } from '@popcomputer/web/effect'
import type { WebPage } from '@popcomputer/web/react'
import { createRoot } from 'react-dom/client'
import Login from './pages/Auth/Login'
import Dashboard from './pages/Dashboard'
import ErrorPage from './pages/Errors/Error'
import ShowRetro from './pages/Retros/Show'
import InviteExpired from './pages/Teams/InviteExpired'
import Join from './pages/Teams/Join'
import Members from './pages/Teams/Members'
import ShowTeam from './pages/Teams/Show'
import { appTitle } from './title'

// Every registered page's component: a page without one is a type error.
const components: { readonly [Name in PageName]: WebPage<Name> } = {
  'Auth/Login': Login,
  Dashboard,
  'Teams/Show': ShowTeam,
  'Teams/Members': Members,
  'Teams/Join': Join,
  'Teams/InviteExpired': InviteExpired,
  'Retros/Show': ShowRetro,
}

const isPage = (name: string): name is PageName => name in components

void createInertiaApp({
  title: (title) => (title ? `${title} · ${appTitle}` : appTitle),
  // The error page is not a registered page: it answers any other name.
  resolve: (name) => (isPage(name) ? components[name] : ErrorPage),
  setup({ el, App, props }) {
    if (el !== null) createRoot(el).render(<App {...props} />)
  },
})
