export interface SessionSummary {
  id: number;
  sport: string;
  /** Public Airsoft format when provided by a compatible API. */
  airsoftGameType?: 'SKIRMISH' | 'MILSIM' | 'CAPTURE_THE_FLAG' | null;
  city: string;
  gameDate: string;
  distanceKm: number | null;
  /** Coarse public discovery grid coordinates; not precise meeting-point GPS. */
  latitude?: number | null;
  longitude?: number | null;
  participantCount: number;
  maxParticipants: number;
  priceAmount: number;
  privateGame: boolean;
  audience?: 'COMMUNITY_ONLY' | 'PUBLIC';
  communityId?: number | null;
  seasonCommunityId?: number | null;
  joinedByViewer?: boolean;
  waitlistedByViewer?: boolean;
  recurrenceSeriesId?: string | null;
  /** Level the session is aimed at; null = all levels. */
  skillLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null;
  /** Organiser marked the court as booked. */
  courtBooked?: boolean | null;
  /** Players needed for the game to happen (custom or the sport's default). */
  minPlayers?: number | null;
  status: string;
}
