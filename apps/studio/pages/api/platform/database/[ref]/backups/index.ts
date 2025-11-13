// apps/studio/pages/api/platform/database/[ref]/backups/index.ts

import type { NextApiRequest, NextApiResponse } from 'next'
import type { components } from 'data/api'
import { parseBackupTimestamp, listBackupsFromRclone } from 'lib/backup-utils'

// Type definition from packages/api-types/types/platform.d.ts
type BackupsResponse = components['schemas']['BackupsResponse']

// Environment variables with defaults for self-hosted setups
const RCLONE_REMOTE = process.env.RCLONE_REMOTE!
const RCLONE_BASE_DIR = process.env.RCLONE_BASE_DIR!
const REGION = process.env.REGION || 'self-hosted'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BackupsResponse | { error: string }>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Get project ref from URL parameter
  const projectRef = req.query.ref as string
  if (!projectRef) {
    return res.status(400).json({ error: 'Project ref is required' })
  }

  try {
    // List all backup files from rclone remote using backup-utils
    let files: Array<{ Path: string; Size: number; ModTime: string }>
    try {
      files = listBackupsFromRclone(RCLONE_REMOTE, RCLONE_BASE_DIR)
    } catch (err) {
      console.error('Error listing backups:', err)
      return res.status(500).json({ error: 'Failed to list backups' })
    }

    // Parse and sort backups
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
        project_id: 1, // Hardcoded for self-hosted (single project)
        status: 'COMPLETED' as const,
      }))

    const response: BackupsResponse = {
      backups,
      physicalBackupData: {},
      pitr_enabled: false,
      region: REGION,
      tierKey: 'PRO',
      walg_enabled: false,
    }

    return res.status(200).json(response)
  } catch (err: any) {
    console.error('Unexpected error in backups handler:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}