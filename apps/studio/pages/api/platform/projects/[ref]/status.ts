import type { NextApiRequest, NextApiResponse } from 'next'  
import { getCurrentProjectStatus } from 'lib/docker-utils'  
  
export default async function handler(  
  req: NextApiRequest,  
  res: NextApiResponse<{ status: string }>  
) {  
  // Only allow GET requests  
  if (req.method !== 'GET') {  
    return res.status(405).json({ status: 'Method not allowed' } as any)  
  }  
  
  try {  
    // Get the current project status using the shared utility  
    const status = await getCurrentProjectStatus()  
      
    return res.status(200).json({ status })  
  } catch (err: any) {  
    console.error('Error in status endpoint:', err)  
    return res.status(500).json({ status: 'UNKNOWN' } as any)  
  }  
}
