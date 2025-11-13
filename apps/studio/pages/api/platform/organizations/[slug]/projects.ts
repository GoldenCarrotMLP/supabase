import type { NextApiRequest, NextApiResponse } from 'next'  
import { execSync } from 'child_process'  
import type { components } from 'data/api'  
  
type OrgProjectsResponse = components['schemas']['OrganizationProjectsResponse']  
  
const DOCKER_CONTAINER = process.env.DOCKER_CONTAINER || 'supabase-db-17'  
const POSTGRES_USER = process.env.POSTGRES_USER || 'supabase_admin'  
const POSTGRES_DB = process.env.POSTGRES_DB || 'postgres'  
  
async function getCurrentStatus(): Promise<'ACTIVE_HEALTHY' | 'RESTORING'> {  
  try {  
    // Check if restore is in progress  
    const restoreCheck = `docker exec ${DOCKER_CONTAINER} psql -U ${POSTGRES_USER} -d template1 -t -c "SELECT COUNT(*) FROM pg_stat_activity WHERE application_name LIKE '%psql%' AND query LIKE '%COPY%'"`  
    const restoreResult = execSync(restoreCheck, { encoding: 'utf-8', timeout: 5000 }).trim()  
    if (parseInt(restoreResult) > 0) {  
      return 'RESTORING'  
    }  
  
    // Check if auth.users table exists  
    const healthCheck = `docker exec ${DOCKER_CONTAINER} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users');"`  
    const healthResult = execSync(healthCheck, { encoding: 'utf-8', timeout: 5000 }).trim()  
      
    return healthResult === 't' ? 'ACTIVE_HEALTHY' : 'RESTORING'  
  } catch {  
    return 'RESTORING'  
  }  
}  
  
export default async function handler(  
  req: NextApiRequest,  
  res: NextApiResponse<OrgProjectsResponse>  
) {  
  if (req.method !== 'GET') {  
    return res.status(405).json({ error: 'Method not allowed' } as any)  
  }  
  
  try {  
    // Fetch current status  
    const currentStatus = await getCurrentStatus()  
  
    const response: OrgProjectsResponse = {  
      pagination: {  
        count: 1,  
        limit: 100,  
        offset: 0,  
      },  
      projects: [  
        {  
          cloud_provider: 'localhost',  
          databases: [  
            {  
              cloud_provider: 'localhost',  
              identifier: 'default',  
              region: 'local',  
              status: currentStatus,  
              type: 'PRIMARY',  
            },  
          ],  
          inserted_at: '2021-08-02T06:40:40.646Z',  
          is_branch: false,  
          name: process.env.DEFAULT_PROJECT_NAME || 'Default Project',  
          ref: 'default',  
          region: 'local',  
          status: currentStatus,  
        },  
      ],  
    }  
  
    return res.status(200).json(response)  
  } catch (err: any) {  
    console.error('Error in org projects endpoint:', err)  
    return res.status(500).json({ error: 'Failed to get projects' } as any)  
  }  
}
