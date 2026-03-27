import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts' },
});

export const einLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'EIN lookup rate limit exceeded' },
});

export const addressAutocompleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Address autocomplete rate limit exceeded' },
});

export const bankHelpLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const tenant = req.get('x-tenant-slug') || 'default';
    const applicationId = req.params.id || 'unknown';
    const identity = ('userId' in req && typeof req.userId === 'string' && req.userId)
      ? req.userId
      : (req.ip || 'unknown');
    return `${tenant}:${applicationId}:${identity}`;
  },
  message: { success: false, error: 'Bank help lookup limit reached. Please try again tomorrow.' },
});

