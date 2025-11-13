// apps/studio/lib/backup-utils.ts
import { execSync } from 'child_process'

export function parseBackupTimestamp(filename: string): string | null {
  const regex =
    /supabase-postgres-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})(?:-(?:AM|PM))?\.sql\.gz$/;
  const match = filename.match(regex);
  if (!match) return null;

  const [, date, hh, mm] = match;
  const hour = parseInt(hh, 10);
  const minute = parseInt(mm, 10);

  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  try {
    // Build a Date in NYC local time
    const dt = new Date(`${date}T${hour.toString().padStart(2, '0')}:${minute
      .toString()
      .padStart(2, '0')}:00`);

    // Format with NYC timezone offset
    const tz = 'America/New_York';
    const offsetMinutes = -dt
      .toLocaleString('en-US', { timeZone: tz, timeZoneName: 'short' })
      .includes('EDT')
      ? 240
      : 300;

    const offsetHours = Math.floor(offsetMinutes / 60);
    const offsetSign = '-';
    const offsetStr = `${offsetSign}${offsetHours
      .toString()
      .padStart(2, '0')}:00`;

    return `${date}T${hour.toString().padStart(2, '0')}:${minute
      .toString()
      .padStart(2, '0')}:00${offsetStr}`;
  } catch {
    return null;
  }
}

export interface RcloneFile {
  Path: string
  Size: number
  ModTime: string
  // rclone also returns IsDir, MimeType, etc. — add if you need them
}

export function listBackupsFromRclone(
  rcloneRemote: string,
  rcloneBaseDir: string
): RcloneFile[] {
  const cmd = `rclone lsjson --recursive ${rcloneRemote}:${rcloneBaseDir}`
  const output = execSync(cmd, { encoding: 'utf-8' })
  return JSON.parse(output) as RcloneFile[]
}