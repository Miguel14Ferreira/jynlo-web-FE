import { formatForSport, CommunitySportFormat } from './community-round-sport';
import { tournamentClassificationProfile } from './community-tournament-classification';
import { isRaceChampionshipSport } from '../../services/community-tournaments.service';

/**
 * Existing tournament API capabilities, distinct from the 121 sport families.
 * A visual family is not proof of official competitive result support.
 */
export type TournamentCreationModel =
  | 'NUMERIC_INDIVIDUAL' | 'NUMERIC_TEAM'
  | 'RACE_POINTS' | 'INLINE_SPEED' | 'SWIM_BEST_TIME' | 'CANOE_BEST_TIME' | 'ROWING_BEST_TIME' | 'FIELD_BEST_MARK' | 'TRACK_BEST_TIME' | 'RELAY_BEST_TIME' | 'UNAVAILABLE';

export interface TournamentSportCapabilities {
  family: CommunitySportFormat | 'unknown';
  individual: TournamentCreationModel;
  team: TournamentCreationModel;
  /** No model here claims complete federation/discipline-specific scoring. */
  fullSportRulesImplemented: false;
}

export function tournamentSportCapabilities(sport: string | null | undefined): TournamentSportCapabilities {
  const family = formatForSport(sport);
  const profile = tournamentClassificationProfile(sport);
  let individual: TournamentCreationModel = 'UNAVAILABLE';
  let team: TournamentCreationModel = 'UNAVAILABLE';

  if (sport === 'Atletismo') {
    individual = 'FIELD_BEST_MARK';
    team = 'RELAY_BEST_TIME';
  } else if (sport === 'Natação') {
    individual = 'SWIM_BEST_TIME';
  } else if (sport === 'Canoagem Velocidade') {
    individual = 'CANOE_BEST_TIME';
  } else if (sport === 'Remo') {
    individual = 'ROWING_BEST_TIME';
  } else if (sport === 'Patinagem de Velocidade') {
    individual = 'INLINE_SPEED';
  } else if (sport && isRaceChampionshipSport(sport)) {
    // Only explicitly verified race-championship sports use this API.
    individual = 'RACE_POINTS';
  } else if (profile.isRoundRobinSupported) {
    individual = 'NUMERIC_INDIVIDUAL';
    if (profile.scoringMode !== 'CHESS_HALF_POINTS') team = 'NUMERIC_TEAM';
  }

  return { family, individual, team, fullSportRulesImplemented: false };
}

/**
 * Selects the implemented result engine for the current event.
 * Athletics track races use times, field events use marks and relays use
 * the team engine. This must never fall back to an unrelated numeric league.
 */
export function tournamentCreationModelForEvent(
  sport: string | null | undefined,
  team: boolean,
  eventType: string | null | undefined
): TournamentCreationModel {
  const capabilities = tournamentSportCapabilities(sport);
  if (sport === 'Atletismo') {
    // Athletics uses distinct contracts for timed track races, measured field
    // events and team relays. Never route an incompatible event to another engine.
    if (team) return eventType === 'TRACK_RELAY' ? 'RELAY_BEST_TIME' : 'UNAVAILABLE';
    if (eventType === 'TRACK') return 'TRACK_BEST_TIME';
    if (eventType === 'TRACK_RELAY') return 'UNAVAILABLE';
    return capabilities.individual;
  }
  return team ? capabilities.team : capabilities.individual;
}
