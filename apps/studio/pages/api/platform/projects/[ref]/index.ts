import type { NextApiRequest, NextApiResponse } from 'next'  
  
export default async function handler(  
  req: NextApiRequest,  
  res: NextApiResponse  
) {  
  if (req.method !== 'GET') {  
    return res.status(405).json({ error: 'Method not allowed' })  
  }  
  
  const { ref } = req.query  
  
  if (ref !== 'default') {  
    return res.status(404).json({ error: 'Project not found' })  
  }  
  
  // Fetch current status  
  const statusResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/platform/projects/default/status`)  
  const { status } = await statusResponse.json()  
  
  const project = {  
    id: 1,  
    ref: 'default',  
    name: process.env.DEFAULT_PROJECT_NAME || 'Default Project',  
    organization_id: 1,  
    cloud_provider: 'localhost',  
    status: status,
    region: 'local',  
    inserted_at: '2021-08-02T06:40:40.646Z',  
    parent_project_ref: null,  
  }  
  
  return res.status(200).json(project)  
}
