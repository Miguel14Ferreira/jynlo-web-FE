import { championshipTeamProfile } from './community-championship-team-profile';
import {
  CommunityChampionship, CommunityChampionshipHonours, CommunityChampionshipTeams,
  CommunityPermanentTeams
} from '../../services/community-championships.service';

describe('championshipTeamProfile', () => {
  const registry: CommunityPermanentTeams = {
    communityId: 7,
    teams: [{ id: 90, name: 'Águias FC' }, { id: 91, name: 'Leões' }]
  };
  const honours: CommunityChampionshipHonours = {
    communityId: 7, completedSeasons: 2, individualHonours: [],
    teamHonours: [{ permanentTeamId: 90, name: 'Águias FC', titles: 2,
      championshipIds: [4, 5], leagues: 1, cups: 1 }],
    titles: [
      { championshipId: 4, championshipName: 'Primeira época', seasonLabel: '2024/25',
        sport: 'Futebol', closedAt: '2025-06-30T00:00:00Z', entryType: 'TEAM',
        participantId: 17, championName: 'Águias', permanentTeamId: 90 },
      { championshipId: 5, championshipName: 'Segunda época', seasonLabel: '2025/26',
        sport: 'Futebol', closedAt: '2026-06-30T00:00:00Z', entryType: 'TEAM',
        participantId: 18, championName: 'Águias FC', permanentTeamId: 90 }
    ],
    competitionTitles: [
      { championshipId: 4, tournamentId: 30, tournamentName: 'Liga',
        seasonLabel: '2024/25', sport: 'Futebol', format: 'LEAGUE',
        entryType: 'TEAM', winnerName: 'Águias', permanentTeamId: 90 },
      { championshipId: 5, tournamentId: 31, tournamentName: 'Taça',
        seasonLabel: '2025/26', sport: 'Futebol', format: 'KNOCKOUT',
        entryType: 'TEAM', winnerName: 'Águias FC', permanentTeamId: 90 },
      { championshipId: 5, tournamentId: 32, tournamentName: 'Outra Taça',
        seasonLabel: '2025/26', sport: 'Futebol', format: 'KNOCKOUT',
        entryType: 'TEAM', winnerName: 'Leões', permanentTeamId: null }
    ]
  };
  const season = (id: number, label: string, closedAt: string | null): CommunityChampionship => ({
    id, communityId: 7, name: 'Campeonato', sport: 'Futebol',
    seasonLabel: label, createdAt: '2024-01-01T00:00:00Z',
    closedAt, competitions: [], winnerStandings: [], championEntryType: null,
    championParticipantId: null, championDisplayName: null
  });
  const seasons = [
    season(4, '2024/25', '2025-06-30T00:00:00Z'),
    season(5, '2025/26', '2026-06-30T00:00:00Z'),
    season(6, '2026/27', null)
  ];
  const teams: Record<number, CommunityChampionshipTeams> = {
    4: { championshipId: 4, teams: [{ id: 17, name: 'Águias A', permanentTeamId: 90 }],
      competitionTeams: [] },
    5: { championshipId: 5, teams: [{ id: 18, name: 'Águias FC', permanentTeamId: 90 }],
      competitionTeams: [] },
    6: { championshipId: 6, teams: [{ id: 19, name: 'Leões', permanentTeamId: 91 }],
      competitionTeams: [] }
  };

  it('groups titles by linked permanent team ID, not similar display names', () => {
    const profile = championshipTeamProfile(90, honours, seasons, teams, registry);
    expect(profile?.name).toBe('Águias FC');
    expect([profile?.championships, profile?.leagues, profile?.cups]).toEqual([2, 1, 1]);
    expect(profile?.seasons.map(item => item.seasonLabel)).toEqual(['2025/26', '2024/25']);
    expect(profile?.seasons.every(item => item.champion)).toBeTrue();
    expect(profile?.competitionTitles.map(t => t.tournamentId)).toEqual([30, 31]);
  });

  it('shows registered teams with no trophies and no guessed participation', () => {
    const profile = championshipTeamProfile(91, honours, seasons, teams, registry);
    expect(profile?.championships).toBe(0);
    expect(profile?.competitionTitles).toEqual([]);
    expect(profile?.seasons.map(item => item.championshipId)).toEqual([6]);
    expect(profile?.seasons[0].closedAt).toBeNull();
  });

  it('does not expose details for a team outside the community registry', () => {
    expect(championshipTeamProfile(999, honours, seasons, teams, registry)).toBeNull();
  });

  it('does not infer participation from an identical name in an unrelated season', () => {
    const altered: Record<number, CommunityChampionshipTeams> = {
      ...teams,
      4: { championshipId: 4,
        teams: [{ id: 17, name: 'Águias FC', permanentTeamId: null }],
        competitionTeams: [] }
    };
    const profile = championshipTeamProfile(90, honours, seasons, altered, registry);
    expect(profile?.seasons.map(s => s.championshipId)).toEqual([5]);
    expect(profile?.seasonTitles.length).toBe(2);
  });
});
