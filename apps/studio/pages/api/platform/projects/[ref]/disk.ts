// apps/studio/pages/api/platform/database/[ref]/backups/disk.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { execDockerCommand, execPsqlCommand } from 'lib/docker-utils'

interface DiskAttributes {
  disk_volume_id: string
  size_gb: number
  available_gb: number
  used_gb: number
  usage_percent: number
  database_size_gb: number
  wal_size_gb: number
  system_size_gb: number
}

/**
 * Get disk usage from the database container using df command
 */
function getDiskUsage(): { total: number; used: number; available: number } {
  try {
    // Use execDockerCommand to run df inside the container
    const output = execDockerCommand('df -B1 /var/lib/postgresql/data | tail -1')
    const parts = output.split(/\s+/)
    const total = parseInt(parts[1], 10)
    const used = parseInt(parts[2], 10)
    const available = parseInt(parts[3], 10)

    return { total, used, available }
  } catch (err) {
    console.error('Error getting disk usage:', err)
    throw new Error('Failed to get disk usage')
  }
}

/**
 * Get database size using PostgreSQL query
 */
function getDatabaseSize(): number {
  try {
    const output = execPsqlCommand(
      'postgres',
      "SELECT pg_database_size('postgres')"
    )
    return parseInt(output, 10)
  } catch (err) {
    console.error('Error getting database size:', err)
    return 0
  }
}

/**
 * Get WAL size using PostgreSQL query
 */
function getWALSize(): number {
  try {
    const output = execPsqlCommand(
      'postgres',
      'SELECT COALESCE(SUM(size), 0) FROM pg_ls_waldir()'
    )
    return parseInt(output, 10)
  } catch (err) {
    console.error('Error getting WAL size:', err)
    return 0
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ attributes: DiskAttributes } | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const diskUsage = getDiskUsage()
    const databaseSizeBytes = getDatabaseSize()
    const walSizeBytes = getWALSize()

    const systemSizeBytes = diskUsage.used - databaseSizeBytes - walSizeBytes

    const GB = 1024 * 1024 * 1024
    const totalGB = Math.round((diskUsage.total / GB) * 100) / 100
    const usedGB = Math.round((diskUsage.used / GB) * 100) / 100
    const availableGB = Math.round((diskUsage.available / GB) * 100) / 100
    const databaseGB = Math.round((databaseSizeBytes / GB) * 100) / 100
    const walGB = Math.round((walSizeBytes / GB) * 100) / 100
    const systemGB = Math.round((systemSizeBytes / GB) * 100) / 100

    const usagePercent = Math.round((diskUsage.used / diskUsage.total) * 100)

    const attributes: DiskAttributes = {
      disk_volume_id: 'self-hosted-disk',
      size_gb: totalGB,
      available_gb: availableGB,
      used_gb: usedGB,
      usage_percent: usagePercent,
      database_size_gb: databaseGB,
      wal_size_gb: walGB,
      system_size_gb: systemGB,
    }

    return res.status(200).json({ attributes })
  } catch (err) {
    console.error('Error in disk endpoint:', err)
    return res.status(500).json({ error: 'Failed to retrieve disk information' })
  }
}