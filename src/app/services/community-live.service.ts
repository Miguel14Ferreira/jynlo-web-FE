import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type CommunityLiveStatus = 'SCHEDULED' | 'LIVE' | 'ENDED';
export interface CommunityLiveEvent {
  id: number; communityId: number; title: string; description: string | null;
  status: CommunityLiveStatus; scheduledAt: string; startedAt: string | null;
  endedAt: string | null; canManage: boolean;
}
export interface CommunityLiveCapabilities {
  canManage: boolean; enabled: boolean;
}
export interface CommunityLiveConnection {
  serverUrl: string; token: string; role: 'HOST' | 'VIEWER'; expiresAt: string;
}

/** Tokens are never cached in browser storage, URLs, or shared conversation state. */
@Injectable({ providedIn: 'root' })
export class CommunityLiveService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl.replace(/\/+$/, '');
  private url(communityId: number): string {
    return `${this.base}/api/communities/${communityId}/live`;
  }
  capabilities(communityId: number): Observable<CommunityLiveCapabilities> {
    return this.http.get<CommunityLiveCapabilities>(this.url(communityId) + '/capabilities');
  }
  list(communityId: number): Observable<CommunityLiveEvent[]> {
    return this.http.get<CommunityLiveEvent[]>(this.url(communityId));
  }
  schedule(communityId: number, title: string, description: string,
           scheduledAt: string): Observable<CommunityLiveEvent> {
    return this.http.post<CommunityLiveEvent>(this.url(communityId),
      { title, description: description || null, scheduledAt });
  }
  start(communityId: number, id: number): Observable<CommunityLiveEvent> {
    return this.http.post<CommunityLiveEvent>(`${this.url(communityId)}/${id}/start`, {});
  }
  heartbeat(communityId: number, id: number): Observable<void> {
    return this.http.post<void>(`${this.url(communityId)}/${id}/heartbeat`, {});
  }
  end(communityId: number, id: number): Observable<CommunityLiveEvent> {
    return this.http.post<CommunityLiveEvent>(`${this.url(communityId)}/${id}/end`, {});
  }
  join(communityId: number, id: number): Observable<CommunityLiveConnection> {
    return this.http.post<CommunityLiveConnection>(`${this.url(communityId)}/${id}/join`, {});
  }
}
