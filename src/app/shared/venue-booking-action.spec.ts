import { safeBookingUrl, venueBookingAction, venueWhatsAppUrl } from './venue-booking-action';

describe('venueBookingAction', () => {
  it('prefers the booking link, then the website', () => {
    expect(venueBookingAction({ bookingUrl: 'playtomic.com/clubs/x', website: 'https://clube.pt' }))
      .toEqual({ kind: 'link', url: 'https://playtomic.com/clubs/x' });
    expect(venueBookingAction({ website: 'https://clube.pt/reservas' }))
      .toEqual({ kind: 'link', url: 'https://clube.pt/reservas' });
  });

  it('offers a call (and WhatsApp for mobiles) when there is only a phone', () => {
    expect(venueBookingAction({ contact: '912 345 678' }))
      .toEqual({ kind: 'phone', url: 'tel:+351912345678', whatsapp: 'https://wa.me/351912345678' });
    expect(venueBookingAction({ contact: '213 456 789' }))
      .toEqual({ kind: 'phone', url: 'tel:+351213456789', whatsapp: null });
  });

  it('marks free-access places and falls back to a search', () => {
    expect(venueBookingAction({ freeAccess: true, bookingUrl: 'https://x.pt' })).toEqual({ kind: 'free' });
    const search = venueBookingAction({ name: 'Campo da Bicuda', city: 'Cascais' });
    expect(search?.kind).toBe('search');
    expect((search as { url: string }).url).toContain('Campo%20da%20Bicuda%20Cascais%20reservar');
  });

  it('never opens unsafe links', () => {
    expect(safeBookingUrl('javascript:alert(1)')).toBeNull();
    expect(safeBookingUrl('http://clube.pt')).toBeNull();
    expect(safeBookingUrl('https://user:pw@clube.pt')).toBeNull();
    expect(venueWhatsAppUrl('tel:+351213456789')).toBeNull();
  });
});
