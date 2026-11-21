export type TournamentStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED';

export type TeamTieBreakPriority =
  'GOAL_DIFFERENCE_FIRST' | 'GOALS_SCORED_FIRST' | 'WINS_FIRST';

export interface TournamentPointRules {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
}
export type TournamentParticipantStatus = 'PENDING' | 'CONFIRMED';
export type TournamentMatchStatus = 'SCHEDULED' | 'COMPLETED';

export interface CommunityTournament {
  id: number;
  name: string;
  // Optional for cached responses from old API versions; new API always supplies it.
  sport?: string | null;
  // Nullable sport-specific event metadata; historical competitions remain null.
  eventType?: string | null;
  eventDiscipline?: string | null;
  // Older individual competitions may omit these fields in cached responses.
  entryType?: 'INDIVIDUAL' | 'TEAM';
  scoringMode?: 'CHESS_HALF_POINTS' | 'RACE_POINTS' | 'SWIM_BEST_TIME' | 'CANOE_BEST_TIME' | 'ROWING_BEST_TIME' | 'FIELD_BEST_MARK' | 'TRACK_BEST_TIME' | 'RELAY_BEST_TIME' | 'GOLF_GROSS_STROKES' | 'EVENT_RANKING' | null;
  playersPerTeam?: number | null;
  roundRobinLegs?: 1 | 2;
  teamTieBreakPriority?: TeamTieBreakPriority;
  format: 'LEAGUE' | 'KNOCKOUT' | 'GROUP_KNOCKOUT';
  groupCount?: 2 | 4 | null;
  historicalArchiveId?: number | null;
  status: TournamentStatus;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  championProfileId: number | null;
  championUsername: string | null;
  championDisplayName: string | null;
  championPoints: number | null;
  championTied: boolean;
  championTeamId?: number | null;
  championTeamName?: string | null;
}

export interface TournamentPage {
  tournaments: CommunityTournament[];
  page: number;
  hasMore: boolean;
}

export interface TournamentParticipant {
  profileId: number;
  username: string;
  displayName: string;
  joinedAt: string;
  status: TournamentParticipantStatus;
}

export interface TournamentParticipantPage {
  participants: TournamentParticipant[];
  page: number;
  hasMore: boolean;
}

export interface TournamentMatch {
  id: number;
  roundNumber: number;
  homeProfileId: number;
  homeUsername: string;
  awayProfileId: number;
  awayUsername: string;
  status: TournamentMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
}

export interface TournamentMatchPage {
  matches: TournamentMatch[];
  page: number;
  hasMore: boolean;
}

export interface TournamentScheduleSummary {
  tournamentId: number;
  status: TournamentStatus;
  participantCount: number;
  roundCount: number;
  matchCount: number;
}

export interface TournamentStandingRow {
  position: number;
  profileId: number;
  username: string;
  displayName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface TournamentStandings {
  tournamentId: number;
  status: TournamentStatus;
  totalMatches: number;
  completedMatches: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  standings: TournamentStandingRow[];
}

/** Real teams are independent from individual tournament participants and community statistics. */
export interface TournamentTeamPlayer {
  profileId: number;
  username: string;
  displayName: string;
}

export interface TournamentTeam {
  id: number;
  name: string;
  playersPerTeam: number | null;
  createdAt: string;
  players: TournamentTeamPlayer[];
}

/** Team fixtures never use individual tournament participant IDs. */
export interface TournamentTeamMatch {
  id: number;
  roundNumber: number;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  status: TournamentMatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  groupNumber?: number | null;
}

export interface TournamentTeamMatchPage {
  matches: TournamentTeamMatch[];
  page: number;
  hasMore: boolean;
}

export interface TournamentTeamScheduleSummary {
  tournamentId: number;
  status: TournamentStatus;
  teamCount: number;
  roundCount: number;
  matchCount: number;
}

export interface TournamentTeamStandingRow {
  position: number;
  teamId: number;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface TournamentTeamGroup {
  groupNumber: number;
  standings: TournamentTeamStandingRow[];
}

export interface TournamentTeamGroups {
  tournamentId: number;
  knockoutStarted: boolean;
  groups: TournamentTeamGroup[];
}

export interface TournamentTeamStandings {
  tournamentId: number;
  status: TournamentStatus;
  totalMatches: number;
  completedMatches: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  standings: TournamentTeamStandingRow[];
}

/** Karting championship only. Race entries are the existing community round results. */
export interface TournamentRaceEntry {
  communityPlayerId: number | null;
  fullName: string | null;
  finishPosition: number | null;
  elapsedSeconds: number | null;
  bestLapSeconds: number | null;
  racePenaltyPoints: number;
  racePenaltyReason?: string | null;
  raceTimePenaltySeconds?: number | null;
  adjustedElapsedSeconds?: number | null;
  raceStewardReason?: string | null;
  lapsCompleted?: number | null;
  raceDisqualified: boolean;
}

export interface TournamentRaceRound {
  id: number;
  name: string;
  sport: string | null;
  playedAt: string;
  entries: TournamentRaceEntry[];
}

export interface TournamentRaceStanding {
  position: number;
  playerId: number;
  fullName: string | null;
  races: number;
  wins: number;
  podiums: number;
  bestFinish: number | null;
  championshipPoints: number | null;
  penaltyPoints: number;
}

export interface TournamentRaceOverview {
  tournamentId: number;
  pointsByPlace: number[];
  linkedRaces: TournamentRaceRound[];
  availableRaces: TournamentRaceRound[];
  standings: TournamentRaceStanding[];
}

/** Official World Skate 2026 progression; never inferred as a final placement. */
export type InlineSpeedStage = 'FIRST' | 'QUARTER' | 'SEMI' | 'FINAL';
export interface InlineSpeedSkater {
  playerId: number;
  name: string;
  position: number | null;
  seconds: number | null;
  disqualified: boolean;
}
export interface InlineSpeedHeat {
  roundId: number;
  name: string;
  eventType: string;
  heatNumber: number;
  skaters: InlineSpeedSkater[];
}
export interface InlineSpeedProposal {
  sourceStage: Exclude<InlineSpeedStage, 'FINAL'>;
  targetStage: Exclude<InlineSpeedStage, 'FIRST'>;
  playerIds: number[];
  expectedCount: number;
  ready: boolean;
  warning: string;
}
export interface InlineSpeedDecision {
  sourceStage: Exclude<InlineSpeedStage, 'FINAL'>;
  targetStage: Exclude<InlineSpeedStage, 'FIRST'>;
  playerIds: number[];
  reason: string | null;
  confirmedBy: string;
  confirmedAt: string;
  stale: boolean;
}
export type InlineSpeedTieEvidenceType = 'PHOTO_FINISH' | 'VIDEO_REVIEW' | 'OFFICIAL_MINUTES' | 'TIEBREAK_TRIAL' | 'OTHER';

export interface InlineSpeedTieBreakRevision {
  revision: number;
  selectedPlayerIds: number[];
  reason: string;
  trialOrderExceptionReason?: string | null;
  evidenceType?: InlineSpeedTieEvidenceType | null;
  evidenceReference?: string | null;
  trialIds?: number[];
  confirmedBy: string;
  confirmedAt: string;
  stale: boolean;
}
export interface InlineSpeedTieBreak {
  sourceStage: 'FIRST';
  selectedPlayerIds: number[];
  reason: string;
  trialOrderExceptionReason?: string | null;
  evidenceType?: InlineSpeedTieEvidenceType | null;
  evidenceReference?: string | null;
  trialIds?: number[];
  confirmedBy: string;
  confirmedAt: string;
  stale: boolean;
  revisions?: InlineSpeedTieBreakRevision[];
}

export interface InlineSpeedTrialResult {
  playerId: number;
  place: number;
  seconds: number | null;
}
export interface InlineSpeedTrial {
  id: number;
  sourceStage: 'FIRST';
  heldAt: string;
  officialReference: string;
  reason: string;
  recordedBy: string;
  recordedAt: string;
  stale: boolean;
  results: InlineSpeedTrialResult[];
}
export interface InlineSpeedTrialRequest {
  actuallyHeld: boolean;
  heldAt: string;
  officialReference: string;
  reason: string;
  results: InlineSpeedTrialResult[];
}

export interface InlineSpeedOverview {
  tournamentId: number;
  discipline: 'TRACK_500D' | 'ROAD_LAP' | null;
  linkedHeats: InlineSpeedHeat[];
  availableHeats: InlineSpeedHeat[];
  proposals: InlineSpeedProposal[];
  decisions: InlineSpeedDecision[];
  tieBreaks?: InlineSpeedTieBreak[];
  trials?: InlineSpeedTrial[];
}

/** Measured times, not football scores or ordinal race points. */
export interface TournamentTimedRound {
  id:number; name:string; sport:string|null; playedAt:string;
  eventType:string|null; eventDiscipline:string|null;
  entries:{communityPlayerId:number|null;fullName:string|null;
    elapsedSeconds:number|null;raceDisqualified:boolean}[];
}
export interface TournamentTimedStanding {
  position:number;communityPlayerId:number;profileId:number|null;
  username:string;fullName:string;bestSeconds:number;validAttempts:number;
}
export interface TournamentTimedOverview {
  tournamentId:number;eventType:string;eventDiscipline:string;
  linkedRounds:TournamentTimedRound[];availableRounds:TournamentTimedRound[];
  standings:TournamentTimedStanding[];
}

/** Source-recorded metre marks, never head-to-head scores or race points. */
export interface TournamentMeasuredRound {
  id:number; name:string; sport:string|null; playedAt:string;
  eventType:string|null; eventDiscipline:string|null;
  entries:{communityPlayerId:number|null;fullName:string|null;
    performanceValue:number|null;raceDisqualified:boolean}[];
}
export interface TournamentMeasuredStanding {
  position:number;communityPlayerId:number;profileId:number|null;
  username:string;fullName:string;bestMetres:number;validMarks:number;
}
export interface TournamentMeasuredOverview {
  tournamentId:number;eventType:string;eventDiscipline:string;
  linkedRounds:TournamentMeasuredRound[];availableRounds:TournamentMeasuredRound[];
  standings:TournamentMeasuredStanding[];
}

export interface RelayHeat {
  id:number; teamId:number; teamName:string; heatNumber:number; elapsedSeconds:number;
  runnerProfileIds:number[]; recordedAt:string;
  stage?:'QUALIFICATION'|'FINAL'; decisionStatus?:'VALID'|'DISQUALIFIED';
}
export interface RelayStanding {
  position:number; teamId:number; teamName:string; bestSeconds:number;
  recordedHeats:number; runnerProfileIds:number[];
}
export interface RelayOverview {
  tournamentId:number; eventDiscipline:string;
  teams:TournamentTeam[]; heats:RelayHeat[]; standings:RelayStanding[];
  finalPublished?:boolean;
  finalists?:RelayFinalist[];
  qualifyingStandings?:RelayStanding[];
  finalStandings?:RelayStanding[];
  decisions?:RelayDecision[];
}
export interface RelayFinalist {
  teamId:number; teamName:string; seed:number; qualifyingSeconds:number;
}
export interface RelayDecision {
  id:number; heatId:number; previousStatus:'VALID'|'DISQUALIFIED';
  status:'VALID'|'DISQUALIFIED'; reason:string; actorProfileId:number; decidedAt:string;
}
