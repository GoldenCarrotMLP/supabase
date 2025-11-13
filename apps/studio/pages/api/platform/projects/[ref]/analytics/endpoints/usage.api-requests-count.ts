// File: pages/api/platform/projects/default/analytics/endpoints/usage.api-requests-count.ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    result: [
      {
        count: 54,
      },
    ],
    error: null,
  })
}