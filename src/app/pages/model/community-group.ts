export type CommunityRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type CommunityVisibility = 'PUBLIC' | 'PRIVATE';

export interface CommunityMember {
  profileId: number;
  username: string;
  fullName: string | null;
  profilePicUrl: string | null;
  role: CommunityRole;
}

export interface CommunityGroup {
  id: number;
  name: string;
  description: string | null;
  sport: string | null;
  sports?: string[];
  photoUrl: string | null;
  defaultVenueId?: number | null;
  defaultVenueName?: string | null;
  habitualLocationSource?: 'MAPS' | 'GPS' | null;
  habitualLatitude?: number | null;
  habitualLongitude?: number | null;
  habitualCity?: string | null;
  habitualAddress?: string | null;
  photoZoom?: number | null;
  photoFocusX?: number | null;
  photoFocusY?: number | null;
  photoFitMode?: 'COVER' | 'SHOW_ALL' | null;
  visibility: CommunityVisibility;
  rankingsEnabled: boolean;
  individualTournamentsEnabled?: boolean;
  teamTournamentsEnabled?: boolean;
  /** Defaults to true for pre-existing community responses. */
  membersCanCreateSessions?: boolean;
  /** Organizers decide whether all members may post in the feed and Stories. */
  membersCanPost?: boolean;
  ownerUsername: string;
  myRole: CommunityRole | null;
  memberCount: number;
  createdAt: string;
  members: CommunityMember[];
}

export interface CommunityInvite {
  id: number;
  communityId: number;
  communityName: string;
  invitedByUsername: string;
  createdAt: string;
}


export type CommunityMatchResult = 'WIN' | 'DRAW' | 'LOSS';

export interface CommunityCompetitionSettings {
  rankingsEnabled: boolean;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  /** Optional "Geral" table across sports; older backends omit it. */
  overallStandingsEnabled?: boolean;
}

/** One row of the "Geral" table: games and wins across sports, never summed sport points. */
export interface CommunityOverallStanding {
  position: number;
  profileId: number | null;
  username: string | null;
  fullName: string | null;
  profilePicUrl: string | null;
  games: number;
  wins: number;
  sports: number;
  winRate: number;
}

export interface CommunityRoundEntry {
  profileId: number | null;
  username: string | null;
  fullName: string | null;
  profilePicUrl: string | null;
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
  entryId?: number | null;
  communityPlayerId?: number | null;
  racePenaltyPoints?: number;
  racePenaltyReason?: string | null;
  raceTimePenaltySeconds?: number | null;
  adjustedElapsedSeconds?: number | null;
  raceDisqualified?: boolean;
  raceStewardReason?: string | null;
  performanceValue?: number | null;
  waveScore1?: number | null;
  waveScore2?: number | null;
}

export interface CommunitySetScore {
  sideA: number | null;
  sideB: number | null;
}

export type CommunityRacketMatchFormat = 'SINGLES' | 'DOUBLES';

export interface CommunityGroupRoutineScore {
  groupName: string;
  score: number | null;
}

export interface CommunityTeamFinalScore { sideA: number | null; sideB: number | null; }
export interface CommunityCricketDetails {
  wicketsA: number | null; legalBallsA: number | null;
  wicketsB: number | null; legalBallsB: number | null;
}

export interface CommunityBasketballScore {
  sideA: number | null;
  sideB: number | null;
}

export interface CommunityRound {
  id: number;
  name: string;
  playedAt: string;
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
    | 'STRENGTH_TRAINING' | 'SWIM_LCM' | 'CANOE_SPRINT' | 'OWS_INDIVIDUAL' | 'FOOT_ORIENTEERING' | 'INLINE_TRACK_200_TT' | 'INLINE_TRACK_500D_FIRST_ROUND' | 'INLINE_ROAD_LAP_FIRST_ROUND'
    | 'INLINE_TRACK_500D_QUARTER_HEAT' | 'INLINE_TRACK_500D_SEMI_HEAT' | 'INLINE_TRACK_500D_FINAL_A' | 'INLINE_TRACK_500D_FINAL_B' | 'INLINE_ROAD_LAP_QUARTER_HEAT' | 'INLINE_ROAD_LAP_SEMI_HEAT' | 'INLINE_ROAD_LAP_FINAL_A' | 'INLINE_ROAD_LAP_FINAL_B' | null;
  eventDiscipline?: string | null;
  sprintSeriesKey?: string | null;
  sprintHeatNumber?: number | null;
  matchFormat?: CommunityRacketMatchFormat | null;
  setScores?: CommunitySetScore[] | null;
  groupScores?: CommunityGroupRoutineScore[] | null;
  basketballScore?: CommunityBasketballScore | null;
  teamScore?: CommunityTeamFinalScore | null;
  cricketDetails?: CommunityCricketDetails | null;
  entries: CommunityRoundEntry[];
}

export interface CommunitySeason {
  id: number;
  name: string;
  startsAt: string;
  endedAt: string | null;
  active: boolean;
  championUsername: string | null;
  championDisplayName: string | null;
  championPoints: number | null;
  /** null/undefined for legacy shared seasons. */
  sport?: string | null;
}

export interface CommunityStanding {
  position: number;
  profileId: number | null;
  username: string | null;
  fullName: string | null;
  profilePicUrl: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goals: number;
  assists: number;
  mvps: number;
  cleanSheets: number;
  winRate: number;
  currentStreak: string;
  bestWinStreak: number;
}

export interface CommunityRacketScoringRule {
  sport: string;
  matchFormat: CommunityRacketMatchFormat;
  winPoints: number;
  lossPoints: number;
  tieBreak: 'SETS_FIRST' | 'SCORE_FIRST';
}

export interface CommunityRacketStanding {
  position: number;
  profileId: number;
  username: string | null;
  fullName: string;
  profilePicUrl: string | null;
  matches: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  setDifference: number;
  gamesOrPointsWon: number;
  gamesOrPointsLost: number;
  gamesOrPointsDifference: number;
  championshipPoints?: number | null;
}

export interface CommunityRacketStandingGroup {
  sport: string;
  matchFormat: CommunityRacketMatchFormat;
  standings: CommunityRacketStanding[];
  rule?: CommunityRacketScoringRule | null;
}

export interface CommunityRaceRule {
  sport: string;
  pointsByPlace: number[];
}

export interface CommunityRaceStanding {
  position: number;
  playerId: number;
  profileId: number | null;
  username: string | null;
  fullName: string | null;
  profilePicUrl: string | null;
  races: number;
  wins: number;
  podiums: number;
  bestFinish: number | null;
  championshipPoints: number | null;
  penaltyPoints: number;
}

export interface CommunityRaceStandingGroup {
  sport: string;
  rule: CommunityRaceRule | null;
  standings: CommunityRaceStanding[];
}

export interface CommunityCompetitionOverview {
  settings: CommunityCompetitionSettings;
  seasons: CommunitySeason[];
  selectedSeasonId: number | null;
  activeSeasonId: number | null;
  rounds: CommunityRound[];
  standings: CommunityStanding[];
  racketStandings?: CommunityRacketStandingGroup[];
  raceStandings?: CommunityRaceStandingGroup[];
  /** New backend contract: W/D/L statistics scoped to one selected sport.
   * Optional until all deployments expose sport-scoped responses. */
  sportStandings?: { sport: string; standings: CommunityStanding[];
    scoring?: { sport: string; winPoints: number; drawPoints: number; lossPoints: number } | null }[];
  overallStandings?: CommunityOverallStanding[];
}

export interface CommunityRoundEntryDraft {
  username: string;
  included: boolean;
  team: string;
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
}
