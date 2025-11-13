// apps/studio/pages/api/platform/database/[ref]/backups/restore.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { parseBackupTimestamp, listBackupsFromRclone } from 'lib/backup-utils'
import { execPsqlCommand, streamRestoreFromRclone } from 'lib/docker-utils'

const RCLONE_REMOTE = process.env.RCLONE_REMOTE!
const RCLONE_BASE_DIR = process.env.RCLONE_BASE_DIR!

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ message: string } | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.body as { id?: number }
  if (!id) {
    return res.status(400).json({ error: 'Missing backup id' })
  }

  try {
    // List files
    let files: Array<{ Path: string }>
    try {
      files = listBackupsFromRclone(RCLONE_REMOTE, RCLONE_BASE_DIR)
    } catch (err) {
      console.error('Error listing backups:', err)
      return res.status(500).json({ error: 'Failed to list backups' })
    }

    // Build backup list with IDs
    const backups = files
      .map((f) => {
        const ts = parseBackupTimestamp(f.Path)
        if (!ts) return null
        return { path: f.Path, inserted_at: ts }
      })
      .filter((b): b is { path: string; inserted_at: string } => b !== null)
      .sort((a, b) => (a.inserted_at < b.inserted_at ? 1 : -1))
      .map((b, idx, arr) => ({
        id: arr.length - idx,
        path: b.path,
      }))

    const backup = backups.find((b) => b.id === id)
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' })
    }

    console.log(`Starting restore of backup: ${backup.path}`)

    // Phase 1: terminate connections to target DBs
    try {
      execPsqlCommand(
        'template1',
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname IN ('_supabase','postgres')
           AND pid <> pg_backend_pid();`
      )
    } catch (err) {
      console.error('Error terminating connections:', err)
      return res.status(500).json({ error: 'Failed to terminate connections' })
    }

    // Phase 2: stream restore (dump will handle drops/creates)
    streamRestoreFromRclone(RCLONE_REMOTE, RCLONE_BASE_DIR, backup.path, {
      database: 'postgres',
      onExit: (err) => {
        if (err) {
          console.error('Background restore failed', err)
        } else {
          console.log('Background restore finished')
        }
      },
    })

    console.log('Restore started in background')
    return res.status(200).json({ message: 'Restore started successfully' })
  } catch (err) {
    console.error('Failed to start restore:', err)
    return res.status(500).json({ error: 'Failed to start restore' })
  }
}