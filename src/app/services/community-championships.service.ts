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
  closedAt: string | null;
  championEntryType: 'TEAM' | 'INDIVIDUAL' | null;
  championParticipantId: number | null;
  championDisplayName: string | null;
}

export interface CommunityChampionshipTeam {
  id: number;
  name: string;
}
export interface CommunityChampionshipCompetitionTeam {
  id: number;
  tournamentId: number;
  tournamentName: string;
  name: string;
  championshipTeamId: number | null;
}
export interface CommunityChampionshipTeams {
  championshipId: number;
  teams: CommunityChampionshipTeam[];
  competitionTeams: CommunityChampionshipCompetitionTeam[];
}

export interface ChampionshipAggregateStanding {
  entryType: 'TEAM' | 'TEAM_UNLINKED' | 'INDIVIDUAL';
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

export interface ChampionshipHistoricalTitle {
  championshipId: number;
  championshipName: string;
  seasonLabel: string;
  sport: string;
  closedAt: string;
  entryType: 'TEAM' | 'INDIVIDUAL';
  participantId: number;
  championName: string;
}
export interface ChampionshipIndividualHonour {
  profileId: number;
  name: string;
  titles: number;
  championshipIds: number[];
}
export interface CommunityChampionshipHonours {
  communityId: number;
  completedSeasons: number;
  titles: ChampionshipHistoricalTitle[];
  individualHonours: ChampionshipIndividualHonour[];
}

@Injectable({ providedIn: 'root' })
export class CommunityChampionshipsService {
  constructor(private readonly http: HttpClient) {}

  private base(communityId: number): string {
    return environment.apiUrl + '/api/communities/' + communityId + '/championships';
  }

  honours(communityId: number): Observable<CommunityChampionshipHonours> {
    return this.http.get<CommunityChampionshipHonours>(this.base(communityId) + '/honours');
  }

  teams(communityId: number, championshipId: number): Observable<CommunityChampionshipTeams> {
    return this.http.get<CommunityChampionshipTeams>(
      this.base(communityId) + '/' + championshipId + '/teams');
  }

  createTeam(communityId: number, championshipId: number, name: string): Observable<CommunityChampionshipTeams> {
    return this.http.post<CommunityChampionshipTeams>(
      this.base(communityId) + '/' + championshipId + '/teams', { name });
  }

  linkTeam(communityId: number, championshipId: number, tournamentTeamId: number,
           championshipTeamId: number): Observable<CommunityChampionshipTeams> {
    return this.http.put<CommunityChampionshipTeams>(
      this.base(communityId) + '/' + championshipId + '/competition-teams/' + tournamentTeamId,
      { championshipTeamId });
  }

  close(communityId: number, championshipId: number): Observable<CommunityChampionship> {
    return this.http.post<CommunityChampionship>(
      this.base(communityId) + '/' + championshipId + '/close', {});
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
