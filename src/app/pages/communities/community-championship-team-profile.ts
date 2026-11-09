import {
  CommunityChampionship, CommunityChampionshipHonours,
  CommunityChampionshipTeams, ChampionshipCompetitionTitle, ChampionshipHistoricalTitle
} from '../../services/community-championships.service';

export interface ChampionshipTeamSeason {
  championshipId: number;
  name: string;
  seasonLabel: string;
  sport: string;
  closedAt: string | null;
  teamName: string;
  champion: boolean;
}

export interface ChampionshipTeamProfile {
  id: number;
  name: string;
  championships: number;
  leagues: number;
  cups: number;
  seasons: ChampionshipTeamSeason[];
  seasonTitles: ChampionshipHistoricalTitle[];
  competitionTitles: ChampionshipCompetitionTitle[];
}

/**
 * A community team ID is shared across seasons only after explicit assignment.
 * Participation comes from season-team registries, never the team display name.
 * Honors come solely from the backend's frozen results.
 */
export function championshipTeamProfile(
  permanentTeamId: number,
  honours: CommunityChampionshipHonours,
  championships: CommunityChampionship[],
  registries: Record<number, CommunityChampionshipTeams>
): ChampionshipTeamProfile | null {
  const team = honours.teamHonours.find(item => item.permanentTeamId === permanentTeamId);
  if (!team) return null;

  const seasons: ChampionshipTeamSeason[] = [];
  for (const championship of championships) {
    const registry = registries[championship.id];
    const seasonTeam = registry?.teams.find(item => item.permanentTeamId === permanentTeamId);
    if (!seasonTeam) continue;

    seasons.push({
      championshipId: championship.id,
      name: championship.name,
      seasonLabel: championship.seasonLabel,
      sport: championship.sport,
      closedAt: championship.closedAt,
      teamName: seasonTeam.name,
      champion: honours.titles.some(title =>
        title.championshipId === championship.id &&
        title.entryType === 'TEAM' &&
        title.permanentTeamId === permanentTeamId)
    });
  }

  seasons.sort((a, b) =>
    (b.closedAt || '').localeCompare(a.closedAt || '') ||
    b.championshipId - a.championshipId);

  return {
    id: team.permanentTeamId,
    name: team.name,
    championships: team.titles,
    leagues: team.leagues,
    cups: team.cups,
    seasons,
    seasonTitles: honours.titles.filter(item =>
      item.entryType === 'TEAM' && item.permanentTeamId === permanentTeamId),
    competitionTitles: honours.competitionTitles.filter(item =>
      item.entryType === 'TEAM' && item.permanentTeamId === permanentTeamId)
  };
}
