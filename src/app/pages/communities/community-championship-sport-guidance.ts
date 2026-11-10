import { championshipModeAvailability } from './community-championship-mode';

/** Explain actual competition support without presenting suggested rules as implemented engines. */
export interface ChampionshipSportGuidance {
  title: string;
  detail: string;
}

export function championshipSportGuidance(sport: string | null | undefined): ChampionshipSportGuidance {
  const mode = championshipModeAvailability(sport);
  if (!mode.canOrganize) {
    return { title: 'Modalidade não reconhecida', detail: 'Seleciona uma modalidade do catálogo Jynlo para organizar um campeonato.' };
  }
  switch (sport) {
    case 'Karaté':
      return {
        title: 'Karaté: kata e kumite são provas diferentes',
        detail: 'O kata depende de avaliação técnica e o kumite de combates por categorias. Podes organizar a época, mas não existe ainda um motor automático específico para estas provas. Não serão tratadas como futebol.'
      };
    case 'Natação':
      return {
        title: 'Natação: tempos por prova e distância',
        detail: 'O motor atual suporta apenas as disciplinas individuais de piscina de 50 m explicitamente disponíveis na criação. Estafetas e outras distâncias não devem receber classificações automáticas sem suporte próprio.'
      };
    case 'Atletismo':
      return {
        title: 'Atletismo: corridas, concursos e estafetas',
        detail: 'Corridas individuais utilizam tempos; saltos e lançamentos utilizam marcas; as estafetas disponíveis utilizam equipas. Seleciona uma disciplina compatível antes de registar resultados.'
      };
    case 'Golfe':
      return {
        title: 'Golfe: stroke play e match play exigem regras próprias',
        detail: 'Podes estruturar a época e as provas, mas a classificação automática de torneios de golfe ainda não está validada. Não aplicamos pontuações de confrontos de futebol ao número de pancadas.'
      };
    default:
      return mode.automaticIndividual || mode.automaticTeam
        ? {
            title: 'Resultados automáticos com limites',
            detail: 'Estão disponíveis apenas os modelos de resultados já implementados. As regras detalhadas de cada federação e disciplina podem necessitar de suporte adicional.'
          }
        : {
            title: 'Campeonato organizável; resultados automáticos pendentes',
            detail: 'Podes organizar a época, mas ainda não existe um motor de resultados validado para esta modalidade. Não será aplicada uma classificação genérica de futebol.'
          };
  }
}
