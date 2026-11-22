import { appTranslate } from '../../i18n/i18n.service';
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
  // Owned league/cup fixtures currently have a verified result engine only
  // for football/futsal. Other sports may use independent tournaments, but
  // must never be offered football-specific owned fixtures.
  if (sport === 'Futebol' || sport === 'Futsal') {
    return [
      { id: 'league', title: 'Liga', description: appTranslate('Jornadas entre equipas. Podes organizar uma ou duas voltas.'), nextStep: 'OWNED_TEAM', format: 'LEAGUE' },
      { id: 'cup', title: 'Taça', description: appTranslate('Eliminatórias entre equipas, com sorteio inicial.'), nextStep: 'OWNED_TEAM', format: 'CUP' },
      { id: 'standalone', title: 'Torneio independente', description: appTranslate('Cria um torneio separado e associa-o depois à época.'), nextStep: 'STANDALONE' }
    ];
  }
  if (sport === 'Karaté') {
    return [
      { id: 'kata', title: appTranslate('Kata por categorias'), description: appTranslate('Provas de avaliação técnica. Resultados automáticos específicos ainda pendentes.'), nextStep: 'PLANNED' },
      { id: 'kumite', title: appTranslate('Kumite por categorias'), description: appTranslate('Combates por categorias de peso e idade. Motor específico ainda pendente.'), nextStep: 'PLANNED' }
    ];
  }
  if (sport === 'Golfe') {
    return [
      { id: 'stroke', title: 'Stroke play', description: appTranslate('Classificação por pancadas; motor automático de torneios ainda pendente.'), nextStep: 'PLANNED' },
      { id: 'match', title: 'Match play', description: appTranslate('Confrontos por buracos; regras próprias ainda não implementadas no torneio.'), nextStep: 'PLANNED' }
    ];
  }
  if (sport === 'Natação') {
    return [
      { id: 'swim', title: appTranslate('Provas individuais por tempo'), description: appTranslate('Cria um torneio com uma das disciplinas de piscina de 50 m suportadas e associa-o ao campeonato.'), nextStep: 'STANDALONE' },
      { id: 'relay', title: 'Estafetas', description: appTranslate('O motor de torneios para estafetas de natação ainda está pendente.'), nextStep: 'PLANNED' }
    ];
  }
  if (sport === 'Atletismo') {
    return [
      { id: 'track', title: 'Corridas', description: appTranslate('Cria um torneio de pista com tempos e distâncias suportadas e associa-o à época.'), nextStep: 'STANDALONE' },
      { id: 'field', title: appTranslate('Saltos e lançamentos'), description: appTranslate('Cria uma prova individual por marcas e associa o torneio à época.'), nextStep: 'STANDALONE' },
      { id: 'relay', title: 'Estafetas', description: appTranslate('Cria uma prova por equipas nas distâncias suportadas e associa-a à época.'), nextStep: 'STANDALONE' }
    ];
  }
  const capabilities = tournamentSportCapabilities(sport);
  return capabilities.individual !== 'UNAVAILABLE' || capabilities.team !== 'UNAVAILABLE'
    ? [{ id: 'standalone', title: appTranslate('Torneio da modalidade'), description: appTranslate('Cria um torneio com o motor suportado e associa-o a este campeonato.'), nextStep: 'STANDALONE' }]
    : [{ id: 'planned', title: 'Formato personalizado', description: appTranslate('Organiza a época; os resultados automáticos desta modalidade ainda não estão disponíveis.'), nextStep: 'PLANNED' }];
}
