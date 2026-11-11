export type AppNotificationType =
  | 'WAITLIST_PROMOTED'
  | 'SESSION_REMOVED'
  | 'SESSION_CANCELLED'
  | 'CHAT_MESSAGE'
  | string
  | null;

export interface AppNotification {
  id: number;
  subject: string;
  message: string;
  greeting: string;
  signature: string;
  createdAt: string;
  friendRequest: boolean;
  updateProfile: boolean;
  sessionInvite: boolean;
  normalMessage: boolean;
  token: string | null;
  type: AppNotificationType;
  sessionId: number | null;
  /** Added by the community join workflow; absent on older notifications. */
  communityId?: number | null;
  /** Optional direct target for an invitation or role change. */
  competitionTournamentId?: number | null;
  competitionChampionshipId?: number | null;
  competitionTeamId?: number | null;
  /** Linked to the reviewed venue when a community edit is decided. */
  venueId?: number | null;
  venueEditSuggestionId?: number | null;
  relatedUsername: string | null;
  read: boolean;
  username: string;
}
