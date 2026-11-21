import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface PublicTournamentRow {
  position: number; name: string; played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
}
export interface PublicTournamentGame {
  round: number; group: number | null; home: string; away: string;
  status: 'SCHEDULED' | 'COMPLETED' | string; homeScore: number | null; awayScore: number | null;
}
export interface PublicTournamentPage {
  id: number; name: string; sport: string | null; communityName: string | null;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | string; format: string | null; entryType: 'INDIVIDUAL' | 'TEAM' | string;
  startedAt: string | null; completedAt: string | null; champion: string | null;
  table: PublicTournamentRow[]; games: PublicTournamentGame[];
}
export interface PublicTournamentSetting { enabled: boolean; path: string; }

/** Opt-in shareable tournament page: table and games, no login. */
@Injectable({ providedIn: 'root' })
export class PublicTournamentService {
  constructor(private readonly http: HttpClient) {}

  page(tournamentId: number): Observable<PublicTournamentPage> {
    return this.http.get<PublicTournamentPage>(environment.apiUrl + '/api/public/tournaments/' + tournamentId);
  }
  private settingUrl(communityId: number, tournamentId: number): string {
    return environment.apiUrl + '/api/communities/' + communityId + '/tournaments/' + tournamentId + '/public-page';
  }
  setting(communityId: number, tournamentId: number): Observable<PublicTournamentSetting> {
    return this.http.get<PublicTournamentSetting>(this.settingUrl(communityId, tournamentId));
  }
  update(communityId: number, tournamentId: number, enabled: boolean): Observable<PublicTournamentSetting> {
    return this.http.put<PublicTournamentSetting>(this.settingUrl(communityId, tournamentId), { enabled });
  }
}
