// lib/docker-utils.ts
import { execSync, exec } from 'child_process'
import { executeQuery } from 'lib/api/self-hosted/query'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// Fail fast if DOCKER_CONTAINER is not provided
const DOCKER_CONTAINER = process.env.DOCKER_CONTAINER
if (!DOCKER_CONTAINER) {
  throw new Error('Environment variable DOCKER_CONTAINER must be provided')
}

/**
 * Execute a SQL query inside the dockerized Postgres as supabase_admin.
 * @param database - the database name to connect to
 * @param sqlQuery - the SQL query string to execute
 * @param options - optional timeout
 * @returns stdout from psql
 */
export function execQueryInDocker(
  database: string,
  sqlQuery: string,
  options?: { timeout?: number }
): string {
  const timeout = options?.timeout || 5000
  const escaped = sqlQuery.replace(/"/g, '\\"')
  const cmd = `docker exec ${DOCKER_CONTAINER} psql -U supabase_admin -d ${database} -A -F"," -t -c "${escaped}"`
  return execSync(cmd, { encoding: 'utf-8', timeout }).trim()
}


/**
 * Check if a restore operation is currently in progress by looking for bulk restore sessions
 */
export function isRestoreInProgress(): boolean {
  try {
    const cmd = `docker exec ${DOCKER_CONTAINER} psql -U supabase_admin -d template1 -t -c "
      SELECT COUNT(*)
      FROM pg_stat_activity
      WHERE application_name IN ('psql','pg_restore')
        AND state = 'active'
        AND (
          query ~* '^(COPY|CREATE|ALTER|COMMENT|GRANT|REVOKE|INSERT)'
        )
        AND backend_start < now() - interval '5 seconds'
    "`
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim()
    const count = parseInt(result, 10)
    return count > 0
  } catch (err) {
    console.error('Error checking restore progress:', err)
    return false
  }
}

/**
 * Check if the database has the auth.users table, indicating it's fully restored and healthy
 */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    // Example of using execQueryInDocker directly instead of executeQuery
    const result = execQueryInDocker(
      'postgres',
      `SELECT EXISTS (
         SELECT FROM information_schema.tables
         WHERE table_schema = 'auth' AND table_name = 'users'
       ) as table_exists;`
    )

    return result.includes('t') // psql returns 't' for true
  } catch (err) {
    console.error('Error checking database health:', err)
    return false
  }
}

/**
 * Get the current project status based on restore progress and database health
 */
export async function getCurrentProjectStatus(): Promise<'ACTIVE_HEALTHY' | 'RESTORING' | 'ACTIVE_UNHEALTHY'> {
  if (isRestoreInProgress()) {
    return 'RESTORING'
  }
  const isHealthy = await isDatabaseHealthy()
  return isHealthy ? 'ACTIVE_HEALTHY' : 'ACTIVE_UNHEALTHY'
}

export function execDockerCommand(command: string, options?: { timeout?: number }): string {
  const timeout = options?.timeout || 5000
  const cmd = `docker exec ${DOCKER_CONTAINER} ${command}`
  return execSync(cmd, { encoding: 'utf-8', timeout }).trim()
}

/**
 * Execute SQL by writing it to a temp file, copying into the container, and running with psql -f
 */
export function execPsqlCommand(database: string, sqlCommand: string, options?: { timeout?: number }) {
  const timeout = options?.timeout || 5000
  const tmpDir = os.tmpdir()
  const tmpFile = path.join(tmpDir, `restore-${Date.now()}.sql`)
  fs.writeFileSync(tmpFile, sqlCommand, { encoding: 'utf-8' })

  const cmd = `docker cp ${tmpFile} ${DOCKER_CONTAINER}:/tmp/restore.sql && docker exec ${DOCKER_CONTAINER} psql -U supabase_admin -d ${database} -f /tmp/restore.sql`
  const result = execSync(cmd, { encoding: 'utf-8', timeout }).trim()

  fs.unlinkSync(tmpFile)
  return result
}

/**
 * Stream a backup file from rclone into Postgres inside the container.
 * This runs asynchronously in the background.
 */
export function streamRestoreFromRclone(
  rcloneRemote: string,
  rcloneBaseDir: string,
  backupPath: string,
  options?: { database?: string; user?: string; onExit?: (err: Error | null) => void }
) {
  const database = options?.database
  const user = options?.user || 'supabase_admin'

  const restoreCmd = `
    rclone cat ${rcloneRemote}:${rcloneBaseDir}/${backupPath} \
    | gunzip \
    | docker exec -i ${DOCKER_CONTAINER} psql -U ${user} -d ${database}
  `

  const child = exec(restoreCmd, (error, stdout, stderr) => {
    if (error) {
      console.error('Restore failed:', error)
      console.error('stderr:', stderr)
      options?.onExit?.(error)
    } else {
      console.log('Restore completed successfully')
      console.log('stdout:', stdout)
      options?.onExit?.(null)
    }
  })

  return child
}