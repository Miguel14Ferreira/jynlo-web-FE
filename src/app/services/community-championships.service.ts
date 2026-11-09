import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type ChampionshipOwnedEventFormat = 'LEAGUE' | 'CUP' | 'SUPERCUP' | 'OTHER';

export interface ChampionshipOwnedEvent {
  id: number;
  championshipId: number;
  name: string;
  format: ChampionshipOwnedEventFormat;
  status: 'DRAFT';
  createdAt: string;
}

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
  permanentTeamId: number | null;
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
  permanentTeamId: number | null;
}
export interface ChampionshipIndividualHonour {
  profileId: number;
  name: string;
  titles: number;
  championshipIds: number[];
}
export interface ChampionshipTeamHonour {
  permanentTeamId: number;
  name: string;
  titles: number;
  championshipIds: number[];
  leagues: number;
  cups: number;
}
export interface ChampionshipCompetitionTitle {
  championshipId: number;
  tournamentId: number;
  tournamentName: string;
  seasonLabel: string;
  sport: string;
  format: 'LEAGUE' | 'KNOCKOUT' | 'GROUP_KNOCKOUT';
  entryType: 'TEAM' | 'INDIVIDUAL';
  winnerName: string;
  permanentTeamId: number | null;
}
export interface CommunityPermanentTeam {
  id: number;
  name: string;
}
export interface CommunityPermanentTeams {
  communityId: number;
  teams: CommunityPermanentTeam[];
}

export interface CommunityChampionshipHonours {
  communityId: number;
  completedSeasons: number;
  titles: ChampionshipHistoricalTitle[];
  individualHonours: ChampionshipIndividualHonour[];
  teamHonours: ChampionshipTeamHonour[];
  competitionTitles: ChampionshipCompetitionTitle[];
}

@Injectable({ providedIn: 'root' })
export class CommunityChampionshipsService {
  constructor(private readonly http: HttpClient) {}

  private base(communityId: number): string {
    return environment.apiUrl + '/api/communities/' + communityId + '/championships';
  }

  permanentTeams(communityId: number): Observable<CommunityPermanentTeams> {
    return this.http.get<CommunityPermanentTeams>(this.base(communityId) + '/permanent-teams');
  }

  createPermanentTeam(communityId: number, name: string): Observable<CommunityPermanentTeams> {
    return this.http.post<CommunityPermanentTeams>(
      this.base(communityId) + '/permanent-teams', { name });
  }

  linkPermanentTeam(communityId: number, championshipId: number,
                    seasonTeamId: number, permanentTeamId: number): Observable<CommunityPermanentTeams> {
    return this.http.put<CommunityPermanentTeams>(
      this.base(communityId) + '/' + championshipId + '/teams/' + seasonTeamId + '/permanent-team',
      { permanentTeamId });
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

  ownedEvents(communityId: number, championshipId: number): Observable<ChampionshipOwnedEvent[]> {
    return this.http.get<ChampionshipOwnedEvent[]>(
      this.base(communityId) + '/' + championshipId + '/owned-events');
  }

  createOwnedEvent(communityId: number, championshipId: number, name: string,
                   format: ChampionshipOwnedEventFormat): Observable<ChampionshipOwnedEvent> {
    return this.http.post<ChampionshipOwnedEvent>(
      this.base(communityId) + '/' + championshipId + '/owned-events',
      { name, format });
  }

  updateOwnedEvent(communityId: number, championshipId: number, eventId: number,
                   name: string, format: ChampionshipOwnedEventFormat): Observable<ChampionshipOwnedEvent> {
    return this.http.put<ChampionshipOwnedEvent>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId,
      { name, format });
  }

  deleteOwnedEvent(communityId: number, championshipId: number, eventId: number): Observable<void> {
    return this.http.delete<void>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId);
  }

  addCompetition(communityId: number, championshipId: number,
                 tournamentId: number): Observable<CommunityChampionship> {
    return this.http.post<CommunityChampionship>(
      this.base(communityId) + '/' + championshipId + '/competitions/' + tournamentId, {});
  }
}
