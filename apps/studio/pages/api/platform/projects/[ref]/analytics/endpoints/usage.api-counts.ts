// pages/api/usage.api-counts.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { execQueryInDocker } from "lib/docker-utils";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const interval = (req.query.interval as string) || "7day";

  try {
    const sql = `
      WITH dates AS (
        SELECT CASE
          WHEN '${interval}' = '1day'   THEN current_timestamp - interval '24 hours'
          WHEN '${interval}' = '7day'    THEN current_timestamp - interval '7 days'
          WHEN '${interval}' = '1hr' THEN current_timestamp - interval '60 minutes'
        END AS start
      ),
      chart_counts AS (
        SELECT
          CASE
            WHEN '${interval}' = '1day'   THEN date_trunc('hour', f0.timestamp)
            WHEN '${interval}' = '7day'    THEN date_trunc('day', f0.timestamp)
            WHEN '${interval}' = '1hr' THEN date_trunc('minute', f0.timestamp)
          END AS ts_bucket,
          COUNT(*) FILTER (WHERE (f0.body->'metadata'->'request'->>'path') ~ '/rest')     AS total_rest_requests,
          COUNT(*) FILTER (WHERE (f0.body->'metadata'->'request'->>'path') ~ '/storage')  AS total_storage_requests,
          COUNT(*) FILTER (WHERE (f0.body->'metadata'->'request'->>'path') ~ '/auth')     AS total_auth_requests,
          COUNT(*) FILTER (WHERE (f0.body->'metadata'->'request'->>'path') ~ '/realtime') AS total_realtime_requests
        FROM dates,
             _analytics.log_events_d4e343bd_4722_408c_bacd_22852e9fb22f AS f0
        WHERE (f0.body->>'project') = 'default'
          AND f0.timestamp >= (SELECT start FROM dates)
        GROUP BY ts_bucket
      )
      SELECT
        ts_bucket AT TIME ZONE 'UTC' AS timestamp,
        COALESCE(SUM(total_rest_requests), 0)     AS total_rest_requests,
        COALESCE(SUM(total_storage_requests), 0)  AS total_storage_requests,
        COALESCE(SUM(total_auth_requests), 0)     AS total_auth_requests,
        COALESCE(SUM(total_realtime_requests), 0) AS total_realtime_requests
      FROM chart_counts
      GROUP BY ts_bucket
      ORDER BY ts_bucket ASC;
    `;

    // Use CSV output for easier parsing
    const raw = execQueryInDocker("_supabase", sql);

    const rows = raw
      .split("\n")
      .filter(Boolean)
      .map(line => {
        const [timestamp, rest, storage, auth, realtime] = line.split(",");
        return {
          // Normalize timestamp to ISO without timezone suffix
          timestamp: new Date(timestamp).toISOString().replace("Z", ""),
          total_auth_requests: Number(auth),
          total_realtime_requests: Number(realtime),
          total_rest_requests: Number(rest),
          total_storage_requests: Number(storage),
        };
      });

    res.status(200).json({ result: rows, error: null });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ result: [], error: { message: "Internal server error" } });
  }
}