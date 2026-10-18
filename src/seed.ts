/**
 * `bun run db:seed` leaves the local database empty: each visitor who starts
 * the demo gets their own teams and retros from src/demo.ts, here as on
 * Cloudflare.
 */
export async function seed(): Promise<void> {
  console.log('Open the app and choose Start the demo: each guest gets the teams and retros in src/demo.ts.')
}
