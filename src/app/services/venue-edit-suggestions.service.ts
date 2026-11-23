import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type VenueEditField =
  | 'name' | 'city' | 'district' | 'address' | 'sports'
  | 'openingHours' | 'website' | 'contact' | 'latitude' | 'longitude' | 'bookingUrl' | 'freeAccess';
export type VenueEditStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface VenueEditSuggestion {
  id: number;
  venueId: number;
  venueName: string;
  status: VenueEditStatus;
  before: Partial<Record<VenueEditField, string | null>>;
  proposed: Partial<Record<VenueEditField, string>>;
  reason: string;
  /** Submitted link, not verified until an administrator checks the source. */
  sourceUrl?: string | null;
  submittedByUsername: string;
  submittedAt: string;
  reviewedByUsername: string | null;
  reviewedAt: string | null;
  decisionNote: string | null;
  /** Authenticated moderator's confirmation date; null means no recorded attestation. */
  sourceReviewConfirmedAt?: string | null;
}

export interface VenueEditSuggestionPage {
  suggestions: VenueEditSuggestion[];
  page: number;
  hasMore: boolean;
}

@Injectable({ providedIn: 'root' })
export class VenueEditSuggestionsService {
  private readonly base = environment.apiUrl + '/api/venues';
  private readonly admin = environment.apiUrl + '/api/admin/venue-edit-suggestions';

  constructor(private readonly http: HttpClient) {}

  submit(venueId: number, changes: Partial<Record<VenueEditField, string>>, reason: string, sourceUrl?: string):
    Observable<VenueEditSuggestion> {
    return this.http.post<VenueEditSuggestion>(
      `${this.base}/${venueId}/edit-suggestions`, { changes, reason, ...(sourceUrl ? { sourceUrl } : {}) });
  }

  mine(venueId: number): Observable<VenueEditSuggestion> {
    return this.http.get<VenueEditSuggestion>(`${this.base}/${venueId}/edit-suggestions/mine`);
  }

  pending(page = 0): Observable<VenueEditSuggestionPage> {
    return this.http.get<VenueEditSuggestionPage>(this.admin,
      { params: new HttpParams().set('page', String(page)) });
  }

  history(page = 0): Observable<VenueEditSuggestionPage> {
    return this.http.get<VenueEditSuggestionPage>(`${this.admin}/history`,
      { params: new HttpParams().set('page', String(page)) });
  }

  decide(id: number, action: 'approve' | 'reject', note: string,
    sourceReviewed = false): Observable<VenueEditSuggestion> {
    return this.http.post<VenueEditSuggestion>(`${this.admin}/${id}/${action}`,
      { note, ...(action === 'approve' && sourceReviewed ? { sourceReviewed: true } : {}) });
  }
}
