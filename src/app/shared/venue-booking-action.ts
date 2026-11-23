import { venueTelephoneUrl } from './venue-public-contact';

/** What the "Reservar" button does for a venue, from the best information we have. */
export type VenueBookingAction =
  | { kind: 'free' }
  | { kind: 'link'; url: string }
  | { kind: 'phone'; url: string; whatsapp: string | null }
  | { kind: 'search'; url: string };

export interface VenueBookingSource {
  name?: string | null; city?: string | null; contact?: string | null;
  bookingUrl?: string | null; website?: string | null; freeAccess?: boolean | null;
}

/** Only https links to a real host; anything else is ignored rather than opened. */
export function safeBookingUrl(raw: string | null | undefined): string | null {
  const value = (raw || '').trim();
  if (!value) return null;
  const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname.includes('.') || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Portuguese mobile numbers (9[1236]…) also get a WhatsApp link. */
export function venueWhatsAppUrl(telUrl: string | null): string | null {
  const digits = (telUrl || '').replace(/\D/g, '');
  return /^3519[1236]\d{7}$/.test(digits) ? 'https://wa.me/' + digits : null;
}

export function venueBookingAction(venue: VenueBookingSource | null | undefined): VenueBookingAction | null {
  if (!venue) return null;
  if (venue.freeAccess === true) return { kind: 'free' };
  const link = safeBookingUrl(venue.bookingUrl) || safeBookingUrl(venue.website);
  if (link) return { kind: 'link', url: link };
  const tel = venueTelephoneUrl(venue.contact);
  if (tel) return { kind: 'phone', url: tel, whatsapp: venueWhatsAppUrl(tel) };
  const query = [venue.name, venue.city, 'reservar'].filter(p => !!p && String(p).trim()).join(' ');
  return query ? { kind: 'search', url: 'https://www.google.com/search?q=' + encodeURIComponent(query) } : null;
}
