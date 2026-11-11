export interface CreateSessionRequest {
  sport: string;
  /** Public game format; independent of private meeting point instructions. */
  airsoftGameType?: 'SKIRMISH' | 'MILSIM' | 'CAPTURE_THE_FLAG' | null;
  /** Optional for legacy API clients; server infers safe default. */
  playFormat?: 'INDIVIDUAL' | 'PAIRS' | 'TEAMS';
  gameDate: string;
  city: string;
  address: string;
  /** Optional public overview; no confidential arrival instructions. */
  description?: string | null;
  /** Private arrival instructions for confirmed players and organiser. */
  meetingPointInstructions?: string | null;
  maxParticipants: number;
  minParticipants?: number;
  externalConfirmedParticipants?: number;
  priceAmount: number;
  privateGame: boolean;
  password: string | null;
  latitude: number | null;
  longitude: number | null;
  communityId?: number | null;
  communityShareIds?: number[];
  seasonCompetitionCommunityId?: number | null;
  confirmActivateRankings?: boolean;
  venueId?: number | null;
  recurrence?: 'NONE' | 'WEEKLY' | 'BIWEEKLY';
  recurrenceOccurrences?: number | null;
  additionalWeeklyGameDates?: string[];
  recurrenceTimeZone?: string | null;
  registrationOpeningMode?: 'IMMEDIATE' | 'SCHEDULED' | 'MANUAL';
  registrationOpensAt?: string | null;
}
