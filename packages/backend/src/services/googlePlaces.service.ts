import { config } from '../config';

export interface GooglePlacesResult {
  phone?: string;
  website?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  placeId?: string;
  rating?: number;
  totalRatings?: number;
  source: 'google_places';
  fieldsPopulated: string[];
}

interface PlaceCandidate {
  place_id: string;
  name: string;
  formatted_address?: string;
}

interface PlaceDetails {
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  address_components?: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  rating?: number;
  user_ratings_total?: number;
}

/**
 * Search for a business using Google Places API and return contact info
 */
export async function lookupByGooglePlaces(
  businessName: string,
  state: string
): Promise<GooglePlacesResult | null> {
  if (!config.googlePlacesApiKey) return null;

  try {
    // Step 1: Find Place from Text
    const searchQuery = `${businessName} ${state}`;
    const findPlaceUrl = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
    findPlaceUrl.searchParams.set('input', searchQuery);
    findPlaceUrl.searchParams.set('inputtype', 'textquery');
    findPlaceUrl.searchParams.set('fields', 'place_id,name,formatted_address');
    findPlaceUrl.searchParams.set('key', config.googlePlacesApiKey);

    const findRes = await fetch(findPlaceUrl.toString(), { signal: AbortSignal.timeout(5000) });
    if (!findRes.ok) return null;

    const findJson = (await findRes.json()) as { candidates?: PlaceCandidate[]; status: string };
    if (findJson.status !== 'OK' || !findJson.candidates?.length) return null;

    const placeId = findJson.candidates[0].place_id;

    // Step 2: Get Place Details
    const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    detailsUrl.searchParams.set('place_id', placeId);
    detailsUrl.searchParams.set('fields', 'formatted_phone_number,international_phone_number,website,address_components,rating,user_ratings_total');
    detailsUrl.searchParams.set('key', config.googlePlacesApiKey);

    const detailsRes = await fetch(detailsUrl.toString(), { signal: AbortSignal.timeout(5000) });
    if (!detailsRes.ok) return null;

    const detailsJson = (await detailsRes.json()) as { result?: PlaceDetails; status: string };
    if (detailsJson.status !== 'OK' || !detailsJson.result) return null;

    const place = detailsJson.result;
    const populated: string[] = [];
    const result: GooglePlacesResult = { source: 'google_places', fieldsPopulated: [], placeId };

    // Extract phone
    const phone = place.formatted_phone_number || place.international_phone_number;
    if (phone) {
      result.phone = phone.replace(/\D/g, ''); // normalize to digits only
      populated.push('phone');
    }

    // Extract website
    if (place.website) {
      result.website = place.website;
      populated.push('website');
    }

    // Extract address components
    if (place.address_components) {
      for (const component of place.address_components) {
        if (component.types.includes('street_number') || component.types.includes('route')) {
          result.streetAddress = result.streetAddress 
            ? `${result.streetAddress} ${component.long_name}`
            : component.long_name;
        }
        if (component.types.includes('locality')) {
          result.city = component.long_name;
          populated.push('city');
        }
        if (component.types.includes('administrative_area_level_1')) {
          result.state = component.short_name;
          populated.push('state');
        }
        if (component.types.includes('postal_code')) {
          result.zipCode = component.long_name;
          populated.push('zipCode');
        }
      }
      if (result.streetAddress) populated.push('streetAddress');
    }

    // Extract ratings
    if (place.rating) {
      result.rating = place.rating;
      result.totalRatings = place.user_ratings_total;
    }

    result.fieldsPopulated = populated;
    return populated.length > 0 ? result : null;
  } catch (err) {
    console.error('Google Places lookup error:', err);
    return null;
  }
}

