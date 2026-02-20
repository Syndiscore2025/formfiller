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

// New Places API (v1) response types
interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

interface PlaceResult {
  id?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  rating?: number;
  userRatingCount?: number;
}

interface TextSearchResponse {
  places?: PlaceResult[];
}

/**
 * Search for a business using the Google Places API (New) v1
 * Uses a single Text Search request to get phone, website, and address in one call.
 */
export async function lookupByGooglePlaces(
  businessName: string,
  state: string
): Promise<GooglePlacesResult | null> {
  if (!config.googlePlacesApiKey) return null;

  try {
    const searchQuery = `${businessName} ${state}`;

    // New Places API: single POST request with field mask header
    const fieldMask = [
      'places.id',
      'places.nationalPhoneNumber',
      'places.internationalPhoneNumber',
      'places.websiteUri',
      'places.addressComponents',
      'places.rating',
      'places.userRatingCount',
    ].join(',');

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.googlePlacesApiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify({ textQuery: searchQuery, pageSize: 1 }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as TextSearchResponse;
    const place = json.places?.[0];
    if (!place) return null;

    const populated: string[] = [];
    const result: GooglePlacesResult = {
      source: 'google_places',
      fieldsPopulated: [],
      placeId: place.id,
    };

    // Extract phone (prefer national format for US numbers)
    const phone = place.nationalPhoneNumber || place.internationalPhoneNumber;
    if (phone) {
      result.phone = phone.replace(/\D/g, ''); // normalize to digits only
      populated.push('phone');
    }

    // Extract website
    if (place.websiteUri) {
      result.website = place.websiteUri;
      populated.push('website');
    }

    // Extract address components
    if (place.addressComponents) {
      let streetNumber = '';
      let route = '';

      for (const component of place.addressComponents) {
        if (component.types.includes('street_number')) streetNumber = component.longText;
        if (component.types.includes('route')) route = component.longText;
        if (component.types.includes('locality')) { result.city = component.longText; populated.push('city'); }
        if (component.types.includes('administrative_area_level_1')) { result.state = component.shortText; populated.push('state'); }
        if (component.types.includes('postal_code')) { result.zipCode = component.longText; populated.push('zipCode'); }
      }

      const streetAddress = [streetNumber, route].filter(Boolean).join(' ');
      if (streetAddress) { result.streetAddress = streetAddress; populated.push('streetAddress'); }
    }

    // Extract ratings
    if (place.rating) {
      result.rating = place.rating;
      result.totalRatings = place.userRatingCount;
    }

    result.fieldsPopulated = populated;
    return populated.length > 0 ? result : null;
  } catch (err) {
    console.error('Google Places lookup error:', err);
    return null;
  }
}

