export interface TrackSprintBracketMatch {
  phase: 'SPRINT_THIRTY_SECOND_FINAL' | 'SPRINT_REPECHAGE_1_32' | 'SPRINT_REPECHAGE_1_16' | 'SPRINT_REPECHAGE_1_8' | 'SPRINT_PLACES_5_8' | 'SPRINT_SIXTEENTH_FINAL' | 'SPRINT_EIGHTH_FINAL' | 'SPRINT_QUARTER_FINAL' | 'SPRINT_SEMI_FINAL' | 'SPRINT_BRONZE_FINAL' | 'SPRINT_GOLD_FINAL';
  slot: string;
  seriesKey: string;
  riderA: string | null;
  riderB: string | null;
  riderC?: string | null;
  riderD?: string | null;
  rankings?: { position: number; username: string }[];
  winsA: number;
  winsB: number;
  winner: string | null;
  status: 'READY' | 'WAITING_PREVIOUS' | 'IN_PROGRESS' | 'FINISHED' | 'CONFLICT';
}

/** Explicit signed UCI 3.2.027 decision for one group of tied 200m times. */
export interface SprintTieDecision {
  method: 'LAST_100' | 'DRAW_LOTS';
  reason: 'LAST_100_UNAVAILABLE' | 'LAST_100_STILL_TIED' | null;
  orderedUsernames: string[];
  last100Seconds: Record<string, number>;
  reference: string;
}

export interface TrackSprintIncident {
  id: number;
  seriesKey: string;
  heatNumber: number;
  incidentType: 'FALL' | 'PUNCTURE' | 'BICYCLE_DEFECT' | 'RULE_INFRINGEMENT' | 'OTHER' | 'PRE_SPRINT_BALANCE' | 'PRE_SPRINT_OPPONENT_CONTACT' | 'PRE_SPRINT_BARRIER_CONTACT' | 'FLAGRANT_BEFORE_BELL';
  details: string;
  status: 'PENDING' | 'DECIDED' | 'ADJUDICATION_REQUIRED' | 'RESTART_AUTHORIZED' | 'RESTART_PENDING' | 'POSITIONS_PENDING' | 'FAULT_START_PENDING' | 'FAULT_START_OK' | 'FLAGRANT_START_PENDING' | 'FLAGRANT_START_OK' | 'NEUTRAL_RESTART_OK' | 'OFFICIAL_POSITIONS' | 'OFFICIAL_HEAT_AWARDED' | 'OFFICIAL_SERIES_AWARDED';
  reportedBy: string;
  reportedAt: string;
  decisionType: 'RESTART_REQUIRED' | 'OFFICIAL_RESULT_TO_RECORD' | 'DISCIPLINARY_RULING' | 'UNINTENTIONAL_FALL' | 'PRE_SPRINT_RESTART' | 'FLAGRANT_RULING' | null;
  sanctionType?: 'WARNING' | 'RELEGATION' | 'DISQUALIFICATION' | null;
  sanctionedUsername?: string | null;
  decisionReference: string | null;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  rerunRiders?: string[];
  rerunReference?: string | null;
  rerunReason?: string | null;
  rerunAuthorizedBy?: string | null;
  rerunAuthorizedAt?: string | null;
  awardWinner?: string | null;
  awardReference?: string | null;
  awardReason?: string | null;
  awardConfirmedBy?: string | null;
  awardConfirmedAt?: string | null;
  officialPositions?: string[];
  fallFaultRider?: string | null;
  fallNonFaultRider?: string | null;
  fallChosenStartPosition?: 'INSIDE' | 'OUTSIDE' | null;
  preSprintIncidentRider?: string | null;
  preSprintNonFaultRider?: string | null;
  preSprintStartPosition?: 'INSIDE' | 'OUTSIDE' | null;
  preSprintBeforeStartConfirmed?: boolean | null;
  preSprintStarterStoppedConfirmed?: boolean | null;
  flagrantOffendingRider?: string | null;
  flagrantNonFaultRider?: string | null;
  flagrantChosenStartPosition?: 'INSIDE' | 'OUTSIDE' | null;
  flagrantBeforeCutoffConfirmed?: boolean | null;
  flagrantStarterStoppedConfirmed?: boolean | null;
}

/** Immutable signed-decision transcription; platform does not validate external signatures. */
export interface TrackSprintOfficialReview {
  id: number;
  incidentId: number;
  action: 'REQUESTED' | 'UPHELD' | 'OVERTURNED' | 'RECTIFIED';
  officialName: string;
  officialReference: string;
  panelReference: string | null;
  reason: string;
  recordedBy: string;
  recordedAt: string;
  remedyKind?: 'RESUME_SAME_RIDERS' | null;
  orderedRiders?: string[];
  nextHeatNumber?: number | null;
}

export interface TrackSprintInterruption {
  stage: 'BEFORE_QUARTERS' | 'AFTER_QUARTERS' | 'AFTER_SEMIS';
  reference: string;
  reason: string;
  recordedBy: string;
  recordedAt: string;
  noFinalClassification: boolean;
  regulatoryPlacings: {username: string; position: number}[];
}

export interface TrackSprintBracketOverview {
  id: number;
  seasonId: number;
  name: string;
  format: 'EIGHT_RIDER_FINALS' | 'SIXTEEN_RIDER_1_8' | 'TWENTY_EIGHT_RIDER_1_16' | 'OLYMPIC_TWENTY_FOUR_REPECHAGE';
  matches: TrackSprintBracketMatch[];
  qualifyingRoundId?: number | null;
  qualifyingSeeds?: string[];
  incidents?: TrackSprintIncident[];
  interruption?: TrackSprintInterruption | null;
  officialTieDecisions?: SprintTieDecision[];
  tieDecisionRecordedBy?: string | null;
}

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environment/environment';
import { SessionSummary } from '../pages/model/session-summary';
import {
  CommunityCompetitionOverview,
  CommunityCompetitionSettings,
  CommunityGroup,
  CommunityInvite,
  CommunityMatchResult,
  CommunityRole,
  CommunitySeason,
  CommunityVisibility
} from '../pages/model/community-group';

export interface CommunitySearchPresentation {
  id: number;
  name: string;
  description: string | null;
  sport: string | null;
  sports?: string[];
  photoUrl: string | null;
  photoZoom?: number | null;
  photoFocusX?: number | null;
  photoFocusY?: number | null;
  photoFitMode?: 'COVER' | 'SHOW_ALL' | null;
  visibility: CommunityVisibility;
}

export interface CommunityCreationQuota {
  owned: number;
  limit: number;
  canCreate: boolean;
}

export interface CommunitySearchResponse {
  communities: CommunitySearchPresentation[];
  page: number;
  hasMore: boolean;
}

export interface CommunityJoinRequest {
  id: number;
  communityId: number;
  communityName: string;
  requesterUsername: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
}


export interface HistoricalStandingRow {
  position: number;
  name: string;
  played: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  points: number;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

/** Optional structured import diagnostics introduced without removing legacy messages. */
export interface CommunityImportDiagnostic {
  code: string;
  params?: Record<string, string>;
}

export interface HistoricalStandingPreview {
  sheetName: string;
  sourceRows: number;
  acceptedRows: number;
  duplicateRows: number;
  warnings: string[];
  warningDetails?: CommunityImportDiagnostic[];
  rows: HistoricalStandingRow[];
}

export interface HistoricalStandingSummary {
  id: number;
  title: string;
  entryType: 'INDIVIDUAL' | 'TEAM';
  seasonId: number | null;
  sourceFilename: string;
  createdAt: string;
}

export interface HistoricalStandingArchive extends HistoricalStandingSummary {
  rows: HistoricalStandingRow[];
}

export interface HistoricalMatchPreview {
  sheetName: string;
  sourceRows: number;
  acceptedRows: number;
  potentialDuplicates: number;
  warnings: string[];
  warningDetails?: CommunityImportDiagnostic[];
  rows: Array<{
    sourceRow: number;
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
    sourceDate: string;
    sourceRound: string;
    potentialDuplicate: boolean;
  }>;
}


export interface HistoricalMatchArchiveSummary {
  id: number;
  title: string;
  entryType: 'INDIVIDUAL' | 'TEAM';
  sourceFilename: string;
  createdAt: string;
}

export interface HistoricalMatchArchive extends HistoricalMatchArchiveSummary {
  rows: HistoricalMatchPreview['rows'];
  tournamentId?: number | null;
}


export interface HistoricalPlayerCandidate {
  playerId: number;
  historicalName: string;
  linkedUsername: string | null;
  linkStatus: 'UNLINKED' | 'PENDING' | 'ACCEPTED';
}

export interface HistoricalPlayerLink {
  id: number;
  playerId: number;
  historicalName: string;
  targetUsername: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

@Injectable({ providedIn: 'root' })
export class CommunityGroupsService {
  private readonly url = environment.apiUrl + '/api/communities';

  constructor(private http: HttpClient) {}

  deleteCommunity(id: number, name: string): Observable<void> {
    return this.http.post<void>(this.url + '/' + id + '/delete', { name });
  }

  creationQuota(): Observable<CommunityCreationQuota> {
    return this.http.get<CommunityCreationQuota>(this.url + '/creation-quota');
  }

  mine(): Observable<CommunityGroup[]> {
    return this.http.get<CommunityGroup[]>(this.url + '/mine');
  }

  search(name: string, sport: string, page: number): Observable<CommunitySearchResponse> {
    const params = new HttpParams()
      .set('name', name.trim())
      .set('sport', sport.trim())
      .set('page', String(page));

    return this.http.get<CommunitySearchResponse>(this.url + '/search', { params });
  }

  presentation(id: number): Observable<CommunitySearchPresentation> {
    return this.http.get<CommunitySearchPresentation>(this.url + '/' + id + '/presentation');
  }

  joinPublic(id: number): Observable<CommunityGroup> {
    return this.http.post<CommunityGroup>(this.url + '/' + id + '/join', null);
  }

  requestJoin(id: number): Observable<CommunityJoinRequest> {
    return this.http.post<CommunityJoinRequest>(this.url + '/' + id + '/join-requests', null);
  }

  pendingJoinRequests(id: number): Observable<CommunityJoinRequest[]> {
    return this.http.get<CommunityJoinRequest[]>(this.url + '/' + id + '/join-requests');
  }

  myPendingJoinRequest(id: number): Observable<CommunityJoinRequest | null> {
    return this.http.get<CommunityJoinRequest | null>(this.url + '/' + id + '/join-requests/me');
  }

  acceptJoinRequest(communityId: number, requestId: number): Observable<CommunityGroup> {
    return this.http.post<CommunityGroup>(
      this.url + '/' + communityId + '/join-requests/' + requestId + '/accept',
      null
    );
  }

  rejectJoinRequest(communityId: number, requestId: number): Observable<void> {
    return this.http.post<void>(
      this.url + '/' + communityId + '/join-requests/' + requestId + '/reject',
      null
    );
  }

  followerState(id:number):Observable<{count:number;following:boolean}> {
    return this.http.get<{count:number;following:boolean}>(this.url+'/'+id+'/followers');
  }

  followCommunity(id:number):Observable<{count:number;following:boolean}> {
    return this.http.put<{count:number;following:boolean}>(this.url+'/'+id+'/followers/me',{});
  }

  unfollowCommunity(id:number):Observable<{count:number;following:boolean}> {
    return this.http.delete<{count:number;following:boolean}>(this.url+'/'+id+'/followers/me');
  }

  get(id: number): Observable<CommunityGroup> {
    return this.http.get<CommunityGroup>(this.url + '/' + id);
  }

  create(request: {
    name: string;
    description: string | null;
    sport: string | null;
    sports?: string[];
    visibility: CommunityVisibility;
  }): Observable<CommunityGroup> {
    return this.http.post<CommunityGroup>(this.url, request);
  }

  updateFeatures(id: number, request: {
    rankingsEnabled: boolean;
    individualTournamentsEnabled: boolean;
    teamTournamentsEnabled: boolean;
  }): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(this.url + '/' + id + '/features', request);
  }

  /** Only the owner switches a community between public (discoverable) and private (invite or approval). */
  updateVisibility(id: number, visibility: CommunityVisibility): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(this.url + '/' + id + '/visibility', { visibility });
  }

  /** Organizers choose whether every member, or only organizers, publish posts and Stories. */
  updatePostingPolicy(id: number, membersCanPost: boolean): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(this.url + '/' + id + '/posting-policy', { membersCanPost });
  }

  updateSessionCreationPolicy(id: number, membersCanCreateSessions: boolean): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(
      this.url + '/' + id + '/session-creation-policy', { membersCanCreateSessions });
  }

  updateDefaultVenue(id: number, venueId: number | null): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(this.url + '/' + id + '/default-venue', { venueId });
  }

  updateHabitualLocation(id: number, source: 'MAPS' | 'GPS', latitude: number,
                         longitude: number, city: string | null, address: string | null): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(this.url + '/' + id + '/habitual-location',
      { source, latitude, longitude, city, address });
  }

  updateSports(id: number, sports: string[]): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(this.url + '/' + id + '/sports', { sports });
  }

  sessions(id: number): Observable<SessionSummary[]> {
    return this.http.get<SessionSummary[]>(
      this.url + '/' + id + '/sessions'
    );
  }

  sessionResultRoster(id: number, sessionId: number): Observable<Array<{
    id: number | null;
    username: string;
    attendanceStatus: 'PENDING' | 'ATTENDED' | 'NO_SHOW' | 'LATE_CANCELLED' | null;
    teamCode?: 'A' | 'B' | null;
    displayName?: string | null;
    guest?: boolean;
  }>> {
    return this.http.get<Array<{
      id: number | null;
      username: string;
      attendanceStatus: 'PENDING' | 'ATTENDED' | 'NO_SHOW' | 'LATE_CANCELLED' | null;
      teamCode?: 'A' | 'B' | null;
      displayName?: string | null;
      guest?: boolean;
    }>>(this.url + '/' + id + '/sessions/' + sessionId + '/competition-result/roster');
  }

  recordedSessionResults(id: number): Observable<number[]> {
    return this.http.get<number[]>(this.url + '/' + id + '/sessions/competition-results');
  }

  recordSessionResult(id: number, sessionId: number, request: {
    outcome: 'A' | 'B' | 'DRAW';
    players: Array<{ username: string; team: 'A' | 'B' }>;
  }): Observable<unknown> {
    return this.http.post(this.url + '/' + id + '/sessions/' + sessionId + '/competition-result', request);
  }

  openSessionToPublic(id: number, sessionId: number): Observable<SessionSummary> {
    return this.http.post<SessionSummary>(
      this.url + '/' + id + '/sessions/' + sessionId + '/open-public',
      null
    );
  }

  restrictSessionToMembers(id: number, sessionId: number): Observable<SessionSummary> {
    return this.http.post<SessionSummary>(
      this.url + '/' + id + '/sessions/' + sessionId + '/restrict-members',
      null
    );
  }

  updateSportPointsRule(communityId: number, seasonId: number,
    request: { sport: string; winPoints: number; drawPoints: number; lossPoints: number }
  ): Observable<{ sport: string; winPoints: number; drawPoints: number; lossPoints: number }> {
    return this.http.put<{ sport: string; winPoints: number; drawPoints: number; lossPoints: number }>(
      this.url + '/' + communityId + '/seasons/' + seasonId + '/sport-points', request);
  }

  updateRaceRule(communityId: number, seasonId: number,
    request: { sport: string; pointsByPlace: string }
  ): Observable<unknown> {
    return this.http.put(
      this.url + '/' + communityId + '/seasons/' + seasonId + '/race-rules', request);
  }

  updateRacePenalty(communityId: number, roundId: number, entryId: number,
    request: { penaltyPoints: number; reason: string | null }
  ): Observable<unknown> {
    return this.http.put(
      this.url + '/' + communityId + '/rounds/' + roundId +
        '/entries/' + entryId + '/race-penalty', request);
  }

  updateRaceDecision(communityId: number, roundId: number, entryId: number,
    request: { timePenaltySeconds: number; disqualified: boolean; reason: string | null }
  ): Observable<unknown> {
    return this.http.put(
      this.url + '/' + communityId + '/rounds/' + roundId +
        '/entries/' + entryId + '/race-decision', request);
  }

  updateRacketRule(
    communityId: number,
    seasonId: number,
    request: { sport: string; matchFormat: 'SINGLES' | 'DOUBLES';
      winPoints: number; lossPoints: number; tieBreak: 'SETS_FIRST' | 'SCORE_FIRST' }
  ): Observable<unknown> {
    return this.http.put(
      this.url + '/' + communityId + '/seasons/' + seasonId + '/racket-rules', request
    );
  }

  competition(
    id: number,
    seasonId: number | null = null
  ): Observable<CommunityCompetitionOverview> {
    const suffix = seasonId === null ? '' : '?seasonId=' + seasonId;
    return this.http.get<CommunityCompetitionOverview>(
      this.url + '/' + id + '/competition' + suffix
    );
  }

  historicalPlayerCandidates(id: number): Observable<HistoricalPlayerCandidate[]> {
    return this.http.get<HistoricalPlayerCandidate[]>(this.url + '/' + id + '/competition/historical-players');
  }

  claimHistoricalPlayer(id: number, playerId: number): Observable<HistoricalPlayerLink> {
    return this.http.post<HistoricalPlayerLink>(
      this.url + '/' + id + '/competition/historical-player-links/claim', { playerId });
  }

  myHistoricalClaims(id: number): Observable<HistoricalPlayerLink[]> {
    return this.http.get<HistoricalPlayerLink[]>(
      this.url + '/' + id + '/competition/historical-player-links/my-claims');
  }

  releaseHistoricalClaim(id: number, linkId: number): Observable<void> {
    return this.http.delete<void>(
      this.url + '/' + id + '/competition/historical-player-links/my-claims/' + linkId);
  }

  importPreview(id: number, file: File): Observable<{
    fileName: string;
    sheets: Array<{
      name: string;
      nonEmptyRows: number;
      structure: string;
      headers: string[];
      sampleRows: string[][];
      columnSuggestions: Array<{
        columnIndex: number;
        header: string;
        field: string;
        confidence: number;
      }>;
    }>;
  }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<any>(
      this.url + '/' + id + '/competition/import/preview',
      formData
    );
  }

  validateImport(id: number, file: File, mapping: unknown): Observable<any> {
    const formData = this.importForm(file, mapping);
    return this.http.post<any>(this.url + '/' + id + '/competition/import/validate', formData);
  }

  normalizedImportPreview(id: number, file: File, mapping: unknown): Observable<any> {
    const formData = this.importForm(file, mapping);
    return this.http.post<any>(this.url + '/' + id + '/competition/import/normalized-preview', formData);
  }

  confirmImportRounds(id: number, file: File, mapping: unknown, context: unknown): Observable<any> {
    const formData = this.importForm(file, mapping);
    formData.append('context', new Blob([JSON.stringify(context)], { type: 'application/json' }));
    return this.http.post<any>(this.url + '/' + id + '/competition/import/rounds/confirm', formData);
  }

  finalImportPlan(id: number, file: File, mapping: unknown, context: unknown): Observable<any> {
    const formData = this.importForm(file, mapping);
    formData.append('context', new Blob([JSON.stringify(context)], { type: 'application/json' }));
    return this.http.post<any>(this.url + '/' + id + '/competition/import/rounds/final-plan', formData);
  }

  previewHistoricalMatches(id: number, file: File, mapping: unknown): Observable<HistoricalMatchPreview> {
    return this.http.post<HistoricalMatchPreview>(
      this.url + '/' + id + '/competition/import/matches/preview',
      this.importForm(file, mapping)
    );
  }

  confirmHistoricalMatches(id: number, file: File, mapping: unknown, context: {
    title: string;
    entryType: 'INDIVIDUAL' | 'TEAM';
    createTournament?: boolean;
    sport?: string;
    format?: 'LEAGUE' | 'KNOCKOUT';
  }): Observable<HistoricalMatchArchive> {
    const form = this.importForm(file, mapping);
    form.append('context', new Blob([JSON.stringify(context)], { type: 'application/json' }));
    return this.http.post<HistoricalMatchArchive>(
      this.url + '/' + id + '/competition/import/matches/confirm', form
    );
  }

  listHistoricalMatches(id: number): Observable<HistoricalMatchArchiveSummary[]> {
    return this.http.get<HistoricalMatchArchiveSummary[]>(
      this.url + '/' + id + '/competition/match-archives'
    );
  }

  historicalMatchDetails(id: number, archiveId: number): Observable<HistoricalMatchArchive> {
    return this.http.get<HistoricalMatchArchive>(
      this.url + '/' + id + '/competition/match-archives/' + archiveId
    );
  }

  previewHistoricalStandings(id: number, file: File, mapping: unknown): Observable<HistoricalStandingPreview> {
    return this.http.post<HistoricalStandingPreview>(
      this.url + '/' + id + '/competition/import/standings/preview',
      this.importForm(file, mapping)
    );
  }

  confirmHistoricalStandings(id: number, file: File, mapping: unknown, context: {
    title: string;
    entryType: 'INDIVIDUAL' | 'TEAM';
    seasonId: number | null;
  }): Observable<HistoricalStandingArchive> {
    const form = this.importForm(file, mapping);
    form.append('context', new Blob([JSON.stringify(context)], { type: 'application/json' }));
    return this.http.post<HistoricalStandingArchive>(
      this.url + '/' + id + '/competition/import/standings/confirm', form
    );
  }

  listHistoricalStandings(id: number): Observable<HistoricalStandingSummary[]> {
    return this.http.get<HistoricalStandingSummary[]>(
      this.url + '/' + id + '/competition/standings-archives'
    );
  }

  historicalStandingDetails(id: number, archiveId: number): Observable<HistoricalStandingArchive> {
    return this.http.get<HistoricalStandingArchive>(
      this.url + '/' + id + '/competition/standings-archives/' + archiveId
    );
  }

  private importForm(file: File, mapping: unknown): FormData {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', new Blob([JSON.stringify(mapping)], { type: 'application/json' }));
    return formData;
  }

  createSeason(
    id: number,
    request: { name: string; startsAt: string | null; sport?: string }
  ): Observable<CommunitySeason> {
    return this.http.post<CommunitySeason>(
      this.url + '/' + id + '/seasons',
      request
    );
  }

  renameSeason(id: number, seasonId: number, name: string): Observable<CommunitySeason> {
    return this.http.put<CommunitySeason>(
      this.url + '/' + id + '/seasons/' + seasonId,
      { name }
    );
  }

  deleteSeason(id: number, seasonId: number): Observable<void> {
    return this.http.delete<void>(this.url + '/' + id + '/seasons/' + seasonId);
  }

  closeSeason(id: number, seasonId: number): Observable<CommunitySeason> {
    return this.http.post<CommunitySeason>(
      this.url + '/' + id + '/seasons/' + seasonId + '/close',
      null
    );
  }

  updateCompetitionSettings(
    id: number,
    request: {
      rankingsEnabled: boolean;
      winPoints: number | null;
      drawPoints: number | null;
      lossPoints: number | null;
      overallStandingsEnabled?: boolean;
    }
  ): Observable<CommunityCompetitionSettings> {
    return this.http.put<CommunityCompetitionSettings>(
      this.url + '/' + id + '/competition/settings',
      request
    );
  }

  trackSprintBrackets(communityId: number, seasonId: number): Observable<TrackSprintBracketOverview[]> {
    return this.http.get<TrackSprintBracketOverview[]>(
      this.url + '/' + communityId + '/seasons/' + seasonId + '/track-sprint-brackets');
  }

  createTrackSprintBracket(communityId: number, seasonId: number, name: string,
    format: 'EIGHT_RIDER_FINALS' | 'SIXTEEN_RIDER_1_8' | 'TWENTY_EIGHT_RIDER_1_16' | 'OLYMPIC_TWENTY_FOUR_REPECHAGE' = 'EIGHT_RIDER_FINALS',
    qualifyingRoundId: number | null = null,
    officialTieDecisions: SprintTieDecision[] = []): Observable<TrackSprintBracketOverview> {
    return this.http.post<TrackSprintBracketOverview>(
      this.url + '/' + communityId + '/seasons/' + seasonId + '/track-sprint-brackets',
      {name, format, qualifyingRoundId, officialTieDecisions});
  }

  reportTrackSprintIncident(communityId: number, seasonId: number, bracketId: number,
    payload: {seriesKey: string; heatNumber: number; incidentType: TrackSprintIncident['incidentType']; details: string}):
    Observable<TrackSprintIncident> {
    return this.http.post<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents', payload);
  }

  decideTrackSprintIncident(communityId: number, seasonId: number, bracketId: number,
    incidentId: number,
    payload: {decisionType: 'RESTART_REQUIRED' | 'OFFICIAL_RESULT_TO_RECORD' | 'DISCIPLINARY_RULING' | 'UNINTENTIONAL_FALL' | 'PRE_SPRINT_RESTART';
      reference: string; reason: string;
      sanctionType?: 'WARNING' | 'RELEGATION' | 'DISQUALIFICATION';
      sanctionedUsername?: string}):
    Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId + '/decision', payload);
  }

  ratifySprintIncidentPositions(communityId: number, seasonId: number, bracketId: number,
    incidentId: number, payload: {
      orderedRiders: string[];
      panelPositionsConfirmed: boolean;
      reference: string;
      reason: string;
    }): Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/official-positions', payload);
  }

  confirmUnintentionalFallStart(communityId: number, seasonId: number,
    bracketId: number, incidentId: number, payload: {
      faultRider: string;
      nonFaultRider: string;
      nonFaultStartPosition: 'INSIDE' | 'OUTSIDE';
      nonFaultChoiceConfirmed: boolean;
      reference: string;
      reason: string;
    }): Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/unintentional-fall-start', payload);
  }

  confirmPreSprintStart(communityId: number, seasonId: number,
    bracketId: number, incidentId: number, payload: {
      incidentRider: string;
      nonFaultRider: string;
      nonFaultStartPosition: 'INSIDE' | 'OUTSIDE';
      nonFaultChoiceConfirmed: boolean;
      beforeSprintConfirmed: boolean;
      starterStoppedConfirmed: boolean;
      reference: string;
      reason: string;
    }): Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/pre-sprint-start', payload);
  }

  ruleFlagrantSprintIncident(communityId: number, seasonId: number,
    bracketId: number, incidentId: number, payload: {
      offendingRider: string;
      sanction: 'NONE' | 'RELEGATION' | 'DISQUALIFICATION';
      beforeBellOrSprintConfirmed: boolean;
      starterStoppedConfirmed: boolean;
      reference: string;
      reason: string;
    }): Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/flagrant-ruling', payload);
  }

  confirmFlagrantNoSanctionStart(communityId: number, seasonId: number,
    bracketId: number, incidentId: number, payload: {
      nonFaultRider: string;
      nonFaultStartPosition: 'INSIDE' | 'OUTSIDE';
      nonFaultChoiceConfirmed: boolean;
      reference: string;
      reason: string;
    }): Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/flagrant-no-sanction-start', payload);
  }

  authorizeNeutralSprintRestart(communityId: number, seasonId: number, bracketId: number,
    incidentId: number, payload: {
      cause: 'NO_FAULT_FALL' | 'PUNCTURE' | 'ESSENTIAL_BICYCLE_BREAKAGE';
      noFaultConfirmed: boolean;
      orderedRiders: string[];
      reference: string;
      reason: string;
    }): Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/neutral-restart', payload);
  }

  authorizeTrackSprintRerun(communityId: number, seasonId: number, bracketId: number,
    incidentId: number, payload: {orderedRiders: string[]; reference: string; reason: string}):
    Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId + '/rerun', payload);
  }

  confirmSprintTwoUpOfficialAward(communityId: number, seasonId: number, bracketId: number,
    incidentId: number,
    payload: {winnerUsername: string; basis: 'INTENTIONAL_FALL'; reference: string; reason: string}):
    Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/official-award', payload);
  }

  confirmSprintBo3SeriesVerdict(communityId: number, seasonId: number, bracketId: number,
    incidentId: number,
    payload: {winnerUsername: string; basis: 'INTENTIONAL_FALL'; reference: string; reason: string}):
    Observable<TrackSprintIncident> {
    return this.http.put<TrackSprintIncident>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/official-series-verdict', payload);
  }

  sprintOfficialReviews(communityId: number, seasonId: number,
    bracketId: number, incidentId: number): Observable<TrackSprintOfficialReview[]> {
    return this.http.get<TrackSprintOfficialReview[]>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId + '/reviews');
  }

  requestSprintOfficialReview(communityId: number, seasonId: number,
    bracketId: number, incidentId: number, payload: {
      presidentName: string; requestReference: string; reason: string;
      originalJudgeRefereeDecision: boolean;
    }): Observable<TrackSprintOfficialReview> {
    return this.http.post<TrackSprintOfficialReview>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId + '/reviews', payload);
  }

  resolveSprintOfficialReview(communityId: number, seasonId: number,
    bracketId: number, incidentId: number, payload: {
      outcome: 'UPHELD' | 'OVERTURNED'; presidentName: string;
      panelReviewReference: string; presidentDecisionReference: string; reason: string;
    }): Observable<TrackSprintOfficialReview> {
    return this.http.put<TrackSprintOfficialReview>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/reviews/decision', payload);
  }

  rectifySprintOfficialReview(communityId: number, seasonId: number,
    bracketId: number, incidentId: number, payload: {
      presidentName: string;
      instructionReference: string;
      overturnedDecisionReference: string;
      reason: string;
      sanctionAnnulledByPresident: boolean;
      orderedRiders: string[];
      nextHeatNumber: number;
    }): Observable<TrackSprintOfficialReview> {
    return this.http.put<TrackSprintOfficialReview>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/incidents/' + incidentId
      + '/reviews/rectification', payload);
  }

  endTrackSprintCompetition(communityId: number, seasonId: number, bracketId: number,
    payload: {reference: string; reason: string}): Observable<TrackSprintBracketOverview> {
    return this.http.put<TrackSprintBracketOverview>(
      this.url + '/' + communityId + '/seasons/' + seasonId
      + '/track-sprint-brackets/' + bracketId + '/interruption', payload);
  }

  deleteTrackSprintBracket(communityId: number, seasonId: number, bracketId: number):
    Observable<void> {
    return this.http.delete<void>(
      this.url + '/' + communityId + '/seasons/' + seasonId
        + '/track-sprint-brackets/' + bracketId);
  }

  createRound(
    id: number,
    request: {
      name: string;
      playedAt: string;
      seasonId?: number | null;
      sport?: string | null;
      eventType?: 'TRACK_SCRATCH' | 'TRACK_TIME_TRIAL' | 'TRACK_FLYING_200' | 'TRACK_SPRINT_HEAT' | 'TRACK_SPRINT_REPECHAGE' | 'TRACK_SPRINT_5_8' | 'ROAD_RACE' | 'TIME_TRIAL' | 'RACE' | 'FREESTYLE' | 'TRACK' | 'JUMP' | 'THROW' | 'HEAT' | 'BODYBOARD_HEAT' | 'APPARATUS'
        | 'SKATE_PARK' | 'SKATE_STREET' | 'PARKOUR_SPEED' | 'PARKOUR_FREESTYLE'
        | 'BREAKING_BATTLE' | 'TRAMPOLINE_INDIVIDUAL'
        | 'RHYTHMIC_APPARATUS' | 'ARTISTIC_SOLO_TECHNICAL' | 'ARTISTIC_SOLO_FREE'
        | 'RHYTHMIC_GROUP_5' | 'RHYTHMIC_GROUP_3_2'
        | 'ARTISTIC_DUET_TECH' | 'ARTISTIC_DUET_FREE'
        | 'ARTISTIC_TEAM_TECH' | 'ARTISTIC_TEAM_FREE'
        | 'BASKETBALL_FINAL' | 'BASKETBALL_3X3_FINAL'
        | 'VOLLEYBALL_FINAL' | 'BEACH_VOLLEY_FINAL' | 'HANDBALL_FINAL' | 'RUGBY_FINAL' | 'RUGBY_SEVENS_FINAL'
    | 'FUTSAL_FINAL' | 'FIELD_HOCKEY_FINAL' | 'ROLLER_HOCKEY_FINAL' | 'WATER_POLO_FINAL'
    | 'FOOTVOLLEY_SINGLE_18' | 'FOOTVOLLEY_BEST_OF_3' | 'FOOTVOLLEY_SINGLE_15'
    | 'ICE_HOCKEY_REG' | 'ICE_HOCKEY_OT' | 'ICE_HOCKEY_SO' | 'BASEBALL_RUNS' | 'SOFTBALL_RUNS' | 'KORFBALL_REG' | 'KORFBALL_GOLDEN'
    | 'LACROSSE_M_REG' | 'LACROSSE_M_OT' | 'AMFOOTBALL_SCORE' | 'FLAGFOOTBALL_SCORE' | 'CURLING_REG' | 'CURLING_EXTRA'
    | 'PETANQUE_13' | 'PETANQUE_11' | 'BOWLING_TENPIN' | 'POOL_9_RACKS' | 'FENCING_POOL_5' | 'FENCING_DE_15'
    | 'TEQBALL_SINGLES' | 'TEQBALL_DOUBLES' | 'CHESS_GAME' | 'CRICKET_T20' | 'GOLF_STROKE_9' | 'GOLF_STROKE_18'
    | 'JUDO_IPPON' | 'JUDO_AWASETE_IPPON' | 'JUDO_WAZA_ARI' | 'JUDO_YUKO' | 'JUDO_HANSOKU_MAKE'
    | 'KARATE_KUMITE_POINTS' | 'KARATE_KUMITE_SENSHU' | 'KARATE_KUMITE_HANTEI' | 'KARATE_KATA_JUDGES'
    | 'TKD_KYORUGI_BEST3' | 'TKD_POOMSAE_RECOGNIZED' | 'TKD_POOMSAE_FREESTYLE'
    | 'BJJ_IBJJF_GI_SUBMISSION' | 'BJJ_IBJJF_GI_POINTS' | 'BOXING_WB_POINTS' | 'BOXING_WB_KO' | 'BOXING_WB_RSC' | 'WAKO_POINT_FIGHTING' | 'WAKO_LIGHT_CONTACT'
    | 'WAKO_KICK_LIGHT' | 'WAKO_FULL_CONTACT' | 'WAKO_LOW_KICK' | 'WAKO_K1'
    | 'IFMA_FULL_WP' | 'IFMA_FULL_KO' | 'IFMA_FULL_RSCS' | 'IFMA_FULL_RSCI'
    | 'STRENGTH_TRAINING' | 'SWIM_LCM' | 'CANOE_SPRINT' | 'ROWING_SINGLE' | 'OWS_INDIVIDUAL' | 'FOOT_ORIENTEERING' | 'INLINE_TRACK_200_TT' | 'INLINE_TRACK_500D_FIRST_ROUND' | 'INLINE_ROAD_LAP_FIRST_ROUND'
    | 'INLINE_TRACK_500D_QUARTER_HEAT' | 'INLINE_TRACK_500D_SEMI_HEAT' | 'INLINE_TRACK_500D_FINAL_A' | 'INLINE_TRACK_500D_FINAL_B' | 'INLINE_ROAD_LAP_QUARTER_HEAT' | 'INLINE_ROAD_LAP_SEMI_HEAT' | 'INLINE_ROAD_LAP_FINAL_A' | 'INLINE_ROAD_LAP_FINAL_B' | null;
      eventDiscipline?: string | null;
      sprintSeriesKey?: string | null;
      sprintHeatNumber?: number | null;
      matchFormat?: 'SINGLES' | 'DOUBLES' | null;
      setScores?: Array<{ sideA: number | null; sideB: number | null }> | null;
      groupScores?: Array<{ groupName: string; score: number | null }>;
      basketballScore?: { sideA: number | null; sideB: number | null };
      teamScore?: { sideA: number | null; sideB: number | null };
      cricketDetails?: { wicketsA: number | null; legalBallsA: number | null;
        wicketsB: number | null; legalBallsB: number | null };
      entries: Array<{
        username: string;
        team: string | null;
        result: CommunityMatchResult;
        goals: number;
        assists: number;
        mvp: boolean;
        cleanSheet: boolean;
        finishPosition?: number | null;
        elapsedSeconds?: number | null;
        bestLapSeconds?: number | null;
        lapsCompleted?: number | null;
        performanceValue?: number | null;
        waveScore1?: number | null;
        waveScore2?: number | null;
      }>;
    }
  ): Observable<unknown> {
    return this.http.post(
      this.url + '/' + id + '/rounds',
      request
    );
  }

  deleteRound(communityId: number, roundId: number): Observable<void> {
    return this.http.delete<void>(
      this.url + '/' + communityId + '/rounds/' + roundId
    );
  }

  updatePhoto(
    id: number, photo: File, fitMode: 'COVER' | 'SHOW_ALL' = 'COVER',
    zoom = 1, focusX = 50, focusY = 50
  ): Observable<CommunityGroup> {
    const formData = new FormData();
    formData.append('photo', photo);
    formData.append('fitMode', fitMode);
    formData.append('zoom', String(zoom));
    formData.append('focusX', String(focusX));
    formData.append('focusY', String(focusY));
    return this.http.put<CommunityGroup>(this.url + '/' + id + '/photo', formData);
  }

  updatePhotoFraming(
    id: number, expectedPhotoUrl: string,
    zoom: number, focusX: number, focusY: number,
    fitMode: 'COVER' | 'SHOW_ALL' = 'COVER'
  ): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(this.url + '/' + id + '/photo/framing', {
      expectedPhotoUrl, zoom, focusX, focusY, fitMode
    });
  }

  removePhoto(id: number): Observable<CommunityGroup> {
    return this.http.delete<CommunityGroup>(this.url + '/' + id + '/photo');
  }

  myInvites(): Observable<CommunityInvite[]> {
    return this.http.get<CommunityInvite[]>(this.url + '/invites/me');
  }

  invite(id: number, username: string): Observable<CommunityInvite> {
    return this.http.post<CommunityInvite>(
      this.url + '/' + id + '/invites',
      { username }
    );
  }

  acceptInvite(inviteId: number): Observable<CommunityGroup> {
    return this.http.post<CommunityGroup>(
      this.url + '/invites/' + inviteId + '/accept',
      null
    );
  }

  rejectInvite(inviteId: number): Observable<void> {
    return this.http.post<void>(
      this.url + '/invites/' + inviteId + '/reject',
      null
    );
  }

  updateRole(
    communityId: number,
    username: string,
    role: Exclude<CommunityRole, 'OWNER'>
  ): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(
      this.url + '/' + communityId + '/members/' + encodeURIComponent(username) + '/role',
      { role }
    );
  }

  removeMember(communityId: number, username: string): Observable<void> {
    return this.http.delete<void>(
      this.url + '/' + communityId + '/members/' + encodeURIComponent(username)
    );
  }

  leave(communityId: number): Observable<void> {
    return this.http.post<void>(
      this.url + '/' + communityId + '/leave',
      null
    );
  }

  transferOwnership(communityId: number, username: string): Observable<CommunityGroup> {
    return this.http.put<CommunityGroup>(
      this.url + '/' + communityId + '/owner',
      { username }
    );
  }
}
