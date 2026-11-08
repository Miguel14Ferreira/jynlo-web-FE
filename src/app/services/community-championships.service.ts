import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface ChampionshipCompetition {
  id: number;
  name: string;
  format: string;
  status: string;
  winnerPoints: number;
  winnerConfirmed: boolean;
}

export interface ChampionshipLeader {
  entryType: 'TEAM' | 'INDIVIDUAL';
  participantId: number;
  name: string;
  victories: number;
  points: number;
}

export interface CommunityChampionship {
  id: number;
  communityId: number;
  name: string;
  sport: string;
  seasonLabel: string;
  createdAt: string;
  competitions: ChampionshipCompetition[];
  winnerStandings: ChampionshipLeader[];
}

@Injectable({ providedIn: 'root' })
export class CommunityChampionshipsService {
  constructor(private readonly http: HttpClient) {}

  private base(communityId: number): string {
    return environment.apiUrl + '/api/communities/' + communityId + '/championships';
  }

  list(communityId: number): Observable<CommunityChampionship[]> {
    return this.http.get<CommunityChampionship[]>(this.base(communityId));
  }

  create(communityId: number, name: string, sport: string,
         seasonLabel: string): Observable<CommunityChampionship> {
    return this.http.post<CommunityChampionship>(this.base(communityId), { name, sport, seasonLabel });
  }

  setWinnerPoints(communityId: number, championshipId: number,
                  tournamentId: number, points: number): Observable<CommunityChampionship> {
    return this.http.put<CommunityChampionship>(
      this.base(communityId) + '/' + championshipId + '/competitions/' + tournamentId + '/winner-points',
      { points });
  }

  addCompetition(communityId: number, championshipId: number,
                 tournamentId: number): Observable<CommunityChampionship> {
    return this.http.post<CommunityChampionship>(
      this.base(communityId) + '/' + championshipId + '/competitions/' + tournamentId, {});
  }
}
