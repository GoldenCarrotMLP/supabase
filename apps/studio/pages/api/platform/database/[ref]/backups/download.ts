// apps/studio/pages/api/platform/database/[ref]/backups/download.ts

import type { NextApiRequest, NextApiResponse } from 'next'
import { execSync } from 'child_process'
import type { components } from 'data/api'
import { parseBackupTimestamp, listBackupsFromRclone } from 'lib/backup-utils'

type DownloadBackupResponse = components['schemas']['DownloadBackupResponse']

const RCLONE_REMOTE = process.env.RCLONE_REMOTE!
const RCLONE_BASE_DIR = process.env.RCLONE_BASE_DIR!

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DownloadBackupResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.body as { id?: number }
  if (!id) {
    return res.status(400).json({ error: 'Missing backup id' })
  }

  // List files with rclone using backup-utils
  let files: Array<{ Path: string }>
  try {
    files = listBackupsFromRclone(RCLONE_REMOTE, RCLONE_BASE_DIR)
  } catch (err) {
    console.error('Error listing backups:', err)
    return res.status(500).json({ error: 'Failed to list backups' })
  }

  // Match sorting logic from index.ts
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

  // Generate Dropbox link and force direct download
  try {
    const linkCmd = `rclone link ${RCLONE_REMOTE}:${RCLONE_BASE_DIR}/${backup.path}`
    let fileUrl = execSync(linkCmd, { encoding: 'utf-8', timeout: 10000 }).trim()

    // Convert dl=0 to dl=1 for direct download
    fileUrl = fileUrl.replace('?dl=0', '?dl=1').replace('&dl=0', '&dl=1')

    return res.status(200).json({ fileUrl })
  } catch (err) {
    console.error('Failed to generate download link:', err)
    return res.status(500).json({ error: 'Failed to generate download link' })
  }
}