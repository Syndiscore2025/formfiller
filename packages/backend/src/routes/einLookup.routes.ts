import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { optionalAuth, requireTenant } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { einLookupLimiter } from '../middleware/rateLimiter';
import { lookupByOpenCorporates, BusinessLookupResult } from '../services/businessLookup.service';
import { lookupByGooglePlaces } from '../services/googlePlaces.service';

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

    // Run both lookups in parallel for speed
    const [openCorpResult, googleResult] = await Promise.all([
      lookupByOpenCorporates(businessName, state),
      lookupByGooglePlaces(businessName, state),
    ]);

    // If neither found anything, return not found
    if (!openCorpResult && !googleResult) {
      res.json({
        success: true,
        found: false,
        message: 'No data found. Please enter information manually.',
      });
      return;
    }

    // Merge results - OpenCorporates is authoritative for legal info,
    // Google Places fills in phone/website and can supplement address
    const fieldSources: Record<string, 'opencorporates' | 'google_places'> = {};
    const fieldsPopulated: string[] = [];

    const merged: BusinessLookupResult = {
      source: 'combined',
      fieldsPopulated: [],
      fieldSources: {},
    };

    // Start with OpenCorporates data (authoritative for legal/registration)
    if (openCorpResult) {
      if (openCorpResult.legalName) { merged.legalName = openCorpResult.legalName; fieldSources.legalName = 'opencorporates'; fieldsPopulated.push('legalName'); }
      if (openCorpResult.entityType) { merged.entityType = openCorpResult.entityType; fieldSources.entityType = 'opencorporates'; fieldsPopulated.push('entityType'); }
      if (openCorpResult.stateOfFormation) { merged.stateOfFormation = openCorpResult.stateOfFormation; fieldSources.stateOfFormation = 'opencorporates'; fieldsPopulated.push('stateOfFormation'); }
      if (openCorpResult.registrationDate) { merged.registrationDate = openCorpResult.registrationDate; fieldSources.registrationDate = 'opencorporates'; fieldsPopulated.push('registrationDate'); }
      if (openCorpResult.sicCode) { merged.sicCode = openCorpResult.sicCode; fieldSources.sicCode = 'opencorporates'; fieldsPopulated.push('sicCode'); }
      if (openCorpResult.naicsCode) { merged.naicsCode = openCorpResult.naicsCode; fieldSources.naicsCode = 'opencorporates'; fieldsPopulated.push('naicsCode'); }
      if (openCorpResult.streetAddress) { merged.streetAddress = openCorpResult.streetAddress; fieldSources.streetAddress = 'opencorporates'; fieldsPopulated.push('streetAddress'); }
      if (openCorpResult.city) { merged.city = openCorpResult.city; fieldSources.city = 'opencorporates'; fieldsPopulated.push('city'); }
      if (openCorpResult.state) { merged.state = openCorpResult.state; fieldSources.state = 'opencorporates'; fieldsPopulated.push('state'); }
      if (openCorpResult.zipCode) { merged.zipCode = openCorpResult.zipCode; fieldSources.zipCode = 'opencorporates'; fieldsPopulated.push('zipCode'); }
    }

    // Add Google Places data (phone, website, or fill gaps in address)
    if (googleResult) {
      if (googleResult.phone) { merged.phone = googleResult.phone; fieldSources.phone = 'google_places'; fieldsPopulated.push('phone'); }
      if (googleResult.website) { merged.website = googleResult.website; fieldSources.website = 'google_places'; fieldsPopulated.push('website'); }
      // Only use Google address if OpenCorporates didn't provide it
      if (!merged.streetAddress && googleResult.streetAddress) { merged.streetAddress = googleResult.streetAddress; fieldSources.streetAddress = 'google_places'; fieldsPopulated.push('streetAddress'); }
      if (!merged.city && googleResult.city) { merged.city = googleResult.city; fieldSources.city = 'google_places'; fieldsPopulated.push('city'); }
      if (!merged.state && googleResult.state) { merged.state = googleResult.state; fieldSources.state = 'google_places'; fieldsPopulated.push('state'); }
      if (!merged.zipCode && googleResult.zipCode) { merged.zipCode = googleResult.zipCode; fieldSources.zipCode = 'google_places'; fieldsPopulated.push('zipCode'); }
    }

    merged.fieldsPopulated = fieldsPopulated;
    merged.fieldSources = fieldSources;

    res.json({
      success: true,
      found: true,
      data: merged,
      sources: {
        opencorporates: !!openCorpResult,
        googlePlaces: !!googleResult,
      },
    });
  })
);

export default router;

