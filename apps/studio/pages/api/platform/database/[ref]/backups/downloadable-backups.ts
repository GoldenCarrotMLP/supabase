// apps/studio/pages/api/platform/database/[ref]/backups/downloadable-backups.ts

import type { NextApiRequest, NextApiResponse } from 'next'
import type { components } from 'data/api'
import { parseBackupTimestamp, listBackupsFromRclone } from 'lib/backup-utils'

type DownloadableBackupsResponse = components['schemas']['DownloadableBackupsResponse']

const RCLONE_REMOTE = process.env.RCLONE_REMOTE!
const RCLONE_BASE_DIR = process.env.RCLONE_BASE_DIR!
const PROJECT_ID = parseInt(process.env.PROJECT_ID || '1')

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DownloadableBackupsResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    let files: Array<{ Path: string }>
    try {
      files = listBackupsFromRclone(RCLONE_REMOTE, RCLONE_BASE_DIR)
    } catch (err) {
      console.error('Error listing backups:', err)
      return res.status(500).json({ error: 'Failed to list backups' })
    }

    const backups = files
      .map((f) => {
        const ts = parseBackupTimestamp(f.Path)
        if (!ts) return null
        return { inserted_at: ts }
      })
      .filter((b): b is { inserted_at: string } => b !== null)
      .sort((a, b) => (a.inserted_at < b.inserted_at ? 1 : -1))
      .map((b, idx, arr) => ({
        id: arr.length - idx,
        inserted_at: b.inserted_at,
        isPhysicalBackup: false,
        project_id: PROJECT_ID,
        status: 'COMPLETED' as const,
      }))

    const response: DownloadableBackupsResponse = {
      backups,
      status: 'ok',
    }

    return res.status(200).json(response)
  } catch (err: any) {
    console.error('Unexpected error in downloadable-backups handler:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}