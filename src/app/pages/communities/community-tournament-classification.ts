import { appTranslate } from '../../i18n/i18n.service';
import { formatForSport, CommunitySportFormat } from './community-round-sport';

/**
 * Competition-specific capabilities built on the same 121-sport registry as
 * community rounds. Format families are NOT official sport rulebooks.
 * A round-robin fixture (two opponents) cannot represent a race with many
 * finishers, a judged event, timed attempt, or a golf stroke-play field.
 */
export interface TournamentClassificationProfile {
  format: CommunitySportFormat | 'unknown';
  heading: string;
  detail: string;
  fields: string;
  isRoundRobinSupported: boolean;
  pointRules: { winPoints: number; drawPoints: number; lossPoints: number };
  scoringMode: 'CHESS_HALF_POINTS' | null;
  readOnlyPoints: boolean;
}

export function tournamentClassificationProfile(
  sport: string | null | undefined
): TournamentClassificationProfile {
  const format = formatForSport(sport);
  const chess = sport?.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim() === 'xadrez';

  if (chess) {
    return {
      format: 'duel', heading: appTranslate('Pontuação de Xadrez'),
      detail: appTranslate('Vitória: 1 ponto · Empate: ½ ponto · Derrota: 0. O jogo será registado como vitória das brancas, empate ou vitória das pretas. Na classificação, as vitórias desempatarão a pontuação; ainda não aplicamos desempates oficiais como Buchholz.'),
      fields: appTranslate('Resultado de cada partida'),
      isRoundRobinSupported: true,
      pointRules: { winPoints: 2, drawPoints: 1, lossPoints: 0 },
      scoringMode: 'CHESS_HALF_POINTS', readOnlyPoints: true
    };
  }
  if (format === 'race') {
    return {
      format, heading: appTranslate('Classificação por corridas'),
      detail: appTranslate('Nesta modalidade, a classificação depende das posições, tempos e ocorrências da prova. Estas informações já são tratadas nas jornadas da comunidade. O formato atual de liga individual cria confrontos 1 vs 1, por isso não pode produzir uma classificação de corrida válida.'),
      fields: appTranslate('Posição de chegada · Tempo · Penalizações / DNF'),
      isRoundRobinSupported: false,
      pointRules: { winPoints: 3, drawPoints: 1, lossPoints: 0 },
      scoringMode: null, readOnlyPoints: true
    };
  }
  const unsupported: Partial<Record<CommunitySportFormat | 'unknown', [string, string, string]>> = {
    measured: [appTranslate('Classificação por marcas e tempos'),
      appTranslate('As provas por tempos, distâncias ou outras marcas exigem tentativas e ordenação pela melhor marca. Nas jornadas já existe esse modelo; uma liga de confrontos não o representa.'),
      appTranslate('Marca / tempo · Melhor tentativa · Posição')],
    judged: [appTranslate('Classificação por notas de júri'),
      appTranslate('A classificação deve usar as notas e o formato específico da prova. Usa os eventos disponíveis nas jornadas; não vamos converter notas em vitórias fictícias.'),
      appTranslate('Notas · Classificação da prova')],
    score: [appTranslate('Classificação por resultado de prova'),
      appTranslate('Golfe, bowling e outras modalidades por marca têm regras diferentes entre si. As provas já suportadas nas jornadas devem continuar a utilizar o seu formato próprio.'),
      appTranslate('Resultado da prova · Classificação')],
    activity: [appTranslate('Atividade sem classificação competitiva definida'),
      appTranslate('Esta modalidade não tem um formato oficial de competição individual definido neste ecrã. Podes continuar a criar jogos e jornadas.'),
      appTranslate('Participação / atividade')],
    unknown: [appTranslate('Modalidade sem regras de torneio verificadas'),
      appTranslate('Não foi definido um modelo de resultados para esta modalidade. Não vamos aplicar automaticamente futebol.'),
      appTranslate('Formato por definir')]
  };
  if (format in unsupported) {
    const [heading, detail, fields] = unsupported[format]!;
    return { format, heading, detail, fields,
      isRoundRobinSupported: false,
      pointRules: { winPoints: 3, drawPoints: 1, lossPoints: 0 },
      scoringMode: null, readOnlyPoints: true };
  }
  return {
    format,
    heading: format === 'duel' ? appTranslate('Classificação por confrontos individuais')
      : appTranslate('Classificação por vitórias, empates e derrotas'),
    detail: format === 'duel'
      ? appTranslate('Esta liga regista o resultado numérico final de cada confronto. Ainda não suporta resultados detalhados por set, assalto ou outros formatos específicos das jornadas. Os pontos por vitória, empate e derrota são configuráveis.')
      : appTranslate('A classificação utiliza os pontos por vitória, empate ou derrota. Os resultados e a classificação pertencem apenas ao torneio, sem alterar as estatísticas habituais da comunidade.'),
    fields: format === 'duel' ? appTranslate('Confrontos individuais · Resultado numérico') : appTranslate('Vitória · Empate · Derrota'),
    isRoundRobinSupported: true,
    pointRules: { winPoints: 3, drawPoints: 1, lossPoints: 0 },
    scoringMode: null, readOnlyPoints: false
  };
}
