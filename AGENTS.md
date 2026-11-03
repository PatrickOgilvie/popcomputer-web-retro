# For coding agents

This application is built on `@popcomputer/web`. Follow
`node_modules/@popcomputer/web/AGENTS.md`: its rules name the one API for each
task, and its docs (`node_modules/@popcomputer/web/docs/`, one short file per
task, which `docs/which-api.md` indexes) show each in full. Where this file and
those rules differ, the rules win.

## Where things are declared

Each is declared once, and everything else derives from it:

- `src/paths.ts`: every URL. Build links with `href(paths.x, params)`.
- `src/schema.ts`: the D1 tables (`src/auth-schema.ts` holds Better Auth's).
- `src/forms.ts`: the schemas forms are validated with, which type the forms
  in React too (`FormInput<typeof NoteForm>`).
- `src/pages.ts`: each page's props, taken from the tables' columns.
- `src/env.ts`: the Worker's vars and secrets, each with its schema; the
  bindings type derives from it. `APP_URL` is Better Auth's own address,
  never the request's URL: `wrangler.jsonc` sets the live one, `bun run dev`
  its own and `test/app.ts` the tests'.
- `src/app.ts`: `setupWeb`, which owns rendering, D1, auth and route binding.
- `src/routes.ts`: every route, with the action that answers it.
- `src/actions/`: the actions. `src/pages/`: the React pages, each listed in
  `src/main.tsx`.

## Adding a page

1. Declare its path in `src/paths.ts`.
2. Declare its props in `src/pages.ts`.
3. Declare its form's fields, if it has a form, in `src/forms.ts`. The
   action that takes the form receives them validated:
   `action(form(RetroForm, { page: paths.team }), (input) => ...)`,
   where `page` is the page the form is on.
4. Write its action in `src/actions/`, and register it in `src/routes.ts`
   (behind `RequireAuthLayer` when it needs a signed-in member).
5. Write the component in `src/pages/`, typed `WebPage<'Name'>`, and add it
   to `components` in `src/main.tsx`; a page without one is a type error.
6. Test it in `test/` through the app, as the tests there do.
   `test/requests.test.ts` fuzzes every route with the forms its actions
   declare; give a new path placeholder its values there, and seed and
   watch a new table, with the rule for who in a team may write its rows
   in `teamWrites`. `bun test` runs it for 200 cases; `bun run fuzz` runs
   5,000 from a new seed, and a failure prints the replay that repeats it.

The team and retro pages are examples to copy and learn from: a membership
guard (`src/memberships.ts`) for every route under `/teams/{team:slug}`,
with `can(permission)` in each action that needs a role; records scoped
under their team; and rules concurrent requests could break (vote budgets,
phases, one owner) held by triggers in `migrations/0001_retro_rules.sql`.

A route that reads a record, such as a project, names it in its path (`/projects/{project}`)
and reads it with `bound('project')`. Add its table to `bindings` in
`src/app.ts` with who may load it, and never check that in the action:
`routeBinding(schema.projects, { ownedBy: 'userId' })` for the signed-in
member's own records, whose others are the 404 a missing record is;
`{ publicWhen: { visibility: 'public' } }` for a page anyone may see, under
a binding of its own, the table bound twice;
`{ public: true }` for any record, to anyone. A record that lives inside
another, such as a task in a project, goes under it in the path
(`/projects/{project}/tasks/{task}`) and says
`{ scope: { project: { foreignKey: 'projectId' } } }`, so it loads only under
its project and the project's binding decides. The lint rule
`require-binding-access` reports a binding that doesn't say.

## Changing the database

Edit `src/schema.ts`, then run `bun run db:generate` for a new migration in
`migrations/`, and `bun run db:migrate:local` to apply it locally; restarting
the app with `bun run stop` and `bun run dev` applies it too, since `bun run dev`
applies new migrations as it starts. Never edit
a migration that has been applied. Tests migrate each test's own D1 database
from `migrations/`.

`bun run db:seed` deletes the local database's data, migrates a new one and
runs `src/seed.ts`, which adds nothing here (each guest gets their teams
and retros from `src/demo.ts` when they start the demo); keep the seed working when the schema
changes, as `bun run check` type-checks it. `bun run db:reset` empties the
local database. Both delete data, so without a terminal they stop and ask
for `--yes`: pass it only when the user asked for the reset, and run
`bun run stop` first if `bun run dev` is running.

`bun run db:execute "SQL"` runs one statement on the local database and
prints its result as JSON. With `--remote` it runs on the live app's
database on Cloudflare; a statement that could change data there stops and
asks for `--yes`, which you pass only once the user has said to run that
statement on the live data.

`preview_database_id: "local"` in `wrangler.jsonc` names the local database,
so its data survives the first deploy writing `database_id`; leave it. It
makes wrangler label remote D1 runs "preview database", though they run on
the live one.

## Adding a var or a secret

1. Declare it in `src/env.ts`: `secret(schema)` for a secret, with
   `{ generate: randomSecret }` when the app can make its own value;
   `variable(schema)` for a plain var; `{ optional: true }` when the app runs
   without it. Read it in an action or a service with
   `yield* env.config.NAME`, decoded by its schema: a secret as `Redacted`,
   an optional one as an `Option`.
2. A var goes in `vars` in `wrangler.jsonc`. Never put a secret there.
3. A secret goes in `.dev.vars` (`NAME=value`) for `bun run dev`, as a
   placeholder line in `.dev.vars.example`, and in `test/app.ts`'s bindings.
   Ask the user for a value nothing generates; never invent one.
4. On Cloudflare, `bun run secret NAME` sets it, with the value piped in
   (`printf %s "$VALUE" | bun run secret NAME`), checked against its schema
   first. `bun run deploy` uploads a generated one itself.

`bun run env:check` checks `.dev.vars` and the vars, and
`bun run env:check --remote` checks the secrets on Cloudflare, by name.

## Deploying

Deploy only when asked, with `bun run deploy`: it does everything, and is
safe to run again. It stops, saying why, when `src/schema.ts` has a change
with no migration (run `bun run db:generate`), when Wrangler isn't signed in
to Cloudflare (`bun run cloudflare:login` opens the user's browser to allow
it), or when the Worker lacks a secret `src/env.ts` needs that nothing
generates (`bun run secret NAME`, with the user's value). It uploads the new
version beside the live one, and makes it live only once its `/login`
answers 200 at the version's own address; it ends by printing the app's
address. When the check fails, the live version is unchanged and the output
names the address and what it answered: fetch that address to see the
error, fix it, and deploy again.

`bun run preview`, also only when asked, uploads a version that takes no
traffic and prints its address to share; it runs on the live database and
secrets, so say so to whoever it's shared with. `bun run status` says which version is live and
which migrations each database hasn't had. Each prints a sentence naming
the next command when it stops, and exits 1.

To see what the live app is doing, run `bun run logs` in the background:
it prints each request, its `console.log` lines and any error, as JSON without
a terminal, until stopped; requests to a preview's address don't show there.
To undo a deploy, `bun run rollback` puts the one before back, without asking
when there's no terminal; the database keeps its migrations.

`.github/workflows/check.yml` runs `bun run check` on GitHub, and
`.github/workflows/deploy.yml` runs `bun run deploy` for each push to `main`
once the repository has the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets; the README's "Deploying from GitHub" says
how the user adds them.

## The fence

The checks below hold whether or not a paragraph is read:

- The commit gate, `.githooks/pre-commit`, runs the type check, the lint
  rules, the tests and the debt check before every commit. `bun install`
  installs it in a git repository; `git rev-parse --git-path hooks` then
  prints `.githooks`. If it prints anything else, ask the user to run
  `git config core.hooksPath .githooks` in their own terminal. Never skip
  the gate (`git commit --no-verify` or `-n`, a changed `core.hooksPath`):
  fix what it reports.
- The command hook, in `.claude/settings.json` and `.cursor/hooks.json`,
  refuses a command that skips the gate, and asks the user before one that
  deploys, touches the live database, sets a secret, pushes, or changes the
  fence itself (`oxlint.config.ts`, `.githooks/`, the hooks, `lint-debt.json`).
- The type check runs the Effect language service, so an Effect that is
  neither yielded nor assigned fails it (`effect(floatingEffect)`).
  `bun install` patches TypeScript for it.
- `lint-debt.json` counts every comment that turns a rule or a check off,
  and the count only shrinks: `bunx popweb-fence debt --update` records a
  lower one. Fix the code a rule reports; when a line breaks a rule on
  purpose, say why after ` -- ` in its disable comment, and leave raising
  the count to the user.

## Boundaries and sign-off

- **You may, alone:** write and change actions, routes, pages, services,
  schemas, migrations and their tests; run them against the local database
  (`bun run dev`, `bun run db:migrate:local`, `bun run db:execute` without
  `--remote`) and build (`bun run build`); add or tighten a test, a lint
  rule, a binding's access or a role's permissions; fix the code a rule
  reports, lowering the debt; edit the documentation and this file, except
  this section; commit locally once the gate passes.
- **Needs the user's sign-off:** a deploy (`bun run deploy`, `bun run
  preview`, `bun run rollback`); the live database (`bun run db:migrate`,
  any `--remote` read or write); secrets (`bun run secret`); deleting local
  data (`bun run db:reset`, `bun run db:seed`); a push; loosening
  `oxlint.config.ts` or raising the debt count; changing the commit gate or
  the agent's hooks; and widening access: who may load a record (a binding
  moved to `publicWhen` or `public`, or a record's `scope` dropped), a route
  moved out from behind `RequireMember` or `RequireAuthLayer`, a role given
  a permission in `src/memberships.ts`, who may join a team (an invite that
  outlives its week, or a join without one), Better Auth's handler
  registered for its client SDK and the user fields its `settable` names,
  `verifyOrigin`'s `allowedOrigins`, a raised `bodyLimit`, or
  `history.encrypt` turned off.

The command hook asks the user before the steps it can see. Ask before the
others yourself, and say what the change widens.

## Before finishing

Run `bun run check`: the type check with the Effect language service, the
framework's lint rules, the tests and the debt check. Fix what they report
rather than disabling a rule. After changing routes, bindings or actions,
run `bun run fuzz` too. Then run `bun run mutate`: it plants small bugs in
the `src/` lines you changed and lists each one no test catches; write the
test that fails with each, or say why the change it makes is one no caller
sees.
