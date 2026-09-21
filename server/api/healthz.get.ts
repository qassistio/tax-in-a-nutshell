// Cheap DB connectivity check — mainly for diagnosing Vercel deploys where
// NUXT_TURSO_DATABASE_URL/NUXT_TURSO_AUTH_TOKEN are missing or wrong: curling
// this endpoint surfaces the actual getDb()/createDb() error directly,
// rather than only finding out mid-submission that the one server-side
// table (see server/utils/db.ts) never connected.
import { sql } from 'drizzle-orm'
import { getDb } from '../utils/db'

export default defineEventHandler(async () => {
  try {
    const db = await getDb()
    await db.run(sql`SELECT 1`)
    return { status: 'ok' }
  } catch (e) {
    throw createError({
      statusCode: 503,
      message: `Database unavailable: ${e instanceof Error ? e.message : String(e)}`
    })
  }
})
