// Pre-warms the DB connection (and runs any pending migrations) once at
// server startup rather than lazily on the first request that happens to
// need it — see server/utils/db.ts for the connection itself.
import { getDb } from '../utils/db'

export default defineNitroPlugin(async () => {
  await getDb()
})
