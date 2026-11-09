import { teamRankingChart, teamRankingSports } from './community-championship-team-ranking-chart';
import { ChampionshipTeamProfile, ChampionshipTeamSeason } from './community-championship-team-profile';

describe('team historical ranking chart', () => {
  const season = (id: number, sport: string, date: string | null,
                  position: number | null, points: number | null): ChampionshipTeamSeason => ({
    championshipId: id, name: 'Campeonato', seasonLabel: '202' + id,
    sport, closedAt: date, position, points, teamName: 'Águias',
    champion: false, previousPosition: null, previousPoints: null, positionChange: null
  });
  const profile: ChampionshipTeamProfile = {
    id: 90, name: 'Águias', championships: 0, leagues: 0, cups: 0,
    seasonTitles: [], competitionTitles: [], seasons: [
      season(2, 'Futebol', '2026-06-01T00:00:00Z', 1, 32),
      season(1, 'Futebol', '2025-06-01T00:00:00Z', 3, 24),
      season(3, 'Padel', '2026-07-01T00:00:00Z', 2, 15),
      season(4, 'Futebol', null, 1, 10),
      season(5, 'Futebol', '2026-09-01T00:00:00Z', null, null)
    ]
  };

  it('plots only finalized seasons of one sport in chronological order, best rank higher', () => {
    expect(teamRankingSports(profile)).toEqual(['Futebol', 'Padel']);
    const chart = teamRankingChart(profile, 'futebol');
    expect(chart?.points.map(p => p.championshipId)).toEqual([1, 2]);
    expect(chart?.points.map(p => p.position)).toEqual([3, 1]);
    expect(chart?.points[1].y).toBeLessThan(chart!.points[0].y);
    expect(chart?.points.map(p => p.points)).toEqual([24, 32]);
    expect(chart?.polyline).toContain('80,180');
  });

  it('does not merge multiple sports or infer missing results', () => {
    const padel = teamRankingChart(profile, 'Padel');
    expect(padel?.points.length).toBe(1);
    expect(padel?.points[0].position).toBe(2);
    expect(teamRankingChart(profile, 'Basquetebol')).toBeNull();
    expect(teamRankingChart(profile, '')).toBeNull();
  });

  it('keeps historical data unchanged', () => {
    const before = JSON.stringify(profile);
    teamRankingChart(profile, 'Futebol');
    expect(JSON.stringify(profile)).toBe(before);
  });
});
