import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { optionalAuth, requireTenant } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { einLookupLimiter } from '../middleware/rateLimiter';
import { lookupByOpenCorporates } from '../services/businessLookup.service';

const router = Router();
const guestAccess = [optionalAuth, requireTenant];

const lookupSchema = z.object({
  businessName: z.string().min(2),
  state: z.string().length(2, 'Use 2-letter state code'),
});

router.get(
  '/lookup',
  ...guestAccess,
  einLookupLimiter,
  validate(lookupSchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const { businessName, state } = req.query as z.infer<typeof lookupSchema>;

    const result = await lookupByOpenCorporates(businessName, state);

    if (!result) {
      res.json({
        success: true,
        found: false,
        message: 'No data found. Please enter information manually.',
      });
      return;
    }

    res.json({
      success: true,
      found: true,
      data: result,
    });
  })
);

export default router;

