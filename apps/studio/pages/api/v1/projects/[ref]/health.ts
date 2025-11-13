// apps/studio/pages/api/v1/projects/[ref]/health.ts
import http from 'http'
import type { NextApiRequest, NextApiResponse } from 'next'

function dockerRequest(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get({ socketPath: '/var/run/docker.sock', path }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('error', reject)
  })
}

async function getHealthByService(service: string) {
  // Find container(s) with the service label
  const filter = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.service=${service}`] }))
  const containers = await dockerRequest(`/containers/json?filters=${filter}`)
  if (!containers.length) {
    return { name: service, healthy: false, status: 'UNHEALTHY', error: 'No container found' }
  }

  const id = containers[0].Id
  const info = await dockerRequest(`/containers/${id}/json`)
  const status = info.State.Health?.Status || 'unknown'

  return {
    name: service,
    healthy: status === 'healthy',
    status: status === 'healthy' ? 'ACTIVE_HEALTHY' : 'UNHEALTHY',
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { services } = req.query
  let requested: string[]

  if (typeof services === 'string' && services.length > 0) {
    // Use whatever the URL asked for
    requested = services.split(',')
  } else {
    // No query param: discover all services on the supabase_default network
    const filter = encodeURIComponent(JSON.stringify({ network: ['supabase_default'] }))
    const containers = await dockerRequest(`/containers/json?filters=${filter}`)
    requested = containers.map((c: any) => c.Labels['com.docker.compose.service'])
  }

  const results = await Promise.all(requested.map((s) => getHealthByService(s)))
  res.status(200).json(results)
}