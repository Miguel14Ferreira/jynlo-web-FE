import { CommunityGroup, CommunityRound } from '../model/community-group';

/**
 * UI format defaults, NOT scoring rules. All disciplines in SPORTS_CATALOG
 * must be explicitly assigned to exactly one family. A discipline can have
 * multiple event formats (e.g. singles/doubles, BMX racing/freestyle); those
 * need their own per-round event format before more advanced statistics.
 */
export type CommunitySportFormat =
  | 'team' | 'race' | 'duel' | 'judged' | 'score' | 'measured' | 'activity';
export type CommunityRoundView = 'team' | 'race' | 'individual' | 'unknown';

export const SPORTS_BY_RESULT_FORMAT: Record<CommunitySportFormat, readonly string[]> = {
  team: [
    "Andebol", "Basebol", "Basquetebol", "Basquetebol 3x3", "Corfebol",
    "Cricket", "Curling", "Flag Football", "Futebol", "Futebol Americano",
    "Futevólei", "Futsal", "Hóquei", "Hóquei em Campo", "Hóquei em Patins",
    "Hóquei no Gelo", "Lacrosse", "Polo Aquático", "Rugby", "Rugby Sevens",
    "Softbol", "Voleibol", "Voleibol de Praia",
  ],
  race: [
    "Automobilismo", "BMX", "Canoagem", "Canoagem Slalom", "Canoagem Velocidade",
    "Ciclismo", "Ciclismo de Estrada", "Ciclismo de Pista", "Ciclocrosse", "Columbofilia",
    "Corrida", "Corrida de obstáculos", "Esqui Alpino", "Esqui de Fundo", "Esqui de Montanha",
    "Karting", "Motociclismo", "Motocross", "Motonáutica", "Mountain Bike",
    "Natação", "Natação em Águas Abertas", "Orientação", "Patinagem de Velocidade", "Pentatlo Moderno",
    "Remo", "Trail Running", "Triatlo", "Vela",
  ],
  duel: [
    "Badminton", "Bilhar", "Boxe", "Damas", "Esgrima",
    "Jiu-Jitsu", "Jiu-Jitsu Brasileiro", "Judo", "Karaté", "Kempo",
    "Kickboxing", "Kung Fu", "Luta Greco-Romana", "Luta Livre Olímpica", "Muay Thai",
    "Padel", "Petanca", "Pickleball", "Squash", "Taekwondo",
    "Ténis", "Ténis de praia", "Ténis de mesa", "Teqball", "Xadrez",
  ],
  judged: [
    "Aeromodelismo", "Aikido", "Artes Marciais Chinesas", "Bodyboard", "Breaking",
    "Dança Desportiva", "Esqui Freestyle", "Ginástica", "Ginástica Artística", "Ginástica Rítmica",
    "Natação Artística", "Paraquedismo", "Parkour", "Patinagem Artística", "Skate",
    "Snowboard", "Stand Up Paddle", "Surf", "Trampolim",
  ],
  score: [
    "Bowling", "Bridge", "Golfe", "Pesca Desportiva", "Tiro",
    "Tiro com Arco",
  ],
  measured: [
    "Apneia", "Atletismo", "Atividades Subaquáticas", "Calistenia", "Escalada",
    "Esqui", "Halterofilismo", "Hipismo", "Mergulho", "Patinagem",
    "Powerlifting", "Voo Livre",
  ],
  activity: [
    "Airsoft", "Caminhada", "Campismo", "Ginásio", "Montanhismo", "Musculação",
    "Pilates", "Yoga",
  ],
};

function normalized(sport: string): string {
  return sport.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

const FORMAT_BY_SPORT = new Map<string, CommunitySportFormat>();
for (const [format, sports] of Object.entries(SPORTS_BY_RESULT_FORMAT)) {
  for (const sport of sports) FORMAT_BY_SPORT.set(normalized(sport), format as CommunitySportFormat);
}
// A common historical alias not in the official catalogue.
FORMAT_BY_SPORT.set('karts', 'race');

/**
 * Unknown/unclassified sports must NOT silently become "individual" or
 * inherit team scoring. The catalogue coverage test enforces new additions.
 */
export function formatForSport(sport: string | null | undefined): CommunitySportFormat | 'unknown' {
  return sport?.trim() ? FORMAT_BY_SPORT.get(normalized(sport)) ?? 'unknown' : 'unknown';
}

/**
 * An explicit round sport wins. For legacy rounds, infer only from a community
 * with exactly one sport; multi-sport communities must not guess from their
 * primary/default sport (football results must not be shown as kart results).
 */
export function sportForRound(
  round: Pick<CommunityRound, 'sport'>,
  group?: Pick<CommunityGroup, 'sport' | 'sports'>
): string | null {
  if (round.sport?.trim()) return round.sport.trim();
  if (!group) return null;
  const rawSports = group.sports?.length ? group.sports : (group.sport ? [group.sport] : []);
  // Imported/legacy communities may repeat the same sport or contain blanks.
  // Only infer a missing round sport when exactly one distinct sport remains.
  const sports = new Map<string, string>();
  for (const candidate of rawSports) {
    const trimmed = candidate?.trim();
    if (trimmed && !sports.has(normalized(trimmed))) {
      sports.set(normalized(trimmed), trimmed);
    }
  }
  if (sports.size === 1) return [...sports.values()][0];
  // A legacy sports array containing only empty placeholders should not hide
  // the community's single primary sport.
  if (sports.size === 0 && group.sport?.trim()) return group.sport.trim();
  return null;
}

/**
 * Preserve the existing rendering contract while separating the full sport
 * registry from the limited result schemas currently supported by the API.
 */
export function viewForSport(sport: string | null): CommunityRoundView {
  const format = formatForSport(sport);
  if (format === 'team' || format === 'race') return format;
  return format === 'unknown' ? 'unknown' : 'individual';
}
