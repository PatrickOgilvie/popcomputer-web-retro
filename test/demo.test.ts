import { describe, expect, test } from 'bun:test'
import { href } from '@popcomputer/web/paths'
import { readPage, testBrowser, testClock, testEnv, type TestBrowser } from '@popcomputer/web/testing'
import { paths } from '../src/paths'
import worker from '../src/worker'
import { addNote, app, asksToSignIn, board, freshBindings, freshEnv, inviteToken, send, setPhase, startDemo, visit } from './app'

const teamsOf = async (browser: TestBrowser) =>
  (await readPage(await browser.request(paths.dashboard, visit), 'Dashboard')).props.teams

/** The guest's own team, and this sprint's retro on it. */
async function thisSprint(browser: TestBrowser) {
  const platform = (await teamsOf(browser)).find((team) => team.name === 'Platform')
  const team = platform?.slug ?? ''
  const page = await readPage(await browser.request(href(paths.team, { team }), visit), 'Teams/Show')
  const retro = page.props.retros.find((summary) => summary.title === 'Sprint 42')?.id ?? ''
  return { team, retro, page }
}

describe('the demo', () => {
  test('the sign-in page starts the demo, and nobody registers', async () => {
    const guest = testBrowser(app, await freshEnv())

    await readPage(await guest.request(paths.login, visit), 'Auth/Login')
    expect((await guest.request('/register', visit)).status).toBe(404)
  })

  test('a guest owns a team of their own, and is a member of another', async () => {
    const browser = await startDemo(await freshEnv())
    const teams = await teamsOf(browser)

    expect(teams.map((team) => [team.name, team.role, team.memberCount])).toEqual([
      ['Design guild', 'member', 3],
      ['Platform', 'owner', 4],
    ])

    const { page } = await thisSprint(browser)

    expect(page.props.retros.map((retro) => [retro.title, retro.phase])).toEqual([
      ['Sprint 42', 'collecting'],
      ['Sprint 41', 'closed'],
    ])
    expect(page.props.openActions.map((item) => item.body)).toEqual(['Make Wednesday afternoons meeting-free.'])
  })

  test('the teammates’ notes stay hidden until the guest starts the voting, and their votes until the reveal', async () => {
    const browser = await startDemo(await freshEnv())
    const { team, retro } = await thisSprint(browser)

    const writing = await board(browser, team, retro)

    expect(writing.notes).toHaveLength(4)
    expect(writing.notes.every((note) => note.body === null && !note.mine)).toBe(true)

    await addNote(browser, team, retro, 'to_improve', 'Our standups run long.')
    await setPhase(browser, team, retro, 'voting')
    const voting = await board(browser, team, retro)

    expect(voting.notes.every((note) => note.body !== null && note.votes === null)).toBe(true)
    expect(voting.votesLeft).toBe(3)

    await setPhase(browser, team, retro, 'discussing')
    const discussing = await board(browser, team, retro)

    expect(discussing.notes[0]).toMatchObject({ body: 'Code review takes two days on average.', votes: 3 })
  })

  test('each guest’s teams are their own, and an invite link brings another guest in', async () => {
    const env = await freshEnv()
    const first = await startDemo(env)
    const second = await startDemo(env)
    const { team } = await thisSprint(first)

    expect((await second.request(href(paths.team, { team }), visit)).status).toBe(404)

    await second.request(href(paths.join, { token: await inviteToken(first, team) }), send('POST'))

    expect((await teamsOf(second)).map((joined) => joined.name).sort()).toEqual(['Design guild', 'Platform', 'Platform'])
  })

  test('signing out ends the guest’s session', async () => {
    const browser = await startDemo(await freshEnv())
    const res = await browser.request(paths.logout, send('POST'))

    expect(res.headers.get('Location')).toBe(paths.login)
    expect(asksToSignIn(await browser.request(paths.dashboard))).toBe(true)
  })

  test('guests are swept away after a week, with the teams only they were in', async () => {
    const bindings = await freshBindings()
    const browser = await startDemo(testEnv(bindings))
    const time = await testClock(Date.now() + 8 * 24 * 60 * 60 * 1000)

    await worker.scheduled({ cron: '0 3 * * *', scheduledTime: Date.now() }, testEnv(time.layer, bindings))

    expect(asksToSignIn(await browser.request(paths.dashboard))).toBe(true)
    const left = await bindings.DB.prepare(
      "SELECT (SELECT count(*) FROM teams) AS teams, (SELECT count(*) FROM retros) AS retros, (SELECT count(*) FROM user WHERE id LIKE 'demo-%') AS teammates"
    ).first()

    expect(left).toEqual({ teams: 0, retros: 0, teammates: 3 })
  })
})
