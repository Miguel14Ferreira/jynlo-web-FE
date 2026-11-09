import {
  comparableTeamSeasons, compareTeamSeasons
} from './community-championship-team-comparison';
import {
  ChampionshipTeamProfile, ChampionshipTeamSeason
} from './community-championship-team-profile';

describe('permanent team historical season comparison', () => {
  const season = (id: number, sport: string, position: number | null,
                  points: number | null, closedAt: string | null): ChampionshipTeamSeason => ({
    championshipId: id, name: 'Campeonato', seasonLabel: id === 1 ? '2024/25' : '2025/26',
    sport, teamName: 'Águias', closedAt, position, points, champion: false,
    previousPosition: null, positionChange: null, previousPoints: null
  });
  const profile: ChampionshipTeamProfile = {
    id: 90, name: 'Águias', championships: 1, leagues: 1, cups: 1,
    seasons: [
      season(1, 'Futebol', 3, 20, '2025-06-30T00:00:00Z'),
      season(2, 'Futebol', 1, 27, '2026-06-30T00:00:00Z'),
      season(3, 'Padel', 1, 45, '2026-06-30T00:00:00Z'),
      season(4, 'Futebol', 1, 3, null),
      season(5, 'Futebol', null, null, '2026-07-01T00:00:00Z')
    ],
    seasonTitles: [{ championshipId: 2, championshipName: 'Campeonato',
      seasonLabel: '2025/26', sport: 'Futebol',
      closedAt: '2026-06-30T00:00:00Z', entryType: 'TEAM', participantId: 11,
      championName: 'Águias', permanentTeamId: 90 }],
    competitionTitles: [
      { championshipId: 1, tournamentId: 30, tournamentName: 'Liga',
        seasonLabel: '2024/25', sport: 'Futebol', format: 'LEAGUE',
        entryType: 'TEAM', winnerName: 'Águias', permanentTeamId: 90 },
      { championshipId: 2, tournamentId: 31, tournamentName: 'Taça',
        seasonLabel: '2025/26', sport: 'Futebol', format: 'GROUP_KNOCKOUT',
        entryType: 'TEAM', winnerName: 'Águias', permanentTeamId: 90 }
    ]
  };

  it('compares two seasons regardless of selection order with season-specific trophies', () => {
    const result = compareTeamSeasons(profile, 2, 1);
    expect(result?.older.season.championshipId).toBe(1);
    expect(result?.newer.season.championshipId).toBe(2);
    expect(result?.positionImprovement).toBe(2);
    expect(result?.pointsDifference).toBe(7);
    expect([result?.older.championships, result?.older.leagues, result?.older.cups]).toEqual([0, 1, 0]);
    expect([result?.newer.championships, result?.newer.leagues, result?.newer.cups]).toEqual([1, 0, 1]);
  });

  it('rejects incompatible sports, duplicate selections and missing results', () => {
    expect(compareTeamSeasons(profile, 1, 3)).toBeNull();
    expect(compareTeamSeasons(profile, 1, 1)).toBeNull();
    expect(compareTeamSeasons(profile, 1, 4)).toBeNull();
    expect(compareTeamSeasons(profile, 1, 5)).toBeNull();
    expect(compareTeamSeasons(profile, 1, 999)).toBeNull();
    expect(comparableTeamSeasons(profile).map(s => s.championshipId)).toEqual([1, 2, 3]);
  });

  it('does not mutate historical results when comparing', () => {
    const before = JSON.stringify(profile);
    compareTeamSeasons(profile, 1, 2);
    expect(JSON.stringify(profile)).toBe(before);
  });
});
