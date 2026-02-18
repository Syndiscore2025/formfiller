import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'change-in-production',
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  openCorporatesApiKey: process.env.OPENCORPORATES_API_KEY || '',
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
  crmWebhookUrl: process.env.CRM_WEBHOOK_URL || '',
  crmApiKey: process.env.CRM_API_KEY || '',
  isProduction: process.env.NODE_ENV === 'production',
};

