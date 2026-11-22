import { SessionSummary } from './session-summary';
import { Venue } from './venue';

export interface SessionDetail extends SessionSummary {
  creatorUsername: string | null;
  /** Players the organiser confirmed outside Jynlo (WhatsApp, phone…); they take spots. */
  externalConfirmedParticipants?: number;
  /** API-controlled minimum to be ready; capacity may be greater. */
  minParticipants?: number;
  address: string | null;
  /** Organiser-selected Google Maps URL, hidden by API until exact-location access is allowed. */
  googleMapsUrl?: string | null;
  /** Session-specific resolved pin, never sent to unauthorized viewers. */
  pinLatitude?: number | null;
  pinLongitude?: number | null;
  /** Public optional description of the session. */
  description?: string | null;
  canSeeExactAddress: boolean;
  /** How the organiser is paid (never the phone number): shown before joining. */
  paymentMethod?: 'MBWAY' | 'IN_PERSON' | null;
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
  /** Level the session is aimed at; null = all levels. */
  skillLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null;
  canSharePublicly?: boolean;
  registrationOpeningMode?: 'IMMEDIATE' | 'SCHEDULED' | 'MANUAL' | null;
  registrationOpensAt?: string | null;
}
