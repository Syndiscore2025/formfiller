import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

const configuredAllowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const devAllowedOrigins = process.env.NODE_ENV === 'production'
  ? []
  : [
      'http://localhost:3002',
      'http://127.0.0.1:3002',
      'http://localhost:3003',
      'http://127.0.0.1:3003',
    ];

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'change-in-production',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  allowedOrigins: Array.from(new Set([...configuredAllowedOrigins, ...devAllowedOrigins])),
  openCorporatesApiKey: process.env.OPENCORPORATES_API_KEY || '',
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
  crmWebhookUrl: process.env.CRM_WEBHOOK_URL || '',
  crmApiKey: process.env.CRM_API_KEY || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3002',
  isProduction: process.env.NODE_ENV === 'production',
};

