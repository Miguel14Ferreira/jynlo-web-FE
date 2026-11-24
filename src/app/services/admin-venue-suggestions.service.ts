import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';
import { CreateVenueRequest } from '../pages/model/venue';

export interface AdminVenueSuggestion {
  id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  venue: CreateVenueRequest;
  submittedByUsername: string;
  managerRequested?: boolean;
  managerRole?: string | null;
  managerPhone?: string | null;
  submittedAt: string;
  reviewedByUsername: string | null;
  reviewedAt: string | null;
  publishedVenueId: number | null;
}

export interface AdminVenueSuggestionPage {
  suggestions: AdminVenueSuggestion[];
  page: number;
  hasMore: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminVenueSuggestionsService {
  private readonly baseUrl = environment.apiUrl + '/api/admin/venue-suggestions';
  constructor(private readonly http: HttpClient) {}

  list(page = 0): Observable<AdminVenueSuggestionPage> {
    return this.http.get<AdminVenueSuggestionPage>(this.baseUrl,
      { params: new HttpParams().set('page', String(page)) });
  }

  decide(id: number, action: 'approve' | 'reject'): Observable<AdminVenueSuggestion> {
    return this.http.post<AdminVenueSuggestion>(this.baseUrl + '/' + id + '/' + action, {});
  }
}
