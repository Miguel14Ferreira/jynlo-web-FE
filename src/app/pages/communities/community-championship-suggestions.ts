import { ChampionshipOwnedEventFormat } from '../../services/community-championships.service';
import { championshipModeAvailability } from './community-championship-mode';
import { tournamentSportCapabilities } from './community-tournament-capabilities';

export interface ChampionshipSuggestion {
  id: string;
  title: string;
  description: string;
  /** The team-fixture backend supports only numeric team leagues/cups. */
  nextStep: 'OWNED_TEAM' | 'STANDALONE' | 'PLANNED';
  format?: ChampionshipOwnedEventFormat;
}

/** Organizer recommendations, not sport-rule engines or automatic creations.
 * All suggestions are optional and must still pass the backend validation.
 */
export function championshipSuggestions(sport: string | null | undefined): ChampionshipSuggestion[] {
  if (!championshipModeAvailability(sport).canOrganize) return [];
  if (tournamentSportCapabilities(sport).team === 'NUMERIC_TEAM') {
    return [
      { id: 'league', title: 'Liga', description: 'Jornadas entre equipas. Podes organizar uma ou duas voltas.', nextStep: 'OWNED_TEAM', format: 'LEAGUE' },
      { id: 'cup', title: 'Taça', description: 'Eliminatórias entre equipas, com sorteio inicial.', nextStep: 'OWNED_TEAM', format: 'CUP' },
      { id: 'standalone', title: 'Torneio independente', description: 'Cria um torneio separado e associa-o depois à época.', nextStep: 'STANDALONE' }
    ];
  }
  if (sport === 'Karaté') {
    return [
      { id: 'kata', title: 'Kata por categorias', description: 'Provas de avaliação técnica. Resultados automáticos específicos ainda pendentes.', nextStep: 'PLANNED' },
      { id: 'kumite', title: 'Kumite por categorias', description: 'Combates por categorias de peso e idade. Motor específico ainda pendente.', nextStep: 'PLANNED' }
    ];
  }
  if (sport === 'Golfe') {
    return [
      { id: 'stroke', title: 'Stroke play', description: 'Classificação por pancadas; motor automático de torneios ainda pendente.', nextStep: 'PLANNED' },
      { id: 'match', title: 'Match play', description: 'Confrontos por buracos; regras próprias ainda não implementadas no torneio.', nextStep: 'PLANNED' }
    ];
  }
  if (sport === 'Natação') {
    return [
      { id: 'swim', title: 'Provas individuais por tempo', description: 'Cria um torneio com uma das disciplinas de piscina de 50 m suportadas e associa-o ao campeonato.', nextStep: 'STANDALONE' },
      { id: 'relay', title: 'Estafetas', description: 'O motor de torneios para estafetas de natação ainda está pendente.', nextStep: 'PLANNED' }
    ];
  }
  if (sport === 'Atletismo') {
    return [
      { id: 'track', title: 'Corridas', description: 'Cria um torneio de pista com tempos e distâncias suportadas e associa-o à época.', nextStep: 'STANDALONE' },
      { id: 'field', title: 'Saltos e lançamentos', description: 'Cria uma prova individual por marcas e associa o torneio à época.', nextStep: 'STANDALONE' },
      { id: 'relay', title: 'Estafetas', description: 'Cria uma prova por equipas nas distâncias suportadas e associa-a à época.', nextStep: 'STANDALONE' }
    ];
  }
  const capabilities = tournamentSportCapabilities(sport);
  return capabilities.individual !== 'UNAVAILABLE' || capabilities.team !== 'UNAVAILABLE'
    ? [{ id: 'standalone', title: 'Torneio da modalidade', description: 'Cria um torneio com o motor suportado e associa-o a este campeonato.', nextStep: 'STANDALONE' }]
    : [{ id: 'planned', title: 'Formato personalizado', description: 'Organiza a época; os resultados automáticos desta modalidade ainda não estão disponíveis.', nextStep: 'PLANNED' }];
}
