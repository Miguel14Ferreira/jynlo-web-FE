import {
  ChampionshipTeamProfile, ChampionshipTeamSeason
} from './community-championship-team-profile';

export interface TeamSeasonComparisonSide {
  season: ChampionshipTeamSeason;
  championships: number;
  leagues: number;
  cups: number;
}

export interface TeamSeasonComparison {
  older: TeamSeasonComparisonSide;
  newer: TeamSeasonComparisonSide;
  positionImprovement: number;
  pointsDifference: number;
}

/** Only final standings from a single sport can be compared. No name-based joins. */
export function comparableTeamSeasons(profile: ChampionshipTeamProfile): ChampionshipTeamSeason[] {
  return profile.seasons.filter(s => s.closedAt !== null && s.position !== null &&
    s.points !== null && Number.isFinite(s.points) &&
    Number.isInteger(s.position) && s.position > 0);
}

export function compareTeamSeasons(
  profile: ChampionshipTeamProfile, leftId: number | null, rightId: number | null
): TeamSeasonComparison | null {
  if (leftId === null || rightId === null || leftId === rightId) return null;
  const eligible = comparableTeamSeasons(profile);
  const a = eligible.find(s => s.championshipId === leftId);
  const b = eligible.find(s => s.championshipId === rightId);
  if (!a || !b || a.sport.trim().toLocaleLowerCase() !== b.sport.trim().toLocaleLowerCase()) return null;
  const [older, newer] = (a.closedAt! < b.closedAt! ||
    (a.closedAt === b.closedAt && a.championshipId < b.championshipId)) ? [a, b] : [b, a];
  const trophyCounts = (season: ChampionshipTeamSeason): TeamSeasonComparisonSide => {
    const championshipId = season.championshipId;
    // A tournament has exactly one title per season. Duplicate honours rows
    // must not inflate league/cup counts in the historical comparison.
    const distinct = new Map<number, typeof profile.competitionTitles[number]>();
    for (const title of profile.competitionTitles) {
      if (title.championshipId === championshipId && !distinct.has(title.tournamentId)) {
        distinct.set(title.tournamentId, title);
      }
    }
    const trophies = [...distinct.values()];
    return {
      season,
      championships: profile.seasonTitles.some(t => t.championshipId === championshipId) ? 1 : 0,
      leagues: trophies.filter(t => t.format === 'LEAGUE').length,
      cups: trophies.filter(t => t.format === 'KNOCKOUT' || t.format === 'GROUP_KNOCKOUT').length
    };
  };
  return {
    older: trophyCounts(older),
    newer: trophyCounts(newer),
    positionImprovement: older.position! - newer.position!,
    pointsDifference: newer.points! - older.points!
  };
}
