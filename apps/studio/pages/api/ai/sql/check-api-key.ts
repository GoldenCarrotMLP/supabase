import apiWrapper from 'lib/api/apiWrapper'
import { checkAwsCredentials } from 'lib/ai/bedrock'
import {
  ProviderName,
} from 'lib/ai/model.utils'
import { NextApiRequest, NextApiResponse } from 'next'

const wrapper = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

export default wrapper

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    default:
      res.setHeader('Allow', ['GET'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (req: NextApiRequest, res: NextApiResponse) => {  
  const hasAwsCredentials = await checkAwsCredentials()  
  const hasAwsBedrockRoleArn = !!process.env.AWS_BEDROCK_ROLE_ARN  
  const hasOpenAIKey = !!process.env.OPENAI_API_KEY  
  const hasGeminiKey = !!process.env.GEMINI_API_KEY  
    
  let activeProvider: ProviderName | undefined  
    
  // Mirror the same priority logic as getModel()  
  if (hasAwsBedrockRoleArn && hasAwsCredentials) {  
    activeProvider = 'bedrock'  
  } else if (hasOpenAIKey) {  
    activeProvider = 'openai'  
  } else if (hasGeminiKey) {  
    activeProvider = 'google'  
  }  
    
  return res.status(200).json({   
    hasKey: !!activeProvider,  
    activeProvider   
  })  
}