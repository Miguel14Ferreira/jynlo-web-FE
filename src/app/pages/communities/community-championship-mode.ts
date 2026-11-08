import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { tournamentSportCapabilities, TournamentCreationModel } from './community-tournament-capabilities';

/**
 * Championship organisation is available for every catalogue sport.
 * Automated standings are offered only when a verified result engine exists.
 * CUSTOM requires explicit, versioned scoring rules before results can be recorded.
 */
export type ChampionshipScoringOption = 'AUTOMATIC' | 'CUSTOM_PENDING';
export interface ChampionshipModeAvailability {
  canOrganize: boolean;
  scoringOptions: readonly ChampionshipScoringOption[];
  individualEngine: TournamentCreationModel;
  teamEngine: TournamentCreationModel;
  automaticIndividual: boolean;
  automaticTeam: boolean;
}

const SUPPORTED_SPORTS = new Set<string>(SPORTS_CATALOG);

export function championshipModeAvailability(sport: string | null | undefined): ChampionshipModeAvailability {
  const valid = !!sport && SUPPORTED_SPORTS.has(sport);
  const capabilities = tournamentSportCapabilities(valid ? sport : null);
  const automaticIndividual = valid && capabilities.individual !== 'UNAVAILABLE';
  const automaticTeam = valid && capabilities.team !== 'UNAVAILABLE';
  return {
    canOrganize: valid,
    scoringOptions: valid
      ? (automaticIndividual || automaticTeam ? ['AUTOMATIC', 'CUSTOM_PENDING'] : ['CUSTOM_PENDING'])
      : [],
    individualEngine: capabilities.individual,
    teamEngine: capabilities.team,
    automaticIndividual,
    automaticTeam
  };
}
