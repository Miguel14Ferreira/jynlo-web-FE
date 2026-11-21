import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface PublicRankingSeason { id: number; name: string; sport: string | null; active: boolean; startsAt: string | null; endedAt: string | null; }
export interface PublicRankingRow { position: number; name: string; games: number; wins: number; draws: number; losses: number; points: number; winRate: number; streak: string | null; }
export interface PublicRankingPage { communityId: number; communityName: string; sport: string | null; seasons: PublicRankingSeason[]; selectedSeasonId: number | null; table: PublicRankingRow[]; }
export interface PublicRankingSetting { enabled: boolean; path: string; }

/** Opt-in shareable season ranking of a community. */
@Injectable({ providedIn: 'root' })
export class PublicRankingService {
  constructor(private readonly http: HttpClient) {}

  page(communityId: number, seasonId: number | null): Observable<PublicRankingPage> {
    const params = seasonId ? new HttpParams().set('seasonId', String(seasonId)) : undefined;
    return this.http.get<PublicRankingPage>(environment.apiUrl + '/api/public/communities/' + communityId + '/ranking', { params });
  }
  setting(communityId: number): Observable<PublicRankingSetting> {
    return this.http.get<PublicRankingSetting>(environment.apiUrl + '/api/communities/' + communityId + '/public-ranking');
  }
  update(communityId: number, enabled: boolean): Observable<PublicRankingSetting> {
    return this.http.put<PublicRankingSetting>(environment.apiUrl + '/api/communities/' + communityId + '/public-ranking', { enabled });
  }
}
