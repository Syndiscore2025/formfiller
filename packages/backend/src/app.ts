import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from './config';
import { globalLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import applicationRoutes from './routes/applications.routes';
import formSectionRoutes from './routes/formSections.routes';
import signatureRoutes from './routes/signature.routes';
import analyticsRoutes from './routes/analytics.routes';
import einLookupRoutes from './routes/einLookup.routes';

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

// CORS — only allow configured origins
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'x-tenant-slug'],
}));

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.set('trust proxy', 1);
app.use(globalLimiter);

// Health check — no auth required
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/forms', formSectionRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/business', einLookupRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

app.use(errorHandler);

export default app;

