import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface PlayerStats { games: number; wins: number; goals: number; assists: number; mvps: number; }
export interface MonthLeader { name: string; username: string | null; games: number; goals: number; assists: number; mvps: number; score: number; }
export interface MonthLeaders { month: string; leaders: MonthLeader[]; }

@Injectable({ providedIn: 'root' })
export class PlayerHighlightsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl + '/api';
  stats(username: string): Observable<PlayerStats> {
    return this.http.get<PlayerStats>(`${this.api}/players/${encodeURIComponent(username)}/stats`);
  }
  monthLeaders(communityId: number, month?: string): Observable<MonthLeaders> {
    const params = month ? new HttpParams().set('month', month) : undefined;
    return this.http.get<MonthLeaders>(`${this.api}/communities/${communityId}/month-leaders`, { params });
  }
  playerOfMonthPoll(communityId: number, month?: string): Observable<void> {
    const params = month ? new HttpParams().set('month', month) : undefined;
    return this.http.post<void>(`${this.api}/communities/${communityId}/player-of-month-poll`, null, { params });
  }
}
