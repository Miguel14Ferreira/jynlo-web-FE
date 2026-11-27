import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, EMPTY, of, timeout, shareReplay, catchError } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface BookingCourt { id: number; name: string; sport: string | null; priceCents: number | null; slotMinutes: number; active: boolean; }
export interface BookingHours { dayOfWeek: number; openTime: string; closeTime: string; }
export interface BookingOffer { venueId: number; acceptsBookings: boolean; courts: BookingCourt[]; hours: BookingHours[];
  paymentMethod?: 'MBWAY' | 'IN_PERSON' | null; mbwayPhone?: string | null; }
export interface BookingSlot { start: string; end: string; free: boolean; }
export interface CourtSlots { courtId: number; name: string; sport: string | null; priceCents: number | null; slotMinutes: number; slots: BookingSlot[]; }
export interface DaySlots { venueId: number; date: string; courts: CourtSlots[]; }
export interface ManagementStatus { manager: boolean; claimStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null; decisionNote: string | null; acceptsBookings: boolean; adminSetup?: boolean; }
export interface VenueClaim {
  id: number; venueId: number; venueName: string | null; venueCity: string | null; username: string;
  roleDescription: string; contactPhone: string | null; status: string; createdAt: string;
  decidedAt: string | null; decidedBy: string | null; decisionNote: string | null;
}
export interface VenueBooking {
  id: number; venueId: number; venueName: string | null; courtId: number; courtName: string | null;
  requesterUsername: string; startAt: string; endAt: string; status: 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';
  priceCents: number | null; playerNote: string | null; ownerNote: string | null; sessionId: number | null;
  createdAt: string; decidedAt: string | null;
  paymentMethod?: 'MBWAY' | 'IN_PERSON' | null; mbwayPhone?: string | null; paidClaimedAt?: string | null; paidConfirmedAt?: string | null;
}
export interface VenueAvailability {
  venueId: number; name: string; city: string | null; district: string | null; latitude: number | null; longitude: number | null;
  paymentMethod: 'MBWAY' | 'IN_PERSON' | null; courts: CourtSlots[];
}
export interface ManagedVenue { venueId: number; name: string; city: string; pendingRequests: number; acceptsBookings: boolean; }
export interface CourtInput { id?: number | null; name: string; sport?: string | null; priceCents?: number | null; slotMinutes: number; active: boolean; }

/** Jynlo court bookings: venue claims, courts and hours, free slots and booking requests. */
@Injectable({ providedIn: 'root' })
export class VenueBookingService {
  // Optional so pages that render the booking panel keep working in tests without HttpClient.
  private readonly http = inject(HttpClient, { optional: true });
  private accepting$: Observable<number[]> | null = null;

  private url(path: string): string { return environment.apiUrl + '/api' + path; }
  private get<T>(path: string): Observable<T> { return this.http ? this.http.get<T>(this.url(path)).pipe(timeout(15000)) : EMPTY; }
  private post<T>(path: string, body: unknown): Observable<T> { return this.http ? this.http.post<T>(this.url(path), body).pipe(timeout(15000)) : EMPTY; }
  private put<T>(path: string, body: unknown): Observable<T> { return this.http ? this.http.put<T>(this.url(path), body).pipe(timeout(15000)) : EMPTY; }

  offer(venueId: number) { return this.get<BookingOffer>(`/venues/${venueId}/booking-offer`); }
  slots(venueId: number, date: string) { return this.get<DaySlots>(`/venues/${venueId}/booking-slots?date=${encodeURIComponent(date)}`); }
  status(venueId: number) { return this.get<ManagementStatus>(`/venues/${venueId}/management`); }
  claim(venueId: number, roleDescription: string, contactPhone: string | null) {
    return this.post<VenueClaim>(`/venues/${venueId}/claims`, { roleDescription, contactPhone });
  }
  request(venueId: number, courtId: number, startAt: string, note: string | null, sessionId: number | null) {
    return this.post<VenueBooking>(`/venues/${venueId}/booking-requests`, { courtId, startAt, note, sessionId });
  }
  search(date: string, sport: string, place: string, from: string, to: string) {
    const q = new URLSearchParams({ date });
    if (sport.trim()) q.set('sport', sport.trim());
    if (place.trim()) q.set('place', place.trim());
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return this.get<VenueAvailability[]>('/venue-bookings/search?' + q.toString());
  }
  linkSession(bookingId: number, sessionId: number) {
    return this.post<VenueBooking>(`/venue-bookings/${bookingId}/session`, { sessionId });
  }
  managerOffer(venueId: number) { return this.get<BookingOffer>(`/venues/${venueId}/management/offer`); }
  saveCourts(venueId: number, courts: CourtInput[]) { return this.put<BookingOffer>(`/venues/${venueId}/management/courts`, courts); }
  saveHours(venueId: number, hours: BookingHours[]) { return this.put<BookingOffer>(`/venues/${venueId}/management/hours`, hours); }
  savePayment(venueId: number, method: 'MBWAY' | 'IN_PERSON' | null, phone: string | null) {
    return this.put<BookingOffer>(`/venues/${venueId}/management/payment`, { method, phone });
  }
  markPaid(id: number, paid: boolean) { return this.post<VenueBooking>(`/venue-bookings/${id}/paid`, { paid }); }
  confirmPaid(id: number, paid: boolean) { return this.post<VenueBooking>(`/venue-bookings/${id}/payment-received`, { paid }); }
  venueRequests(venueId: number) { return this.get<VenueBooking[]>(`/venues/${venueId}/management/requests`); }
  mine() { return this.get<VenueBooking[]>('/venue-bookings/mine'); }
  managed() { return this.get<ManagedVenue[]>('/venue-bookings/managed'); }
  cancel(id: number) { return this.post<VenueBooking>(`/venue-bookings/${id}/cancel`, {}); }
  confirm(id: number, note: string | null) { return this.post<VenueBooking>(`/venue-bookings/${id}/confirm`, { note }); }
  decline(id: number, note: string | null) { return this.post<VenueBooking>(`/venue-bookings/${id}/decline`, { note }); }
  pendingClaims() { return this.get<VenueClaim[]>('/admin/venue-claims'); }
  claimHistory() { return this.get<VenueClaim[]>('/admin/venue-claims/history'); }
  approveClaim(id: number, note: string | null) { return this.post<VenueClaim>(`/admin/venue-claims/${id}/approve`, { note }); }
  rejectClaim(id: number, note: string | null) { return this.post<VenueClaim>(`/admin/venue-claims/${id}/reject`, { note }); }

  /** Ids of venues that take Jynlo bookings, fetched once per page load. */
  accepting(): Observable<number[]> {
    if (!this.http) return of([]);
    if (!this.accepting$) {
      this.accepting$ = this.get<number[]>('/venue-bookings/accepting').pipe(
        catchError(() => of([] as number[])), shareReplay(1));
    }
    return this.accepting$;
  }
}

/** "24,00 €" from cents; null when the price is set at the venue. */
export function formatPrice(cents: number | null | undefined, language: 'pt' | 'en' = 'pt'): string | null {
  if (cents === null || cents === undefined) return null;
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Time of day in Lisbon, "18:00". */
export function lisbonTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' }).format(new Date(iso));
}

/** "26/11, 18:00" in Lisbon. */
export function lisbonDateTime(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Lisbon' }).format(d);
  return day + ', ' + lisbonTime(iso);
}

/** Today and the next days as YYYY-MM-DD in Lisbon. */
export function nextLisbonDays(count: number, from = new Date()): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Lisbon' });
  const days: string[] = [];
  for (let i = 0; i < count; i++) days.push(fmt.format(new Date(from.getTime() + i * 86400000)));
  return [...new Set(days)];
}
