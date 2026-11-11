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
  status: 'DRAFT' | 'SCHEDULED';
  createdAt: string;
}

export interface ChampionshipOwnedEventTeam {
  id: number;
  championshipTeamId: number;
  name: string;
}

export interface ChampionshipFixtureGoal {
  id: number;
  profileId: number;
  scorerName: string;
  teamId: number;
  teamName: string;
  minute: number | null;
}

export interface ChampionshipOwnedLeagueTable {
  eventId: number;
  totalMatches: number;
  playedMatches: number;
  completed: boolean;
  firstPlaceTied: boolean;
  standings: {
    position: number; teamId: number; teamName: string; played: number;
    wins: number; draws: number; losses: number; goalsFor: number;
    goalsAgainst: number; goalDifference: number; points: number;
  }[];
}

export interface ChampionshipOwnedLeagueFixture {
  id: number;
  round: number;
  match: number;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  homeScore?: number | null;
  awayScore?: number | null;
}

export interface ChampionshipCupBye {
  id: number;
  slot: number;
  teamId: number;
  teamName: string;
}

export interface ChampionshipCupOpeningRound {
  matches: ChampionshipOwnedLeagueFixture[];
  byes: ChampionshipCupBye[];
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
  standingsMode?: 'AGGREGATE' | 'INDEPENDENT';
}

export interface ChampionshipTeamPlayer {
  profileId: number;
  username: string;
  displayName: string;
  profilePicUrl: string | null;
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

  teamPlayers(communityId: number, championshipId: number, teamId: number): Observable<ChampionshipTeamPlayer[]> {
    return this.http.get<ChampionshipTeamPlayer[]>(
      this.base(communityId) + '/' + championshipId + '/teams/' + teamId + '/players');
  }

  addTeamPlayer(communityId: number, championshipId: number,
                teamId: number, profileId: number): Observable<ChampionshipTeamPlayer[]> {
    return this.http.post<ChampionshipTeamPlayer[]>(
      this.base(communityId) + '/' + championshipId + '/teams/' + teamId + '/players', { profileId });
  }

  removeTeamPlayer(communityId: number, championshipId: number,
                   teamId: number, profileId: number): Observable<void> {
    return this.http.delete<void>(
      this.base(communityId) + '/' + championshipId + '/teams/' + teamId + '/players/' + profileId);
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
         seasonLabel: string, standingsMode: 'AGGREGATE' | 'INDEPENDENT' = 'AGGREGATE'): Observable<CommunityChampionship> {
    return this.http.post<CommunityChampionship>(this.base(communityId), { name, sport, seasonLabel, standingsMode });
  }

  setStandingsMode(communityId: number, championshipId: number,
                   mode: 'AGGREGATE' | 'INDEPENDENT'): Observable<CommunityChampionship> {
    return this.http.put<CommunityChampionship>(
      this.base(communityId) + '/' + championshipId + '/standings-mode', { mode });
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

  ownedEventTeams(communityId: number, championshipId: number,
                  eventId: number): Observable<ChampionshipOwnedEventTeam[]> {
    return this.http.get<ChampionshipOwnedEventTeam[]>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId + '/teams');
  }

  addOwnedEventTeam(communityId: number, championshipId: number, eventId: number,
                    championshipTeamId: number): Observable<ChampionshipOwnedEventTeam> {
    return this.http.post<ChampionshipOwnedEventTeam>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId + '/teams',
      { championshipTeamId });
  }

  removeOwnedEventTeam(communityId: number, championshipId: number, eventId: number,
                       championshipTeamId: number): Observable<void> {
    return this.http.delete<void>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId +
      '/teams/' + championshipTeamId);
  }

  fixtureGoals(communityId: number, championshipId: number, eventId: number,
               fixtureId: number): Observable<ChampionshipFixtureGoal[]> {
    return this.http.get<ChampionshipFixtureGoal[]>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId
      + '/fixtures/' + fixtureId + '/goals');
  }

  addFixtureGoal(communityId: number, championshipId: number, eventId: number,
                 fixtureId: number, profileId: number, teamId: number,
                 minute: number | null): Observable<ChampionshipFixtureGoal[]> {
    return this.http.post<ChampionshipFixtureGoal[]>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId
      + '/fixtures/' + fixtureId + '/goals', { profileId, teamId, minute });
  }

  removeFixtureGoal(communityId: number, championshipId: number, eventId: number,
                    fixtureId: number, goalId: number): Observable<void> {
    return this.http.delete<void>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId
      + '/fixtures/' + fixtureId + '/goals/' + goalId);
  }

  recordOwnedFixtureScore(communityId: number, championshipId: number, eventId: number,
                          fixtureId: number, homeScore: number, awayScore: number): Observable<ChampionshipOwnedLeagueFixture> {
    return this.http.put<ChampionshipOwnedLeagueFixture>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId +
      '/fixtures/' + fixtureId + '/score', { homeScore, awayScore });
  }

  ownedLeagueStandings(communityId: number, championshipId: number,
                      eventId: number): Observable<ChampionshipOwnedLeagueTable> {
    return this.http.get<ChampionshipOwnedLeagueTable>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId + '/standings');
  }

  ownedLeagueFixtures(communityId: number, championshipId: number,
                      eventId: number): Observable<ChampionshipOwnedLeagueFixture[]> {
    return this.http.get<ChampionshipOwnedLeagueFixture[]>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId + '/fixtures');
  }

  scheduleOwnedLeague(communityId: number, championshipId: number, eventId: number,
                      legs: 1 | 2): Observable<ChampionshipOwnedLeagueFixture[]> {
    return this.http.post<ChampionshipOwnedLeagueFixture[]>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId + '/schedule',
      { legs });
  }

  ownedCupDraw(communityId: number, championshipId: number,
               eventId: number): Observable<ChampionshipCupOpeningRound> {
    return this.http.get<ChampionshipCupOpeningRound>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId + '/cup-draw');
  }

  drawOwnedCup(communityId: number, championshipId: number,
               eventId: number): Observable<ChampionshipCupOpeningRound> {
    return this.http.post<ChampionshipCupOpeningRound>(
      this.base(communityId) + '/' + championshipId + '/owned-events/' + eventId + '/cup-draw', {});
  }

  addCompetition(communityId: number, championshipId: number,
                 tournamentId: number): Observable<CommunityChampionship> {
    return this.http.post<CommunityChampionship>(
      this.base(communityId) + '/' + championshipId + '/competitions/' + tournamentId, {});
  }
}
