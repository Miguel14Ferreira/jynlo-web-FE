/** A reusable configuration, never a scheduled event. Passwords and dates are not persisted. */
export interface SessionPresetSettings {
  sport: string;
  airsoftGameType?: 'SKIRMISH' | 'MILSIM' | 'CAPTURE_THE_FLAG' | null;
  playFormat: 'INDIVIDUAL' | 'PAIRS';
  city: string;
  address: string;
  /** Optional reusable public overview; passwords and private arrival instructions stay excluded. */
  description?: string | null;
  maxParticipants: number;
  creationMode: 'START' | 'COMPLETE';
  confirmedPlayers: number;
  hasPrice: boolean;
  priceAmount: number;
  privateGame: boolean;
  communityShareIds: number[];
  communityId: number | null;
  seasonGame: boolean;
  selectedVenueId: number | null;
  locationMethod: 'venue' | 'maps' | 'gps';
  latitude: number | null;
  longitude: number | null;
  venueMapLink: string;
  recurrence: 'NONE' | 'WEEKLY' | 'BIWEEKLY';
  recurrenceOccurrences: number;
  weeklySessionsPerWeek: number;
  registrationOpeningMode: 'IMMEDIATE' | 'SCHEDULED' | 'MANUAL';
}
export interface SessionPreset {
  id: number;
  name: string;
  settings: SessionPresetSettings;
  createdAt: string;
  updatedAt: string;
}
