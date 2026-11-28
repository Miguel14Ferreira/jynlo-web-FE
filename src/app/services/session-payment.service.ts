import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface SessionPaymentPlayer {
  username: string; profilePicUrl: string | null; claimedAt: string | null; confirmedAt: string | null;
  /** Set for players who confirmed through the WhatsApp link (no account): username is "guest:<id>". */
  displayName?: string | null; guest?: boolean;
}
export interface SessionPayments {
  priceAmount: number | null;
  organiser: boolean;
  method: 'MBWAY' | 'IN_PERSON' | 'ONLINE' | null;
  mbwayPhone: string | null;
  me: { claimedAt: string | null; confirmedAt: string | null } | null;
  confirmedCount: number;
  playerCount: number;
  players: SessionPaymentPlayer[];
  lastReminderAt: string | null;
  /** The organiser who receives the money (older backends omit it). */
  payee?: { username: string | null; fullName: string | null; profilePicUrl: string | null } | null;
}

/** In-app payments (MB WAY or card through the organiser's own Stripe account). */
export interface OnlinePaymentStatus { available: boolean; connected: boolean; chargesEnabled: boolean; }

export interface PreviousUnpaid { sessionId: number | null; gameDate: string | null; sport: string | null; unpaid: string[]; }

/** MB WAY goes straight to the organiser; Jynlo only keeps "who already paid". */
@Injectable({ providedIn: 'root' })
export class SessionPaymentService {
  constructor(private readonly http: HttpClient) {}

  private url(sessionId: number): string {
    return environment.apiUrl + '/api/sessions/' + sessionId + '/payments';
  }

  get(sessionId: number): Observable<SessionPayments> {
    return this.http.get<SessionPayments>(this.url(sessionId));
  }
  setMethod(sessionId: number, method: 'MBWAY' | 'IN_PERSON' | 'ONLINE' | null, phone: string | null): Observable<SessionPayments> {
    return this.http.put<SessionPayments>(this.url(sessionId) + '/method', { method, phone });
  }
  previousUnpaid(sessionId: number): Observable<PreviousUnpaid> {
    return this.http.get<PreviousUnpaid>(this.url(sessionId) + '/previous-unpaid');
  }
  remind(sessionId: number): Observable<SessionPayments> {
    return this.http.post<SessionPayments>(this.url(sessionId) + '/remind', {});
  }
  claim(sessionId: number, paid: boolean): Observable<SessionPayments> {
    return this.http.put<SessionPayments>(this.url(sessionId) + '/me', { paid });
  }
  onlineStatus(): Observable<OnlinePaymentStatus> {
    return this.http.get<OnlinePaymentStatus>(environment.apiUrl + '/api/payments/online/status');
  }
  onlineOnboarding(returnPath: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(environment.apiUrl + '/api/payments/online/onboarding', { returnPath });
  }
  checkout(sessionId: number): Observable<{ url: string }> {
    return this.http.post<{ url: string }>(this.url(sessionId) + '/checkout', {});
  }
  confirm(sessionId: number, username: string, paid: boolean): Observable<SessionPayments> {
    return this.http.put<SessionPayments>(this.url(sessionId) + '/players/' + encodeURIComponent(username), { paid });
  }
}
