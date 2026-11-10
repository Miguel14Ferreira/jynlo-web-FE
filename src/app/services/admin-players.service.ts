import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface AdminPlayer {
  id: number;
  username: string;
  fullName: string | null;
  nickname: string | null;
  role: string | null;
  enabled: boolean | null;
  notLocked: boolean | null;
  moderationSuspendedAt?: string | null;
}
export interface AdminPlayerSearch {
  players: AdminPlayer[];
  page: number;
  hasMore: boolean;
}

export interface CommunityQuota {
  owned: number;
  limit: number;
  canCreate: boolean;
}

export type ModerationAction = 'SUSPEND' | 'REINSTATE' | 'DELETE';
export interface ModerationResult {
  id: number;
  action: ModerationAction;
  moderationSuspendedAt: string | null;
  notLocked: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminPlayersService {
  constructor(private http: HttpClient) {}
  communityLimit(id: number): Observable<CommunityQuota> {
    return this.http.get<CommunityQuota>(
      environment.apiUrl + '/api/admin/players/' + id + '/community-limit');
  }

  updateCommunityLimit(id: number, limit: number | null, reason: string): Observable<CommunityQuota> {
    return this.http.put<CommunityQuota>(
      environment.apiUrl + '/api/admin/players/' + id + '/community-limit',
      { limit, reason });
  }

  changeRole(id: number, role: string, expectedRole: string): Observable<{ id: number; role: string }> {
    return this.http.put<{ id: number; role: string }>(
      environment.apiUrl + '/api/admin/players/' + id + '/role', { role, expectedRole });
  }

  moderate(id: number, action: ModerationAction, expectedUsername: string,
           expectedSuspended: boolean, reason: string): Observable<ModerationResult> {
    return this.http.post<ModerationResult>(
      environment.apiUrl + '/api/admin/players/' + id + '/moderation',
      { action, expectedUsername, expectedSuspended, reason });
  }

  sendAdminMessage(id: number, message: string): Observable<{ notificationId: number }> {
    return this.http.post<{ notificationId: number }>(
      environment.apiUrl + '/api/admin/players/' + id + '/message',
      { message });
  }

  search(name: string, page: number): Observable<AdminPlayerSearch> {
    const params = new HttpParams().set('name', name.trim()).set('page', String(page));
    return this.http.get<AdminPlayerSearch>(environment.apiUrl + '/api/admin/players', { params });
  }
}
