import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface ChampionshipCompetition {
  id: number;
  name: string;
  format: string;
  status: string;
}

export interface CommunityChampionship {
  id: number;
  communityId: number;
  name: string;
  sport: string;
  seasonLabel: string;
  createdAt: string;
  competitions: ChampionshipCompetition[];
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

  addCompetition(communityId: number, championshipId: number,
                 tournamentId: number): Observable<CommunityChampionship> {
    return this.http.post<CommunityChampionship>(
      this.base(communityId) + '/' + championshipId + '/competitions/' + tournamentId, {});
  }
}
