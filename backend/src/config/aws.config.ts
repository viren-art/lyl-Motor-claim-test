module.exports = {
  region: process.env.AWS_REGION || 'ap-southeast-1',
  s3: {
    claimDocumentsBucket: process.env.S3_CLAIMS_BUCKET || 'roojai-claims-documents-dev',
    encryption: 'AES256'
  },
  secretsManager: {
    llmApiKeySecret: process.env.LLM_API_KEY_SECRET || 'roojai/llm/api-key'
  }
};