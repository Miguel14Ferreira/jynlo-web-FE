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
  pointsByPlace: string | null;
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

export interface ChampionshipAggregateStanding {
  entryType: 'TEAM' | 'INDIVIDUAL';
  participantId: number;
  name: string;
  points: number;
  victories: number;
  awardedCompetitions: number;
}
export interface CommunityChampionshipStandings {
  championshipId: number;
  standings: ChampionshipAggregateStanding[];
  fullyScoredCompetitions: number;
  winnerOnlyCompetitions: number;
  pendingCompetitions: number;
}

@Injectable({ providedIn: 'root' })
export class CommunityChampionshipsService {
  constructor(private readonly http: HttpClient) {}

  private base(communityId: number): string {
    return environment.apiUrl + '/api/communities/' + communityId + '/championships';
  }

  standings(communityId: number, championshipId: number): Observable<CommunityChampionshipStandings> {
    return this.http.get<CommunityChampionshipStandings>(
      this.base(communityId) + '/' + championshipId + '/standings');
  }

  list(communityId: number): Observable<CommunityChampionship[]> {
    return this.http.get<CommunityChampionship[]>(this.base(communityId));
  }

  create(communityId: number, name: string, sport: string,
         seasonLabel: string): Observable<CommunityChampionship> {
    return this.http.post<CommunityChampionship>(this.base(communityId), { name, sport, seasonLabel });
  }

  setPlacementPoints(communityId: number, championshipId: number,
                     tournamentId: number, pointsByPlace: string): Observable<CommunityChampionship> {
    return this.http.put<CommunityChampionship>(
      this.base(communityId) + '/' + championshipId + '/competitions/' + tournamentId + '/placement-points',
      { pointsByPlace });
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
