import { describe, expect, test } from 'bun:test'
import { href } from '@popcomputer/web/paths'
import { readPage, type TestBrowser } from '@popcomputer/web/testing'
import { paths } from '../src/paths'
import { addNote, board, createRetro, createTeam, freshEnv, inviteToken, joinTeam, member, send, setPhase, visit } from './app'

/** Ada runs a team with Grace in it, and a retro collecting notes. */
async function retroWithTwo(votesPerPerson = 3) {
  const env = await freshEnv()
  const ada = await member(env, 'Ada')
  const team = await createTeam(ada)
  const grace = await joinTeam(env, 'Grace', await inviteToken(ada, team))
  const retro = await createRetro(ada, team, { votesPerPerson })
  return { env, ada, grace, team, retro }
}

const noteId = async (browser: TestBrowser, team: string, retro: string, body: string) =>
  (await board(browser, team, retro)).notes.find((note) => note.body === body)?.id ?? ''

const voteOn = (browser: TestBrowser, team: string, retro: string, note: string) =>
  browser.request(href(paths.noteVotes, { team, retro, note }), send('POST'))

describe('writing notes', () => {
  test('another member’s note stays hidden until voting starts, and no author is ever sent', async () => {
    const { ada, grace, team, retro } = await retroWithTwo()
    await addNote(ada, team, retro, 'went_well', 'Shipped on time')
    await addNote(grace, team, retro, 'to_improve', 'Too many meetings')

    const gracesView = await board(grace, team, retro)

    expect(gracesView.notes.map((note) => [note.column, note.body, note.mine])).toEqual([
      ['went_well', null, false],
      ['to_improve', 'Too many meetings', true],
    ])
    expect(JSON.stringify(gracesView.notes)).not.toContain('Shipped on time')
    expect(Object.keys(gracesView.notes[0] ?? {})).not.toContain('authorId')

    await setPhase(ada, team, retro, 'voting')

    expect((await board(grace, team, retro)).notes.map((note) => note.body)).toEqual(['Shipped on time', 'Too many meetings'])
  })

  test('notes close once voting starts; actions open again for the discussion', async () => {
    const { ada, grace, team, retro } = await retroWithTwo()
    await setPhase(ada, team, retro, 'voting')
    await grace.request(href(paths.retro, { team, retro }), visit)

    const late = await addNote(grace, team, retro, 'went_well', 'Too late')
    const refused = await readPage(await grace.follow(late), 'Retros/Show')

    expect(refused.props.errors.body).toMatch(/isn’t taking notes/)

    await setPhase(ada, team, retro, 'discussing')
    await addNote(grace, team, retro, 'action', 'Fewer meetings on Fridays')
    await addNote(grace, team, retro, 'to_improve', 'Still too late')

    expect((await board(ada, team, retro)).notes.map((note) => note.body)).toEqual(['Fewer meetings on Fridays'])
  })

  test('only its author takes a note down', async () => {
    const { ada, grace, team, retro } = await retroWithTwo()
    await addNote(ada, team, retro, 'went_well', 'Mine')
    const note = await noteId(ada, team, retro, 'Mine')
    const path = href(paths.note, { team, retro, note })

    expect((await grace.request(path, send('DELETE'))).status).toBe(403)

    await ada.request(path, send('DELETE'))

    expect((await board(ada, team, retro)).notes).toEqual([])
  })
})

describe('voting', () => {
  test('each member spends their budget, and may stack votes on one note', async () => {
    const { ada, grace, team, retro } = await retroWithTwo(3)
    await addNote(ada, team, retro, 'went_well', 'Shipped on time')
    await addNote(grace, team, retro, 'to_improve', 'Flaky tests')
    await setPhase(ada, team, retro, 'voting')
    const shipped = await noteId(grace, team, retro, 'Shipped on time')
    const flaky = await noteId(grace, team, retro, 'Flaky tests')
    await grace.request(href(paths.retro, { team, retro }), visit)

    await voteOn(grace, team, retro, flaky)
    await voteOn(grace, team, retro, flaky)
    await voteOn(grace, team, retro, shipped)
    const fourth = await voteOn(grace, team, retro, shipped)
    const refused = await readPage(await grace.follow(fourth), 'Retros/Show')

    expect(refused.props.errors.votes).toMatch(/used all 3/)
    expect(refused.props.votesLeft).toBe(0)
    expect(refused.props.notes.map((note) => [note.body, note.myVotes, note.votes])).toEqual([
      ['Shipped on time', 1, null],
      ['Flaky tests', 2, null],
    ])

    await grace.request(href(paths.noteVotes, { team, retro, note: flaky }), send('DELETE'))

    expect((await board(grace, team, retro)).votesLeft).toBe(1)
  })

  test('the totals arrive with the discussion, highest first', async () => {
    const { ada, grace, team, retro } = await retroWithTwo(3)
    await addNote(ada, team, retro, 'went_well', 'Shipped on time')
    await addNote(grace, team, retro, 'to_improve', 'Flaky tests')
    await setPhase(ada, team, retro, 'voting')
    const flaky = await noteId(ada, team, retro, 'Flaky tests')
    const shipped = await noteId(ada, team, retro, 'Shipped on time')
    await voteOn(ada, team, retro, flaky)
    await voteOn(grace, team, retro, flaky)
    await voteOn(grace, team, retro, shipped)

    expect((await board(ada, team, retro)).notes.every((note) => note.votes === null)).toBe(true)

    await setPhase(ada, team, retro, 'discussing')

    expect((await board(grace, team, retro)).notes.map((note) => [note.body, note.votes])).toEqual([
      ['Flaky tests', 2],
      ['Shipped on time', 1],
    ])
  })

  test('votes are taken only while voting', async () => {
    const { ada, team, retro } = await retroWithTwo()
    await addNote(ada, team, retro, 'went_well', 'Early')
    const note = await noteId(ada, team, retro, 'Early')
    await ada.request(href(paths.retro, { team, retro }), visit)

    const early = await voteOn(ada, team, retro, note)

    expect((await readPage(await ada.follow(early), 'Retros/Show')).props.errors.votes).toMatch(/isn’t open/)
  })

  test('a member can’t move the retro along', async () => {
    const { grace, team, retro } = await retroWithTwo()

    expect((await setPhase(grace, team, retro, 'closed')).status).toBe(403)
    expect((await grace.request(href(paths.retro, { team, retro }), send('DELETE'))).status).toBe(403)
  })
})

describe('action items', () => {
  test('stay open on the team page until someone ticks them off', async () => {
    const { ada, grace, team, retro } = await retroWithTwo()
    await addNote(grace, team, retro, 'action', 'Fix the flaky tests')
    await setPhase(ada, team, retro, 'closed')
    const teamPage = async () => (await readPage(await ada.request(href(paths.team, { team }), visit), 'Teams/Show')).props

    const open = await teamPage()

    expect(open.openActions.map((item) => [item.body, item.retro.id])).toEqual([['Fix the flaky tests', retro]])
    expect(open.retros.map((summary) => [summary.phase, summary.noteCount])).toEqual([['closed', 1]])

    const note = open.openActions[0]?.id ?? ''
    await grace.request(href(paths.noteDone, { team, retro, note }), send('PUT', { done: true }))

    expect((await teamPage()).openActions).toEqual([])
  })
})
