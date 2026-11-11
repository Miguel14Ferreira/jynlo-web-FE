import { SessionSummary } from './session-summary';
import { Venue } from './venue';

export interface SessionDetail extends SessionSummary {
  creatorUsername: string | null;
  /** API-controlled minimum to be ready; capacity may be greater. */
  minParticipants?: number;
  address: string | null;
  /** Public optional description of the session. */
  description?: string | null;
  canSeeExactAddress: boolean;
  /** Visible only when canSeeExactAddress is true. */
  meetingPointInstructions?: string | null;
  joined: boolean;
  waitlisted: boolean;
  waitlistPosition: number | null;
  gamePhoto: string | null;
  venue?: Venue | null;
  problemType?: 'NOT_OCCURRED' | 'VENUE_PROBLEM' | 'OTHER' | null;
  problemDetails?: string | null;
  communityId?: number | null;
  /** Server-controlled eligibility: never infer from participant count alone. */
  teamBalanceSupported?: boolean;
  playFormat?: 'INDIVIDUAL' | 'PAIRS' | 'TEAMS' | null;
  canSharePublicly?: boolean;
  registrationOpeningMode?: 'IMMEDIATE' | 'SCHEDULED' | 'MANUAL' | null;
  registrationOpensAt?: string | null;
}
