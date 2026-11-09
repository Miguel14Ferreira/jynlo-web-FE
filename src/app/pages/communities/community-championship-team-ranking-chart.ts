import { ChampionshipTeamProfile } from './community-championship-team-profile';

export interface TeamRankingChartPoint {
  championshipId: number;
  seasonLabel: string;
  championshipName: string;
  position: number;
  points: number;
  x: number;
  y: number;
}
export interface TeamRankingChart {
  sport: string;
  maximumPosition: number;
  points: TeamRankingChartPoint[];
  polyline: string;
}

/**
 * Visualise only final, finite rankings for one sport.
 * Rank 1 is always at the top; missing seasons are never assigned an invented rank.
 */
export function teamRankingSports(profile: ChampionshipTeamProfile): string[] {
  const bySport = new Map<string, string>();
  for (const season of profile.seasons) {
    if (season.closedAt === null || season.position === null || season.position < 1 ||
        !Number.isInteger(season.position) || season.points === null ||
        !Number.isFinite(season.points)) continue;
    const sport = season.sport.trim();
    if (sport && !bySport.has(sport.toLocaleLowerCase())) {
      bySport.set(sport.toLocaleLowerCase(), sport);
    }
  }
  return [...bySport.values()].sort((a, b) => a.localeCompare(b, 'pt'));
}

export function teamRankingChart(
  profile: ChampionshipTeamProfile, sport: string
): TeamRankingChart | null {
  if (!sport.trim()) return null;
  const filtered = profile.seasons
    .filter(s => s.sport.trim().toLocaleLowerCase() === sport.trim().toLocaleLowerCase() &&
      s.closedAt !== null && s.position !== null && Number.isInteger(s.position) &&
      s.position > 0 && s.points !== null && Number.isFinite(s.points))
    .sort((a, b) => a.closedAt!.localeCompare(b.closedAt!) ||
      a.championshipId - b.championshipId);
  if (!filtered.length) return null;
  const max = Math.max(...filtered.map(s => s.position!));
  const points: TeamRankingChartPoint[] = filtered.map((s, index) => {
    const x = filtered.length === 1 ? 500 : 80 + index * 840 / (filtered.length - 1);
    const y = max === 1 ? 65 : 35 + (s.position! - 1) * 145 / (max - 1);
    return {
      championshipId: s.championshipId, seasonLabel: s.seasonLabel,
      championshipName: s.name, position: s.position!, points: s.points!, x, y
    };
  });
  return {
    sport: filtered[0].sport, maximumPosition: max, points,
    polyline: points.map(p => `${p.x},${p.y}`).join(' ')
  };
}
