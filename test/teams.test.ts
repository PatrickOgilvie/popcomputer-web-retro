import { describe, expect, test } from 'bun:test'
import { href } from '@popcomputer/web/paths'
import { readPage, testBrowser, type TestBrowser } from '@popcomputer/web/testing'
import { paths } from '../src/paths'
import { app, asksToSignIn, clockedEnv, createRetro, createTeam, freshEnv, inviteToken, joinTeam, member, send, visit } from './app'

const members = async (browser: TestBrowser, team: string) =>
  (await readPage(await browser.request(href(paths.teamMembers, { team }), visit), 'Teams/Members')).props

describe('teams', () => {
  test('starting one makes its starter the owner, and lists it', async () => {
    const browser = await member(await freshEnv(), 'Ada')
    const res = await browser.request(paths.teams, send('POST', { name: 'Platform Squad!' }))
    const page = await readPage(await browser.follow(res), 'Teams/Show')

    expect(page.props.team.name).toBe('Platform Squad!')
    expect(page.props.team.slug).toMatch(/^platform-squad-[a-z0-9]{4}$/)
    expect(page.props.role).toBe('owner')

    const dashboard = await readPage(await browser.request(paths.dashboard, visit), 'Dashboard')

    expect(dashboard.props.teams.map((team) => [team.name, team.role, team.memberCount])).toEqual([['Platform Squad!', 'owner', 1]])
  })

  test('a team is the same 404 as a missing one to anyone outside it', async () => {
    const env = await freshEnv()
    const ada = await member(env, 'Ada')
    const grace = await member(env, 'Grace')
    const team = await createTeam(ada)
    const retro = await createRetro(ada, team)

    expect((await grace.request(href(paths.team, { team }), visit)).status).toBe(404)
    expect((await grace.request(href(paths.teamMembers, { team }), visit)).status).toBe(404)
    expect((await grace.request(href(paths.retro, { team, retro }), visit)).status).toBe(404)
    expect((await grace.request(href(paths.retros, { team }), send('POST', { title: 'Mine', votesPerPerson: 3 }))).status).toBe(404)
    expect((await grace.request(href(paths.team, { team: 'no-such-team' }), visit)).status).toBe(404)
    expect(asksToSignIn(await testBrowser(app, env).request(href(paths.team, { team })))).toBe(true)
  })

  test('another team’s retro under this team’s address is a 404', async () => {
    const env = await freshEnv()
    const ada = await member(env, 'Ada')
    const first = await createTeam(ada, 'First')
    const second = await createTeam(ada, 'Second')
    const retro = await createRetro(ada, second)

    expect((await ada.request(href(paths.retro, { team: first, retro }), visit)).status).toBe(404)
    expect((await ada.request(href(paths.retro, { team: second, retro }), visit)).status).toBe(200)
  })
})

describe('invites', () => {
  test('a link brings someone in as a member, once', async () => {
    const env = await freshEnv()
    const ada = await member(env, 'Ada')
    const team = await createTeam(ada)
    const token = await inviteToken(ada, team)
    const grace = await member(env, 'Grace')

    const invite = await readPage(await grace.request(href(paths.join, { token }), visit), 'Teams/Join')

    expect(invite.props).toMatchObject({ team: { slug: team }, memberCount: 1, alreadyMember: false })

    const res = await grace.request(href(paths.join, { token }), send('POST'))

    expect(res.headers.get('Location')).toBe(href(paths.team, { team }))

    await grace.request(href(paths.join, { token }), send('POST'))
    const list = await members(ada, team)

    expect(list.members.map((member) => [member.name, member.role])).toEqual([['Ada', 'owner'], ['Grace', 'member']])
  })

  test('a guest who opens a link signs in first, then comes back to it', async () => {
    const env = await freshEnv()
    const ada = await member(env, 'Ada')
    const token = await inviteToken(ada, await createTeam(ada))
    const guest = testBrowser(app, env)

    const asked = await guest.request(href(paths.join, { token }))

    expect(asked.headers.get('Location')).toBe(`/login?redirect=${encodeURIComponent(href(paths.join, { token }))}`)
  })

  test('a link stops working after a week, or once a new one replaces it', async () => {
    const { env, time } = await clockedEnv()
    const ada = await member(env, 'Ada', time.layer)
    const team = await createTeam(ada)
    const old = await inviteToken(ada, team)
    const current = await inviteToken(ada, team)
    const grace = await member(env, 'Grace', time.layer)

    expect((await grace.request(href(paths.join, { token: old }), visit)).status).toBe(404)
    expect((await grace.request(href(paths.join, { token: old }), send('POST'))).status).toBe(404)

    await time.advance('8 days')

    expect((await grace.request(href(paths.join, { token: current }), send('POST'))).status).toBe(404)
    expect((await grace.request(href(paths.team, { team }), visit)).status).toBe(404)
  })

  test('only the owner and admins see and make invite links', async () => {
    const env = await freshEnv()
    const ada = await member(env, 'Ada')
    const team = await createTeam(ada)
    const grace = await joinTeam(env, 'Grace', await inviteToken(ada, team))

    expect((await members(grace, team)).invite).toBeNull()
    expect((await grace.request(href(paths.teamInvite, { team }), send('POST'))).status).toBe(403)
  })
})

describe('roles', () => {
  test('the owner makes a member an admin, who may then run retros', async () => {
    const env = await freshEnv()
    const ada = await member(env, 'Ada')
    const team = await createTeam(ada)
    const grace = await joinTeam(env, 'Grace', await inviteToken(ada, team))
    const graceId = (await members(grace, team)).you

    expect((await grace.request(href(paths.retros, { team }), send('POST', { title: 'Mine', votesPerPerson: 3 }))).status).toBe(403)

    await ada.request(href(paths.teamMember, { team, member: graceId }), send('PUT', { role: 'admin' }))

    expect((await members(ada, team)).members.find((member) => member.userId === graceId)?.role).toBe('admin')
    expect((await grace.request(href(paths.retros, { team }), send('POST', { title: 'Mine', votesPerPerson: 3 }))).status).toBe(303)
  })

  test('only the owner changes roles, and nobody changes the owner’s', async () => {
    const env = await freshEnv()
    const ada = await member(env, 'Ada')
    const team = await createTeam(ada)
    const token = await inviteToken(ada, team)
    const grace = await joinTeam(env, 'Grace', token)
    const alan = await joinTeam(env, 'Alan', token)
    const ids = Object.fromEntries((await members(ada, team)).members.map((member) => [member.name, member.userId]))

    await ada.request(href(paths.teamMember, { team, member: ids.Grace ?? '' }), send('PUT', { role: 'admin' }))

    expect((await grace.request(href(paths.teamMember, { team, member: ids.Alan ?? '' }), send('PUT', { role: 'admin' }))).status).toBe(403)
    expect((await ada.request(href(paths.teamMember, { team, member: ids.Ada ?? '' }), send('PUT', { role: 'member' }))).status).toBe(403)
    expect((await alan.request(href(paths.teamMember, { team, member: ids.Ada ?? '' }), send('PUT', { role: 'member' }))).status).toBe(403)

    const owner = await ada.request(href(paths.teamMember, { team, member: ids.Grace ?? '' }), send('PUT', { role: 'owner' }))

    expect(owner.status).toBe(303)
    expect((await members(ada, team)).members.map((member) => member.role)).toEqual(['owner', 'admin', 'member'])
  })

  test('anyone may leave, an admin removes members, and the owner stays', async () => {
    const env = await freshEnv()
    const ada = await member(env, 'Ada')
    const team = await createTeam(ada)
    const token = await inviteToken(ada, team)
    const grace = await joinTeam(env, 'Grace', token)
    const alan = await joinTeam(env, 'Alan', token)
    const katherine = await joinTeam(env, 'Katherine', token)
    const ids = Object.fromEntries((await members(ada, team)).members.map((member) => [member.name, member.userId]))
    await ada.request(href(paths.teamMember, { team, member: ids.Grace ?? '' }), send('PUT', { role: 'admin' }))

    expect((await alan.request(href(paths.teamMember, { team, member: ids.Katherine ?? '' }), send('DELETE'))).status).toBe(403)
    expect((await grace.request(href(paths.teamMember, { team, member: ids.Ada ?? '' }), send('DELETE'))).status).toBe(403)
    expect((await ada.request(href(paths.teamMember, { team, member: ids.Ada ?? '' }), send('DELETE'))).status).toBe(403)

    await grace.request(href(paths.teamMember, { team, member: ids.Alan ?? '' }), send('DELETE'))
    const left = await katherine.request(href(paths.teamMember, { team, member: ids.Katherine ?? '' }), send('DELETE'))

    expect(left.headers.get('Location')).toBe(paths.dashboard)
    expect((await members(ada, team)).members.map((member) => member.name)).toEqual(['Ada', 'Grace'])
    expect((await alan.request(href(paths.team, { team }), visit)).status).toBe(404)
  })
})
