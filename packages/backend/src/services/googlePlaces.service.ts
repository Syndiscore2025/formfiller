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

export interface AddressSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
  fullText: string;
}

export interface PlaceAddressDetails {
  placeId: string;
  formattedAddress?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
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

function normalizeUsPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('1')) return digits.slice(1, 11);
  return digits.slice(0, 10);
}

interface AutocompleteSuggestion {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
}

interface AutocompleteResponse {
  suggestions?: AutocompleteSuggestion[];
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
      const normalizedPhone = normalizeUsPhoneDigits(phone);
      const areaCode = normalizedPhone.slice(0, 3);
      const TOLL_FREE_PREFIXES = new Set(['800', '888', '877', '866', '855', '844', '833', '822']);
      if (normalizedPhone.length === 10 && !TOLL_FREE_PREFIXES.has(areaCode)) {
        result.phone = normalizedPhone;
        populated.push('phone');
      }
      // Toll-free numbers are silently dropped; the frontend will ask the user for a local number
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
      let cityFromLocality = '';
      let cityFallback = ''; // sublocality / postal_town for cities like NYC boroughs

      for (const component of place.addressComponents) {
        if (component.types.includes('street_number')) streetNumber = component.longText;
        if (component.types.includes('route')) route = component.longText;
        if (component.types.includes('locality')) cityFromLocality = component.longText;
        // Fallback: borough/neighbourhood (e.g. Brooklyn, Queens) when locality is absent
        if (!cityFallback && (
          component.types.includes('sublocality_level_1')
          || component.types.includes('sublocality')
          || component.types.includes('postal_town')
        )) { cityFallback = component.longText; }
        if (component.types.includes('administrative_area_level_1')) { result.state = component.shortText; populated.push('state'); }
        if (component.types.includes('postal_code')) { result.zipCode = component.longText; populated.push('zipCode'); }
      }

      const city = cityFromLocality || cityFallback;
      if (city) { result.city = city; populated.push('city'); }

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

export async function autocompleteAddresses(
  input: string,
  locationBias?: { latitude: number; longitude: number }
): Promise<AddressSuggestion[]> {
  if (!config.googlePlacesApiKey || input.trim().length < 3) return [];

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.googlePlacesApiKey,
        'X-Goog-FieldMask': [
          'suggestions.placePrediction.placeId',
          'suggestions.placePrediction.text.text',
          'suggestions.placePrediction.structuredFormat.mainText.text',
          'suggestions.placePrediction.structuredFormat.secondaryText.text',
        ].join(','),
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['us'],
        ...(locationBias
          ? {
              locationBias: {
                circle: {
                  center: locationBias,
                  radius: 50000,
                },
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];

    const json = (await res.json()) as AutocompleteResponse;
    return (json.suggestions || [])
      .map((suggestion) => {
        const prediction = suggestion.placePrediction;
        const placeId = prediction?.placeId || '';
        const primaryText = prediction?.structuredFormat?.mainText?.text || prediction?.text?.text || '';
        const secondaryText = prediction?.structuredFormat?.secondaryText?.text || '';
        const fullText = prediction?.text?.text || [primaryText, secondaryText].filter(Boolean).join(', ');

        if (!placeId || !primaryText) return null;

        return {
          placeId,
          primaryText,
          secondaryText,
          fullText,
        } satisfies AddressSuggestion;
      })
      .filter((value): value is AddressSuggestion => Boolean(value))
      .slice(0, 5);
  } catch (err) {
    console.error('Google Places autocomplete error:', err);
    return [];
  }
}

export async function getPlaceAddressDetails(placeId: string): Promise<PlaceAddressDetails | null> {
  if (!config.googlePlacesApiKey || !placeId) return null;

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'X-Goog-Api-Key': config.googlePlacesApiKey,
        'X-Goog-FieldMask': 'id,formattedAddress,addressComponents',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const place = (await res.json()) as PlaceResult;
    const result: PlaceAddressDetails = {
      placeId: place.id || placeId,
      formattedAddress: place.formattedAddress,
    };

    let streetNumber = '';
    let route = '';
    let cityFromLocality = '';
    let cityFallback = '';

    for (const component of place.addressComponents || []) {
      if (component.types.includes('street_number')) streetNumber = component.longText;
      if (component.types.includes('route')) route = component.longText;
      if (component.types.includes('locality')) cityFromLocality = component.longText;
      if (!cityFallback && (
        component.types.includes('sublocality_level_1')
        || component.types.includes('sublocality')
        || component.types.includes('postal_town')
      )) { cityFallback = component.longText; }
      if (component.types.includes('administrative_area_level_1')) result.state = component.shortText;
      if (component.types.includes('postal_code')) result.zipCode = component.longText;
    }

    result.city = cityFromLocality || cityFallback || undefined;
    result.streetAddress = [streetNumber, route].filter(Boolean).join(' ');
    return result;
  } catch (err) {
    console.error('Google Places details error:', err);
    return null;
  }
}

