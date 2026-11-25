import { Venue, VenueLocationStatus } from '../pages/model/venue';

/** An old OSM placeholder is not a usable postal address. */
export function venueUsableAddress(value: string | null | undefined): string | null {
  const address = typeof value === 'string' ? value.trim() : '';
  if (!address) return null;
  const lowered = address.toLocaleLowerCase('pt-PT');
  const unknown = lowered.startsWith('localização no mapa:')
    || lowered.startsWith('localizacao no mapa:')
    || lowered.startsWith('map location:')
    || lowered.startsWith('coordenadas (morada por confirmar)')
    || lowered.startsWith('coordenadas (')
    || lowered.includes('morada por confirmar')
    || lowered.includes('address to be confirmed');
  return unknown ? null : address;
}

/** Informative location status, not proof of facility operation or public access. */
export function venueLocationStatus(venue: Venue): VenueLocationStatus {
  if (venue.locationStatus === 'GPS_ONLY_ADDRESS_UNKNOWN'
      || venue.locationStatus === 'ADDRESS_PROVIDED_UNVERIFIED'
      || venue.locationStatus === 'LOCATION_UNKNOWN') {
    return venue.locationStatus;
  }

  // Old API responses may have no locationStatus; avoid displaying OSM
  // coordinate placeholders as postal addresses during staggered deployments.
  if (venueUsableAddress(venue.address)) return 'ADDRESS_PROVIDED_UNVERIFIED';
  const lat = venue.latitude;
  const lon = venue.longitude;
  return lat !== null && lat !== undefined && Number.isFinite(lat) && Math.abs(lat) <= 90
      && lon !== null && lon !== undefined && Number.isFinite(lon) && Math.abs(lon) <= 180
    ? 'GPS_ONLY_ADDRESS_UNKNOWN'
    : 'LOCATION_UNKNOWN';
}

export function isVenueGpsOnly(venue: Venue): boolean {
  return venueLocationStatus(venue) === 'GPS_ONLY_ADDRESS_UNKNOWN';
}

export function venuePostalAddress(venue: Venue): string | null {
  if (venueLocationStatus(venue) !== 'ADDRESS_PROVIDED_UNVERIFIED') return null;
  return venueUsableAddress(venue.address);
}

/**
 * A free-text place ("Central Park", "campo da escola") is not an address:
 * searching it on a map picks whatever business has that name (e.g. a hotel).
 * Only street-like addresses (a number or a street word) get an approximate map.
 */
export function looksLikeStreetAddress(value: string | null | undefined): boolean {
  const address = venueUsableAddress(value);
  if (!address) return false;
  if (/\d/.test(address)) return true;
  return /\b(rua|r\.|av\.?|avenida|largo|pra[çc]a|estrada|travessa|cal[çc]ada|alameda|rotunda|bairro|urbaniza[çc][ãa]o|quinta|beco|caminho|street|road|avenue)\b/i.test(address);
}
