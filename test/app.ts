import { expect } from 'bun:test'
import { Layer, Redacted } from 'effect'
import { href } from '@popcomputer/web/paths'
import { readPage, signedIn, testBrowser, testClock, testEnv, testRateLimiter, type TestBrowser } from '@popcomputer/web/testing'
import { app } from '../src/app'
import { createDb } from '../src/db'
import { user } from '../src/schema'
import { paths } from '../src/paths'
import { databases } from './databases'
import '../src/routes'

export { app }

/** The Worker's bindings, with a new, empty D1 database. */
export async function freshEnv() {
  return testEnv(await freshBindings())
}

export async function freshBindings() {
  return {
    DB: await databases.fresh(),
    BETTER_AUTH_SECRET: 'test-only-secret-0123456789abcdef0123456789',
    SIGN_IN_LIMITER: testRateLimiter(),
    ENVIRONMENT: 'test' as const,
  }
}

/** Fresh bindings and a clock the test moves, which every request reads. */
export async function clockedEnv() {
  const time = await testClock(new Date())
  return { env: testEnv(time.layer, await freshBindings()), time }
}

export type Env = Awaited<ReturnType<typeof freshEnv>>

/** A request as Inertia sends a form: its fields as JSON. */
export function send(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', fields: Record<string, unknown> = {}): RequestInit {
  return {
    method,
    headers: { 'X-Inertia': 'true', 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  }
}

/** Whether a response sends the visitor to sign in. */
export function asksToSignIn(res: Response): boolean {
  return new URL(res.headers.get('Location') ?? '/', 'http://localhost').pathname === paths.login
}

/** A visit to a page, as Inertia makes it. */
export const visit: RequestInit = { headers: { 'X-Inertia': 'true' } }

/**
 * A member: a user row of their own, signed in as their session would sign
 * them in, with `layer` too, such as a test clock, and in no team yet. Each
 * member's browser shares `env`'s database.
 */
export async function member(env: Env, name: string, layer: Layer.Layer<never> = Layer.empty): Promise<TestBrowser> {
  if (env.DB === undefined) throw new Error('The test env has no DB.')
  const now = new Date()
  const row = {
    id: crypto.randomUUID(),
    name,
    email: `${name.toLowerCase()}@example.com`,
    emailVerified: false,
    image: null,
    createdAt: now,
    updatedAt: now,
    isAnonymous: false,
  }
  await createDb(env.DB).insert(user).values(row)
  const session = {
    id: `session-${row.id}`,
    token: Redacted.make(`token-${row.id}`),
    userId: row.id,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  }

  return testBrowser(app, testEnv(Layer.merge(signedIn({ user: row, session }), layer), env))
}

/** A visitor who starts the demo: a guest of their own, with their teams and retros. */
export async function startDemo(env: Env): Promise<TestBrowser> {
  const browser = testBrowser(app, env)
  const res = await browser.request(paths.login, send('POST'))

  expect(res.headers.get('Location')).toBe(paths.dashboard)

  return browser
}

/** The last segment of a redirect's path, such as a new retro's id. */
function lastSegment(res: Response): string {
  const location = new URL(res.headers.get('Location') ?? '/', 'http://localhost').pathname

  return location.split('/').at(-1) ?? ''
}

/** Start a team through the form and return its slug. */
export async function createTeam(browser: TestBrowser, name = 'Platform'): Promise<string> {
  const res = await browser.request(paths.teams, send('POST', { name }))

  expect(res.headers.get('Location')).toMatch(/^\/teams\/[a-z0-9-]+$/)

  return lastSegment(res)
}

/** Make the team's invite link and return its token. */
export async function inviteToken(browser: TestBrowser, team: string): Promise<string> {
  await browser.request(href(paths.teamInvite, { team }), send('POST'))
  const page = await readPage(await browser.request(href(paths.teamMembers, { team }), visit), 'Teams/Members')

  expect(page.props.invite).not.toBeNull()

  return page.props.invite?.token ?? ''
}

/** A member who registered, then joined the team through its invite link. */
export async function joinTeam(env: Env, name: string, token: string): Promise<TestBrowser> {
  const browser = await member(env, name)
  await browser.request(href(paths.join, { token }), send('POST'))

  return browser
}

/** Start a retro through the form and return its id. */
export async function createRetro(browser: TestBrowser, team: string, fields: Record<string, unknown> = {}): Promise<string> {
  const res = await browser.request(href(paths.retros, { team }), send('POST', { title: 'Sprint 1', votesPerPerson: 3, ...fields }))

  return lastSegment(res)
}

/** Move a retro to a phase, as its runner. */
export function setPhase(browser: TestBrowser, team: string, retro: string, phase: string): Promise<Response> {
  return browser.request(href(paths.retroPhase, { team, retro }), send('PUT', { phase }))
}

/** Put a note up and return the response. */
export function addNote(browser: TestBrowser, team: string, retro: string, column: string, body: string): Promise<Response> {
  return browser.request(href(paths.notes, { team, retro }), send('POST', { column, body }))
}

/** The retro's board, as this browser's member sees it. */
export async function board(browser: TestBrowser, team: string, retro: string) {
  return (await readPage(await browser.request(href(paths.retro, { team, retro }), visit), 'Retros/Show')).props
}
