import { preloadEnglishTranslations } from '../../i18n/i18n.service';
import { CommunityChampionshipsService } from '../../services/community-championships.service';
import { of, Subject, throwError } from 'rxjs';
import { ChangeDetectorRef, SimpleChange } from '@angular/core';
import { AuthenticationService } from '../../services/authethication.service';
import { CommunityTournamentsService } from '../../services/community-tournaments.service';
import { CommunityGroup } from '../model/community-group';
import { CommunityTournament, TournamentMatch, TournamentPage, TournamentParticipant, TournamentParticipantPage, TournamentTeam, TournamentTeamMatchPage, InlineSpeedOverview } from '../model/community-tournament';
import { CommunityTournamentsComponent } from './community-tournaments.component';
import { tournamentScoreTerminology } from './community-tournament-scoring';
import { appTranslate as t } from '../../i18n/i18n.service';
import { HistoricalMatchArchive } from '../../services/community-groups.service';

describe('Community tournaments management', () => {
  // Production preloads the English chunk before appTranslate runs. Reproduce
  // that bootstrap contract in isolated Karma runs to avoid PT fallbacks.
  beforeAll(async () => {
    await preloadEnglishTranslations();
  });

  let api: jasmine.SpyObj<CommunityTournamentsService>;
  let component: CommunityTournamentsComponent;
  const community: CommunityGroup = {
    id: 7, name: 'Liga de amigos', description: null, sport: 'Futebol', photoUrl: null,
    visibility: 'PRIVATE', rankingsEnabled: true, ownerUsername: 'owner',
    myRole: 'OWNER', memberCount: 2, createdAt: '2026-10-16T12:00:00Z', members: []
  };
  const draft: CommunityTournament = {
    id: 9, name: 'Liga', format: 'LEAGUE', status: 'DRAFT',
    winPoints: 3, drawPoints: 1, lossPoints: 0, createdAt: '2026-10-16T12:00:00Z',
    startedAt: null, completedAt: null, championProfileId: null,
    championUsername: null, championDisplayName: null, championPoints: null,
    championTied: false
  };

  it('shows match outcomes only for recorded scores, including draws', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    expect(instance.championshipFixtureWinner({ homeScore: null, awayScore: null } as any)).toBeNull();
    expect(instance.championshipFixtureWinner({ homeScore: 2, awayScore: 0 } as any)).toBe('HOME');
    expect(instance.championshipFixtureWinner({ homeScore: 1, awayScore: 3 } as any)).toBe('AWAY');
    expect(instance.championshipFixtureWinner({ homeScore: 0, awayScore: 0 } as any)).toBe('DRAW');
  });

  it('compares attributed scorers with the persisted result without inventing missing data', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    instance.championshipFixtureGoals = {};
    const fixture = {
      id: 800, homeTeamId: 1, awayTeamId: 2, homeScore: 2, awayScore: 1
    } as any;
    expect(instance.championshipFixtureGoalAttribution(fixture)).toBeNull();
    instance.championshipFixtureGoals[800] = [
      { id: 1, teamId: 1 }, { id: 2, teamId: 1 }, { id: 3, teamId: 2 }
    ] as any;
    expect(instance.championshipFixtureGoalAttribution(fixture)).toEqual({
      homeAssigned: 2, awayAssigned: 1, homeRemaining: 0, awayRemaining: 0
    });
    fixture.homeScore = 1;
    expect(instance.championshipFixtureGoalAttribution(fixture)?.homeRemaining).toBe(-1);
    instance.championshipFixtureGoals[800] = [];
    expect(instance.championshipFixtureGoalAttribution(fixture)?.awayRemaining).toBe(1);
    fixture.homeScore = null;
    expect(instance.championshipFixtureGoalAttribution(fixture)).toBeNull();
  });

  it('rejects a score edit that would contradict already credited player goals', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    const fixture = { id: 812, homeTeamId: 11, awayTeamId: 12, homeScore: 4, awayScore: 2 } as any;
    instance.championshipFixtureGoals = {
      812: [
        { id: 1, teamId: 11 }, { id: 2, teamId: 11 },
        { id: 3, teamId: 12 }
      ] as any
    };
    expect(instance.championshipScoreRespectsAssignedGoals(fixture, { home: 1, away: 2 })).toBeFalse();
    expect(instance.championshipScoreRespectsAssignedGoals(fixture, { home: 2, away: 0 })).toBeFalse();
    expect(instance.championshipScoreRespectsAssignedGoals(fixture, { home: 2, away: 1 })).toBeTrue();
    expect(instance.championshipScoreRespectsAssignedGoals(fixture, { home: 3, away: 1 })).toBeTrue();
    expect(instance.championshipScoreRespectsAssignedGoals(fixture, { home: null, away: 1 })).toBeFalse();
    delete instance.championshipFixtureGoals[812];
    expect(instance.championshipScoreRespectsAssignedGoals(fixture, { home: 0, away: 0 })).toBeTrue();
  });

  it('never attributes a player goal beyond the persisted team score', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    const fixture = { id: 810, homeTeamId: 11, awayTeamId: 12, homeScore: 2, awayScore: 0 } as any;
    instance.championshipFixtureGoals = {};
    expect(instance.championshipFixtureCanAssignGoal(fixture, 11)).toBeFalse();
    instance.championshipFixtureGoals[810] = [];
    expect(instance.championshipFixtureCanAssignGoal(fixture, 11)).toBeTrue();
    expect(instance.championshipFixtureCanAssignGoal(fixture, 12)).toBeFalse();
    expect(instance.championshipFixtureCanAssignGoal(fixture, 99)).toBeFalse();
    instance.championshipFixtureGoals[810] = [{ id: 1, teamId: 11 }, { id: 2, teamId: 11 }] as any;
    expect(instance.championshipFixtureCanAssignGoal(fixture, 11)).toBeFalse();
    fixture.homeScore = 3;
    expect(instance.championshipFixtureCanAssignGoal(fixture, 11)).toBeTrue();
  });

  it('shows scorer events chronologically and leaves undated events last', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    instance.championshipFixtureGoals = {
      811: [
        { id: 7, minute: null },
        { id: 3, minute: 70 },
        { id: 2, minute: 10 },
        { id: 1, minute: 10 }
      ] as any
    };
    expect(instance.championshipFixtureGoalsInOrder(811).map(goal => goal.id)).toEqual([1, 2, 3, 7]);
    expect(instance.championshipFixtureGoals[811].map(goal => goal.id)).toEqual([7, 3, 2, 1]);
    expect(instance.championshipFixtureGoalsInOrder(999)).toEqual([]);
  });

  it('only saves edited scores and respects knockout winner rules', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    const recorded = { homeScore: 2, awayScore: 1 };
    expect(instance.championshipScoreChanged(undefined, recorded)).toBeFalse();
    expect(instance.championshipScoreChanged({ home: 2, away: 1 }, recorded)).toBeFalse();
    expect(instance.championshipScoreChanged({ home: 3, away: 1 }, recorded)).toBeTrue();
    expect(instance.championshipScoreChanged({ home: 2, away: null }, recorded)).toBeFalse();
    expect(instance.championshipScoreChanged({ home: 1, away: 1 }, recorded, true)).toBeFalse();
    expect(instance.championshipScoreChanged({ home: 1, away: 2 }, recorded, true)).toBeTrue();
    const unplayed = { homeScore: null, awayScore: null };
    expect(instance.championshipScoreChanged({ home: 0, away: 0 }, unplayed)).toBeTrue();
    expect(instance.championshipScoreChanged({ home: 0, away: 0 }, unplayed, true)).toBeFalse();
  });

  it('validates league and cup scores before enabling result submission', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    const valid = (home: number | null, away: number | null) => ({ home, away });
    expect(instance.championshipScoreDraftValid(undefined)).toBeFalse();
    expect(instance.championshipScoreDraftValid(valid(null, 1))).toBeFalse();
    expect(instance.championshipScoreDraftValid(valid(1, null))).toBeFalse();
    expect(instance.championshipScoreDraftValid(valid(-1, 0))).toBeFalse();
    expect(instance.championshipScoreDraftValid(valid(1000, 0))).toBeFalse();
    expect(instance.championshipScoreDraftValid(valid(1.5, 2))).toBeFalse();
    expect(instance.championshipScoreDraftValid(valid(Number.NaN, 1))).toBeFalse();
    expect(instance.championshipScoreDraftValid(valid(0, 0))).toBeTrue();
    expect(instance.championshipScoreDraftValid(valid(0, 0), true)).toBeFalse();
    expect(instance.championshipScoreDraftValid(valid(2, 1), true)).toBeTrue();
    expect(instance.championshipScoreDraftValid(valid(1, 2), true)).toBeTrue();
  });

  it('adapts championship team controls to actual sport capabilities', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    expect(instance.championshipTeamAvailable('Futebol')).toBeTrue();
    expect(instance.championshipIndividualAvailable('Futebol')).toBeTrue();
    expect(instance.championshipSportModeKey('Futebol')).toBe('communities.competitionModes.both');

    expect(instance.championshipTeamAvailable('Natação')).toBeFalse();
    expect(instance.championshipIndividualAvailable('Natação')).toBeTrue();
    expect(instance.championshipSportModeKey('Natação')).toBe('communities.competitionModes.individual');

    expect(instance.championshipTeamAvailable('Golfe')).toBeFalse();
    expect(instance.championshipSportModeKey('Golfe')).toBe('communities.competitionModes.pending');
  });

  it('does not offer team-only championship fixtures for sports without a team result engine', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    expect(instance.championshipOwnedTeamEventsAvailable('Futebol')).toBeTrue();
    expect(instance.championshipOwnedTeamEventsAvailable('Natação')).toBeFalse();
    expect(instance.championshipOwnedTeamEventsAvailable('Atletismo')).toBeFalse();
    expect(instance.championshipOwnedTeamEventsAvailable('Karaté')).toBeFalse();
    expect(instance.championshipOwnedTeamEventsAvailable('Golfe')).toBeFalse();
  });

  it('offers only same-sport, unlinked, non-historical tournaments for a championship', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    instance.tournaments = [
      { ...draft, id: 9, sport: 'Futebol' },
      { ...draft, id: 10, sport: 'Futebol' },
      { ...draft, id: 11, sport: 'Natação' }
    ];
    const championship = {
      id: 12, communityId: 7, name: 'Época', sport: 'Futebol', seasonLabel: '2026/27',
      createdAt: '2026-10-16T12:00:00Z', competitions: [{ id: 9 }],
      winnerStandings: [], closedAt: null, championEntryType: null,
      championParticipantId: null, championDisplayName: null
    };
    instance.championships = [championship as any];
    expect(instance.availableChampionshipTournaments(championship as any).map(item => item.id)).toEqual([10]);
  });

  it('does not allow changing ranking policy after a linked tournament starts', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    expect(instance.canChangeChampionshipStandingsMode({
      id: 15, closedAt: null, competitions: [{ id: 1, status: 'IN_PROGRESS' }]
    } as any)).toBeFalse();
  });

  it('allows policy selection before starting a championship, but not after closing it', () => {
    const instance = Object.create(CommunityTournamentsComponent.prototype) as CommunityTournamentsComponent;
    instance.championshipOwnedEvents = {};
    expect(instance.canChangeChampionshipStandingsMode({
      id: 15, closedAt: null, competitions: [{ id: 1, status: 'DRAFT' }]
    } as any)).toBeTrue();
    expect(instance.canChangeChampionshipStandingsMode({
      id: 15, closedAt: '2026-11-10T20:00:00Z', competitions: []
    } as any)).toBeFalse();
  });

  it('distinguishes championship-owned competitions from standalone tournaments', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'pt');
      expect(t('communities.championshipOwned.distinction')).toContain('exclusivamente');
      expect(t('communities.championshipOwned.format.LEAGUE')).toBe('Liga');
      expect(t('communities.championshipOwned.format.CUP')).toBe('Taça');
      expect(t('communities.championshipOwned.edit')).toBe('Editar');
      expect(t('communities.championshipOwned.confirmDelete')).toBe('Confirmar eliminação');
      expect(t('communities.championshipOwned.generateSchedule')).toBe('Gerar jornadas');
      expect(t('communities.championshipOwned.scheduled')).toBe('Calendário gerado');
      localStorage.setItem('d24-language', 'en');
      expect(t('communities.championshipOwned.distinction')).toContain('exclusively');
      expect(t('communities.championshipOwned.format.CUP')).toBe('Cup');
      expect(t('communities.championshipOwned.edit')).toBe('Edit');
      expect(t('communities.championshipOwned.confirmDelete')).toBe('Confirm deletion');
      expect(t('communities.championshipOwned.generateSchedule')).toBe('Generate fixtures');
      expect(t('communities.championshipOwned.scheduled')).toBe('Scheduled');
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('allows editing a championship-owned draft without changing a standalone tournament', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = {
      id: 15, communityId: 7, name: 'Época 2026/27', sport: 'Futebol',
      seasonLabel: '2026/27', closedAt: null
    } as any;
    const draftEvent = {
      id: 100, championshipId: 15, name: 'Liga Principal',
      format: 'LEAGUE', status: 'DRAFT', createdAt: '2026-11-09T18:00:00Z'
    } as const;
    const standaloneSnapshot = JSON.stringify(component.tournaments);
    component.championshipOwnedEvents[15] = [draftEvent];
    component.beginEditChampionshipEvent(draftEvent);
    component.editingChampionshipEventName = 'Taça de Inverno';
    component.editingChampionshipEventFormat = 'CUP';
    const updated = { ...draftEvent, name: 'Taça de Inverno', format: 'CUP' as const };
    championships.updateOwnedEvent.and.returnValue(of(updated));
    component.saveChampionshipEvent(championship, draftEvent);
    expect(championships.updateOwnedEvent).toHaveBeenCalledOnceWith(
      7, 15, 100, 'Taça de Inverno', 'CUP');
    expect(component.championshipOwnedEvents[15]).toEqual([updated]);
    expect(JSON.stringify(component.tournaments)).toBe(standaloneSnapshot);
  });

  it('requires explicit confirmation before deleting an owned draft', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    const event = {
      id: 101, championshipId: 15, name: 'Supertaça',
      format: 'SUPERCUP', status: 'DRAFT', createdAt: '2026-11-09T18:00:00Z'
    } as const;
    component.championshipOwnedEvents[15] = [event];
    championships.deleteOwnedEvent.and.returnValue(of(undefined));
    component.deleteChampionshipEvent(championship, event);
    expect(championships.deleteOwnedEvent).not.toHaveBeenCalled();
    component.requestDeleteChampionshipEvent(event);
    expect(component.deletingChampionshipEventId).toBe(101);
    component.cancelDeleteChampionshipEvent();
    expect(component.deletingChampionshipEventId).toBeNull();
    component.requestDeleteChampionshipEvent(event);
    component.deleteChampionshipEvent(championship, event);
    expect(championships.deleteOwnedEvent).toHaveBeenCalledOnceWith(7, 15, 101);
    expect(component.championshipOwnedEvents[15]).toEqual([]);
  });

  it('registers season teams independently in an owned cup without changing standalone tournaments', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    const cup = {
      id: 101, championshipId: 15, name: 'Taça',
      format: 'CUP', status: 'DRAFT', createdAt: '2026-11-09T18:00:00Z'
    } as const;
    component.championshipTeamRegistries[15] = {
      championshipId: 15,
      teams: [{ id: 30, name: 'Águias', permanentTeamId: null }],
      competitionTeams: []
    };
    component.championshipOwnedEventTeams[101] = [];
    component.championshipOwnedTeamDrafts[101] = 30;
    const standalone = JSON.stringify(component.tournaments);
    championships.addOwnedEventTeam.and.returnValue(of({
      id: 900, championshipTeamId: 30, name: 'Águias'
    }));
    component.registerChampionshipEventTeam(championship, cup);
    expect(championships.addOwnedEventTeam).toHaveBeenCalledOnceWith(7, 15, 101, 30);
    expect(component.championshipOwnedEventTeams[101].length).toBe(1);
    expect(component.availableChampionshipTeams(15, 101)).toEqual([]);
    expect(JSON.stringify(component.tournaments)).toBe(standalone);
  });

  it('removes one owned competition team without removing the season team identity', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    const league = {
      id: 101, championshipId: 15, name: 'Liga',
      format: 'LEAGUE', status: 'DRAFT', createdAt: '2026-11-09T18:00:00Z'
    } as const;
    component.championshipTeamRegistries[15] = {
      championshipId: 15, teams: [{ id: 30, name: 'Águias', permanentTeamId: null }],
      competitionTeams: []
    };
    component.championshipOwnedEventTeams[101] = [{ id: 900, championshipTeamId: 30, name: 'Águias' }];
    championships.removeOwnedEventTeam.and.returnValue(of(undefined));
    component.unregisterChampionshipEventTeam(championship, league, 30);
    expect(championships.removeOwnedEventTeam).toHaveBeenCalledOnceWith(7, 15, 101, 30);
    expect(component.championshipOwnedEventTeams[101]).toEqual([]);
    expect(component.championshipTeamRegistries[15].teams.length).toBe(1);
  });

  it('creates an owned league fixture calendar without changing independent tournaments', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    const league = { id: 101, championshipId: 15, name: 'Liga', format: 'LEAGUE',
      status: 'DRAFT', createdAt: '2026-11-09T18:00:00Z' } as const;
    component.championshipOwnedEvents[15] = [league];
    component.championshipOwnedEventTeams[101] = [
      { id: 901, championshipTeamId: 30, name: 'Águias' },
      { id: 902, championshipTeamId: 31, name: 'Leões' }
    ];
    const independent = JSON.stringify(component.tournaments);
    const fixture = { id: 700, round: 1, match: 1, homeTeamId: 30,
      homeTeamName: 'Águias', awayTeamId: 31, awayTeamName: 'Leões' };
    championships.scheduleOwnedLeague.and.returnValue(of([fixture]));
    component.setChampionshipLeagueLegs(101, '2');
    component.generateChampionshipLeague(championship, league);
    expect(championships.scheduleOwnedLeague).toHaveBeenCalledOnceWith(7, 15, 101, 2);
    expect(component.championshipOwnedEvents[15][0].status).toBe('SCHEDULED');
    expect(component.leagueRounds(101)).toEqual([1]);
    expect(component.leagueRoundFixtures(101, 1)).toEqual([fixture]);
    expect(JSON.stringify(component.tournaments)).toEqual(independent);
  });

  it('does not schedule a cup or a league with fewer than two registered teams', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    const league = { id: 101, championshipId: 15, name: 'Liga', format: 'LEAGUE',
      status: 'DRAFT', createdAt: '2026-11-09T18:00:00Z' } as const;
    const cup = { ...league, id: 102, format: 'CUP' as const };
    component.championshipOwnedEventTeams[101] = [
      { id: 901, championshipTeamId: 30, name: 'Águias' }
    ];
    component.championshipOwnedEventTeams[102] = [
      { id: 901, championshipTeamId: 30, name: 'Águias' },
      { id: 902, championshipTeamId: 31, name: 'Leões' }
    ];
    component.generateChampionshipLeague(championship, league);
    component.generateChampionshipLeague(championship, cup);
    expect(championships.scheduleOwnedLeague).not.toHaveBeenCalled();
  });

  it('draws a championship-owned cup without touching standalone tournaments', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    const cup = { id: 101, championshipId: 15, name: 'Taça', format: 'CUP',
      status: 'DRAFT', createdAt: '2026-11-09T18:00:00Z' } as const;
    component.championshipOwnedEvents[15] = [cup];
    component.championshipOwnedEventTeams[101] = [
      { id: 901, championshipTeamId: 30, name: 'Águias' },
      { id: 902, championshipTeamId: 31, name: 'Leões' },
      { id: 903, championshipTeamId: 32, name: 'Tigres' }
    ];
    const draw = {
      matches: [{ id: 700, round: 1, match: 1, homeTeamId: 30,
        homeTeamName: 'Águias', awayTeamId: 31, awayTeamName: 'Leões' }],
      byes: [{ id: 701, slot: 1, teamId: 32, teamName: 'Tigres' }]
    };
    const independent = JSON.stringify(component.tournaments);
    championships.drawOwnedCup.and.returnValue(of(draw));
    component.generateChampionshipCup(championship, cup);
    expect(championships.drawOwnedCup).toHaveBeenCalledOnceWith(7, 15, 101);
    expect(component.championshipCupDraws[101]).toEqual(draw);
    expect(component.championshipOwnedEvents[15][0].status).toBe('SCHEDULED');
    expect(JSON.stringify(component.tournaments)).toBe(independent);
  });

  it('rejects a cup draw without enough teams or on a league format', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    const cup = { id: 101, championshipId: 15, name: 'Taça', format: 'CUP',
      status: 'DRAFT', createdAt: '2026-11-09T18:00:00Z' } as const;
    const league = { ...cup, id: 102, format: 'LEAGUE' as const };
    component.championshipOwnedEventTeams[101] =
      [{ id: 901, championshipTeamId: 30, name: 'Águias' }];
    component.championshipOwnedEventTeams[102] = [
      { id: 901, championshipTeamId: 30, name: 'Águias' },
      { id: 902, championshipTeamId: 31, name: 'Leões' }
    ];
    component.generateChampionshipCup(championship, cup);
    component.generateChampionshipCup(championship, league);
    expect(championships.drawOwnedCup).not.toHaveBeenCalled();
  });

  it('translates championship creation actions, fields and placeholders in PT/EN', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'pt');
      expect(t('communities.championshipUi.openForm')).toBe('Criar campeonato');
      expect(t('communities.championshipUi.save')).toBe('Guardar campeonato');
      expect(t('communities.championshipUi.name')).toBe('Nome do campeonato');
      expect(t('communities.championshipUi.season')).toBe('Época');
      expect(t('communities.championshipUi.sport')).toBe('Modalidade');
      expect(t('communities.championshipUi.active')).toBe('Em curso');
      expect(t('communities.championshipUi.history')).toBe('Histórico');
      expect(t('communities.championshipUi.linkExisting')).toBe('Associar prova existente');
      expect(t('communities.championshipUi.chooseCompetition')).toBe('Escolher prova');
      expect(t('communities.championshipUi.savePoints')).toBe('Guardar pontos');

      localStorage.setItem('d24-language', 'en');
      expect(t('communities.championshipUi.openForm')).toBe('Create championship');
      expect(t('communities.championshipUi.save')).toBe('Save championship');
      expect(t('communities.championshipUi.name')).toBe('Championship name');
      expect(t('communities.championshipUi.season')).toBe('Season');
      expect(t('communities.championshipUi.sport')).toBe('Sport');
      expect(t('communities.championshipUi.active')).toBe('Active');
      expect(t('communities.championshipUi.history')).toBe('History');
      expect(t('communities.championshipUi.linkExisting')).toBe('Link existing competition');
      expect(t('communities.championshipUi.chooseCompetition')).toBe('Choose a competition');
      expect(t('communities.championshipUi.savePoints')).toBe('Save points');
      expect(t('communities.championshipUi.namePlaceholder')).toContain('Community Championship');
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  beforeEach(() => {
    api = jasmine.createSpyObj<CommunityTournamentsService>('CommunityTournamentsService', [
      'list', 'create', 'participants', 'join', 'leave', 'confirm', 'removeParticipant',
      'generateSchedule', 'matches', 'recordResult', 'standings', 'complete', 'delete',
      'createTeamTournament', 'createRelayChampionship', 'relayOverview', 'recordRelayHeat',
      'publishRelayFinal', 'decideRelayHeat', 'details', 'teams', 'createTeam', 'addTeamPlayer', 'acceptTeamInvite', 'removeTeamPlayer', 'deleteTeam',
      'teamAdministration', 'teamInvitationStatus', 'declineTeamInvitation',
      'transferTeamAdministration', 'respondTeamAdministration', 'cancelTeamAdministrationTransfer',
      'generateTeamSchedule', 'teamMatches', 'teamProfileMatches', 'recordTeamResult', 'teamStandings', 'teamGroups', 'completeTeam',
      'createRaceChampionship', 'raceOverview', 'linkRace', 'unlinkRace', 'setRacePoints',
      'createTimedChampionship', 'createCanoeChampionship', 'createRowingChampionship', 'createTrackChampionship', 'timedOverview', 'linkTimedRound', 'unlinkTimedRound',
      'createMeasuredChampionship', 'measuredOverview', 'linkMeasuredRound', 'unlinkMeasuredRound',
      'completeRaceChampionship', 'inlineSpeedOverview', 'resolveInlineSpeedTieBreak', 'recordInlineSpeedTrial'
    ]);
    api.list.and.returnValue(of({ tournaments: [draft], page: 0, hasMore: false }));
    api.participants.and.returnValue(of({ participants: [], page: 0, hasMore: false }));
    api.matches.and.returnValue(of({ matches: [], page: 0, hasMore: false }));
    api.teams.and.returnValue(of([]));
    api.teamAdministration.and.returnValue(of({
      teamId: 10, adminProfileId: null, pendingProfileId: null, canManage: false, canAccept: false
    }));
    api.teamInvitationStatus.and.returnValue(of({ invited: false }));
    api.declineTeamInvitation.and.returnValue(of(void 0));
    api.relayOverview.and.returnValue(of({
      tournamentId:103,eventDiscipline:'RELAY_4X100',teams:[],heats:[],standings:[]
    }));
    api.raceOverview.and.returnValue(of({
      tournamentId: 19, pointsByPlace: [25, 18, 15], linkedRaces: [], availableRaces: [],
      standings: []
    }));
    api.timedOverview.and.returnValue(of({
      tournamentId: 19, eventType: 'SWIM_LCM', eventDiscipline: 'FREE_50',
      linkedRounds: [], availableRounds: [], standings: []
    }));
    api.measuredOverview.and.returnValue(of({
      tournamentId: 101, eventType: 'JUMP', eventDiscipline: 'LONG_JUMP',
      linkedRounds: [], availableRounds: [], standings: []
    }));
    api.inlineSpeedOverview.and.returnValue(of({
      tournamentId: 19, discipline: null, linkedHeats: [], availableHeats: [],
      proposals: [], decisions: []
    }));
    api.teamMatches.and.returnValue(of({ matches: [], page: 0, hasMore: false }));
    api.teamProfileMatches.and.returnValue(of({ matches: [], page: 0, hasMore: false }));
    api.teamGroups.and.returnValue(of({
      tournamentId: 19, knockoutStarted: false, groups: []
    }));
    api.teamStandings.and.returnValue(of({
      tournamentId: 19, status: 'IN_PROGRESS', totalMatches: 0, completedMatches: 0,
      winPoints: 3, drawPoints: 1, lossPoints: 0, standings: []
    }));
    api.standings.and.returnValue(of({
      tournamentId: 9, status: 'DRAFT', totalMatches: 0, completedMatches: 0,
      winPoints: 3, drawPoints: 1, lossPoints: 0, standings: []
    }));
    const auth = {
      loggedInPerfilname: 'owner', isLoggedIn: () => true
    } as unknown as AuthenticationService;
    const cdr = {
      markForCheck: jasmine.createSpy('markForCheck'),
      detectChanges: jasmine.createSpy('detectChanges')
    } as unknown as ChangeDetectorRef;
    const championships = jasmine.createSpyObj<CommunityChampionshipsService>('CommunityChampionshipsService', ['list', 'create', 'addCompetition', 'standings', 'setWinnerPoints', 'setPlacementPoints', 'teams', 'createTeam', 'linkTeam', 'honours', 'permanentTeams', 'createPermanentTeam', 'linkPermanentTeam', 'ownedEvents', 'createOwnedEvent', 'updateOwnedEvent', 'deleteOwnedEvent', 'deleteUnplayed', 'ownedEventTeams', 'addOwnedEventTeam', 'removeOwnedEventTeam', 'ownedLeagueFixtures', 'scheduleOwnedLeague', 'ownedCupDraw', 'drawOwnedCup']);
    championships.list.and.returnValue(of([]));
    championships.ownedEvents.and.returnValue(of([]));
    championships.ownedEventTeams.and.returnValue(of([]));
    championships.ownedLeagueFixtures.and.returnValue(of([]));
    championships.ownedCupDraw.and.returnValue(of({ matches: [], byes: [] }));
    championships.honours.and.returnValue(of({ communityId: 7, completedSeasons: 0, titles: [], individualHonours: [], teamHonours: [], competitionTitles: [] }));
    championships.permanentTeams.and.returnValue(of({ communityId: 7, teams: [] }));
    championships.teams.and.returnValue(of({ championshipId: 1, teams: [], competitionTeams: [] }));
    championships.standings.and.returnValue(of({
      championshipId: 1, standings: [], fullyScoredCompetitions: 0,
      winnerOnlyCompetitions: 0, pendingCompetitions: 0
    }));
    component = new CommunityTournamentsComponent(api, championships, auth, cdr);
    component.community = { ...community };
    component.ngOnChanges({ community: new SimpleChange(undefined, community, true) });
  });


  it('requires a second explicit action before deleting an unplayed championship', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = {
      id: 15, communityId: 7, name: 'Campeonato criado por engano',
      sport: 'Futebol', seasonLabel: '2026/27', closedAt: null
    } as any;
    championships.deleteUnplayed.and.returnValue(of(void 0));
    component.championships = [championship];
    component.requestDeleteChampionship(championship);
    expect(component.deletingChampionshipId).toBe(15);
    expect(championships.deleteUnplayed).not.toHaveBeenCalled();

    component.cancelDeleteChampionship();
    component.deleteUnplayedChampionship(championship);
    expect(championships.deleteUnplayed).not.toHaveBeenCalled();

    component.requestDeleteChampionship(championship);
    component.deleteUnplayedChampionship(championship);
    expect(championships.deleteUnplayed).toHaveBeenCalledOnceWith(7, 15);
    expect(component.deletingChampionshipId).toBeNull();
  });

  it('shows a protected-history explanation when deletion is rejected by the API', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    championships.deleteUnplayed.and.returnValue(throwError(() => ({ status: 409 })));
    component.requestDeleteChampionship(championship);
    component.deleteUnplayedChampionship(championship);

    expect(component.championshipError).toContain('resultados');
    expect(component.deletingChampionshipId).toBe(15);
    expect(component.championshipBusy).toBeFalse();
  });

  it('explains when the user lacks permissions to delete a championship', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    championships.deleteUnplayed.and.returnValue(throwError(() => ({ status: 403 })));
    component.requestDeleteChampionship(championship);
    component.deleteUnplayedChampionship(championship);

    expect(component.championshipError).toContain('permissões');
    expect(component.deletingChampionshipId).toBe(15);
    expect(component.championshipBusy).toBeFalse();
  });

  it('explains when the championship has already been removed', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    championships.deleteUnplayed.and.returnValue(throwError(() => ({ status: 404 })));
    component.requestDeleteChampionship(championship);
    component.deleteUnplayedChampionship(championship);

    expect(component.championshipError).toContain('já não existe');
    expect(component.deletingChampionshipId).toBe(15);
    expect(component.championshipBusy).toBeFalse();
  });

  it('clears championship deletion confirmation when switching communities', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const championship = { id: 15, closedAt: null } as any;
    championships.deleteUnplayed.and.returnValue(of(void 0));
    component.requestDeleteChampionship(championship);
    expect(component.deletingChampionshipId).toBe(15);

    const otherCommunity = { ...community, id: 8 };
    component.community = otherCommunity;
    component.ngOnChanges({ community: new SimpleChange(community, otherCommunity, false) });

    expect(component.deletingChampionshipId).toBeNull();
    component.deleteUnplayedChampionship(championship);
    expect(championships.deleteUnplayed).not.toHaveBeenCalled();
  });

  it('does not offer destructive deletion of archived championship history', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const archived = { id: 15, closedAt: '2026-11-11T18:00:00Z' } as any;
    component.requestDeleteChampionship(archived);
    component.deleteUnplayedChampionship(archived);
    expect(championships.deleteUnplayed).not.toHaveBeenCalled();
  });

  it('does not resubmit an unchanged saved league score', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const scoreApi = jasmine.createSpy('recordOwnedFixtureScore');
    (championships as any).recordOwnedFixtureScore = scoreApi;
    const fixture = { id: 504, homeScore: 2, awayScore: 1 };
    component.championshipFixtureScoreDrafts[504] = { home: 2, away: 1 };

    component.saveChampionshipFixtureScore(
      { id: 15, sport: 'Futebol', closedAt: null } as any,
      { id: 104, format: 'LEAGUE', status: 'SCHEDULED' } as any, fixture as any
    );

    expect(scoreApi).not.toHaveBeenCalled();
    expect(component.championshipFixtureScoreDrafts[504]).toEqual({ home: 2, away: 1 });
  });

  it('does not dispatch a score correction that drops below credited goals', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const save = jasmine.createSpy('recordOwnedFixtureScore');
    (championships as any).recordOwnedFixtureScore = save;
    const fixture = { id: 820, homeTeamId: 11, awayTeamId: 12, homeScore: 3, awayScore: 1 };
    component.championshipFixtureGoals[820] = [
      { id: 1, teamId: 11 }, { id: 2, teamId: 11 }
    ] as any;
    component.championshipFixtureScoreDrafts[820] = { home: 1, away: 1 };
    component.saveChampionshipFixtureScore(
      { id: 15, sport: 'Futebol', closedAt: null } as any,
      { id: 104, format: 'LEAGUE', status: 'SCHEDULED' } as any, fixture as any);
    expect(save).not.toHaveBeenCalled();
    expect(component.championshipFixtureScoreDrafts[820]).toEqual({ home: 1, away: 1 });
  });

  it('does not dispatch a player-goal attribution after that team has reached its score', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const add = jasmine.createSpy('addFixtureGoal');
    (championships as any).addFixtureGoal = add;
    const fixture = { id: 821, homeTeamId: 11, awayTeamId: 12, homeScore: 1, awayScore: 0 };
    component.championshipFixtureGoals[821] = [{ id: 1, teamId: 11 }] as any;
    component.championshipFixtureGoalTeamDrafts[821] = 11;
    component.championshipFixtureGoalPlayerDrafts[821] = 55;
    component.addFixtureGoal(
      { id: 15, sport: 'Futebol', closedAt: null } as any,
      { id: 105, format: 'LEAGUE', status: 'SCHEDULED' } as any, fixture as any);
    expect(add).not.toHaveBeenCalled();
  });

  it('does not update a league score while player-goal attribution is pending', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const scoreApi = jasmine.createSpy('recordOwnedFixtureScore');
    (championships as any).recordOwnedFixtureScore = scoreApi;
    const fixture = { id: 501, homeScore: 1, awayScore: 0 };
    component.championshipFixtureScoreDrafts[501] = { home: 2, away: 1 };
    component.championshipFixtureGoalBusy[501] = true;

    component.saveChampionshipFixtureScore(
      { id: 15, sport: 'Futebol', closedAt: null } as any,
      { id: 101, format: 'LEAGUE', status: 'SCHEDULED' } as any, fixture as any
    );

    expect(scoreApi).not.toHaveBeenCalled();
  });

  it('does not remove an attributed goal while its fixture score is being saved', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const remove = jasmine.createSpy('removeFixtureGoal');
    (championships as any).removeFixtureGoal = remove;
    component.championshipFixtureSaving[501] = true;

    component.removeFixtureGoal(
      { id: 15, sport: 'Futebol', closedAt: null } as any,
      { id: 101, format: 'LEAGUE', status: 'SCHEDULED' } as any, 501, 17
    );

    expect(remove).not.toHaveBeenCalled();
  });

  it('refreshes the league fixture and clears its draft after a successful score save', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const fixture = { id: 501, homeScore: 1, awayScore: 0 };
    const updated = { ...fixture, homeScore: 2, awayScore: 1 };
    const scoreApi = jasmine.createSpy('recordOwnedFixtureScore').and.returnValue(of(updated));
    (championships as any).recordOwnedFixtureScore = scoreApi;
    spyOn(component, 'loadChampionshipOwnedLeagueTable');
    spyOn(component, 'loadChampionshipLeaguePlayerStats');
    spyOn(component, 'loadFixtureGoals');
    spyOn(component, 'loadChampionshipStandings');
    component.championshipLeagueFixtures[101] = [fixture as any];
    component.championshipFixtureScoreDrafts[501] = { home: 2, away: 1 };

    component.saveChampionshipFixtureScore(
      { id: 15, sport: 'Futebol', closedAt: null } as any,
      { id: 101, format: 'LEAGUE', status: 'SCHEDULED' } as any, fixture as any
    );

    expect(scoreApi).toHaveBeenCalledOnceWith(7, 15, 101, 501, 2, 1);
    expect(component.championshipLeagueFixtures[101][0].homeScore).toBe(2);
    expect(component.championshipFixtureScoreDrafts[501]).toBeUndefined();
    expect(component.loadChampionshipOwnedLeagueTable).toHaveBeenCalledOnceWith(15, 101);
    expect(component.loadChampionshipLeaguePlayerStats).toHaveBeenCalledOnceWith(15, 101);
    expect(component.loadFixtureGoals).toHaveBeenCalledOnceWith(15, 101, 501);
    expect(component.loadChampionshipStandings).toHaveBeenCalledOnceWith(15);
    expect(component.championshipFixtureSaving[501]).toBeFalse();
  });

  it('blocks cup progression while the current round has uncommitted score edits', () => {
    const match = { id: 503, round: 1, homeScore: 2, awayScore: 0 };
    component.championshipCupDraws[103] = { matches: [match], byes: [] } as any;
    expect(component.cupRoundCanAdvance(103)).toBeTrue();

    component.championshipCupResultDrafts[503] = { home: 3, away: 0 };
    expect(component.cupRoundHasPendingScores(103)).toBeTrue();
    expect(component.cupRoundCanAdvance(103)).toBeFalse();

    component.championshipCupResultDrafts[503] = { home: 2, away: 0 };
    expect(component.cupRoundHasPendingScores(103)).toBeFalse();
    expect(component.cupRoundCanAdvance(103)).toBeTrue();
  });

  it('blocks cup progression while the server is saving a match result', () => {
    const match = { id: 503, round: 1, homeScore: 2, awayScore: 0 };
    component.championshipCupDraws[103] = { matches: [match], byes: [] } as any;
    component.championshipCupScoreBusy[503] = true;
    expect(component.cupRoundCanAdvance(103)).toBeFalse();
    component.championshipCupScoreBusy[503] = false;
    expect(component.cupRoundCanAdvance(103)).toBeTrue();
  });

  it('does not advance the cup despite confirmation when a score was edited', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const advance = jasmine.createSpy('advanceOwnedCup');
    (championships as any).advanceOwnedCup = advance;
    const match = { id: 503, round: 1, homeScore: 2, awayScore: 0 };
    const championship = { id: 15, closedAt: null } as any;
    const event = { id: 103, format: 'CUP', status: 'SCHEDULED' } as any;
    component.championshipCupDraws[103] = { matches: [match], byes: [] } as any;
    component.championshipCupAdvanceConfirm[103] = true;
    component.championshipCupResultDrafts[503] = { home: 1, away: 2 };

    component.advanceChampionshipCup(championship, event);
    expect(advance).not.toHaveBeenCalled();
    expect(component.championshipCupAdvanceConfirm[103]).toBeTrue();
  });

  it('does not save additional cup scores while advancing the bracket', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const scoreApi = jasmine.createSpy('recordOwnedFixtureScore');
    (championships as any).recordOwnedFixtureScore = scoreApi;
    const match = { id: 503, round: 1, homeScore: 2, awayScore: 0 };
    component.championshipCupDraws[103] = { matches: [match], byes: [] } as any;
    component.championshipCupResultDrafts[503] = { home: 3, away: 0 };
    component.championshipCupBusy = true;
    component.saveChampionshipCupScore(
      { id: 15, sport: 'Futebol', closedAt: null } as any,
      { id: 103, format: 'CUP', status: 'SCHEDULED' } as any, match as any);
    expect(scoreApi).not.toHaveBeenCalled();
  });

  it('requires new consent after editing cup scores, even if changed back', () => {
    const match = { id: 503, round: 1, homeScore: 2, awayScore: 0 } as any;
    component.championshipCupDraws[103] = { matches: [match], byes: [] } as any;
    component.championshipCupAdvanceConfirm[103] = true;

    component.updateChampionshipCupScoreDraft(103, match, 'home', '3');
    expect(component.championshipCupAdvanceConfirm[103]).toBeFalse();
    expect(component.cupRoundCanAdvance(103)).toBeFalse();

    component.championshipCupAdvanceConfirm[103] = true;
    component.updateChampionshipCupScoreDraft(103, match, 'home', '2');
    expect(component.cupRoundCanAdvance(103)).toBeTrue();
    expect(component.championshipCupAdvanceConfirm[103]).toBeFalse();
  });

  it('ignores edits while a cup result is being saved', () => {
    const match = { id: 503, round: 1, homeScore: 2, awayScore: 0 } as any;
    component.championshipCupScoreBusy[503] = true;
    component.updateChampionshipCupScoreDraft(103, match, 'away', '4');
    expect(component.championshipCupResultDrafts[503]).toBeUndefined();
  });

  it('clears local cup drafts and prior progression consent on a verified bracket reload', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const match = { id: 503, round: 1, homeScore: 2, awayScore: 0 };
    championships.ownedCupDraw.and.returnValue(of({ matches: [match], byes: [] } as any));
    component.championshipCupAdvanceConfirm[103] = true;
    component.championshipCupResultDrafts[503] = { home: 1, away: 0 };

    component.loadChampionshipCupDraw(15, 103);

    expect(component.championshipCupAdvanceConfirm[103]).toBeFalse();
    expect(component.championshipCupResultDrafts[503]).toBeUndefined();
    expect(component.championshipCupDraws[103].matches[0].homeScore).toBe(2);
  });

  it('updates cup matches and clears the draft after a confirmed save', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const match = { id: 503, round: 1, homeScore: null, awayScore: null };
    const updated = { ...match, homeScore: 2, awayScore: 0 };
    const scoreApi = jasmine.createSpy('recordOwnedFixtureScore').and.returnValue(of(updated));
    (championships as any).recordOwnedFixtureScore = scoreApi;
    spyOn(component, 'loadChampionshipStandings');
    component.championshipCupDraws[103] = { matches: [match], byes: [] } as any;
    component.championshipCupAdvanceConfirm[103] = true;
    component.championshipCupResultDrafts[503] = { home: 2, away: 0 };

    component.saveChampionshipCupScore(
      { id: 15, sport: 'Futebol', closedAt: null } as any,
      { id: 103, format: 'CUP', status: 'SCHEDULED' } as any, match as any
    );

    expect(scoreApi).toHaveBeenCalledOnceWith(7, 15, 103, 503, 2, 0);
    expect(component.championshipCupDraws[103].matches[0].homeScore).toBe(2);
    expect(component.championshipCupResultDrafts[503]).toBeUndefined();
    expect(component.championshipCupAdvanceConfirm[103]).toBeFalse();
    expect(component.loadChampionshipStandings).toHaveBeenCalledOnceWith(15);
    expect(component.championshipCupScoreBusy[503]).toBeFalse();
  });

  it('keeps an unsaved cup score draft when the API fails', () => {
    const championships = (component as any).championshipsApi as jasmine.SpyObj<CommunityChampionshipsService>;
    const scoreApi = jasmine.createSpy('recordOwnedFixtureScore')
      .and.returnValue(throwError(() => new Error('Server unavailable')));
    (championships as any).recordOwnedFixtureScore = scoreApi;
    const match = { id: 502, round: 1, homeScore: null, awayScore: null };
    spyOn(component, 'loadChampionshipStandings');
    component.championshipCupDraws[102] = { matches: [match], byes: [] } as any;
    component.championshipCupAdvanceConfirm[102] = true;
    component.championshipCupResultDrafts[502] = { home: 3, away: 1 };

    component.saveChampionshipCupScore(
      { id: 15, sport: 'Futebol', closedAt: null } as any,
      { id: 102, format: 'CUP', status: 'SCHEDULED' } as any, match as any
    );

    expect(scoreApi).toHaveBeenCalledOnceWith(7, 15, 102, 502, 3, 1);
    expect(component.championshipCupResultDrafts[502]).toEqual({ home: 3, away: 1 });
    expect(component.championshipCupAdvanceConfirm[102]).toBeTrue();
    expect(component.loadChampionshipStandings).not.toHaveBeenCalled();
    expect(component.championshipCupScoreBusy[502]).toBeFalse();
    expect(component.championshipError).toContain('Não foi possível guardar');
  });

  it('uses the shared 121-sport contract for creation instead of a football fallback', () => {
    component.sportDraft = 'Karting';
    component.showTeamCreate = false;
    expect(component.selectedSportCreationModel).toBe('RACE_POINTS');
    expect(component.isSportFormatSupported).toBeTrue();
    component.showTeamCreate = true;
    expect(component.selectedSportCreationModel).toBe('UNAVAILABLE');
    expect(component.isSportFormatSupported).toBeFalse();

    component.sportDraft = 'Xadrez';
    expect(component.isSportFormatSupported).toBeFalse();
    component.showTeamCreate = false;
    expect(component.selectedSportCreationModel).toBe('NUMERIC_INDIVIDUAL');

    component.sportDraft = 'Natação';
    expect(component.selectedSportCapabilities.family).toBe('race');
    expect(component.selectedSportCreationModel).toBe('SWIM_BEST_TIME');
    expect(component.isSportFormatSupported).toBeFalse();

    component.sportDraft = 'Futebol';
    component.showTeamCreate = true;
    expect(component.selectedSportCreationModel).toBe('NUMERIC_TEAM');
    expect(component.isSportFormatSupported).toBeTrue();
    expect(api.createTeamTournament).not.toHaveBeenCalled();
  });

  it('selects only eligible tournament event types and clears them on sport changes',()=>{
    component.sportDraft='BMX';
    component.showTeamCreate=false;
    expect(component.sportEventChoices.map(x=>[x.code,x.supported])).toEqual([
      ['RACE',true],['FREESTYLE',false]
    ]);
    component.chooseTournamentEventType('FREESTYLE');
    expect(component.savedSportEventType).toBeNull();
    component.chooseTournamentEventType('RACE');
    expect(component.savedSportEventType).toBe('RACE');
    component.chooseSport('Xadrez');
    expect(component.eventTypeDraft).toBeNull();
    component.chooseTournamentEventType('CHESS_GAME');
    expect(component.savedSportEventType).toBe('CHESS_GAME');
    component.startTeamCreation();
    expect(component.savedSportEventType).toBeNull();
    expect(component.sportEventChoices[0].supported).toBeFalse();
  });

  it('sends the selected compatible race or chess event type to the API', async () => {
    component.startIndividualCreation();
    component.nameDraft = 'BMX corrida';
    component.chooseSport('BMX');
    component.chooseTournamentEventType('RACE');
    api.createRaceChampionship.and.returnValue(of({
      ...draft, id: 55, name: 'BMX corrida', sport: 'BMX',
      scoringMode: 'RACE_POINTS', eventType: 'RACE'
    }));
    await component.create();
    expect(api.createRaceChampionship).toHaveBeenCalledWith(7, 'BMX corrida', 'BMX', 'RACE');

    component.startIndividualCreation();
    component.nameDraft = 'Torneio de Xadrez';
    component.chooseSport('Xadrez');
    component.chooseTournamentEventType('CHESS_GAME');
    api.create.and.returnValue(of({
      ...draft, id: 56, name: 'Torneio de Xadrez', sport: 'Xadrez',
      scoringMode: 'CHESS_HALF_POINTS', eventType: 'CHESS_GAME'
    }));
    await component.create();
    expect(api.create).toHaveBeenCalledWith(
      7, 'Torneio de Xadrez', 'Xadrez',
      { winPoints: 2, drawPoints: 1, lossPoints: 0 },
      'CHESS_HALF_POINTS', 'CHESS_GAME'
    );
  });

  it('publishes finalists from qualifying standings only after confirmation',async()=>{
    component.selected={...draft,id:103,entryType:'TEAM',sport:'Atletismo',
      status:'IN_PROGRESS',scoringMode:'RELAY_BEST_TIME',
      eventType:'TRACK_RELAY',eventDiscipline:'RELAY_4X100'};
    const rows=[1,2,3].map(n=>({
      position:n,teamId:n,teamName:'Equipa '+n,
      bestSeconds:42+n,recordedHeats:1,runnerProfileIds:[11,12,13,14]
    }));
    component.relayOverview={
      tournamentId:103,eventDiscipline:'RELAY_4X100',
      teams:[],heats:[],standings:rows,qualifyingStandings:rows,finalPublished:false
    };
    expect(component.canPublishRelayFinal).toBeTrue();
    component.relayFinalConfirm=true;
    api.publishRelayFinal.and.returnValue(of({
      ...component.relayOverview,standings:[],finalPublished:true,
      finalists:rows.map(row=>({teamId:row.teamId,teamName:row.teamName,
        seed:row.position,qualifyingSeconds:row.bestSeconds}))
    }));
    await component.publishRelayFinal();
    expect(api.publishRelayFinal).toHaveBeenCalledOnceWith(7,103);
    expect(component.relayOverview?.finalPublished).toBeTrue();
    expect(component.relayFinalConfirm).toBeFalse();
  });

  it('refuses automatic qualification when eighth and ninth teams tie',()=>{
    component.selected={...draft,id:103,entryType:'TEAM',sport:'Atletismo',
      status:'IN_PROGRESS',scoringMode:'RELAY_BEST_TIME'};
    const rows=Array.from({length:9},(_,i)=>({
      position:i+1,teamId:i+1,teamName:'Equipa '+i,
      bestSeconds:i>=7?50:i+40,recordedHeats:1,runnerProfileIds:[1,2,3,4]
    }));
    component.relayOverview={tournamentId:103,eventDiscipline:'RELAY_4X100',
      teams:[],heats:[],standings:rows,qualifyingStandings:rows,finalPublished:false};
    expect(component.canPublishRelayFinal).toBeFalse();
  });

  it('keeps qualification read-only after the final and allows jury corrections in final',async()=>{
    component.selected={...draft,id:103,status:'IN_PROGRESS',entryType:'TEAM',
      sport:'Atletismo',scoringMode:'RELAY_BEST_TIME'};
    const team:TournamentTeam={
      id:7,name:'Equipa',playersPerTeam:4,createdAt:'2026-11-03T00:00:00Z',
      players:[1,2,3,4].map(n=>({profileId:n,username:'a'+n,displayName:'Atleta '+n}))
    };
    component.teams=[team];
    component.relayLegDraft[7]=[1,2,3,4];
    component.relayHeatDraft[7]=1;
    component.relayTimeDraft[7]=44.123;
    const overview={
      tournamentId:103,eventDiscipline:'RELAY_4X100',teams:[team],heats:[],standings:[],
      finalPublished:true,finalists:[{teamId:7,teamName:'Equipa',seed:1,qualifyingSeconds:44.789}]
    };
    component.relayOverview=overview;
    const response={...overview,heats:[{id:88,teamId:7,teamName:'Equipa',
      heatNumber:1,elapsedSeconds:44.123,runnerProfileIds:[1,2,3,4],
      recordedAt:'2026-11-03T00:00:00Z',stage:'FINAL' as const,decisionStatus:'VALID' as const}]};
    api.recordRelayHeat.and.returnValue(of(response));
    await component.saveRelayHeat(team);
    expect(api.recordRelayHeat).toHaveBeenCalledOnceWith(7,103,7,1,44.123,[1,2,3,4],true);
    const qualifying={...response.heats[0],stage:'QUALIFICATION' as const};
    expect(component.canDecideRelayHeat(qualifying)).toBeFalse();
    expect(component.canDecideRelayHeat(response.heats[0])).toBeTrue();
    component.relayDecisionReasons[88]='Troca de testemunho fora da zona';
    api.decideRelayHeat.and.returnValue(of({
      ...response,heats:[{...response.heats[0],decisionStatus:'DISQUALIFIED' as const}]
    }));
    await component.decideRelayHeat(response.heats[0]);
    expect(api.decideRelayHeat).toHaveBeenCalledOnceWith(7,103,88,
      'DISQUALIFIED','Troca de testemunho fora da zona');
    expect(component.relayOverview?.heats[0].decisionStatus).toBe('DISQUALIFIED');
  });

  it('creates four-runner relay championship without generic match scoring',async()=>{
    component.startTeamCreation();
    component.nameDraft='Estafetas 4x100';
    component.chooseSport('Atletismo');
    expect(component.selectedSportCreationModel).toBe('RELAY_BEST_TIME');
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseTournamentEventType('TRACK_RELAY');
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseRelayDiscipline('RELAY_4X100');
    expect(component.isSportFormatSupported).toBeTrue();
    api.createRelayChampionship.and.returnValue(of({
      ...draft,id:103,name:'Estafetas 4x100',sport:'Atletismo',entryType:'TEAM',
      eventType:'TRACK_RELAY',eventDiscipline:'RELAY_4X100',scoringMode:'RELAY_BEST_TIME',
      playersPerTeam:4
    }));
    await component.createTeamCompetition();
    expect(api.createRelayChampionship).toHaveBeenCalledOnceWith(7,'Estafetas 4x100','RELAY_4X100');
    expect(component.isRelayCompetition).toBeTrue();
    expect(component.canPublishTeamSchedule).toBeFalse();
    expect(api.generateTeamSchedule).not.toHaveBeenCalled();
    expect(api.createTeamTournament).not.toHaveBeenCalled();
  });

  it('validates relay legs without duplicate runners or invalid times',()=>{
    component.selected={...draft,entryType:'TEAM',sport:'Atletismo',
      scoringMode:'RELAY_BEST_TIME',eventType:'TRACK_RELAY',eventDiscipline:'RELAY_4X400'};
    const team:TournamentTeam={id:10,name:'A',createdAt:'2026-11-02T12:00:00Z',
      playersPerTeam:4,players:[1,2,3,4].map(n=>({profileId:n,username:'p'+n,displayName:'Atleta '+n}))};
    component.teams=[team];
    component.relayLegDraft[10]=[1,2,2,4];
    expect(component.relayTeamReady(team)).toBeFalse();
    component.relayLegDraft[10]=[1,2,3,4];
    expect(component.relayTeamReady(team)).toBeTrue();
    component.relayTimeDraft[10]=48.125;
    expect(component.relayTimeDraft[10]).toBe(48.125);
    component.relayTimeDraft[10]=-1;
    expect(component.relayTimeDraft[10]).toBe(-1);
  });

  it('creates timed K1 championships only after selecting the event and distance', async () => {
    component.startIndividualCreation();
    component.nameDraft='K1 500 m';
    component.chooseSport('Canoagem Velocidade');
    expect(component.selectedSportCreationModel).toBe('CANOE_BEST_TIME');
    expect(component.isSportFormatSupported).toBeFalse();
    expect(component.creationReadiness).toBe('EVENT_REQUIRED');
    component.chooseTournamentEventType('CANOE_SPRINT');
    expect(component.creationReadiness).toBe('DISCIPLINE_REQUIRED');
    component.chooseCanoeDiscipline('K1_500');
    expect(component.isSportFormatSupported).toBeTrue();
    api.createCanoeChampionship.and.returnValue(of({
      ...draft,id:119,name:'K1 500 m',sport:'Canoagem Velocidade',
      eventType:'CANOE_SPRINT',eventDiscipline:'K1_500',scoringMode:'CANOE_BEST_TIME'
    }));
    await component.create();
    expect(api.createCanoeChampionship).toHaveBeenCalledOnceWith(7,'K1 500 m','K1_500');
    expect(component.isTimedCompetition).toBeTrue();
    expect(component.timedUiKey('title')).toBe('cno.title');
    expect(api.timedOverview).toHaveBeenCalledWith(7,119);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.generateSchedule).not.toHaveBeenCalled();

    component.startTeamCreation();
    component.chooseSport('Canoagem Velocidade');
    expect(component.selectedSportCreationModel).toBe('UNAVAILABLE');
    expect(component.isSportFormatSupported).toBeFalse();
  });

  it('creates a real swimming best-time championship only after selecting the event and exact discipline', async () => {
    component.startIndividualCreation();
    component.nameDraft='50 m livres';
    component.chooseSport('Natação');
    expect(component.selectedSportCreationModel).toBe('SWIM_BEST_TIME');
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseTournamentEventType('SWIM_LCM');
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseSwimDiscipline('FREE_100');
    expect(component.isSportFormatSupported).toBeTrue();
    component.chooseSwimDiscipline('FREE_50');
    api.createTimedChampionship.and.returnValue(of({
      ...draft,id:100,name:'50 m livres',sport:'Natação',eventType:'SWIM_LCM',
      eventDiscipline:'FREE_50',scoringMode:'SWIM_BEST_TIME'
    }));
    await component.create();
    expect(api.createTimedChampionship).toHaveBeenCalledOnceWith(7,'50 m livres','FREE_50');
    expect(component.selected?.eventDiscipline).toBe('FREE_50');
    expect(component.isTimedCompetition).toBeTrue();
    expect(api.timedOverview).toHaveBeenCalledWith(7,100);
    expect(api.create).not.toHaveBeenCalled();
    expect(api.generateSchedule).not.toHaveBeenCalled();
  });

  it('creates a 100 m track best-time championship without mixing swim or field results', async () => {
    component.startIndividualCreation();
    component.nameDraft='Campeonato 100 m';
    component.chooseSport('Atletismo');
    component.chooseTournamentEventType('TRACK');
    expect(component.selectedSportCreationModel).toBe('TRACK_BEST_TIME');
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseTrackDiscipline('TRACK_100');
    expect(component.isSportFormatSupported).toBeTrue();
    api.createTrackChampionship.and.returnValue(of({
      ...draft,id:102,name:'Campeonato 100 m',sport:'Atletismo',
      eventType:'TRACK',eventDiscipline:'TRACK_100',scoringMode:'TRACK_BEST_TIME'
    }));
    await component.create();
    expect(api.createTrackChampionship).toHaveBeenCalledOnceWith(7,'Campeonato 100 m','TRACK_100');
    expect(component.isTimedCompetition).toBeTrue();
    expect(api.timedOverview).toHaveBeenCalledOnceWith(7,102);
    expect(api.createTimedChampionship).not.toHaveBeenCalled();
    expect(api.generateSchedule).not.toHaveBeenCalled();
  });

  it('keeps 100 m hurdles separate from flat sprints and relay formats', async () => {
    component.startIndividualCreation();
    component.nameDraft='100 m barreiras';
    component.chooseSport('Atletismo');
    component.chooseTournamentEventType('TRACK');
    expect(component.trackFlatOptions).toContain('TRACK_100');
    expect(component.trackFlatOptions).toContain('TRACK_10000');
    expect(component.trackObstacleOptions).toEqual([
      'TRACK_HURDLES_100','TRACK_HURDLES_110','TRACK_HURDLES_400','TRACK_STEEPLE_3000'
    ]);
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseTrackDiscipline('TRACK_RELAY_4X100');
    expect(component.eventDisciplineDraft).toBeNull();
    component.chooseTrackDiscipline('TRACK_HURDLES_100');
    expect(component.isSportFormatSupported).toBeTrue();
    api.createTrackChampionship.and.returnValue(of({
      ...draft,id:103,name:'100 m barreiras',sport:'Atletismo',
      eventType:'TRACK',eventDiscipline:'TRACK_HURDLES_100',scoringMode:'TRACK_BEST_TIME'
    }));
    await component.create();
    expect(api.createTrackChampionship).toHaveBeenCalledOnceWith(
      7,'100 m barreiras','TRACK_HURDLES_100');
    expect(api.timedOverview).toHaveBeenCalledOnceWith(7,103);
    expect(api.generateSchedule).not.toHaveBeenCalled();
  });

  it('creates athletics championships only after selecting a compatible discipline', async () => {
    component.startIndividualCreation();
    component.nameDraft='Salto em comprimento';
    component.chooseSport('Atletismo');
    expect(component.selectedSportCreationModel).toBe('FIELD_BEST_MARK');
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseTournamentEventType('TRACK');
    expect(component.savedSportEventType).toBe('TRACK');
    component.chooseTournamentEventType('JUMP');
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseFieldDiscipline('LONG_JUMP');
    expect(component.isSportFormatSupported).toBeTrue();
    api.createMeasuredChampionship.and.returnValue(of({
      ...draft,id:101,name:'Salto em comprimento',sport:'Atletismo',
      eventType:'JUMP',eventDiscipline:'LONG_JUMP',scoringMode:'FIELD_BEST_MARK'
    }));
    await component.create();
    expect(api.createMeasuredChampionship).toHaveBeenCalledOnceWith(
      7,'Salto em comprimento','JUMP','LONG_JUMP');
    expect(component.isMeasuredCompetition).toBeTrue();
    expect(api.measuredOverview).toHaveBeenCalledOnceWith(7,101);
    expect(api.generateSchedule).not.toHaveBeenCalled();
  });

  it('never submits athletics metre marks through race or 1-vs-1 endpoints', async () => {
    component.selected={...draft,id:101,sport:'Atletismo',eventType:'JUMP',
      eventDiscipline:'LONG_JUMP',scoringMode:'FIELD_BEST_MARK'};
    const data={
      tournamentId:101,eventType:'JUMP',eventDiscipline:'LONG_JUMP',
      linkedRounds:[],availableRounds:[],
      standings:[{position:1,communityPlayerId:10,profileId:null,username:'ana',
        fullName:'Ana',bestMetres:7.25,validMarks:2}]
    };
    api.linkMeasuredRound.and.returnValue(of(data));
    await component.linkMeasuredRound(31);
    expect(api.linkMeasuredRound).toHaveBeenCalledOnceWith(7,101,31);
    expect(component.measuredOverview?.standings[0].bestMetres).toBe(7.25);
    expect(api.linkRace).not.toHaveBeenCalled();
    expect(api.recordResult).not.toHaveBeenCalled();
  });

  it('uses swimming round results without exposing race-position points', async () => {
    component.selected={...draft,id:100,sport:'Natação',eventType:'SWIM_LCM',
      eventDiscipline:'FREE_50',scoringMode:'SWIM_BEST_TIME'};
    const data={
      tournamentId:100,eventType:'SWIM_LCM',eventDiscipline:'FREE_50',
      linkedRounds:[],availableRounds:[],
      standings:[{position:1,communityPlayerId:10,profileId:null,username:'ana',
        fullName:'Ana',bestSeconds:28.47,validAttempts:2}]
    };
    api.linkTimedRound.and.returnValue(of(data));
    await component.linkTimedRound(31);
    expect(api.linkTimedRound).toHaveBeenCalledOnceWith(7,100,31);
    expect(component.timedOverview?.standings[0].bestSeconds).toBe(28.47);
    expect(api.linkRace).not.toHaveBeenCalled();
    expect(api.recordResult).not.toHaveBeenCalled();
  });

  it('keeps tournament and fixtures semantics unchanged by the layout update', () => {
    expect(component.community.id).toBe(7);
    expect(component.tournaments.length).toBeGreaterThan(0);
    expect(component.tournaments[0].id).toBe(9);
  });

  it('translates organizer validation feedback without submitting invalid team tournaments', async () => {
    const previous = localStorage.getItem('d24-language');
    try {
      component.startTeamCreation();
      component.nameDraft = 'A';
      localStorage.setItem('d24-language', 'en');
      await component.createTeamCompetition();
      expect(component.error).toBe('Enter a name between 2 and 120 characters.');
      expect(api.createTeamTournament).not.toHaveBeenCalled();

      localStorage.setItem('d24-language', 'pt');
      await component.createTeamCompetition();
      expect(component.error).toBe('Indica um nome entre 2 e 120 caracteres.');
      expect(api.createTeamTournament).not.toHaveBeenCalled();

      localStorage.setItem('d24-language', 'en');
      component.nameDraft = 'A valid tournament';
      component.sportDraft = 'Modalidade inexistente';
      await component.createTeamCompetition();
      expect(component.error).toBe('Choose a valid sport for the tournament.');
      expect(api.createTeamTournament).not.toHaveBeenCalled();
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('shows localized individual creation success after the selected tournament changes', async () => {
    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'en');
      component.startIndividualCreation();
      component.nameDraft = 'Autumn QA League';
      component.sportDraft = 'Futebol';
      api.create.and.returnValue(of({ ...draft, sport: 'Futebol', name: 'Autumn QA League' }));
      await component.create();
      expect(api.create).toHaveBeenCalled();
      expect(component.feedback).toBe('Tournament created.');
      expect(component.selected?.name).toBe('Autumn QA League');
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('shows a single selected sport and preserves it until the replacement is picked', () => {
    expect(component.sportDraft).toBe('Futebol');
    expect(component.editingSport).toBeFalse();
    expect(component.showCommunitySportShortcuts).toBeFalse();

    component.startTeamCreation();
    component.toggleSportEditor();
    expect(component.editingSport).toBeTrue();
    expect(component.sportDraft).toBe('Futebol');

    component.sportSearch = 'kar';
    component.toggleSportEditor(); // Cancel keeps the current selection.
    expect(component.editingSport).toBeFalse();
    expect(component.sportSearch).toBe('');
    expect(component.sportDraft).toBe('Futebol');

    component.toggleSportEditor();
    component.chooseSport('Karting');
    expect(component.sportDraft).toBe('Karting');
    expect(component.editingSport).toBeFalse();
    expect(component.sportSearch).toBe('');

    component.startIndividualCreation();
    expect(component.sportDraft).toBe('Karting');
    expect(component.editingSport).toBeFalse();

    // After selecting Karting, Futebol must not appear again as an
    // unlabelled quick suggestion when the editor is opened.
    component.toggleSportEditor();
    expect(component.showCommunitySportShortcuts).toBeFalse();
    expect(component.suggestedSports).toEqual([]);
    component.toggleSportEditor();
    expect(component.sportDraft).toBe('Karting');

    // Before any sport is chosen, community sports remain helpful shortcuts.
    component.sportDraft = '';
    expect(component.showCommunitySportShortcuts).toBeTrue();
  });

  it('prioritizes exact and prefix sport matches before imported substring matches', () => {
    component.community = {
      ...community,
      sport: 'Mini Karting',
      sports: ['Mini Karting', 'Super Karting', 'Karting de Rua', 'Karting']
    };
    component.sportSearch = '  KÁRTING  ';
    expect(component.suggestedSports[0]).toBe('Karting');
    expect(component.suggestedSports.slice(1)).toEqual([
      'Karting de Rua', 'Mini Karting', 'Super Karting'
    ]);

    component.sportSearch = 'kart';
    expect(component.suggestedSports.slice(0, 2)).toEqual(['Karting de Rua', 'Karting']);
    expect(component.suggestedSports).toContain('Mini Karting');
    expect(component.suggestedSports).toContain('Super Karting');

    component.sportSearch = '  ';
    expect(component.suggestedSports).toEqual([]);
  });

  it('keeps multiple community sports selectable in the change editor without changing the current choice', () => {
    component.community = {
      ...community, sport: 'Futebol', sports: ['Futebol', 'Karting', 'Natação']
    };
    component.sportDraft = 'Futebol';
    component.editingSport = false;
    expect(component.showCommunitySportShortcuts).toBeFalse();

    component.toggleSportEditor();
    expect(component.showCommunitySportShortcuts).toBeTrue();
    expect(component.communitySportOptions).toEqual(['Futebol', 'Karting', 'Natação']);
    expect(component.sportDraft).toBe('Futebol');

    component.chooseSport('Karting');
    expect(component.sportDraft).toBe('Karting');
    expect(component.editingSport).toBeFalse();
    expect(component.showCommunitySportShortcuts).toBeFalse();
    expect(component.selectedSportCreationModel).toBe('RACE_POINTS');

    component.startIndividualCreation();
    component.toggleSportEditor();
    expect(component.showCommunitySportShortcuts).toBeTrue();
    component.toggleSportEditor();
    expect(component.sportDraft).toBe('Karting');

    component.community = { ...community, sport: 'Futebol', sports: ['Futebol'] };
    component.toggleSportEditor();
    expect(component.showCommunitySportShortcuts).toBeFalse();
  });

  it('expands and collapses community shortcuts without losing the selected sport', () => {
    const sports = ['Futebol', 'Karting', 'Natação', 'Padel', 'Xadrez',
      'Atletismo', 'Voleibol', 'Basquetebol'];
    component.community = { ...community, sport: 'Futebol', sports };
    component.sportDraft = 'Futebol';
    component.toggleSportEditor();

    expect(component.showCommunitySportShortcuts).toBeTrue();
    expect(component.visibleCommunitySportOptions).toEqual(sports.slice(0, 6));
    expect(component.expandedCommunitySports).toBeFalse();

    component.toggleCommunitySportOptions();
    expect(component.visibleCommunitySportOptions).toEqual(sports);
    expect(component.sportDraft).toBe('Futebol');

    component.chooseSport('Voleibol');
    expect(component.sportDraft).toBe('Voleibol');
    expect(component.expandedCommunitySports).toBeFalse();

    component.toggleSportEditor();
    component.toggleCommunitySportOptions();
    expect(component.visibleCommunitySportOptions).toEqual(sports);
    component.toggleCommunitySportOptions();
    expect(component.visibleCommunitySportOptions).toEqual(sports.slice(0, 6));
    component.toggleSportEditor();
    expect(component.sportDraft).toBe('Voleibol');

    component.community = { ...community, sport: 'Futebol', sports: ['Futebol'] };
    component.expandedCommunitySports = false;
    component.toggleCommunitySportOptions();
    expect(component.expandedCommunitySports).toBeFalse();
    expect(component.visibleCommunitySportOptions).toEqual(['Futebol']);
  });

  it('shows truthful sport readiness: supported, needs event/discipline or unavailable', () => {
    component.startIndividualCreation();
    component.chooseSport('Karting');
    expect(component.creationReadiness).toBe('READY');
    expect(component.creationReadinessLabelKey).toBe('communities.tournaments.capabilities.partialAvailable');

    component.chooseSport('Atletismo');
    expect(component.creationReadiness).toBe('EVENT_REQUIRED');
    component.chooseTournamentEventType('TRACK');
    expect(component.selectedSportCreationModel).toBe('TRACK_BEST_TIME');
    expect(component.creationReadiness).toBe('DISCIPLINE_REQUIRED');
    component.chooseTrackDiscipline('TRACK_100');
    expect(component.creationReadiness).toBe('READY');
    expect(component.creationSportNoticeKey).toBeNull();

    component.chooseSport('Natação');
    expect(component.creationReadiness).toBe('EVENT_REQUIRED');
    component.chooseTournamentEventType('SWIM_LCM');
    expect(component.creationReadiness).toBe('DISCIPLINE_REQUIRED');
    component.chooseSwimDiscipline('FREE_50');
    expect(component.creationReadiness).toBe('READY');

    component.chooseSport('Triatlo');
    expect(component.creationReadiness).toBe('UNAVAILABLE');
    expect(component.creationSportNoticeKey).toBe('communities.tournaments.creationRaceNotice');

    component.chooseSport('Futebol');
    expect(component.creationReadiness).toBe('READY');
  });

  it('asks for a relay event rather than an individual race distance', () => {
    component.startTeamCreation();
    component.chooseSport('Atletismo');
    component.chooseTournamentEventType('TRACK_RELAY');
    expect(component.creationReadiness).toBe('DISCIPLINE_REQUIRED');
    expect(component.creationReadinessLabelKey).toBe('communities.relayTournament.disciplineTitle');
    component.chooseRelayDiscipline('RELAY_4X100');
    expect(component.creationReadiness).toBe('READY');
  });

  it('respects the relay-only league format and four-runner discipline', () => {
    component.startTeamCreation();
    component.chooseSport('Atletismo');
    expect(component.creationReadiness).toBe('EVENT_REQUIRED');
    component.chooseTournamentEventType('TRACK_RELAY');
    expect(component.creationReadiness).toBe('DISCIPLINE_REQUIRED');
    component.chooseRelayDiscipline('RELAY_4X400');
    expect(component.creationReadiness).toBe('READY');

    component.teamFormatDraft = 'KNOCKOUT';
    expect(component.creationReadiness).toBe('LEAGUE_REQUIRED');
    expect(component.isSportFormatSupported).toBeFalse();
  });

  it('explains when sport-specific race or combat results need community rounds', () => {
    component.sportDraft = 'Futebol';
    expect(component.creationSportNoticeKey).toBeNull();

    component.chooseSport('Karting');
    expect(component.creationSportNoticeKey).toBeNull();

    component.chooseSport('Judo');
    expect(component.creationSportNoticeKey).toBe('communities.tournaments.creationDuelNotice');

    component.chooseSport('Golfe');
    expect(component.creationSportNoticeKey).toBe('communities.tournaments.creationPerformanceNotice');

    component.sportDraft = '';
    expect(component.creationSportNoticeKey).toBeNull();
  });

  it('shows classification family guidance in the selected language without changing supported formats', () => {
    const previous = localStorage.getItem('d24-language');
    const cases: Array<[string, string, string, boolean]> = [
      ['Xadrez', 'Chess scoring', 'Pontuação de Xadrez', true],
      ['Karting', 'Race standings', 'Classificação por corridas', false],
      ['Atletismo', 'Time and measurement standings', 'Classificação por marcas e tempos', false],
      ['Surf', 'Judged-event standings', 'Classificação por notas de júri', false],
      ['Golfe', 'Event-score standings', 'Classificação por resultado de prova', false],
      ['Yoga', 'Activity without defined competitive standings', 'Atividade sem classificação competitiva definida', false],
      ['Modalidade inexistente', 'Sport without verified tournament rules', 'Modalidade sem regras de torneio verificadas', false],
      ['Judo', 'Individual head-to-head standings', 'Classificação por confrontos individuais', true],
      ['Futebol', 'Win, draw and loss standings', 'Classificação por vitórias, empates e derrotas', true]
    ];
    try {
      component.startIndividualCreation();
      for (const [sport, english, portuguese, supported] of cases) {
        component.sportDraft = sport;
        localStorage.setItem('d24-language', 'en');
        const en = component.classificationProfile;
        expect(en.heading).withContext(sport).toBe(english);
        expect(en.detail).withContext(sport).not.toContain('Classificação');
        expect(en.fields).withContext(sport).toBeTruthy();
        expect(en.isRoundRobinSupported).withContext(sport).toBe(supported);
        expect(en.pointRules).withContext(sport).toEqual(sport === 'Xadrez'
          ? { winPoints: 2, drawPoints: 1, lossPoints: 0 }
          : { winPoints: 3, drawPoints: 1, lossPoints: 0 });
        localStorage.setItem('d24-language', 'pt');
        const pt = component.classificationProfile;
        expect(pt.heading).withContext(sport).toBe(portuguese);
        expect(pt.isRoundRobinSupported).withContext(sport).toBe(supported);
        expect(pt.pointRules).withContext(sport).toEqual(en.pointRules);
      }
      component.startTeamCreation();
      component.chooseSport('Xadrez');
      expect(component.isSportFormatSupported).toBeFalse();
      localStorage.setItem('d24-language', 'en');
      expect(component.sportFormatWarning).toContain('chess');
      localStorage.setItem('d24-language', 'pt');
      expect(component.sportFormatWarning).toContain('tabuleiro');
      expect(component.raceSportLabel(null)).toBe('Corridas');
      localStorage.setItem('d24-language', 'en');
      expect(component.raceSportLabel(null)).toBe('Races');
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
    expect(api.create).not.toHaveBeenCalled();
    expect(api.createTeamTournament).not.toHaveBeenCalled();
  });

  it('creates a Karting championship instead of fake head-to-head fixtures', async () => {
    component.startIndividualCreation();
    component.nameDraft = 'Campeonato Karting';
    component.chooseSport('Karting');
    expect(component.classificationProfile.heading).toContain('corridas');
    expect(component.classificationProfile.isRoundRobinSupported).toBeFalse();
    expect(component.isSportFormatSupported).toBeTrue();
    api.createRaceChampionship.and.returnValue(of({
      ...draft, id: 19, name: 'Campeonato Karting', sport: 'Karting', scoringMode: 'RACE_POINTS'
    }));
    await component.create();
    expect(api.createRaceChampionship).toHaveBeenCalledOnceWith(7, 'Campeonato Karting', 'Karting');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.matches).not.toHaveBeenCalledWith(7, 19, 0);
    expect(api.raceOverview).toHaveBeenCalledWith(7, 19);
    expect(component.isRaceCompetition).toBeTrue();

    component.startIndividualCreation();
    component.chooseSport('Xadrez');
    expect(component.classificationProfile.scoringMode).toBe('CHESS_HALF_POINTS');
    expect(component.pointRulesDraft).toEqual({
      winPoints: 2, drawPoints: 1, lossPoints: 0
    });
    component.chooseSport('Futebol');
    expect(component.pointRulesDraft).toEqual({
      winPoints: 3, drawPoints: 1, lossPoints: 0
    });
  });

  it('creates BMX Racing as a proper race championship, not a fictional duel', async () => {
    component.startIndividualCreation();
    component.nameDraft = 'Taça BMX Racing';
    component.chooseSport('BMX');
    expect(component.isRaceChampionshipDraft).toBeTrue();
    expect(component.raceSportLabel('BMX')).toBe('BMX Racing');
    expect(component.classificationProfile.isRoundRobinSupported).toBeFalse();
    api.createRaceChampionship.and.returnValue(of({
      ...draft, id: 40, name: 'Taça BMX Racing', sport: 'BMX', scoringMode: 'RACE_POINTS'
    }));
    await component.create();
    expect(api.createRaceChampionship).toHaveBeenCalledOnceWith(7, 'Taça BMX Racing', 'BMX');
    expect(api.create).not.toHaveBeenCalled();
    expect(api.raceOverview).toHaveBeenCalledWith(7, 40);
    expect(component.selected?.sport).toBe('BMX');

    component.startTeamCreation();
    component.chooseSport('BMX');
    expect(component.isRaceChampionshipDraft).toBeFalse();
    expect(component.isSportFormatSupported).toBeFalse();
  });

  it('creates motorsport championships using real positions, not numeric football fixtures', async () => {
    for (const [index, sport] of (['Automobilismo', 'Motociclismo', 'Motocross'] as const).entries()) {
      component.startIndividualCreation();
      component.nameDraft = 'Campeonato ' + sport;
      component.chooseSport(sport);
      expect(component.isRaceChampionshipDraft).toBeTrue();
      expect(component.isSportFormatSupported).toBeTrue();
      expect(component.creationReadiness).toBe('READY');
      expect(component.selectedSportCreationModel).toBe('RACE_POINTS');
      expect(component.sportEventChoices).toEqual([]);

      const id = 300 + index;
      api.createRaceChampionship.and.returnValue(of({
        ...draft, id, name: 'Campeonato ' + sport, sport, scoringMode: 'RACE_POINTS'
      }));
      await component.create();
      expect(api.createRaceChampionship).toHaveBeenCalledWith(7, 'Campeonato ' + sport, sport);
      expect(api.raceOverview).toHaveBeenCalledWith(7, id);
    }
    expect(api.create).not.toHaveBeenCalled();
    for (const id of [300, 301, 302])
      expect(api.matches).not.toHaveBeenCalledWith(7, id, 0);
    component.startTeamCreation();
    component.chooseSport('Motocross');
    expect(component.isSportFormatSupported).toBeFalse();
    expect(component.selectedSportCreationModel).toBe('UNAVAILABLE');
  });

  it('creates running, trail, obstacles and powerboat circuits only from race positions', async () => {
    for (const [index, sport] of (['Corrida', 'Trail Running', 'Corrida de obstáculos', 'Motonáutica'] as const).entries()) {
      component.startIndividualCreation();
      component.nameDraft = 'Circuito ' + sport;
      component.chooseSport(sport);
      expect(component.isRaceChampionshipDraft).toBeTrue();
      expect(component.selectedSportCreationModel).toBe('RACE_POINTS');
      expect(component.creationReadiness).toBe('READY');
      expect(component.sportEventChoices).toEqual([]);

      const id = 410 + index;
      api.createRaceChampionship.and.returnValue(of({
        ...draft, id, name: 'Circuito ' + sport, sport, scoringMode: 'RACE_POINTS'
      }));
      await component.create();
      expect(api.createRaceChampionship).toHaveBeenCalledWith(7, 'Circuito ' + sport, sport);
      expect(api.raceOverview).toHaveBeenCalledWith(7, id);
      expect(api.matches).not.toHaveBeenCalledWith(7, id, 0);
    }
    expect(api.create).not.toHaveBeenCalled();
    component.startTeamCreation();
    component.chooseSport('Motonáutica');
    expect(component.isSportFormatSupported).toBeFalse();
  });

  it('creates Ciclismo, Mountain Bike and Ciclocrosse championships using recorded race positions', async () => {
    for (const [index, sport] of (['Ciclismo', 'Mountain Bike', 'Ciclocrosse', 'Ciclismo de Estrada', 'Ciclismo de Pista'] as const).entries()) {
      component.startIndividualCreation();
      component.nameDraft = 'Campeonato ' + sport;
      component.chooseSport(sport);
      expect(component.classificationProfile.format).toBe('race');
      expect(component.isRaceChampionshipDraft).toBeTrue();
      expect(component.raceSportLabel(sport)).toBe(sport);
      const id = 42 + index;
      api.createRaceChampionship.and.returnValue(of({
        ...draft, id, name: 'Campeonato ' + sport, sport, scoringMode: 'RACE_POINTS'
      }));
      await component.create();
      expect(api.createRaceChampionship).toHaveBeenCalledWith(7, 'Campeonato ' + sport, sport);
      expect(api.raceOverview).toHaveBeenCalledWith(7, id);
      expect(component.selected?.sport).toBe(sport);
    }
    expect(api.create).not.toHaveBeenCalled();
    expect(api.createRaceChampionship).toHaveBeenCalledTimes(5);
  });

  it('shows lap columns only for races that really have lap metrics', () => {
    const entry = {
      communityPlayerId: 11, fullName: 'Ana', finishPosition: 1,
      elapsedSeconds: 120.5, bestLapSeconds: null, lapsCompleted: null,
      racePenaltyPoints: 0, raceDisqualified: false
    };
    expect(component.hasRaceLaps([entry])).toBeFalse();
    expect(component.hasRaceBestLap([entry])).toBeFalse();
    expect(component.hasRaceLaps([{ ...entry, lapsCompleted: 3 }])).toBeTrue();
    expect(component.hasRaceBestLap([{ ...entry, bestLapSeconds: 45.55 }])).toBeTrue();
    expect(component.hasRaceLaps([{ ...entry, lapsCompleted: -1 }])).toBeFalse();
    expect(component.hasRaceLaps([{ ...entry, lapsCompleted: 2.5 }])).toBeFalse();
    expect(component.hasRaceLaps([{ ...entry, lapsCompleted: Infinity }])).toBeFalse();
    expect(component.hasRaceLaps([{ ...entry, lapsCompleted: 0 }])).toBeTrue();
    expect(component.hasRaceBestLap([{ ...entry, bestLapSeconds: -1 }])).toBeFalse();
    expect(component.hasRaceBestLap([{ ...entry, bestLapSeconds: NaN }])).toBeFalse();
    expect(component.hasRaceBestLap([{ ...entry, bestLapSeconds: Infinity }])).toBeFalse();
    expect(component.hasRaceBestLap([{ ...entry, bestLapSeconds: 0 }])).toBeFalse();
    expect(component.hasRaceLaps([])).toBeFalse();
    expect(component.hasRaceBestLap([])).toBeFalse();
  });

  it('does not offer cycling race championships as team or specialised event formats', () => {
    for (const sport of ['Ciclismo', 'Mountain Bike', 'Ciclocrosse', 'Ciclismo de Estrada', 'Ciclismo de Pista']) {
      component.startTeamCreation();
      component.chooseSport(sport);
      expect(component.isRaceChampionshipDraft).toBeFalse();
      expect(component.isSportFormatSupported).toBeFalse();
    }
    component.startIndividualCreation();
    for (const sport of ['Canoagem', 'Triatlo']) {
      component.chooseSport(sport);
      expect(component.isRaceChampionshipDraft).toBeFalse();
      expect(component.isSportFormatSupported).toBeFalse();
    }
  });

  it('does not enable race championships for unsupported event rules', () => {
    component.startIndividualCreation();
    for (const sport of ['Natação', 'Snowboard', 'Atletismo', 'Futebol']) {
      component.chooseSport(sport);
      expect(component.isRaceChampionshipDraft).toBeFalse();
    }
  });

  it('links a Karting race and reads race standings without duel endpoints', async () => {
    component.selected = { ...draft, id: 19, sport: 'Karting', scoringMode: 'RACE_POINTS' };
    const data = {
      tournamentId: 19, pointsByPlace: [25, 18, 15],
      linkedRaces: [{ id: 30, name: 'Corrida 1', sport: 'Karting',
        playedAt: '2026-10-24T10:00:00Z', entries: [] }],
      availableRaces: [],
      standings: [{ position: 1, playerId: 11, fullName: 'Ana', races: 1,
        wins: 1, podiums: 1, bestFinish: 1, championshipPoints: 25, penaltyPoints: 0 }]
    };
    api.linkRace.and.returnValue(of(data));
    await component.linkTournamentRace(30);
    expect(api.linkRace).toHaveBeenCalledWith(7, 19, 30);
    expect(component.raceOverview?.standings[0].championshipPoints).toBe(25);
    expect(component.selected.status).toBe('IN_PROGRESS');
    expect(api.generateSchedule).not.toHaveBeenCalled();
  });

  it('accepts valid Karting points, including spaces around descending positions', async () => {
    const original = {
      tournamentId: 19, pointsByPlace: [25, 18, 15],
      linkedRaces: [], availableRaces: [], standings: []
    };
    component.selected = { ...draft, id: 19, sport: 'Karting', scoringMode: 'RACE_POINTS' };
    component.raceOverview = original;
    component.racePointsDraft = '25, 18, 15, 12, 10';
    api.setRacePoints.and.returnValue(of({
      ...original, pointsByPlace: [25, 18, 15, 12, 10]
    }));

    await component.saveRacePoints();

    expect(api.setRacePoints).toHaveBeenCalledOnceWith(7, 19, '25, 18, 15, 12, 10');
    expect(component.racePointsDraft).toBe('25,18,15,12,10');
    expect(component.raceOverview?.pointsByPlace).toEqual([25, 18, 15, 12, 10]);
  });

  it('rejects invalid Karting positions locally without calling the API', async () => {
    const current = {
      tournamentId: 19, pointsByPlace: [25, 18, 15],
      linkedRaces: [], availableRaces: [], standings: []
    };
    component.selected = { ...draft, id: 19, sport: 'Karting', scoringMode: 'RACE_POINTS' };
    component.raceOverview = current;
    const invalid = ['25,18.5,15', '25,abc,15', '25,-1', '18,25',
      '1001,25', '25,,15', '25,18,', '', Array(21).fill('1').join(',')];

    for (const input of invalid) {
      component.racePointsDraft = input;
      await component.saveRacePoints();
      expect(api.setRacePoints).not.toHaveBeenCalled();
      expect(component.error).toContain('pontos inteiros decrescentes');
    }
  });

  it('locks Karting points after associating the first race or starting the competition', async () => {
    const linked = {
      tournamentId: 19, pointsByPlace: [25, 18, 15], availableRaces: [],
      linkedRaces: [{
        id: 30, name: 'Corrida 1', sport: 'Karting',
        playedAt: '2026-10-24T10:00:00Z', entries: []
      }], standings: []
    };
    component.selected = { ...draft, id: 19, sport: 'Karting', scoringMode: 'RACE_POINTS' };
    component.raceOverview = linked;
    component.racePointsDraft = '30,20,10';
    await component.saveRacePoints();
    expect(api.setRacePoints).not.toHaveBeenCalled();

    component.raceOverview = { ...linked, linkedRaces: [] };
    component.selected = { ...component.selected, status: 'IN_PROGRESS' };
    await component.saveRacePoints();
    expect(api.setRacePoints).not.toHaveBeenCalled();
  });

  it('only allows closing Karting with recorded races and classified drivers', async () => {
    component.selected = { ...draft, id: 19, sport: 'Karting',
      status: 'IN_PROGRESS', scoringMode: 'RACE_POINTS' };
    component.raceOverview = {
      tournamentId: 19, pointsByPlace: [25, 18],
      linkedRaces: [], availableRaces: [], standings: []
    };
    expect(component.canCompleteRace).toBeFalse();
    component.confirmAction = 'completeRace';
    await component.completeRace();
    expect(api.completeRaceChampionship).not.toHaveBeenCalled();
    component.raceOverview.linkedRaces = [{
      id: 30, name: 'Karting 1', sport: 'Karting',
      playedAt: '2026-10-24T12:00:00Z', entries: []
    }];
    component.raceOverview.standings = [
      { position: 1, playerId: 10, fullName: 'Ana', races: 1,
        wins: 1, podiums: 1, bestFinish: 1, championshipPoints: 25, penaltyPoints: 0 },
      { position: 2, playerId: 11, fullName: 'Rui', races: 1,
        wins: 0, podiums: 1, bestFinish: 2, championshipPoints: 18, penaltyPoints: 0 }
    ];
    expect(component.canCompleteRace).toBeTrue();
    api.completeRaceChampionship.and.returnValue(of({ ...component.selected,
      status: 'COMPLETED', championProfileId: 10, championDisplayName: 'Ana',
      championPoints: 25, completedAt: '2026-10-24T13:00:00Z' }));
    component.confirmAction = 'completeRace';
    await component.completeRace();
    expect(api.completeRaceChampionship).toHaveBeenCalledOnceWith(7, 19);
    expect(component.selected?.championDisplayName).toBe('Ana');
    expect(component.selected?.status).toBe('COMPLETED');
    expect(component.confirmAction).toBeNull();
    expect(component.canCompleteRace).toBeFalse();
    expect(api.raceOverview).toHaveBeenCalledWith(7, 19);
  });

  it('never closes a duel tournament via the Karting endpoint', async () => {
    component.selected = { ...draft, status: 'IN_PROGRESS', sport: 'Xadrez',
      scoringMode: 'CHESS_HALF_POINTS' };
    component.confirmAction = 'completeRace';
    await component.completeRace();
    expect(api.completeRaceChampionship).not.toHaveBeenCalled();
  });

  it('shows a frozen Karting podium using official finishing ranks, including shared first place', () => {
    component.selected = { ...draft, id: 19, sport: 'Karting', scoringMode: 'RACE_POINTS',
      status: 'COMPLETED', championTied: true, completedAt: '2026-10-24T13:00:00Z' };
    component.raceOverview = {
      tournamentId: 19, pointsByPlace: [25, 18], linkedRaces: [], availableRaces: [],
      standings: [
        { position: 3, playerId: 15, fullName: 'João', races: 2, wins: 0,
          podiums: 1, bestFinish: 3, championshipPoints: 21, penaltyPoints: 0 },
        { position: 1, playerId: 11, fullName: 'Rui', races: 2, wins: 1,
          podiums: 2, bestFinish: 1, championshipPoints: 43, penaltyPoints: 0 },
        { position: 1, playerId: 10, fullName: 'Ana', races: 2, wins: 1,
          podiums: 2, bestFinish: 1, championshipPoints: 43, penaltyPoints: 0 },
        { position: 4, playerId: 12, fullName: 'Beatriz', races: 2, wins: 0,
          podiums: 1, bestFinish: 3, championshipPoints: 12, penaltyPoints: 0 }
      ]
    };
    expect(component.finalKartingPodium.map(driver => driver.position)).toEqual([1, 1, 3]);
    expect(component.finalKartingPodium.map(driver => driver.fullName))
      .toEqual(['Ana', 'Rui', 'João']);
    component.selected = { ...component.selected, status: 'IN_PROGRESS' };
    expect(component.finalKartingPodium).toEqual([]);
    component.selected = { ...draft, status: 'COMPLETED', scoringMode: 'CHESS_HALF_POINTS' };
    expect(component.finalKartingPodium).toEqual([]);
  });

  it('lists only finished Karting championships in reverse date order, preserving historical ties', () => {
    const older = { ...draft, id: 30, name: 'Taça primavera',
      sport: 'Karting', scoringMode: 'RACE_POINTS' as const,
      status: 'COMPLETED' as const, completedAt: '2026-04-10T12:00:00Z',
      championDisplayName: 'Ana', championTied: false };
    const newer = { ...older, id: 31, name: 'Taça outono',
      completedAt: '2026-10-12T12:00:00Z', championDisplayName: null, championTied: true };
    component.tournaments = [
      older, { ...draft, id: 32, sport: 'Karting', scoringMode: 'RACE_POINTS' },
      { ...draft, id: 33, sport: 'Futebol', status: 'COMPLETED' },
      newer,
      { ...older, id: 34, name: 'BMX Summer Racing', sport: 'BMX',
        completedAt: '2026-08-10T12:00:00Z', championDisplayName: 'Rui' }
    ];
    expect(component.hasKartingCompetitions).toBeTrue();
    expect(component.kartingPalmares.map(tournament => tournament.id)).toEqual([31, 34, 30]);
    expect(component.kartingPalmares[0].championTied).toBeTrue();
    expect(component.kartingPalmares[1].championDisplayName).toBe('Rui');
    expect(component.kartingPalmares[2].championDisplayName).toBe('Ana');

    component.tournaments = [];
    expect(component.hasKartingCompetitions).toBeFalse();
    expect(component.kartingPalmares).toEqual([]);
  });

  it('does not present individual chess rules as a team-board tournament', async () => {
    component.chooseSport('Xadrez');
    component.startTeamCreation();
    component.nameDraft = 'Torneio por equipas';
    expect(component.isSportFormatSupported).toBeFalse();
    expect(component.sportFormatWarning).toContain('tabuleiro');
    await component.createTeamCompetition();
    expect(api.createTeamTournament).not.toHaveBeenCalled();
  });

  it('creates a chess competition with a saved half-point scoring mode', async () => {
    component.startIndividualCreation();
    component.nameDraft = 'Liga de Xadrez';
    component.chooseSport('Xadrez');
    api.create.and.returnValue(of({ ...draft, sport: 'Xadrez',
      scoringMode: 'CHESS_HALF_POINTS', winPoints: 2, drawPoints: 1 }));
    await component.create();
    expect(api.create).toHaveBeenCalledOnceWith(
      7, 'Liga de Xadrez', 'Xadrez', { winPoints: 2, drawPoints: 1, lossPoints: 0 },
      'CHESS_HALF_POINTS'
    );
    expect(component.isChessTournament).toBeTrue();
    expect(component.formatTournamentPoints(3)).toBe('1,5');
  });

  it('accepts only proper chess match outcomes for new chess tournaments', () => {
    const game: TournamentMatch = { id: 81, roundNumber: 1, homeProfileId: 1,
      homeUsername: 'ana', awayProfileId: 2, awayUsername: 'bruno',
      status: 'SCHEDULED', homeScore: null, awayScore: null };
    component.selected = { ...draft, sport: 'Xadrez', scoringMode: 'CHESS_HALF_POINTS',
      status: 'IN_PROGRESS', winPoints: 2, drawPoints: 1 };
    expect(component.validTournamentScore(game)).toBeFalse();
    component.setChessOutcome(game, 'DRAW');
    expect(component.validTournamentScore(game)).toBeTrue();
    expect(component.chessOutcome(game)).toBe('DRAW');
    expect(component.displayTournamentResult({ ...game, homeScore: 0, awayScore: 0 })).toBe('½ – ½');
    component.setScore(game, 'home', 7);
    expect(component.validTournamentScore(game)).toBeFalse();
    component.setChessOutcome(game, 'BLACK');
    expect(component.validTournamentScore(game)).toBeTrue();
  });

  describe('real team competitions', () => {
    const teamDraft: CommunityTournament = {
      ...draft, id: 19, name: 'Torneio CNG 5x5', sport: 'Futebol',
      entryType: 'TEAM', playersPerTeam: 5
    };
    const team: TournamentTeam = {
      id: 40, name: 'Verdes', playersPerTeam: 5, createdAt: '2026-10-17T12:00:00Z', players: []
    };
    const members = [
      { profileId: 1, username: 'owner', fullName: 'Organizador', profilePicUrl: null, role: 'OWNER' as const },
      { profileId: 2, username: 'ana', fullName: 'Ana', profilePicUrl: null, role: 'MEMBER' as const },
      { profileId: 3, username: 'bruno', fullName: 'Bruno', profilePicUrl: null, role: 'MEMBER' as const }
    ];

    it('builds profile links only for players with a usable username', () => {
      expect(component.teamPlayerProfileUsername('ana')).toBe('ana');
      expect(component.teamPlayerProfileUsername('  Ana-PT  ')).toBe('Ana-PT');
      expect(component.teamPlayerProfileUsername('')).toBeNull();
      expect(component.teamPlayerProfileUsername('   ')).toBeNull();
      expect(component.teamPlayerProfileUsername(null)).toBeNull();
      expect(component.teamPlayerProfileUsername(undefined)).toBeNull();
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('uses trimmed direct-message recipients and never links to the current user', () => {
      component.selectTournament(teamDraft);
      expect(component.teamPlayerMessageRecipient('  Ana  ')).toBe('Ana');
      expect(component.teamPlayerMessageRecipient('bruno')).toBe('bruno');
      expect(component.teamPlayerMessageRecipient(' OWNER ')).toBeNull();
      expect(component.teamPlayerMessageRecipient('')).toBeNull();
      expect(component.teamPlayerMessageRecipient('   ')).toBeNull();
      expect(component.teamPlayerMessageRecipient(null)).toBeNull();
      expect(component.teamPlayerMessageRecipient(undefined)).toBeNull();
      expect(component.canMessageTeamPlayer('  Ana  ')).toBeTrue();
      expect(component.canMessageTeamPlayer(' OWNER ')).toBeFalse();
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('offers private messages only to other identified team players', () => {
      component.selectTournament(teamDraft);
      expect(component.canMessageTeamPlayer('ana')).toBeTrue();
      expect(component.canMessageTeamPlayer('Bruno')).toBeTrue();
      expect(component.canMessageTeamPlayer('owner')).toBeFalse();
      expect(component.canMessageTeamPlayer(' OWNER ')).toBeFalse();
      expect(component.canMessageTeamPlayer('')).toBeFalse();
      expect(component.canMessageTeamPlayer('   ')).toBeFalse();
      expect(component.canMessageTeamPlayer(null)).toBeFalse();
      expect(component.canMessageTeamPlayer(undefined)).toBeFalse();
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('labels team scoring by sport rather than treating every competition as football', () => {
      const examples: Array<[string,string,string,string]> = [
        ['Futebol', 'GM', 'GS', 'DG'],
        ['Basquetebol', 'PM', 'PS', 'DP'],
        ['Voleibol', 'SG', 'SP', 'DS'],
        ['Karting', 'MF', 'MC', 'DM']
      ];
      for (const [sport, scoreFor, scoreAgainst, difference] of examples) {
        component.selected = { ...teamDraft, sport };
        expect(component.teamScoreHeadings).toEqual({
          for: scoreFor, against: scoreAgainst, difference
        });
      }
      const earlierLanguage = localStorage.getItem('d24-language');
      try {
        localStorage.setItem('d24-language', 'en');
        component.selected = { ...teamDraft, sport: 'Basketball' };
        expect(component.teamScoreHeadings).toEqual({
          for: 'PF', against: 'PA', difference: 'PD'
        });
        component.selected = { ...teamDraft, sport: 'Futebol' };
        expect(component.teamScoreHeadings).toEqual({
          for: 'GF', against: 'GA', difference: 'GD'
        });
      } finally {
        if (earlierLanguage === null) localStorage.removeItem('d24-language');
        else localStorage.setItem('d24-language', earlierLanguage);
      }
    });

    it('announces team score editors using the selected sport in PT and EN', () => {
      const previous = localStorage.getItem('d24-language');
      try {
        localStorage.setItem('d24-language', 'pt');
        for (const [sport, label] of [
          ['Futebol', 'Golos de Verdes'],
          ['Basquetebol', 'Pontos de Verdes'],
          ['Voleibol', 'Sets ganhos de Verdes'],
          ['Karting', 'Marcador de Verdes']
        ]) {
          component.selected = { ...teamDraft, sport };
          expect(component.teamScoreInputLabel('Verdes')).toBe(label);
        }
        localStorage.setItem('d24-language', 'en');
        component.selected = { ...teamDraft, sport: 'Basketball' };
        expect(component.teamScoreInputLabel('Blues')).toBe('Points for Blues');
        component.selected = { ...teamDraft, sport: 'Tennis' };
        expect(component.teamScoreInputLabel('Blues')).toBe('Sets won by Blues');
      } finally {
        if (previous === null) localStorage.removeItem('d24-language');
        else localStorage.setItem('d24-language', previous);
      }
    });

    it('shows the invited team using an exact tournament deep link rather than the first result', () => {
      const other = { ...teamDraft, id: 99, name: 'Outro torneio' };
      api.list.and.returnValue(of({ tournaments: [other], page: 0, hasMore: false }));
      api.details.and.returnValue(of(teamDraft));
      api.teams.and.returnValue(of([team]));
      component.invitedTournamentId = 19;
      component.invitedTeamId = 40;
      component.ngOnChanges({ community: new SimpleChange(undefined, community, true) });

      expect(api.details).toHaveBeenCalledWith(7, 19);
      expect(component.competitionView).toBe('tournaments');
      expect(component.selected?.id).toBe(19);
      expect(component.invitedTeam?.id).toBe(40);
      expect(component.teamInviteUrl(team))
        .toContain('/menu/communities/7?tab=tournaments&tournament=19&team=40');
    });

    it('allows a member to accept only their own invited team spot', async () => {
      api.list.and.returnValue(of({ tournaments: [teamDraft], page: 0, hasMore: false }));
      api.teams.and.returnValue(of([team]));
      api.acceptTeamInvite.and.returnValue(of({ ...team, players: [{
        profileId: 1, username: 'owner', displayName: 'Organizador'
      }]}));
      component.invitedTournamentId = 19;
      component.invitedTeamId = 40;
      component.ngOnChanges({ community: new SimpleChange(undefined, community, true) });

      await component.acceptInvitedTeam();
      expect(api.acceptTeamInvite).toHaveBeenCalledOnceWith(7, 19, 40);
      expect(component.feedback).toContain('Convite aceite');
    });

    it('never submits self-registration if the team is full or player is elsewhere', async () => {
      api.list.and.returnValue(of({ tournaments: [teamDraft], page: 0, hasMore: false }));
      api.teams.and.returnValue(of([{ ...team, players: [
        { profileId: 1, username: 'owner', displayName: 'Organizador' },
        { profileId: 2, username: 'ana', displayName: 'Ana' },
        { profileId: 3, username: 'bruno', displayName: 'Bruno' },
        { profileId: 4, username: 'x', displayName: 'X' },
        { profileId: 5, username: 'y', displayName: 'Y' }
      ] }]));
      component.invitedTournamentId = 19;
      component.invitedTeamId = 40;
      component.ngOnChanges({ community: new SimpleChange(undefined, community, true) });

      await component.acceptInvitedTeam();
      expect(api.acceptTeamInvite).not.toHaveBeenCalled();
    });

    it('never accepts an invitation with unavailable or stale team roster data', async () => {
      api.list.and.returnValue(of({ tournaments: [teamDraft], page: 0, hasMore: false }));
      api.teams.and.returnValue(of([team]));
      component.invitedTournamentId = 19;
      component.invitedTeamId = 40;
      component.ngOnChanges({ community: new SimpleChange(undefined, community, true) });
      expect(component.invitedTeam?.id).toBe(40);

      component.teamsLoadError = true;
      expect(component.invitedTeam).toBeUndefined();
      await component.acceptInvitedTeam();
      expect(api.acceptTeamInvite).not.toHaveBeenCalled();

      component.teamsLoadError = false;
      component.detailsLoading = true;
      expect(component.invitedTeam).toBeUndefined();
      await component.acceptInvitedTeam();
      expect(api.acceptTeamInvite).not.toHaveBeenCalled();

      component.detailsLoading = false;
      component.community = { ...community, myRole: undefined } as any;
      expect(component.invitedTeam).toBeUndefined();
      await component.acceptInvitedTeam();
      expect(api.acceptTeamInvite).not.toHaveBeenCalled();

      component.community = community;
      component.invitedTeamId = 999;
      expect(component.invitedTeam).toBeUndefined();
      await component.acceptInvitedTeam();
      expect(api.acceptTeamInvite).not.toHaveBeenCalled();

      component.invitedTeamId = 40;
      component.invitedTournamentId = 999;
      expect(component.invitedTeam).toBeUndefined();
      await component.acceptInvitedTeam();
      expect(api.acceptTeamInvite).not.toHaveBeenCalled();
    });

    it('creates group knockout with four groups and resets the draft', async () => {
      api.createTeamTournament.and.returnValue(of({ ...teamDraft,
        format: 'GROUP_KNOCKOUT', groupCount: 4 }));
      component.startTeamCreation();
      component.nameDraft = 'Taça de amigos';
      component.teamFormatDraft = 'GROUP_KNOCKOUT';
      component.teamGroupCountDraft = 4;
      await component.createTeamCompetition();
      expect(api.createTeamTournament).toHaveBeenCalledWith(7, 'Taça de amigos', 'Futebol',
        null, 1, { winPoints: 3, drawPoints: 1, lossPoints: 0 },
        'GOAL_DIFFERENCE_FIRST', 'GROUP_KNOCKOUT', 4);
      expect(component.teamFormatDraft).toBe('LEAGUE');
      expect(Number(component.teamGroupCountDraft)).toBe(2);
      expect(component.isGroupKnockout).toBeTrue();
    });


    it('loads a team page by its own server-scoped fixture pages, not global fixtures', () => {
      const fixture = { id: 71, roundNumber: 1, homeTeamId: 40, homeTeamName: 'Verdes',
        awayTeamId: 41, awayTeamName: 'Azuis', status: 'COMPLETED' as const,
        homeScore: 3, awayScore: 1 };
      api.teams.and.returnValue(of([team]));
      api.teamProfileMatches.and.returnValues(
        of({ matches: [fixture], page: 0, hasMore: true }),
        of({ matches: [{...fixture, id: 72, roundNumber: 2,
          homeTeamId: 41, awayTeamId: 40}], page: 1, hasMore: false })
      );
      component.teamPageId = 40;
      component.selectTournament({...teamDraft, status: 'IN_PROGRESS'});
      expect(component.teamProfileMatches.map(match => match.id)).toEqual([71]);
      expect(component.teamProfileMatchesHasMore).toBeTrue();
      expect(api.teamMatches).toHaveBeenCalledWith(7, 19, 0); // existing tournament overview
      expect(api.teamProfileMatches).toHaveBeenCalledOnceWith(7, 19, 40, 0);
      component.loadTeamProfileMatches();
      expect(component.teamProfileMatches.map(match => match.id)).toEqual([71,72]);
      expect(api.teamProfileMatches).toHaveBeenCalledWith(7, 19, 40, 1);
      expect(component.teamProfileMatchesHasMore).toBeFalse();
      component.loadTeamProfileMatches();
      expect(api.teamProfileMatches).toHaveBeenCalledTimes(2);
    });

    it('switching team pages discards an outstanding request for the former team', () => {
      const pending = new Subject<TournamentTeamMatchPage>();
      const second = {...team, id: 41, name: 'Azuis'};
      api.teams.and.returnValue(of([team, second]));
      const first = { id: 71, roundNumber: 1, homeTeamId: 40, homeTeamName: 'Verdes',
        awayTeamId: 41, awayTeamName: 'Azuis', status: 'SCHEDULED' as const };
      api.teamProfileMatches.and.returnValues(pending.asObservable(),
        of({ matches: [{...first,id:72}], page: 0, hasMore: false }));
      component.teamPageId = 40;
      component.selectTournament({...teamDraft, status: 'IN_PROGRESS'});
      expect(component.teamProfileMatchesLoading).toBeTrue();
      component.teamPageId = 41;
      component.ngOnChanges({teamPageId:new SimpleChange(40, 41, false)});
      expect(component.focusedTeam?.id).toBe(41);
      expect(component.teamProfileMatches.map(match=>match.id)).toEqual([72]);
      pending.next({matches: [first], page:0, hasMore:false});
      pending.complete();
      expect(component.teamProfileMatches.map(match=>match.id)).toEqual([72]);
      expect(api.teamProfileMatches).toHaveBeenCalledWith(7, 19, 41, 0);
    });

    it('does not present other-team fixtures even if a response is incorrectly scoped', () => {
      api.teams.and.returnValue(of([team]));
      api.teamProfileMatches.and.returnValue(of({matches: [
        {id:100,roundNumber:1,homeTeamId:81,homeTeamName:'Outra',
          awayTeamId:82,awayTeamName:'Outra B',status:'SCHEDULED'},
        {id:101,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:82,awayTeamName:'Outra B',status:'SCHEDULED'}
      ],page:0,hasMore:false}));
      component.teamPageId=40;
      component.selectTournament({...teamDraft,status:'IN_PROGRESS'});
      expect(component.teamProfileMatches.map(f=>f.id)).toEqual([101]);
    });

    it('shows independent league and relay results without football fields on relay pages', () => {
      api.teams.and.returnValue(of([team]));
      component.teamPageId=40;
      component.selectTournament({...teamDraft,status:'IN_PROGRESS'});
      component.teamStandings={tournamentId:19,status:'IN_PROGRESS',totalMatches:1,
        completedMatches:1,winPoints:3,drawPoints:1,lossPoints:0,standings:[
          {position:1,teamId:40,teamName:'Verdes',played:1,won:1,drawn:0,
            lost:0,goalsFor:3,goalsAgainst:1,goalDifference:2,points:3}]};
      expect(component.focusedTeamStanding?.points).toBe(3);
      component.selected={...teamDraft,scoringMode:'RELAY_BEST_TIME',
        entryType:'TEAM',sport:'Atletismo',status:'IN_PROGRESS'};
      component.relayOverview={tournamentId:19,eventDiscipline:'RELAY_4X100',teams:[team],
        standings:[{position:2,teamId:40,teamName:'Verdes',bestSeconds:44.2,
          recordedHeats:2,runnerProfileIds:[]}],
        heats:[{id:19,teamId:40,teamName:'Verdes',heatNumber:1,
          elapsedSeconds:44.2,runnerProfileIds:[],recordedAt:'2026-11-03T00:00:00Z'}]};
      expect(component.focusedTeamStanding).toBeUndefined();
      expect(component.focusedTeamRelayStanding?.bestSeconds).toBe(44.2);
      expect(component.focusedTeamRelayHeats.map(h=>h.id)).toEqual([19]);
    });

    it('renders only published knockout rounds and advances winners only when confirmed in the next fixture', () => {
      component.selected = {...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches = [
        {id:72,roundNumber:2,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:43,awayTeamName:'Amarelos',status:'SCHEDULED'},
        {id:70,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED',homeScore:2,awayScore:1},
        {id:71,roundNumber:1,homeTeamId:42,homeTeamName:'Pretos',
          awayTeamId:43,awayTeamName:'Amarelos',status:'COMPLETED',homeScore:0,awayScore:3}
      ];
      const bracket=component.knockoutBracket;
      expect(bracket.map(round=>round.round)).toEqual([1,2]);
      expect(bracket[0].matches.map(item=>item.game.id)).toEqual([70,71]);
      expect(bracket[0].matches.map(item=>item.winnerId)).toEqual([40,43]);
      expect(bracket[0].matches.every(item=>item.advanced)).toBeTrue();
      expect(bracket[0].matches.map(item=>item.nextFixture?.id)).toEqual([72,72]);
      expect(bracket[0].matches.every(item=>!item.champion)).toBeTrue();
      expect(bracket[1].matches[0].winnerId).toBeNull();
      expect(bracket[1].matches[0].incoming.map(source=>source.winnerName))
        .toEqual(['Verdes','Amarelos']);
      expect(bracket[1].matches[0].incoming.map(source=>source.game.id))
        .toEqual([70,71]);
      expect(component.knockoutFocusTeams.map(team=>team.id)).toEqual([43,41,42,40]);
      component.setKnockoutFocusTeam(40);
      expect(component.focusedKnockoutPath.map(step=>step.game.id)).toEqual([70,72]);
      expect(component.focusedKnockoutPath.map(step=>step.linkedToNext)).toEqual([true,false]);
      expect(component.isKnockoutTeamFocused(bracket[0].matches[0].game)).toBeTrue();
      expect(component.isKnockoutTeamFocused(bracket[0].matches[1].game)).toBeFalse();
      component.setKnockoutFocusTeam('ALL');
      expect(component.focusedKnockoutPath).toEqual([]);
      expect(bracket[0].matches.every(item=>item.incoming.length===0)).toBeTrue();
      expect(bracket.some(round=>round.round===3)).toBeFalse();
      expect(component.teamMatches.map(game=>game.id)).toEqual([72,70,71]);
    });

    it('navigates from a verified knockout path to the actual next fixture in the bracket', () => {
      const won={id:70,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED' as const,homeScore:2,awayScore:1};
      const next={id:72,roundNumber:2,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:43,awayTeamName:'Amarelos',status:'SCHEDULED' as const};
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[won,next];
      component.setKnockoutFocusTeam(40);
      const path=component.focusedKnockoutPath;
      expect(path.map(step=>step.game.id)).toEqual([70,72]);
      expect(path.map(step=>step.linkedToNext)).toEqual([true,false]);
      const board=document.createElement('details');
      const match=document.createElement('article');
      match.dataset['knockoutFixtureId']='72';
      const scroll=jasmine.createSpy('scrollIntoView');
      match.scrollIntoView=scroll;
      const focus=spyOn(match,'focus');
      board.appendChild(match);
      (component as any).teamTournamentBracket={nativeElement:board};
      component.focusPublishedKnockoutInBoard(path[1].game);
      expect(component.selectedKnockoutRound).toBe(2);
      expect(board.open).toBeTrue();
      expect(scroll).toHaveBeenCalledOnceWith({behavior:'smooth',block:'nearest',inline:'center'});
      expect(focus).toHaveBeenCalledOnceWith({preventScroll:true});
      component.focusPublishedKnockoutInBoard({...next,id:12345});
      expect(scroll).toHaveBeenCalledTimes(1);
      component.setKnockoutFocusTeam('ALL');
      component.focusPublishedKnockoutInBoard(next);
      expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('keeps elimination provisional until all selected team fixture pages are loaded', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamPageId=40;
      component.teams=[team];
      component.teamProfileMatches=[{id:200,roundNumber:1,
        homeTeamId:40,homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',
        status:'COMPLETED',homeScore:0,awayScore:2}];
      component.teamProfileMatchesHasMore=true;
      expect(component.focusedTeamJourney.knockoutPath[0].state).toBe('LOST');
      expect(component.focusedTeamJourney.knockoutProgress.losses).toBe(1);
      component.teamProfileMatchesHasMore=false;
      expect(component.focusedTeamJourney.knockoutPath[0].state).toBe('ELIMINATED');
      component.selected={...component.selected,format:'LEAGUE'};
      expect(component.focusedTeamJourney.knockoutPath).toEqual([]);
    });

    it('links each published knockout opponent only to a real tournament team page', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamPageId=40;
      const rival={...team,id:41,name:'Azuis'};
      component.teams=[team,rival];
      const game={id:85,roundNumber:1,groupNumber:null,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',
        status:'SCHEDULED' as const};
      component.teamProfileMatches=[game];
      expect(component.teamPathOpponent(game)?.id).toBe(41);
      const reverse={...game,id:86,homeTeamId:41,homeTeamName:'Azuis',
        awayTeamId:40,awayTeamName:'Verdes'};
      component.teamProfileMatches.push(reverse);
      expect(component.teamPathOpponent(reverse)?.id).toBe(41);
      expect(component.teamPathOpponent({...game,id:999})).toBeUndefined();
      expect(component.teamPathOpponent({...game,awayTeamId:99})).toBeUndefined();
      component.teams=[team];
      expect(component.teamPathOpponent(game)).toBeUndefined();
      component.teams=[team,rival];
      component.teamPageId=42;
      expect(component.teamPathOpponent(game)).toBeUndefined();
      component.teamPageId=40;
      component.selected={...teamDraft,status:'DRAFT',format:'GROUP_KNOCKOUT'};
      expect(component.teamPathOpponent(game)).toBeUndefined();
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      expect(component.teamPathOpponent(game)).toBeUndefined();
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT',
        scoringMode:'RELAY_BEST_TIME'};
      expect(component.teamPathOpponent(game)).toBeUndefined();
    });

    it('opens the next verified team-page fixture without exposing unconfirmed rounds', () => {
      const won={id:70,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED' as const,homeScore:2,awayScore:0};
      const next={id:72,roundNumber:2,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:43,awayTeamName:'Amarelos',status:'SCHEDULED' as const};
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamPageId=40;
      component.teams=[team];
      component.teamProfileMatches=[next,won];
      expect(component.focusedTeamJourney.knockoutPath.map(step=>
        step.confirmedNextFixture?.id??null)).toEqual([72,null]);
      const host=document.createElement('section');
      const match=document.createElement('div');
      match.dataset['teamProfileFixtureId']='72';
      const scroll=jasmine.createSpy('scrollIntoView');
      match.scrollIntoView=scroll;
      const focus=spyOn(match,'focus');
      host.appendChild(match);
      (component as any).teamProfileSection={nativeElement:host};
      component.teamProfileMatchFilter='COMPLETED';
      component.teamProfilePhaseFilter='round-1';
      component.teamProfileOpponentId=41;
      component.showTeamProfileFixture(component.focusedTeamJourney.knockoutPath[0].confirmedNextFixture!);
      expect(component.teamProfileMatchFilter).toBe('ALL');
      expect(component.teamProfilePhaseFilter).toBe('ALL');
      expect(component.teamProfileOpponentId).toBeNull();
      expect(scroll).toHaveBeenCalledOnceWith({behavior:'smooth',block:'center'});
      expect(focus).toHaveBeenCalledOnceWith({preventScroll:true});
      component.teamProfileMatches=[won,next,{...won,id:74,awayTeamId:44}];
      expect(component.focusedTeamJourney.knockoutPath[0].confirmedNextFixture).toBeNull();
      component.teamProfileMatches=[won,{...next,roundNumber:3}];
      expect(component.focusedTeamJourney.knockoutPath[0].confirmedNextFixture).toBeNull();
    });

    it('jumps only to loaded knockout rounds without modifying fixture filters', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[
        {id:70,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED',homeScore:2,awayScore:1},
        {id:72,roundNumber:3,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:43,awayTeamName:'Amarelos',status:'SCHEDULED'}
      ];
      expect(component.knockoutBracket.map(stage=>stage.round)).toEqual([1,3]);
      component.teamPhaseFilter='round-1';
      component.teamMatchFilter='COMPLETED';
      component.jumpToKnockoutRound(3);
      expect(component.selectedKnockoutRound).toBe(3);
      expect(component.teamPhaseFilter).toBe('round-1');
      expect(component.teamMatchFilter).toBe('COMPLETED');
      component.jumpToKnockoutRound(2);
      component.jumpToKnockoutRound(-1);
      component.jumpToKnockoutRound(NaN);
      expect(component.selectedKnockoutRound).toBe(3);
    });

    it('shows one published bracket round at a time and restores all without changing fixtures', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[
        {id:70,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED',homeScore:2,awayScore:1},
        {id:71,roundNumber:1,homeTeamId:42,homeTeamName:'Pretos',
          awayTeamId:43,awayTeamName:'Amarelos',status:'SCHEDULED'},
        {id:72,roundNumber:2,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:43,awayTeamName:'Amarelos',status:'SCHEDULED'},
        {id:73,roundNumber:3,homeTeamId:42,homeTeamName:'Pretos',
          awayTeamId:41,awayTeamName:'Azuis',status:'SCHEDULED'}
      ];
      const published=component.knockoutBracket;
      const snapshot=JSON.stringify(component.teamMatches);
      expect(component.shownKnockoutRounds(published).map(r=>r.round)).toEqual([1,2,3]);
      component.teamPhaseFilter='round-1';
      component.teamMatchFilter='COMPLETED';
      component.jumpToKnockoutRound(2);
      expect(component.shownKnockoutRounds(published).map(r=>r.round)).toEqual([2]);
      component.jumpToKnockoutRound(3);
      expect(component.shownKnockoutRounds(published).map(r=>r.round)).toEqual([3]);
      expect(component.teamPhaseFilter).toBe('round-1');
      expect(component.teamMatchFilter).toBe('COMPLETED');
      expect(JSON.stringify(component.teamMatches)).toBe(snapshot);
      component.showAllKnockoutRounds();
      expect(component.selectedKnockoutRound).toBeNull();
      expect(component.shownKnockoutRounds(published).map(r=>r.round)).toEqual([1,2,3]);
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      component.jumpToKnockoutRound(2);
      component.showAllKnockoutRounds();
      expect(component.selectedKnockoutRound).toBeNull();
    });

    it('clears selected knockout round when changing competitions', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[
        {id:72,roundNumber:2,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:43,awayTeamName:'Amarelos',status:'SCHEDULED'}
      ];
      component.jumpToKnockoutRound(2);
      expect(component.selectedKnockoutRound).toBe(2);
      component.selectTournament({...teamDraft,id:39,status:'DRAFT',format:'KNOCKOUT'});
      expect(component.selectedKnockoutRound).toBeNull();
      component.jumpToKnockoutRound(2);
      expect(component.selectedKnockoutRound).toBeNull();
    });

    it('searches loaded knockout matchups by team name and ignores accents', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      const first=Array.from({length:16},(_,i)=>({
        id:800+i,roundNumber:1,homeTeamId:100+i*2,
        homeTeamName:i===14?'Smash Atlântico':'Casa '+i,
        awayTeamId:101+i*2,awayTeamName:'Fora '+i,status:'SCHEDULED' as const
      }));
      const next={id:900,roundNumber:2,homeTeamId:230,homeTeamName:'Clube Águia',
        awayTeamId:231,awayTeamName:'Açores',status:'SCHEDULED' as const};
      component.teamMatches=[...first,next];
      const original=JSON.stringify(component.teamMatches);
      const bracket=component.knockoutBracket;
      expect(component.visibleKnockoutMatches(1,bracket[0].matches).length).toBe(4);
      component.setKnockoutFocusTeam(128);
      component.jumpToKnockoutRound(1);
      component.setKnockoutMatchQuery('  aTlAnTiCo  ');
      expect(component.selectedKnockoutRound).toBeNull();
      expect(component.knockoutFocusTeamId).toBeNull();
      expect(component.visibleKnockoutMatches(1,bracket[0].matches)
        .map(item=>item.game.id)).toEqual([814]);
      expect(component.shownKnockoutRounds(bracket).map(item=>item.round)).toEqual([1]);
      component.setKnockoutMatchQuery('aguia');
      expect(component.shownKnockoutRounds(bracket).map(item=>item.round)).toEqual([2]);
      expect(component.visibleKnockoutMatches(2,bracket[1].matches)
        .map(item=>item.game.id)).toEqual([900]);
      component.setKnockoutMatchQuery('sem resultados');
      expect(component.shownKnockoutRounds(bracket)).toEqual([]);
      expect(component.visibleKnockoutMatches(1,bracket[0].matches)).toEqual([]);
      component.setKnockoutMatchQuery('');
      expect(component.shownKnockoutRounds(bracket).map(item=>item.round)).toEqual([1,2]);
      expect(component.visibleKnockoutMatches(1,bracket[0].matches).length).toBe(4);
      component.setKnockoutMatchQuery('Atlantico');
      component.setKnockoutFocusTeam(128);
      expect(component.knockoutMatchQuery).toBe('');
      expect(component.knockoutFocusTeamId).toBe(128);
      component.setKnockoutMatchQuery('x'.repeat(100));
      expect(component.knockoutMatchQuery.length).toBe(80);
      expect(JSON.stringify(component.teamMatches)).toBe(original);
      component.selectTournament({...teamDraft,id:42,status:'DRAFT',format:'KNOCKOUT'});
      expect(component.knockoutMatchQuery).toBe('');
      component.setKnockoutMatchQuery('Azuis');
      expect(component.knockoutMatchQuery).toBe('Azuis');
      component.selected={...component.selected,format:'LEAGUE'};
      component.setKnockoutMatchQuery('foo');
      expect(component.knockoutMatchQuery).toBe('Azuis');
    });

    it('filters loaded knockout statuses without changing actual fixtures', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[
        {id:71,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED',homeScore:2,awayScore:1},
        {id:72,roundNumber:1,homeTeamId:42,homeTeamName:'Pretos',
          awayTeamId:40,awayTeamName:'Verdes',status:'SCHEDULED'},
        {id:73,roundNumber:2,homeTeamId:43,homeTeamName:'Amarelos',
          awayTeamId:44,awayTeamName:'Rosas',status:'SCHEDULED'}
      ];
      const snapshot=JSON.stringify(component.teamMatches), rounds=component.knockoutBracket;
      expect(component.knockoutCompletedCount(rounds[0].matches)).toBe(1);
      expect(component.knockoutCompletedCount(rounds[1].matches)).toBe(0);
      component.setKnockoutMatchQuery('verdes');
      expect(component.knockoutSearchMatches.map(game=>game.id)).toEqual([71,72]);
      component.setKnockoutStatusFilter('COMPLETED');
      expect(component.knockoutSearchMatches.map(game=>game.id)).toEqual([71]);
      expect(component.shownKnockoutRounds(rounds).map(stage=>stage.round)).toEqual([1]);
      expect(component.visibleKnockoutMatches(1,rounds[0].matches).map(item=>item.game.id))
        .toEqual([71]);
      component.jumpToKnockoutRound(2);
      expect(component.selectedKnockoutRound).toBeNull();
      component.setKnockoutStatusFilter('PENDING');
      expect(component.knockoutSearchMatches.map(game=>game.id)).toEqual([72]);
      expect(component.knockoutSearchFixtureId).toBe(72);
      expect(component.visibleKnockoutMatches(1,rounds[0].matches).map(item=>item.game.id))
        .toEqual([72]);
      component.setKnockoutMatchQuery('');
      expect(component.shownKnockoutRounds(rounds).map(stage=>stage.round)).toEqual([1,2]);
      component.jumpToKnockoutRound(2);
      expect(component.selectedKnockoutRound).toBe(2);
      component.setKnockoutStatusFilter('COMPLETED');
      expect(component.selectedKnockoutRound).toBeNull();
      expect(component.shownKnockoutRounds(rounds).map(stage=>stage.round)).toEqual([1]);
      component.setKnockoutStatusFilter('ALL');
      expect(component.shownKnockoutRounds(rounds).map(stage=>stage.round)).toEqual([1,2]);
      expect(JSON.stringify(component.teamMatches)).toBe(snapshot);
      component.selectTournament({...teamDraft,id:99,status:'DRAFT',format:'KNOCKOUT'});
      expect(component.knockoutStatusFilter).toBe('ALL');
    });

    it('opens only the selected published search fixture and safely ignores stale results', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[
        {id:202,roundNumber:2,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:43,awayTeamName:'Amarelos',status:'SCHEDULED'},
        {id:201,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED',homeScore:2,awayScore:1}
      ];
      const original=JSON.stringify(component.teamMatches);
      const list=document.createElement('section');
      const row=document.createElement('div');
      row.dataset['teamFixtureId']='201';
      const scroll=jasmine.createSpy('scrollIntoView');
      row.scrollIntoView=scroll;
      const focus=spyOn(row,'focus');
      list.appendChild(row);
      (component as any).teamFixturesList={nativeElement:list};
      component.setKnockoutMatchQuery('verdes');
      expect(component.currentKnockoutSearchFixture?.id).toBe(201);
      component.teamPhaseFilter='round-99';
      component.teamMatchFilter='COMPLETED';
      component.openCurrentKnockoutSearchFixture();
      expect(component.teamPhaseFilter).toBe('round-1');
      expect(component.teamMatchFilter).toBe('ALL');
      expect(scroll).toHaveBeenCalledOnceWith({behavior:'smooth',block:'center'});
      expect(focus).toHaveBeenCalledOnceWith({preventScroll:true});
      component.setKnockoutMatchQuery('nome inexistente');
      expect(component.currentKnockoutSearchFixture).toBeNull();
      component.teamPhaseFilter='ALL';
      component.openCurrentKnockoutSearchFixture();
      expect(component.teamPhaseFilter).toBe('ALL');
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(component.teamMatches)).toBe(original);
    });

    it('navigates actual search results in round order and focuses the selected fixture', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      const fixtures=[
        {id:93,roundNumber:2,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:43,awayTeamName:'Águias',status:'SCHEDULED' as const},
        {id:92,roundNumber:1,homeTeamId:42,homeTeamName:'Verdes B',
          awayTeamId:44,awayTeamName:'Azuis',status:'SCHEDULED' as const},
        {id:91,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Pretos',status:'SCHEDULED' as const},
        {id:94,roundNumber:1,homeTeamId:45,homeTeamName:'Rosas',
          awayTeamId:46,awayTeamName:'Amarelos',status:'SCHEDULED' as const}
      ];
      component.teamMatches=fixtures;
      const original=JSON.stringify(component.teamMatches);
      const board=document.createElement('details');
      const targets=new Map<number, {scroll:jasmine.Spy; focus:jasmine.Spy}>();
      for (const fixture of fixtures) {
        const row=document.createElement('article');
        row.dataset['knockoutFixtureId']=''+fixture.id;
        const scroll=jasmine.createSpy('scrollIntoView');
        row.scrollIntoView=scroll;
        const focus=spyOn(row,'focus');
        board.appendChild(row);
        targets.set(fixture.id,{scroll,focus});
      }
      (component as any).teamTournamentBracket={nativeElement:board};
      component.setKnockoutMatchQuery('verdes');
      expect(component.knockoutSearchMatches.map(game=>game.id)).toEqual([91,92,93]);
      expect(component.knockoutSearchFixtureId).toBe(91);
      expect(component.knockoutSearchPosition).toBe(1);
      component.moveKnockoutSearch(1);
      expect(component.knockoutSearchFixtureId).toBe(92);
      expect(component.knockoutSearchPosition).toBe(2);
      expect(board.open).toBeTrue();
      expect(targets.get(92)!.scroll).toHaveBeenCalledOnceWith({
        behavior:'smooth',block:'nearest',inline:'center'});
      expect(targets.get(92)!.focus).toHaveBeenCalledOnceWith({preventScroll:true});
      component.moveKnockoutSearch(1);
      expect(component.knockoutSearchFixtureId).toBe(93);
      component.moveKnockoutSearch(1);
      expect(component.knockoutSearchFixtureId).toBe(91);
      component.moveKnockoutSearch(-1);
      expect(component.knockoutSearchFixtureId).toBe(93);
      // A round filter must never leave the highlighted result invisible.
      component.jumpToKnockoutRound(1);
      expect(component.knockoutSearchFixtureId).toBe(91);
      expect(component.shownKnockoutRounds(component.knockoutBracket)
        .map(round=>round.round)).toEqual([1]);
      component.moveKnockoutSearch(-1);
      expect(component.knockoutSearchFixtureId).toBe(93);
      expect(component.selectedKnockoutRound).toBe(2);
      expect(component.shownKnockoutRounds(component.knockoutBracket)
        .map(round=>round.round)).toEqual([2]);
      component.moveKnockoutSearch(1);
      expect(component.knockoutSearchFixtureId).toBe(91);
      expect(component.selectedKnockoutRound).toBe(1);
      component.jumpToKnockoutRound(2);
      expect(component.knockoutSearchFixtureId).toBe(93);
      component.showAllKnockoutRounds();
      expect(component.selectedKnockoutRound).toBeNull();
      component.knockoutSearchFixtureId = -1;
      component.moveKnockoutSearch(-1);
      expect(component.knockoutSearchFixtureId).toBe(93);
      component.setKnockoutMatchQuery('no match');
      expect(component.knockoutSearchMatches).toEqual([]);
      expect(component.knockoutSearchPosition).toBe(0);
      component.moveKnockoutSearch(1);
      expect(component.knockoutSearchFixtureId).toBeNull();
      expect(JSON.stringify(component.teamMatches)).toBe(original);
      component.setKnockoutMatchQuery('Verdes');
      component.selectTournament({...teamDraft,id:70,status:'DRAFT',format:'KNOCKOUT'});
      expect(component.knockoutSearchFixtureId).toBeNull();
      expect(component.knockoutSearchMatches).toEqual([]);
    });

    it('compacts 16 and 32 team brackets without dropping any loaded fixtures', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      for (const matchCount of [8,16]) {
        component.teamMatches=Array.from({length:matchCount},(_,i)=>({
          id:200+i,roundNumber:1,homeTeamId:100+i*2,
          homeTeamName:'Casa '+i,awayTeamId:101+i*2,
          awayTeamName:'Fora '+i,status:'SCHEDULED' as const
        }));
        const matches=component.knockoutBracket[0].matches;
        expect(matches.length).toBe(matchCount);
        expect(component.visibleKnockoutMatches(1,matches).map(item=>item.game.id))
          .toEqual([200,201,202,203]);
        component.setKnockoutFocusTeam(100+(matchCount-1)*2);
        expect(component.visibleKnockoutMatches(1,matches).map(item=>item.game.id))
          .toEqual([200,201,202,203,200+matchCount-1]);
        component.toggleKnockoutRound(1);
        expect(component.visibleKnockoutMatches(1,matches).length).toBe(matchCount);
        expect(component.teamMatches.length).toBe(matchCount);
        component.toggleKnockoutRound(1);
        expect(component.visibleKnockoutMatches(1,matches).length).toBe(5);
        component.setKnockoutFocusTeam('ALL');
      }
    });

    it('reveals large bracket rounds in four-match batches without hiding focused fixtures', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      const roundOne=Array.from({length:16},(_,i)=>({
        id:500+i,roundNumber:1,homeTeamId:100+i*2,
        homeTeamName:'Casa '+i,awayTeamId:101+i*2,
        awayTeamName:'Fora '+i,status:'SCHEDULED' as const
      }));
      component.teamMatches=[...roundOne,{
        id:600,roundNumber:2,homeTeamId:200,homeTeamName:'A',
        awayTeamId:201,awayTeamName:'B',status:'SCHEDULED' as const
      }];
      const original=JSON.stringify(component.teamMatches);
      const rounds=component.knockoutBracket;
      const first=rounds[0].matches;
      expect(component.visibleKnockoutMatches(1,first).length).toBe(4);
      component.setKnockoutFocusTeam(130);
      expect(component.visibleKnockoutMatches(1,first).map(item=>item.game.id))
        .toEqual([500,501,502,503,515]);
      component.showMoreKnockoutMatches(1);
      expect(component.visibleKnockoutMatches(1,first).map(item=>item.game.id))
        .toEqual([500,501,502,503,504,505,506,507,515]);
      expect(component.visibleKnockoutMatches(2,rounds[1].matches).length).toBe(1);
      component.showMoreKnockoutMatches(2);
      component.showMoreKnockoutMatches(-1);
      component.showMoreKnockoutMatches(NaN);
      expect(component.knockoutRoundLimits.size).toBe(1);
      component.showMoreKnockoutMatches(1);
      expect(component.visibleKnockoutMatches(1,first).length).toBe(13);
      component.showMoreKnockoutMatches(1);
      component.showMoreKnockoutMatches(1);
      expect(component.visibleKnockoutMatches(1,first).length).toBe(16);
      expect(component.knockoutRoundLimits.get(1)).toBe(16);
      component.toggleKnockoutRound(1);
      expect(component.visibleKnockoutMatches(1,first).length).toBe(5);
      expect(component.knockoutRoundLimits.size).toBe(0);
      component.setKnockoutFocusTeam('ALL');
      expect(component.visibleKnockoutMatches(1,first).length).toBe(4);
      component.showMoreKnockoutMatches(1);
      component.toggleKnockoutRound(1);
      expect(component.visibleKnockoutMatches(1,first).length).toBe(16);
      component.toggleKnockoutRound(1);
      expect(component.visibleKnockoutMatches(1,first).length).toBe(4);
      expect(JSON.stringify(component.teamMatches)).toBe(original);
      component.showMoreKnockoutMatches(1);
      component.selectTournament({...teamDraft,id:501,status:'DRAFT',format:'KNOCKOUT'});
      expect(component.knockoutRoundLimits.size).toBe(0);
    });

    it('keeps small rounds expanded, refuses missing rounds and clears expansion on tournament change', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=Array.from({length:6},(_,i)=>({
        id:300+i,roundNumber:1,homeTeamId:10+i*2,
        homeTeamName:'A '+i,awayTeamId:11+i*2,
        awayTeamName:'B '+i,status:'SCHEDULED' as const
      }));
      const round=component.knockoutBracket[0];
      expect(component.visibleKnockoutMatches(round.round,round.matches).length).toBe(6);
      component.toggleKnockoutRound(1);
      component.toggleKnockoutRound(2);
      expect(component.expandedKnockoutRounds.size).toBe(0);
      component.teamMatches.push(
        {id:400,roundNumber:1,homeTeamId:100,homeTeamName:'A',
         awayTeamId:101,awayTeamName:'B',status:'SCHEDULED'});
      component.toggleKnockoutRound(1);
      expect(component.expandedKnockoutRounds.has(1)).toBeTrue();
      component.selectTournament({...teamDraft,id:45,status:'DRAFT',format:'KNOCKOUT'});
      expect(component.expandedKnockoutRounds.size).toBe(0);
    });

    it('does not connect an ambiguous duplicate winner to the next published round', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[
        {id:100,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED',homeScore:2,awayScore:0},
        {id:101,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:42,awayTeamName:'Pretos',status:'COMPLETED',homeScore:3,awayScore:1},
        {id:200,roundNumber:2,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:43,awayTeamName:'Amarelos',status:'SCHEDULED'}
      ];
      const bracket = component.knockoutBracket;
      expect(bracket[1].matches[0].incoming).toEqual([]);
      expect(bracket[0].matches.every(item=>item.nextFixture===null && !item.advanced)).toBeTrue();
      component.setKnockoutFocusTeam(40);
      expect(component.focusedKnockoutPath.map(step=>step.linkedToNext))
        .toEqual([false,false,false]);
    });

    it('clears team bracket focus when switching competitions or resetting loaded fixtures', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[
        {id:400,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'SCHEDULED'}
      ];
      component.setKnockoutFocusTeam(40);
      component.setKnockoutFocusTeam(9999);
      expect(component.knockoutFocusTeamId).toBe(40);
      component.selectTournament({...teamDraft,id:28,status:'DRAFT',format:'KNOCKOUT'});
      expect(component.knockoutFocusTeamId).toBeNull();
      expect(component.focusedKnockoutPath).toEqual([]);
      component.setKnockoutFocusTeam(40);
      expect(component.knockoutFocusTeamId).toBeNull();
    });

    it('does not invent knockout progress, winners, draws or championships', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[
        {id:7,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',awayTeamId:41,
          awayTeamName:'Azuis',status:'COMPLETED',homeScore:3,awayScore:1},
        {id:8,roundNumber:1,homeTeamId:42,homeTeamName:'Pretos',awayTeamId:43,
          awayTeamName:'Amarelos',status:'SCHEDULED',homeScore:8,awayScore:0},
        {id:9,roundNumber:1,homeTeamId:44,homeTeamName:'Rosas',awayTeamId:45,
          awayTeamName:'Laranjas',status:'COMPLETED',homeScore:1,awayScore:1},
        {id:10,roundNumber:1,homeTeamId:46,homeTeamName:'A',awayTeamId:47,
          awayTeamName:'B',status:'COMPLETED',homeScore:null,awayScore:2}
      ];
      const matches=component.knockoutBracket[0].matches;
      expect(matches.map(item=>item.winnerId)).toEqual([40,null,null,null]);
      expect(matches.every(item=>!item.advanced && !item.champion && !item.nextFixture)).toBeTrue();
      component.selected={...component.selected,status:'COMPLETED',championTeamId:40};
      // A completed flag without the actual final is insufficient evidence.
      expect(component.knockoutBracket[0].matches[0].champion).toBeFalse();
      component.selected={...component.selected,championTeamId:41};
      expect(component.knockoutBracket[0].matches.every(item=>!item.champion)).toBeTrue();
    });

    it('reserves the champion badge for the final published round only', () => {
      component.teams=[40,41,42,43].map(id=>({id,name:`Team ${id}`,playersPerTeam:null,
        createdAt:'2026-11-03T00:00:00Z',players:[]}));
      component.selected={...teamDraft,status:'COMPLETED',format:'KNOCKOUT',championTeamId:40};
      component.teamMatches=[
        {id:41,roundNumber:1,homeTeamId:40,homeTeamName:'A',awayTeamId:41,
          awayTeamName:'B',status:'COMPLETED',homeScore:2,awayScore:0},
        {id:42,roundNumber:2,homeTeamId:40,homeTeamName:'A',awayTeamId:42,
          awayTeamName:'C',status:'COMPLETED',homeScore:1,awayScore:0}
      ];
      expect(component.knockoutBracket[0].matches[0].champion).toBeFalse();
      expect(component.knockoutBracket[1].matches[0].champion).toBeTrue();
      component.teamMatchesHasMore=true;
      expect(component.knockoutBracket[1].matches[0].champion).toBeFalse();
    });

    it('does not mistake a partial first-round page for confirmed byes', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teams=[40,41,42,43,44].map(id=>({id,name:`Team ${id}`,playersPerTeam:null,
        createdAt:'2026-11-03T00:00:00Z',players:[]}));
      component.teamMatches=[{id:91,roundNumber:1,homeTeamId:40,homeTeamName:'A',
        awayTeamId:41,awayTeamName:'B',status:'SCHEDULED'}];
      component.teamMatchesHasMore=true;
      expect(component.knockoutFirstRoundByes).toEqual([]);
      component.teamMatchesHasMore=false;
      expect(component.knockoutFirstRoundByes.map(team=>team.id)).toEqual([42,43,44]);
      component.teamMatchesLoading=true;
      expect(component.knockoutFirstRoundByes).toEqual([]);
      component.teamMatchesLoading=false;
      component.teamMatchesError=true;
      expect(component.knockoutFirstRoundByes).toEqual([]);
    });

    it('links only unambiguous published next-round fixtures', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      const first={id:100,roundNumber:1,homeTeamId:40,homeTeamName:'A',
        awayTeamId:41,awayTeamName:'B',status:'COMPLETED' as const,
        homeScore:2,awayScore:0};
      const next={id:101,roundNumber:2,homeTeamId:40,homeTeamName:'A',
        awayTeamId:42,awayTeamName:'C',status:'SCHEDULED' as const};
      component.teamMatches=[first,next];
      expect(component.knockoutBracket[0].matches[0].nextFixture?.id).toBe(101);
      component.teamMatchFilter='COMPLETED';
      component.showPublishedKnockoutFixture(next);
      expect(component.teamPhaseFilter).toBe('round-2');
      expect(component.teamMatchFilter).toBe('ALL');
      component.teamMatches.push({...next,id:102,awayTeamId:43,awayTeamName:'D'});
      const firstMatch=component.knockoutBracket[0].matches[0];
      expect(firstMatch.advanced).toBeFalse();
      expect(firstMatch.nextFixture).toBeNull();
      component.teamPhaseFilter='ALL';
      component.showPublishedKnockoutFixture({...next,id:999});
      expect(component.teamPhaseFilter).toBe('ALL');
    });

    it('does not award the championship when the published round is not the final', () => {
      component.teams=[40,41,42,43,44,45,46,47].map(id=>({id,name:`Team ${id}`,
        playersPerTeam:null,createdAt:'2026-11-03T00:00:00Z',players:[]}));
      component.selected={...teamDraft,status:'COMPLETED',format:'KNOCKOUT',
        championTeamId:40};
      component.teamMatches=[{id:110,roundNumber:1,homeTeamId:40,homeTeamName:'A',
        awayTeamId:41,awayTeamName:'B',status:'COMPLETED',homeScore:1,awayScore:0}];
      expect(component.knockoutTotalRounds).toBe(3);
      expect(component.knockoutBracket[0].matches[0].champion).toBeFalse();
    });

    it('excludes group fixtures and sport-specific relay competitions from the knockout board', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamMatches=[
        {id:21,roundNumber:1,groupNumber:1,homeTeamId:40,homeTeamName:'A',
          awayTeamId:41,awayTeamName:'B',status:'COMPLETED',homeScore:1,awayScore:0},
        {id:22,roundNumber:1,groupNumber:null,homeTeamId:40,homeTeamName:'A',
          awayTeamId:42,awayTeamName:'C',status:'COMPLETED',homeScore:2,awayScore:0}
      ];
      expect(component.knockoutBracket.length).toBe(1);
      expect(component.knockoutBracket[0].matches.map(item=>item.game.id)).toEqual([22]);
      component.selected={...component.selected,format:'LEAGUE'};
      expect(component.knockoutBracket).toEqual([]);
      component.selected={...component.selected,format:'GROUP_KNOCKOUT',
        scoringMode:'RELAY_BEST_TIME'};
      // Relay overview uses times and qualification, never a football-style fixture board.
      expect(component.isRelayCompetition).toBeTrue();
      expect(component.knockoutBracket).toEqual([]);
    });

    it('builds group and knockout stages strictly from published match data', () => {
      const cup = {...teamDraft, status:'IN_PROGRESS' as const,
        format:'GROUP_KNOCKOUT' as const, groupCount:4 as const};
      const fixtures = [
        {id:4,roundNumber:1,groupNumber:2,homeTeamId:40,homeTeamName:'A',
          awayTeamId:41,awayTeamName:'B',status:'SCHEDULED' as const},
        {id:5,roundNumber:1,groupNumber:1,homeTeamId:42,homeTeamName:'C',
          awayTeamId:43,awayTeamName:'D',status:'COMPLETED' as const,
          homeScore:2,awayScore:0},
        {id:6,roundNumber:2,groupNumber:1,homeTeamId:42,homeTeamName:'C',
          awayTeamId:41,awayTeamName:'B',status:'SCHEDULED' as const},
        {id:7,roundNumber:1,groupNumber:null,homeTeamId:42,homeTeamName:'C',
          awayTeamId:40,awayTeamName:'A',status:'SCHEDULED' as const}
      ];
      component.selected=cup;
      component.teamMatches=fixtures;
      expect(component.teamPhases.map(p=>[p.key,p.label,p.completed,p.loaded])).toEqual([
        ['group-1','Grupo A',1,2],['group-2','Grupo B',0,1],
        ['round-1','Quartos de final',0,1]
      ]);
      component.setTeamPhaseFilter('group-1');
      expect(component.visibleTeamMatches.map(g=>g.id)).toEqual([5,6]);
      component.setTeamMatchFilter('COMPLETED');
      expect(component.visibleTeamMatches.map(g=>g.id)).toEqual([5]);
      component.setTeamPhaseFilter('round-1');
      expect(component.visibleTeamMatches).toEqual([]);
      component.setTeamMatchFilter('ALL');
      expect(component.visibleTeamMatches.map(g=>g.id)).toEqual([7]);
      component.setTeamPhaseFilter('round-9'); // Unpublished stages must not appear.
      expect(component.teamPhaseFilter).toBe('round-1');
      component.setTeamPhaseFilter('ALL');
      expect(component.visibleTeamMatches.length).toBe(4);
    });

    it('keeps league rounds separate and resets stage selection across competitions', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      const fixture={id:11,roundNumber:3,homeTeamId:40,homeTeamName:'A',
        awayTeamId:41,awayTeamName:'B',status:'COMPLETED' as const,homeScore:1,awayScore:0};
      component.teamMatches=[fixture];
      expect(component.teamPhases.map(s=>s.label)).toEqual(['Jornada 3']);
      component.setTeamPhaseFilter('round-3');
      component.selectTournament(draft);
      expect(component.teamPhaseFilter).toBe('ALL');
      expect(component.teamPhases).toEqual([]);
    });

    it('does not claim a future cup final or infer its winner from pending fixtures', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      component.teamMatches=[
        {id:21,roundNumber:1,homeTeamId:40,homeTeamName:'A',
          awayTeamId:41,awayTeamName:'B',status:'SCHEDULED' as const}
      ];
      expect(component.teamPhases).toEqual([{
        key:'round-1',label:'Ronda 1',completed:0,loaded:1
      }]);
      expect(component.teamPhases.some(s=>s.label==='Final')).toBeFalse();
    });

    it('filters only fetched matches without touching paging or results', () => {
      const pending = { id: 71, roundNumber: 1, homeTeamId: 40, homeTeamName: 'Verdes',
        awayTeamId: 41, awayTeamName: 'Azuis', status: 'SCHEDULED' as const };
      const done = { ...pending, id: 72, roundNumber: 2,
        status: 'COMPLETED' as const, homeScore: 2, awayScore: 1 };
      api.teams.and.returnValue(of([team]));
      api.teamMatches.and.returnValue(of({ matches: [pending, done], page: 0, hasMore: true }));
      component.selectTournament({ ...teamDraft, status: 'IN_PROGRESS' });
      const initialCalls = api.teamMatches.calls.count();
      expect(component.visibleTeamMatches.map(item => item.id)).toEqual([71, 72]);
      component.setTeamMatchFilter('PENDING');
      expect(component.visibleTeamMatches.map(item => item.id)).toEqual([71]);
      component.editingTeamResultId = 72;
      component.setTeamMatchFilter('COMPLETED');
      expect(component.editingTeamResultId).toBeNull();
      expect(component.visibleTeamMatches.map(item => item.id)).toEqual([72]);
      expect(component.teamMatches.map(item => item.id)).toEqual([71, 72]);
      expect(component.teamMatchesHasMore).toBeTrue();
      expect(api.teamMatches.calls.count()).toBe(initialCalls);
      component.setTeamMatchFilter('ALL');
      expect(component.visibleTeamMatches.length).toBe(2);
      component.setTeamMatchFilter('PENDING');
      component.selectTournament(draft);
      expect(component.teamMatchFilter).toBe('ALL');
      expect(component.visibleTeamMatches).toEqual([]);
    });

    it('recomputes pending and completed cards after backend result updates', () => {
      const game = { id: 71, roundNumber: 1, homeTeamId: 40, homeTeamName: 'Verdes',
        awayTeamId: 41, awayTeamName: 'Azuis', status: 'SCHEDULED' as const };
      component.teamMatches = [game];
      component.setTeamMatchFilter('PENDING');
      expect(component.visibleTeamMatches.length).toBe(1);
      component.teamMatches = [{ ...game, status: 'COMPLETED', homeScore: 2, awayScore: 1 }];
      expect(component.visibleTeamMatches.length).toBe(0);
      component.setTeamMatchFilter('COMPLETED');
      expect(component.visibleTeamMatches.length).toBe(1);
    });

    it('localizes fixture filters and screen-reader score summaries', () => {
      const previous = localStorage.getItem('d24-language');
      try {
        localStorage.setItem('d24-language', 'pt');
        expect(t('communities.tournaments.fixturesUi.filterPending')).toBe('Por jogar');
        expect(t('communities.tournaments.fixturesUi.loadedSummary', { shown: 3, loaded: 5 })).toContain('3 de 5');
        localStorage.setItem('d24-language', 'en');
        expect(t('communities.tournaments.fixturesUi.filterCompleted')).toBe('Completed');
        expect(t('communities.tournaments.fixturesUi.scoreAria', {
          home: 'A', homeScore: 2, awayScore: 1, away: 'B'
        })).toContain('A 2 — 1 B');
      } finally {
        if (previous === null) localStorage.removeItem('d24-language');
        else localStorage.setItem('d24-language', previous);
      }
    });

    it('labels group fixtures, quarterfinals, semifinals and final without changing league labels', () => {
      component.selected = { ...teamDraft, status: 'IN_PROGRESS',
        format: 'GROUP_KNOCKOUT', groupCount: 4 };
      const game = { id: 91, groupNumber: 1, roundNumber: 2,
        homeTeamId: 11, homeTeamName: 'A', awayTeamId: 12, awayTeamName: 'B',
        status: 'SCHEDULED' as const, homeScore: null, awayScore: null };
      expect(component.teamMatchStageLabel(game)).toBe('Grupo A · Jornada 2');
      expect(component.teamMatchStageLabel({ ...game, groupNumber: null, roundNumber: 1 }))
        .toBe('Quartos de final');
      expect(component.teamMatchStageLabel({ ...game, groupNumber: null, roundNumber: 2 }))
        .toBe('Meias-finais');
      expect(component.teamMatchStageLabel({ ...game, groupNumber: null, roundNumber: 3 }))
        .toBe('Final');

      component.selected = { ...component.selected, groupCount: 2 };
      expect(component.teamMatchStageLabel({ ...game, groupNumber: null, roundNumber: 1 }))
        .toBe('Meias-finais');
      expect(component.teamMatchStageLabel({ ...game, groupNumber: null, roundNumber: 2 }))
        .toBe('Final');
      component.selected = { ...component.selected, format: 'LEAGUE' };
      expect(component.teamMatchStageLabel(game)).toBe('Jornada 2');
    });

    it('translates league, cup and group stage labels PT/EN without changing competition phases', () => {
      const previousLanguage = localStorage.getItem('d24-language');
      const match = { id: 91, groupNumber: 1, roundNumber: 2,
        homeTeamId: 11, homeTeamName: 'A', awayTeamId: 12, awayTeamName: 'B',
        status: 'SCHEDULED' as const, homeScore: null, awayScore: null };
      try {
        component.selected = { ...teamDraft, status: 'IN_PROGRESS',
          format: 'GROUP_KNOCKOUT', groupCount: 4 };
        localStorage.setItem('d24-language', 'en');
        expect(component.teamMatchStageLabel(match)).toBe('Group A · Round 2');
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 1 }))
          .toBe('Quarter-finals');
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 2 }))
          .toBe('Semi-finals');
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 3 }))
          .toBe('Final');
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 4 }))
          .toBe('Knockout round 4');
        component.selected = { ...component.selected, groupCount: 2 };
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 1 }))
          .toBe('Semi-finals');
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 2 }))
          .toBe('Final');
        component.selected = { ...component.selected, format: 'KNOCKOUT' };
        expect(component.teamMatchStageLabel(match)).toBe('Round 2');
        component.selected = { ...component.selected, format: 'LEAGUE' };
        expect(component.teamMatchStageLabel(match)).toBe('Round 2');

        localStorage.setItem('d24-language', 'pt');
        expect(component.teamMatchStageLabel(match)).toBe('Jornada 2');
        component.selected = { ...component.selected, format: 'GROUP_KNOCKOUT', groupCount: 4 };
        expect(component.teamMatchStageLabel(match)).toBe('Grupo A · Jornada 2');
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 1 }))
          .toBe('Quartos de final');
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 2 }))
          .toBe('Meias-finais');
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 3 }))
          .toBe('Final');
        expect(component.teamMatchStageLabel({ ...match, groupNumber: null, roundNumber: 4 }))
          .toBe('Ronda eliminatória 4');
        component.selected = { ...component.selected, format: 'KNOCKOUT' };
        expect(component.teamMatchStageLabel(match)).toBe('Ronda 2');
      } finally {
        if (previousLanguage === null) localStorage.removeItem('d24-language');
        else localStorage.setItem('d24-language', previousLanguage);
      }
      expect(api.recordTeamResult).not.toHaveBeenCalled();
      expect(api.generateTeamSchedule).not.toHaveBeenCalled();
    });

    it('creates a team draft without requiring a roster size', async () => {
      api.createTeamTournament.and.returnValue(of(teamDraft));
      component.startTeamCreation();
      component.nameDraft = ' Torneio CNG 5x5 ';
      await component.createTeamCompetition();
      expect(api.createTeamTournament).toHaveBeenCalledWith(7, 'Torneio CNG 5x5', 'Futebol', null, 1, { winPoints: 3, drawPoints: 1, lossPoints: 0 }, 'GOAL_DIFFERENCE_FIRST', 'LEAGUE');
      expect(api.create).not.toHaveBeenCalled();
      expect(component.selected?.entryType).toBe('TEAM');
      expect(api.teams).toHaveBeenCalledWith(7, 19);
      expect(api.participants).toHaveBeenCalledTimes(1); // initial legacy league only
      expect(api.matches).toHaveBeenCalledTimes(1);
      expect(api.standings).toHaveBeenCalledTimes(1);
    });

    it('passes home-and-away rule at creation and resets the selection afterward', async () => {
      api.createTeamTournament.and.returnValue(of({ ...teamDraft, roundRobinLegs: 2 }));
      component.startTeamCreation();
      component.nameDraft = 'Liga casa e fora';
      component.roundRobinLegsDraft = 2;
      await component.createTeamCompetition();
      expect(api.createTeamTournament).toHaveBeenCalledWith(7, 'Liga casa e fora', 'Futebol', null, 2, { winPoints: 3, drawPoints: 1, lossPoints: 0 }, 'GOAL_DIFFERENCE_FIRST', 'LEAGUE');
      expect(component.selected?.roundRobinLegs).toBe(2);
      expect(Number(component.roundRobinLegsDraft)).toBe(1);
      expect(api.create).not.toHaveBeenCalled();
    });

    it('stores custom team points without changing the community rankings', async () => {
      api.createTeamTournament.and.returnValue(of({
        ...teamDraft, winPoints: 2, drawPoints: 0, lossPoints: 0
      }));
      component.startTeamCreation();
      component.nameDraft = 'Torneio pontos';
      component.winPointsDraft = 2;
      component.drawPointsDraft = 0;
      component.lossPointsDraft = 0;
      await component.createTeamCompetition();
      expect(api.createTeamTournament).toHaveBeenCalledWith(
        7, 'Torneio pontos', 'Futebol', null, 1,
        { winPoints: 2, drawPoints: 0, lossPoints: 0 }, 'GOAL_DIFFERENCE_FIRST', 'LEAGUE');
      expect(component.selected?.winPoints).toBe(2);
      expect(component.winPointsDraft).toBe(3);
      expect(component.drawPointsDraft).toBe(1);
      expect(component.lossPointsDraft).toBe(0);
      expect(api.create).not.toHaveBeenCalled();
      expect(api.standings).toHaveBeenCalledTimes(1);
    });

    it('sends the chosen team tiebreak and restores defaults after creation', async () => {
      api.createTeamTournament.and.returnValue(of({
        ...teamDraft, teamTieBreakPriority: 'WINS_FIRST'
      }));
      component.startTeamCreation();
      component.nameDraft = 'Liga de vitórias';
      component.teamTieBreakPriorityDraft = 'WINS_FIRST';
      await component.createTeamCompetition();
      expect(api.createTeamTournament).toHaveBeenCalledWith(
        7, 'Liga de vitórias', 'Futebol', null, 1,
        { winPoints: 3, drawPoints: 1, lossPoints: 0 }, 'WINS_FIRST', 'LEAGUE');
      expect(component.selected?.teamTieBreakPriority).toBe('WINS_FIRST');
      expect(component.teamTieBreakLabel(component.selected?.teamTieBreakPriority)).toBe('Mais vitórias');
      expect(component.teamTieBreakPriorityDraft).toBe('GOAL_DIFFERENCE_FIRST');
      expect(api.create).not.toHaveBeenCalled();
    });

    it('rejects an unsupported team tiebreak before creating anything', async () => {
      component.startTeamCreation();
      component.nameDraft = 'Liga por equipas';
      component.teamTieBreakPriorityDraft = 'INVALID' as any;
      await component.createTeamCompetition();
      expect(component.error).toContain('desempate');
      expect(api.createTeamTournament).not.toHaveBeenCalled();
    });

    it('creates knockout cup without league rules or standings', async () => {
      api.createTeamTournament.and.returnValue(of({ ...teamDraft, format: 'KNOCKOUT' }));
      component.startTeamCreation();
      component.nameDraft = 'Taça entre amigos';
      component.teamFormatDraft = 'KNOCKOUT';
      component.roundRobinLegsDraft = 2;
      component.teamTieBreakPriorityDraft = 'WINS_FIRST';
      component.winPointsDraft = -1;
      await component.createTeamCompetition();
      expect(api.createTeamTournament).toHaveBeenCalledWith(
        7, 'Taça entre amigos', 'Futebol', null, 2,
        { winPoints: -1, drawPoints: 1, lossPoints: 0 }, 'WINS_FIRST', 'KNOCKOUT');
      expect(component.selected?.format).toBe('KNOCKOUT');
      expect(component.teamFormatDraft).toBe('LEAGUE');
      expect(api.teamStandings).not.toHaveBeenCalled();
    });

    it('rejects cup draws and snapshots final winner', async () => {
      const cup = { ...teamDraft, format: 'KNOCKOUT' as const, status: 'IN_PROGRESS' as const };
      const match = { id: 65, roundNumber: 1, homeTeamId: 40, homeTeamName: 'Verdes',
        awayTeamId: 41, awayTeamName: 'Azuis', status: 'SCHEDULED' as const };
      api.teams.and.returnValue(of([team, { ...team, id: 41, name: 'Azuis' }]));
      api.teamMatches.and.returnValue(of({ matches: [match], page: 0, hasMore: false }));
      component.selectTournament(cup);
      expect(component.knockoutTotalRounds).toBe(1);
      expect(api.teamStandings).not.toHaveBeenCalled();
      component.setTeamScore(match, 'home', 1);
      component.setTeamScore(match, 'away', 1);
      await component.saveTeamScore(match);
      expect(api.recordTeamResult).not.toHaveBeenCalled();
      component.setTeamScore(match, 'away', 0);
      api.recordTeamResult.and.returnValue(of({ ...match,
        homeScore: 1, awayScore: 0, status: 'COMPLETED' as const }));
      await component.saveTeamScore(match);
      expect(component.selected?.status).toBe('COMPLETED');
      expect(component.selected?.championTeamName).toBe('Verdes');
      expect(api.teamStandings).not.toHaveBeenCalled();
    });

    it('requires the return leg before enabling team completion', () => {
      const twoLegs = { ...teamDraft, status: 'IN_PROGRESS' as const, roundRobinLegs: 2 as const };
      api.teamStandings.and.returnValue(of({
        tournamentId: 19, status: 'IN_PROGRESS', totalMatches: 2, completedMatches: 1,
        winPoints: 3, drawPoints: 1, lossPoints: 0,
        standings: [
          { position: 1, teamId: 40, teamName: 'Verdes', played: 1, won: 1,
            drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 0, goalDifference: 1, points: 3 },
          { position: 2, teamId: 41, teamName: 'Azuis', played: 1, won: 0,
            drawn: 0, lost: 1, goalsFor: 0, goalsAgainst: 1, goalDifference: -1, points: 0 }
        ]
      }));
      component.selectTournament(twoLegs);
      expect(component.canCompleteTeam).toBeFalse();
      component.teamStandings!.completedMatches = 2;
      component.teamStandings!.standings.forEach(row => row.played = 2);
      expect(component.canCompleteTeam).toBeTrue();
    });

    it('supports flexible rosters and preserves legacy fixed sizes', () => {
      const flexible = { ...teamDraft, playersPerTeam: null };
      component.selectTournament(flexible);
      const playerOne = { profileId: 2, username: 'ana', displayName: 'Ana' };
      const playerTwo = { profileId: 3, username: 'bruno', displayName: 'Bruno' };
      component.teams = [
        { ...team, playersPerTeam: null, players: [playerOne] },
        { ...team, id: 41, playersPerTeam: null, players: [playerOne, playerTwo] }
      ];
      expect(component.readyTeamCount).toBe(2);
      // Two individually ready squads cannot share the same registered player.
      expect(component.canPublishTeamSchedule).toBeFalse();
      component.teams[1].players = [playerTwo];
      expect(component.canPublishTeamSchedule).toBeTrue();
      expect(component.isTeamRosterFull(component.teams[0])).toBeFalse();
      component.teams[1].players = [];
      expect(component.readyTeamCount).toBe(1);
      expect(component.canPublishTeamSchedule).toBeFalse();
      // Existing fixed-size tournaments retain the exact squad requirement.
      component.teams = [{ ...team, players: [playerOne] }, { ...team, id: 41, players: [playerTwo] }];
      expect(component.canPublishTeamSchedule).toBeFalse();
    });


    it('progressively reveals team cards without hiding teams from management', () => {
      const many = Array.from({length:32}, (_,i) => ({...team,id:40+i,name:'Equipa '+(i+1)}));
      api.teams.and.returnValue(of(many));
      component.selectTournament(teamDraft);
      expect(component.teams.length).toBe(32);
      expect(component.visibleTournamentTeams.length).toBe(12);
      expect(component.hasMoreTournamentTeams).toBeTrue();
      component.expandTeamDirectory();
      expect(component.visibleTournamentTeams.length).toBe(24);
      component.expandTeamDirectory();
      expect(component.visibleTournamentTeams.length).toBe(32);
      expect(component.hasMoreTournamentTeams).toBeFalse();
      const calls=api.teams.calls.count();
      component.setTeamDirectoryQuery('Equipa 2');
      expect(component.visibleTournamentTeams.length).toBe(11);
      expect(component.teamDirectoryLimit).toBe(12);
      component.setTeamDirectoryQuery('');
      expect(component.visibleTournamentTeams.length).toBe(12);
      expect(component.teams.length).toBe(32);
      expect(api.teams.calls.count()).toBe(calls);
      component.selectTournament(draft);
      expect(component.teamDirectoryLimit).toBe(12);
    });

    it('jumps only to available sections of the currently selected team page', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamPageId=40;
      component.teams=[team];
      component.teamGroups={tournamentId:19,knockoutStarted:false,groups:[{
        groupNumber:1,standings:[{teamId:40,teamName:'Verdes',position:1,
          played:1,won:1,drawn:0,lost:0,goalsFor:2,goalsAgainst:0,
          goalDifference:2,points:3}]
      }]};
      const results=document.createElement('section');
      const group=document.createElement('section');group.className='team-page-group-overview';
      results.append(group);
      const roster=document.createElement('div');
      const resultsScroll=jasmine.createSpy('resultsScroll');
      results.scrollIntoView=resultsScroll;
      const resultsFocus=spyOn(results,'focus');
      const groupScroll=jasmine.createSpy('groupScroll');
      group.scrollIntoView=groupScroll;
      const groupFocus=spyOn(group,'focus');
      const rosterScroll=jasmine.createSpy('rosterScroll');
      roster.scrollIntoView=rosterScroll;
      const rosterFocus=spyOn(roster,'focus');
      (component as any).teamProfileSection={nativeElement:results};
      (component as any).teamProfileRoster={nativeElement:roster};
      component.showTeamProfileSection('group');
      expect(groupScroll).toHaveBeenCalledOnceWith({behavior:'smooth',block:'start'});
      expect(groupFocus).toHaveBeenCalledOnceWith({preventScroll:true});
      component.showTeamProfileSection('results');
      expect(resultsScroll).toHaveBeenCalledOnceWith({behavior:'smooth',block:'start'});
      expect(resultsFocus).toHaveBeenCalledOnceWith({preventScroll:true});
      component.showTeamProfileSection('roster');
      expect(rosterScroll).toHaveBeenCalledOnceWith({behavior:'smooth',block:'start'});
      expect(rosterFocus).toHaveBeenCalledOnceWith({preventScroll:true});
      component.teamGroups={...component.teamGroups,tournamentId:22};
      component.showTeamProfileSection('group');
      expect(groupScroll).toHaveBeenCalledTimes(1);
      component.selected={...teamDraft,status:'DRAFT'};
      component.showTeamProfileSection('results');
      expect(resultsScroll).toHaveBeenCalledTimes(1);
      component.teamPageId=998;
      component.showTeamProfileSection('roster');
      expect(rosterScroll).toHaveBeenCalledTimes(1);
    });

    it('jumps from a published phase card to the loaded team fixtures and preserves other filters', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamPageId=40;
      component.teams=[team];
      component.teamProfileMatches=[
        {id:70,roundNumber:1,groupNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED',homeScore:1,awayScore:0},
        {id:71,roundNumber:1,groupNumber:null,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:42,awayTeamName:'Roxos',status:'SCHEDULED'}
      ];
      component.teamProfileMatchFilter='PENDING';
      const section=document.createElement('div');
      const scroll=jasmine.createSpy('scrollIntoView');
      section.scrollIntoView=scroll;
      const focus=spyOn(section,'focus');
      (component as any).teamProfileFixtures={nativeElement:section};
      const calls=api.teamProfileMatches.calls.count();

      component.showTeamProfilePhase('group-1');
      expect(component.teamProfilePhaseFilter).toBe('group-1');
      expect(component.teamProfileMatchFilter).toBe('PENDING');
      expect(scroll).toHaveBeenCalledOnceWith({behavior:'smooth',block:'start'});
      expect(focus).toHaveBeenCalledOnceWith({preventScroll:true});
      component.showTeamProfilePhase('group-1');
      expect(component.teamProfilePhaseFilter).toBe('ALL');
      component.showTeamProfilePhase('round-100');
      expect(scroll).toHaveBeenCalledTimes(2);
      expect(api.teamProfileMatches.calls.count()).toBe(calls);

      component.selected={...teamDraft,status:'DRAFT',format:'GROUP_KNOCKOUT'};
      component.showTeamProfilePhase('group-1');
      expect(scroll).toHaveBeenCalledTimes(2);
      component.selected={...teamDraft,status:'IN_PROGRESS',scoringMode:'RELAY_BEST_TIME'};
      component.showTeamProfilePhase('group-1');
      expect(scroll).toHaveBeenCalledTimes(2);
    });

    it('opens only a real scheduled match from the selected team journey', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamPageId=40;
      component.teams=[team];
      const pending={id:15,roundNumber:2,groupNumber:1,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',status:'SCHEDULED' as const};
      const other={id:12,roundNumber:1,groupNumber:2,homeTeamId:89,
        homeTeamName:'Roxos',awayTeamId:42,awayTeamName:'Brancos',status:'SCHEDULED' as const};
      component.teamProfileMatches=[other,pending];
      const open=spyOn(component,'showTeamProfileFixture');
      component.showTeamProfileNextMatch();
      expect(open).toHaveBeenCalledOnceWith(pending);
      component.teamProfileMatches=[other];
      component.showTeamProfileNextMatch();
      expect(open).toHaveBeenCalledTimes(1);
      component.selected={...teamDraft,status:'DRAFT'};
      component.teamProfileMatches=[pending];
      component.showTeamProfileNextMatch();
      expect(open).toHaveBeenCalledTimes(1);
      component.selected={...teamDraft,status:'IN_PROGRESS',scoringMode:'RELAY_BEST_TIME'};
      component.showTeamProfileNextMatch();
      expect(open).toHaveBeenCalledTimes(1);
    });

    it('resolves adjacent team-page navigation only within the selected tournament', () => {
      const teams=Array.from({length:3},(_,i)=>({...team,id:40+i,name:'Equipa '+i}));
      api.teams.and.returnValue(of(teams));
      component.teamPageId=40;
      component.selectTournament(teamDraft);
      expect(component.teamProfileNavigation).toEqual({
        index:1,total:3,previous:undefined,next:teams[1]
      });
      component.teamPageId=41;
      expect(component.teamProfileNavigation).toEqual({
        index:2,total:3,previous:teams[0],next:teams[2]
      });
      component.teamPageId=42;
      expect(component.teamProfileNavigation.index).toBe(3);
      expect(component.teamProfileNavigation.next).toBeUndefined();
      component.teamPageId=500;
      expect(component.teamProfileNavigation).toEqual({index:0,total:3});
      component.selectTournament(draft);
      expect(component.teamProfileNavigation).toEqual({index:0,total:0});
    });

    it('offers direct team switching only on a valid page with many teams', () => {
      const many = Array.from({ length: 8 }, (_, i) =>
        ({ ...team, id: 40 + i, name: 'Equipa ' + (i + 1) }));
      api.teams.and.returnValue(of(many));
      component.teamPageId = 40;
      component.selectTournament(teamDraft);
      expect(component.teamQuickSwitchTeams.map(item => item.id))
        .toEqual([40, 41, 42, 43, 44, 45, 46, 47]);

      component.teamPageId = 47;
      expect(component.teamQuickSwitchTeams.length).toBe(8);
      component.teamPageId = 999;
      expect(component.teamQuickSwitchTeams).toEqual([]);
      component.teamPageId = null;
      expect(component.teamQuickSwitchTeams).toEqual([]);

      component.teamPageId = 40;
      component.selectTournament(draft);
      expect(component.teamQuickSwitchTeams).toEqual([]);
      api.teams.and.returnValue(of(many.slice(0, 4)));
      component.selectTournament(teamDraft);
      expect(component.teamQuickSwitchTeams).toEqual([]);
    });

    it('bounds the quick team switcher and finds any team by accent-insensitive name', () => {
      const many = Array.from({ length: 35 }, (_, i) =>
        ({ ...team, id: 100 + i, name: 'Equipa ' + (i + 1) }));
      many[29] = { ...many[29], name: 'Águias de Lisboa' };
      api.teams.and.returnValue(of(many));
      component.teamPageId = 100;
      component.selectTournament(teamDraft);
      expect(component.teamQuickSwitchTeams.length).toBe(12);
      expect(component.teamQuickSwitchTotalMatches).toBe(35);
      expect(component.teamQuickSwitchTeams[0].id).toBe(100);
      component.teamPageId = 129;
      expect(component.teamQuickSwitchTeams.map(item => item.id)).toContain(129);
      expect(component.teamQuickSwitchTeams.length).toBe(12);
      component.teamQuickSwitchQuery = '  aguias  ';
      expect(component.teamQuickSwitchTeams.map(item => item.id)).toEqual([129]);
      expect(component.teamQuickSwitchTotalMatches).toBe(1);
      component.teamQuickSwitchQuery = 'inexistente';
      expect(component.teamQuickSwitchTeams).toEqual([]);
      expect(component.teamQuickSwitchTotalMatches).toBe(0);
      component.selectTournament(draft);
      expect(component.teamQuickSwitchQuery).toBe('');
      expect(component.teamQuickSwitchTeams).toEqual([]);
    });

    it('ranks exact quick-switch matches ahead of early partial matches without mutating team order', () => {
      const many: TournamentTeam[] = Array.from({ length: 28 }, (_, i) => ({
        ...team, id: 100 + i, name: 'Clube Águias ' + i, players: []
      }));
      many[24] = { ...many[24], name: 'Águias', players: [] };
      many[25] = { ...many[25], name: 'Águias do Sul', players: [] };
      many[26] = { ...many[26], name: 'Equipa 26', players: [
        { profileId: 88, username: 'aguias', displayName: 'Atleta 88' }
      ] };
      api.teams.and.returnValue(of(many));
      component.teamPageId = 100;
      component.selectTournament(teamDraft);
      component.setTeamQuickSwitchQuery('  AGUIAS  ');
      expect(component.teamQuickSwitchTotalMatches).toBe(28);
      expect(component.teamQuickSwitchTeams.slice(0, 3).map(item => item.id))
        .toEqual([124, 126, 125]);
      expect(component.teamQuickSwitchTeams).toHaveSize(12);
      expect(component.teams.map(item => item.id)).toEqual(many.map(item => item.id));
      component.setTeamQuickSwitchQuery('not found');
      expect(component.teamQuickSwitchTeams).toEqual([]);
    });

    it('loads more quick-switch teams and resets the page when searching', () => {
      const many: TournamentTeam[] = Array.from({ length: 30 }, (_, i) =>
        ({ ...team, id: 100 + i, name: 'Equipa ' + i }));
      api.teams.and.returnValue(of(many));
      component.teamPageId = 100;
      component.selectTournament(teamDraft);
      expect(component.teamQuickSwitchTeams).toHaveSize(12);
      expect(component.teamQuickSwitchTotalMatches).toBe(30);
      component.expandTeamQuickSwitch();
      expect(component.teamQuickSwitchTeams).toHaveSize(24);
      component.expandTeamQuickSwitch();
      expect(component.teamQuickSwitchTeams).toHaveSize(30);
      component.expandTeamQuickSwitch();
      expect(component.teamQuickSwitchTeams).toHaveSize(30);
      component.setTeamQuickSwitchQuery('Equipa 2');
      expect(component.teamQuickSwitchLimit).toBe(12);
      expect(component.teamQuickSwitchTotalMatches).toBe(11);
      component.setTeamQuickSwitchQuery('inexistente');
      expect(component.teamQuickSwitchTeams).toEqual([]);
      component.selectTournament(draft);
      expect(component.teamQuickSwitchLimit).toBe(12);
      expect(component.teamQuickSwitchQuery).toBe('');
    });

    it('finds teams by player identity in the quick switcher without leaking other matches', () => {
      const many: TournamentTeam[] = Array.from({ length: 8 }, (_, i) => ({
        ...team, id: 100 + i, name: 'Equipa ' + i, players: []
      }));
      many[6] = { ...many[6], players: [
        { profileId: 30, username: 'joao-atleta', displayName: 'João Silva' }
      ] };
      many[7] = { ...many[7], players: [
        { profileId: 31, username: null as unknown as string, displayName: 'Rúben Lopes' }
      ] };
      api.teams.and.returnValue(of(many));
      component.teamPageId = 100;
      component.selectTournament(teamDraft);
      component.teamQuickSwitchQuery = 'JOAO';
      expect(component.teamQuickSwitchTeams.map(item => item.id)).toEqual([106]);
      expect(component.teamQuickSwitchTotalMatches).toBe(1);
      component.teamQuickSwitchQuery = 'atleta';
      expect(component.teamQuickSwitchTeams.map(item => item.id)).toEqual([106]);
      component.teamQuickSwitchQuery = 'ruben';
      expect(component.teamQuickSwitchTeams.map(item => item.id)).toEqual([107]);
      expect(component.teamQuickSwitchTotalMatches).toBe(1);
      component.teamQuickSwitchQuery = 'inexistente';
      expect(component.teamQuickSwitchTeams).toEqual([]);
      expect(component.teamQuickSwitchTotalMatches).toBe(0);
      expect(many[6].players[0].username).toBe('joao-atleta');
    });

    it('explains which player matched quick navigation without changing team links', () => {
      const players = [
        { profileId: 30, username: 'joao-atleta', displayName: 'João Silva' },
        { profileId: 31, username: 'ana', displayName: 'Ana Rodrigues' }
      ];
      const many: TournamentTeam[] = Array.from({ length: 6 }, (_, i) =>
        ({ ...team, id: 100 + i, name: 'Equipa ' + i, players: i === 5 ? players : [] }));
      api.teams.and.returnValue(of(many));
      component.teamPageId = 100;
      component.selectTournament(teamDraft);
      component.teamQuickSwitchQuery = 'JOAO';
      expect(component.teamQuickSwitchTeams.map(item => item.id)).toEqual([105]);
      expect(component.teamQuickSwitchMatchedPlayer(many[5])).toBe('João Silva');
      component.teamQuickSwitchQuery = 'ana';
      expect(component.teamQuickSwitchMatchedPlayer(many[5])).toBe('Ana Rodrigues');
      component.teamQuickSwitchQuery = 'equipa 5';
      expect(component.teamQuickSwitchMatchedPlayer(many[5])).toBeUndefined();
      component.teamQuickSwitchQuery = 'equipa 2';
      many[5].players[0].displayName = 'Equipa 12';
      expect(component.teamQuickSwitchMatchedPlayer(many[5])).toBeUndefined();
      many[5].players[0].displayName = 'João Silva';
      many[5].players[0].displayName = 'João da Silva';
      component.setTeamQuickSwitchQuery('  JOÃO    SILVA ');
      expect(component.teamQuickSwitchTeams.map(item => item.id)).toEqual([105]);
      expect(component.teamQuickSwitchMatchedPlayer(many[5])).toBe('João da Silva');
      component.setTeamQuickSwitchQuery('joao inexistente');
      expect(component.teamQuickSwitchTeams).toEqual([]);
      expect(component.teamQuickSwitchMatchedPlayer(many[5])).toBeUndefined();
      component.setTeamQuickSwitchQuery('João Silva');
      many[5].name = 'Equipa João da Silva';
      expect(component.teamQuickSwitchMatchedPlayer(many[5])).toBeUndefined();
      component.teamQuickSwitchQuery = '';
      expect(component.teamQuickSwitchMatchedPlayer(many[5])).toBeUndefined();
      expect(players.map(player => player.profileId)).toEqual([30, 31]);
    });

    it('filters only loaded matches on the team page and resets on team changes', () => {
      const first={id:70,roundNumber:1,homeTeamId:40,homeTeamName:'A',
        awayTeamId:41,awayTeamName:'B',status:'SCHEDULED' as const};
      const second={...first,id:71,status:'COMPLETED' as const,
        homeScore:2,awayScore:1};
      api.teams.and.returnValue(of([team,{...team,id:41}]));
      api.teamProfileMatches.and.returnValue(of({
        matches:[first,second],page:0,hasMore:false
      }));
      component.teamPageId=40;
      component.selectTournament({...teamDraft,status:'IN_PROGRESS'});
      const calls=api.teamProfileMatches.calls.count();
      expect(component.visibleTeamProfileMatches.length).toBe(2);
      component.setTeamProfileMatchFilter('PENDING');
      expect(component.visibleTeamProfileMatches.map(x=>x.id)).toEqual([70]);
      component.setTeamProfileMatchFilter('COMPLETED');
      expect(component.visibleTeamProfileMatches.map(x=>x.id)).toEqual([71]);
      expect(api.teamProfileMatches.calls.count()).toBe(calls);
      component.teamPageId=41;
      component.ngOnChanges({teamPageId:new SimpleChange(40,41,false)});
      expect(component.teamProfileMatchFilter).toBe('ALL');
      expect(component.visibleTeamProfileMatches.length).toBe(2);
    });

    it('filters loaded team games by actual opponent, safely combining phase and status', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamPageId=40;
      component.teams=[team,{...team,id:41,name:'Azuis'},{...team,id:42,name:'Roxos'}];
      const first={id:70,roundNumber:1,groupNumber:1,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',status:'SCHEDULED' as const};
      const second={...first,id:71,roundNumber:2,groupNumber:1,
        homeTeamId:42,homeTeamName:'Roxos',awayTeamId:40,awayTeamName:'Verdes',
        status:'COMPLETED' as const,homeScore:2,awayScore:1};
      const third={...first,id:72,groupNumber:null,roundNumber:1,status:'COMPLETED' as const,
        homeScore:3,awayScore:1};
      const unrelated={...first,id:73,homeTeamId:55,awayTeamId:56};
      component.teamProfileMatches=[first,second,third,unrelated];
      expect(component.teamProfileOpponents.map(x=>x.id)).toEqual([41,42]);
      component.setTeamProfileOpponent('41');
      expect(component.visibleTeamProfileMatches.map(x=>x.id)).toEqual([70,72]);
      component.setTeamProfileMatchFilter('COMPLETED');
      expect(component.visibleTeamProfileMatches.map(x=>x.id)).toEqual([72]);
      component.setTeamProfilePhaseFilter('group-1');
      expect(component.visibleTeamProfileMatches).toEqual([]);
      component.setTeamProfileOpponent('42');
      expect(component.visibleTeamProfileMatches.map(x=>x.id)).toEqual([71]);
      component.setTeamProfileOpponent('999');
      expect(component.teamProfileOpponentId).toBe(42);
      component.setTeamProfileOpponent('oops');
      expect(component.teamProfileOpponentId).toBe(42);
      component.setTeamProfileOpponent('ALL');
      expect(component.visibleTeamProfileMatches.map(x=>x.id)).toEqual([71]);
      component.setTeamProfileOpponent('41');
      const reveal=spyOn(component,'showTeamProfileFixture').and.callThrough();
      component.showTeamProfileFixture(third);
      expect(reveal).toHaveBeenCalledWith(third);
      expect(component.teamProfileOpponentId).toBeNull();
      component.setTeamProfileOpponent('41');
      component['resetTeamProfileMatches']();
      expect(component.teamProfileOpponentId).toBeNull();
      component.teamPageId=99;
      expect(component.teamProfileOpponents).toEqual([]);
    });

    it('shows scoped opponent cards without duplicate fixtures, and keeps selected rivals accessible', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      component.teamPageId=40;
      component.teams=[team,...Array.from({length:9},(_,i)=>({...team,id:50+i,name:'Rival '+i}))];
      const first={id:101,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:50,awayTeamName:'Rival 0',status:'COMPLETED' as const,homeScore:3,awayScore:1};
      const second={id:102,roundNumber:2,homeTeamId:50,homeTeamName:'Rival 0',
        awayTeamId:40,awayTeamName:'Verdes',status:'COMPLETED' as const,homeScore:2,awayScore:2};
      component.teamProfileMatches=[
        first,{...first},second,{...first,id:103,awayTeamId:50,status:'SCHEDULED'},
        {...first,id:104,homeScore:null,awayScore:1},
        ...Array.from({length:8},(_,i)=>({...first,id:200+i,
          awayTeamId:51+i,awayTeamName:'Rival '+(i+1),status:'SCHEDULED' as const})),
        {...first,id:999,homeTeamId:90,awayTeamId:91},
        {...first,id:0,awayTeamId:99,awayTeamName:'Fantasma'}
      ];
      const snapshot=JSON.stringify(component.teamProfileMatches);
      const cards=component.teamProfileOpponentCards;
      expect(cards.length).toBe(9);
      expect(cards[0]).toEqual({id:50,name:'Rival 0',played:2,
        wins:1,draws:1,losses:0,pending:1});
      expect(component.visibleTeamProfileOpponentCards.length).toBe(6);
      const originalCallCount=api.teamProfileMatches.calls.count();
      component.showTeamProfileOpponentCard(58);
      expect(component.teamProfileOpponentId).toBe(58);
      expect(component.visibleTeamProfileOpponentCards.map(c=>c.id)).toContain(58);
      expect(component.visibleTeamProfileMatches.map(m=>m.id)).toEqual([207]);
      component.showTeamProfileOpponentCard(58);
      expect(component.teamProfileOpponentId).toBeNull();
      expect(component.visibleTeamProfileOpponentCards.length).toBe(6);
      component.showTeamProfileOpponentCard(5000);
      expect(component.teamProfileOpponentId).toBeNull();
      component.teamProfileOpponentsExpanded=true;
      expect(component.visibleTeamProfileOpponentCards.length).toBe(9);
      expect(api.teamProfileMatches.calls.count()).toBe(originalCallCount);
      expect(JSON.stringify(component.teamProfileMatches)).toBe(snapshot);
      component.selectTournament({...teamDraft,id:72,status:'DRAFT',format:'LEAGUE'});
      expect(component.teamProfileOpponentsExpanded).toBeFalse();
      expect(component.teamProfileOpponentCards).toEqual([]);
    });

    it('separates scheduled and completed team fixtures in published round order', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamPageId=40;
      component.teams=[team];
      const fixtures=[
        {id:303,roundNumber:3,groupNumber:null,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'SCHEDULED' as const},
        {id:301,roundNumber:1,groupNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:42,awayTeamName:'Roxos',status:'COMPLETED' as const,homeScore:2,awayScore:1},
        {id:306,roundNumber:1,groupNumber:null,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:43,awayTeamName:'Pretos',status:'COMPLETED' as const,homeScore:1,awayScore:0},
        {id:302,roundNumber:2,groupNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:44,awayTeamName:'Amarelos',status:'SCHEDULED' as const},
        {id:305,roundNumber:2,groupNumber:null,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:45,awayTeamName:'Rosas',status:'COMPLETED' as const,homeScore:3,awayScore:0},
        {id:304,roundNumber:1,groupNumber:2,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:46,awayTeamName:'Violetas',status:'SCHEDULED' as const}
      ];
      component.teamProfileMatches=fixtures;
      const snapshot=JSON.stringify(fixtures);
      expect(component.teamProfileFixtureSections.map(section=>section.status))
        .toEqual(['PENDING','COMPLETED']);
      expect(component.teamProfileFixtureSections[0].matches.map(game=>game.id))
        .toEqual([304,302,303]);
      expect(component.teamProfileFixtureSections[1].matches.map(game=>game.id))
        .toEqual([305,306,301]);
      component.setTeamProfileMatchFilter('COMPLETED');
      expect(component.teamProfileFixtureSections.map(section=>section.status))
        .toEqual(['COMPLETED']);
      component.setTeamProfileMatchFilter('PENDING');
      expect(component.teamProfileFixtureSections.map(section=>section.status))
        .toEqual(['PENDING']);
      component.setTeamProfileMatchFilter('ALL');
      component.setTeamProfilePhaseFilter('round-2');
      expect(component.teamProfileFixtureSections.map(section=>section.status))
        .toEqual(['COMPLETED']);
      expect(component.teamProfileFixtureSections[0].matches.map(game=>game.id))
        .toEqual([305]);
      // The phase filter uses the actual registered fixture stage, never a guessed date.
      component.setTeamProfilePhaseFilter('ALL');
      expect(JSON.stringify(fixtures)).toBe(snapshot);
      component.teamProfileMatches=[];
      expect(component.teamProfileFixtureSections).toEqual([]);
    });

    it('shows only validated own-team outcomes and links existing tournament opponents', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamPageId=40;
      const blue={...team,id:41,name:'Azuis'};
      component.teams=[team,blue];
      const home={id:730,roundNumber:1,groupNumber:1,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',
        status:'COMPLETED' as const,homeScore:3,awayScore:1};
      const away={...home,id:731,roundNumber:2,homeTeamId:41,
        homeTeamName:'Azuis',awayTeamId:40,awayTeamName:'Verdes',
        homeScore:2,awayScore:3};
      const tie={...home,id:732,homeScore:1,awayScore:1};
      const pending={...home,id:733,status:'SCHEDULED' as const,
        homeScore:undefined,awayScore:undefined};
      const invalid={...home,id:734,homeScore:-1,awayScore:2};
      const missing={...home,id:735,homeScore:null,awayScore:2};
      const fractional={...home,id:738,homeScore:1.5,awayScore:1};
      const unsafe={...home,id:739,homeScore:Number.MAX_SAFE_INTEGER+1,awayScore:1};
      const outsider={...home,id:736,homeTeamId:77,awayTeamId:78};
      const unknownOpponent={...home,id:737,awayTeamId:99,awayTeamName:'Desconhecidos'};
      const fixtures=[home,away,tie,pending,invalid,missing,outsider,unknownOpponent,
        fractional,unsafe];
      component.teamProfileMatches=fixtures;
      const snapshot=JSON.stringify(fixtures);
      expect(component.teamProfileFixtureOutcome(home)).toBe('WIN');
      expect(component.teamProfileFixtureOutcome(away)).toBe('WIN');
      expect(component.teamProfileFixtureOutcome(tie)).toBe('DRAW');
      expect(component.teamProfileFixtureOutcome(pending)).toBeNull();
      expect(component.teamProfileFixtureOutcome(invalid)).toBeNull();
      expect(component.teamProfileFixtureOutcome(missing)).toBeNull();
      expect(component.teamProfileFixtureOutcome(fractional)).toBeNull();
      expect(component.teamProfileFixtureOutcome(unsafe)).toBeNull();
      expect(component.teamProfileFixtureOutcome(outsider)).toBeNull();
      expect(component.teamProfileFixtureOutcome({...home,id:888})).toBeNull();
      expect(component.teamProfileFixtureRival(home)?.id).toBe(41);
      expect(component.teamProfileFixtureRival(away)?.id).toBe(41);
      expect(component.teamProfileFixtureRival(unknownOpponent)).toBeUndefined();
      expect(component.teamProfileFixtureRival({...home,id:888})).toBeUndefined();
      expect(component.teamProfileFixtureRival(outsider)).toBeUndefined();
      component.teams=[team];
      expect(component.teamProfileFixtureRival(home)).toBeUndefined();
      component.teamPageId=99;
      expect(component.teamProfileFixtureOutcome(home)).toBeNull();
      expect(JSON.stringify(component.teamProfileMatches)).toBe(snapshot);
    });

    it('resolves exact published fixture links across later tournament pages', () => {
      const first={id:70,roundNumber:1,groupNumber:1,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',
        status:'COMPLETED' as const,homeScore:2,awayScore:1};
      const requested={...first,id:75,groupNumber:null,roundNumber:2,
        status:'SCHEDULED' as const};
      component.invitedTournamentId=19;
      component.requestedFixtureId=75;
      component.teamPageId=null;
      const row=document.createElement('div');
      row.dataset['teamFixtureId']='75';
      const scroll=jasmine.createSpy('scrollIntoView');
      row.scrollIntoView=scroll;
      const focus=spyOn(row,'focus');
      const host=document.createElement('section');
      host.appendChild(row);
      (component as any).teamFixturesList={nativeElement:host};
      api.teams.and.returnValue(of([team]));
      api.teamMatches.and.returnValues(
        of({matches:[first],page:0,hasMore:true}),
        of({matches:[requested],page:1,hasMore:false})
      );
      component.selectTournament({...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT'});
      expect(api.teamMatches).toHaveBeenCalledTimes(2);
      expect(api.teamMatches).toHaveBeenCalledWith(7,19,0);
      expect(api.teamMatches).toHaveBeenCalledWith(7,19,1);
      expect(component.focusedPublishedFixtureId).toBe(75);
      expect(component.teamMatchFilter).toBe('ALL');
      expect(component.teamPhaseFilter).toBe('round-2');
      expect(scroll).toHaveBeenCalled();
      expect(focus).toHaveBeenCalled();
      expect(component.requestedTeamFixtureMissing).toBeFalse();
    });

    it('ignores stale or unrelated tournament fixture deep links without inventing games', () => {
      const published={id:70,roundNumber:1,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',
        status:'SCHEDULED' as const};
      component.selected={...teamDraft,status:'IN_PROGRESS'};
      component.teamPageId=null;
      component.teamMatches=[published];
      component.teamMatchesHasMore=false;
      component.teamMatchFilter='PENDING';
      component.invitedTournamentId=19;
      component.requestedFixtureId=70;
      component.revealRequestedTeamFixture();
      expect(component.focusedPublishedFixtureId).toBe(70);
      expect(component.teamMatchFilter).toBe('ALL');
      component.requestedFixtureId=99;
      component.ngOnChanges({requestedFixtureId:new SimpleChange(70,99,false)});
      expect(component.focusedPublishedFixtureId).toBeNull();
      expect(component.requestedTeamFixtureMissing).toBeTrue();
      component.invitedTournamentId=88;
      expect(component.requestedTeamFixtureMissing).toBeFalse();
      component.revealRequestedTeamFixture();
      expect(component.focusedPublishedFixtureId).toBeNull();
      component.invitedTournamentId=19;
      component.teamPageId=40;
      component.requestedFixtureId=70;
      component.revealRequestedTeamFixture();
      expect(component.focusedPublishedFixtureId).toBeNull();
      component.teamPageId=null;
      component.requestedFixtureId=-100;
      component.revealRequestedTeamFixture();
      expect(component.focusedPublishedFixtureId).toBeNull();
    });

    it('deduplicates overlapping fixture pages without losing new matches', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS'};
      component.teamMatches=[];
      component.teamMatchesPage=-1;
      component.teamMatchesHasMore=true;
      const fixture=(id:number)=>({id,roundNumber:1,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',
        status:'SCHEDULED' as const});
      api.teamMatches.and.returnValues(
        of({matches:[fixture(701),fixture(702)],page:0,hasMore:true}),
        of({matches:[fixture(702),fixture(703),fixture(703)],page:1,hasMore:false})
      );
      component.loadTeamMatches(true);
      component.teamScoreDrafts[702]={home:4,away:2};
      component.loadTeamMatches();
      expect(component.teamMatches.map(match=>match.id)).toEqual([701,702,703]);
      expect(component.teamScoreDrafts[702]).toEqual({home:4,away:2});
      expect(component.teamMatchesPage).toBe(1);
      expect(component.teamMatchesHasMore).toBeFalse();
      expect(api.teamMatches).toHaveBeenCalledTimes(2);
    });

    it('replaces old score drafts on full fixture refresh', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS'};
      component.teamMatchesPage=-1;
      const fixture=(id:number)=>({id,roundNumber:1,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',
        status:'SCHEDULED' as const,homeScore:0,awayScore:0});
      api.teamMatches.and.returnValues(
        of({matches:[fixture(801),fixture(802)],page:0,hasMore:false}),
        of({matches:[fixture(802)],page:0,hasMore:false})
      );
      component.loadTeamMatches(true);
      component.teamScoreDrafts[801]={home:3,away:1};
      component.teamScoreDrafts[802]={home:4,away:2};
      component.teamScoreTouched.add(801);
      component.editingTeamResultId=801;
      component.loadTeamMatches(true);
      expect(component.teamMatches.map(match=>match.id)).toEqual([802]);
      expect(component.teamScoreDrafts[801]).toBeUndefined();
      expect(component.teamScoreDrafts[802]).toEqual({home:0,away:0});
      expect(component.teamScoreTouched.size).toBe(0);
      expect(component.editingTeamResultId).toBeNull();
      expect(api.teamMatches).toHaveBeenCalledTimes(2);
    });

    it('bounds deep-link scans and never claims an absent match is loaded', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS'};
      component.invitedTournamentId=19;
      component.requestedFixtureId=900;
      component.teamPageId=null;
      component.teamMatchesHasMore=true;
      component.teamMatchesPage=0;
      api.teamMatches.and.callFake((_cid,_tid,page)=>of({
        matches:[{id:100+page,roundNumber:1,homeTeamId:40,
          homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',
          status:'SCHEDULED' as const}],
        page,hasMore:true
      }));
      component.revealRequestedTeamFixture();
      expect(api.teamMatches).toHaveBeenCalledTimes(component.directFixtureMaxExtraPages);
      expect(component.focusedPublishedFixtureId).toBeNull();
      expect(component.teamMatchesHasMore).toBeTrue();
      expect(component.requestedTeamFixtureMissing).toBeTrue();
    });

    it('resumes only a requested fixture scan in bounded blocks after user action', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS'};
      component.invitedTournamentId=19;
      component.requestedFixtureId=999;
      component.teamPageId=null;
      component.teamMatchesHasMore=true;
      component.teamMatchesPage=0;
      api.teamMatches.and.callFake((_cid,_tid,page)=>of({
        matches:[{id:100+page,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'SCHEDULED' as const}],
        page,hasMore:true
      }));
      component.revealRequestedTeamFixture();
      expect(api.teamMatches).toHaveBeenCalledTimes(component.directFixtureMaxExtraPages);
      expect(component.requestedTeamFixtureMissing).toBeTrue();
      const firstCount=api.teamMatches.calls.count();
      component.continueRequestedTeamFixtureSearch();
      expect(api.teamMatches.calls.count()).toBe(firstCount+component.directFixtureMaxExtraPages);
      expect(component.teamMatchesPage).toBe(component.directFixtureMaxExtraPages*2);
      expect(component.requestedTeamFixtureMissing).toBeTrue();
      component.teamMatchesHasMore=false;
      component.continueRequestedTeamFixtureSearch();
      expect(api.teamMatches.calls.count()).toBe(firstCount+component.directFixtureMaxExtraPages);
      component.requestedFixtureId=null;
      component.teamMatchesHasMore=true;
      component.continueRequestedTeamFixtureSearch();
      expect(api.teamMatches.calls.count()).toBe(firstCount+component.directFixtureMaxExtraPages);
    });

    it('stops resumed fixture search on a real fixture on a subsequent page', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS'};
      component.invitedTournamentId=19;
      component.requestedFixtureId=950;
      component.teamPageId=null;
      component.teamMatchesHasMore=true;
      component.teamMatchesPage=0;
      api.teamMatches.and.callFake((_cid,_tid,page)=>of({
        matches:[{id:page===23?950:100+page,roundNumber:1,homeTeamId:40,
          homeTeamName:'Verdes',awayTeamId:41,awayTeamName:'Azuis',
          status:'SCHEDULED' as const}],
        page,hasMore:true
      }));
      component.revealRequestedTeamFixture();
      expect(component.focusedPublishedFixtureId).toBeNull();
      component.continueRequestedTeamFixtureSearch();
      expect(component.focusedPublishedFixtureId).toBe(950);
      expect(component.requestedTeamFixtureMissing).toBeFalse();
      expect(api.teamMatches.calls.count()).toBe(23);
      const n=api.teamMatches.calls.count();
      component.continueRequestedTeamFixtureSearch();
      expect(api.teamMatches.calls.count()).toBe(n);
    });

    it('summarizes only scored, unique loaded head-to-head fixtures without guessing outcomes', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      component.teamPageId=40;
      component.teams=[team,{...team,id:41,name:'Azuis'}];
      const fixture={id:70,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED' as const,
        homeScore:2,awayScore:1};
      component.teamProfileMatches=[
        fixture, {...fixture}, // repeated page must not count twice
        {...fixture,id:71,homeTeamId:41,awayTeamId:40,homeScore:3,awayScore:1},
        {...fixture,id:72,homeScore:1,awayScore:1},
        {...fixture,id:73,status:'SCHEDULED',homeScore:undefined,awayScore:undefined},
        {...fixture,id:74,homeScore:undefined,awayScore:undefined},
        {...fixture,id:75,awayTeamId:98},
        {...fixture,id:76,homeScore:-1,awayScore:0},
        {...fixture,id:77,homeScore:2,awayScore:-2},
      ];
      expect(component.teamProfileHeadToHead).toBeNull();
      component.setTeamProfileOpponent('41');
      expect(component.teamProfileHeadToHead).toEqual({
        opponentName:'Azuis',played:3,wins:1,draws:1,losses:1,pending:1
      });
      component.setTeamProfileMatchFilter('PENDING');
      expect(component.teamProfileHeadToHead?.played).toBe(3);
      component.selected={...teamDraft,status:'IN_PROGRESS',scoringMode:'RELAY_BEST_TIME'};
      expect(component.teamProfileHeadToHead).toBeNull();
      component.selected={...teamDraft,status:'IN_PROGRESS'};
      component.teamPageId=99;
      expect(component.teamProfileHeadToHead).toBeNull();
      component.teamPageId=40;
      component['resetTeamProfileMatches']();
      expect(component.teamProfileHeadToHead).toBeNull();
    });

    it('deduplicates overlapping fixture pages while rejecting invalid or unrelated rows', () => {
      const first={id:70,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED' as const,
        homeScore:3,awayScore:1};
      const second={...first,id:71,roundNumber:2,homeTeamId:41,awayTeamId:40,
        homeScore:0,awayScore:1};
      api.teams.and.returnValue(of([team,{...team,id:41,name:'Azuis'}]));
      api.teamProfileMatches.and.returnValues(
        of({matches:[first,{...first}],page:0,hasMore:true}),
        of({matches:[first,second,{...second},
          {...first,id:0},{...first,id:72,homeTeamId:98,awayTeamId:99}],
          page:1,hasMore:false})
      );
      component.teamPageId=40;
      component.selectTournament({...teamDraft,status:'IN_PROGRESS'});
      expect(component.teamProfileMatches.map(m=>m.id)).toEqual([70]);
      component.loadTeamProfileMatches();
      expect(component.teamProfileMatches.map(m=>m.id)).toEqual([70,71]);
      expect(component.visibleTeamProfileMatches.map(m=>m.id)).toEqual([70,71]);
      expect(component.focusedTeamJourney.phases.reduce((sum,p)=>sum+p.recorded,0)).toBe(2);
      component.setTeamProfileOpponent('41');
      expect(component.teamProfileOpponentTeam?.name).toBe('Azuis');
      expect(component.teamProfileHeadToHead?.played).toBe(2);
      expect(component.teamProfileHeadToHead?.wins).toBe(2);
      expect(component.teamProfileMatchesHasMore).toBeFalse();
    });

    it('clears combined match filters without refetching and keeps one rival selectable', () => {
      const first={id:70,roundNumber:1,groupNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED' as const,
        homeScore:2,awayScore:0};
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamPageId=40;
      component.teams=[team,{...team,id:41,name:'Azuis'}];
      component.teamProfileMatches=[first];
      expect(component.teamProfileOpponents).toHaveSize(1);
      expect(component.teamProfileHasActiveFilters).toBeFalse();
      component.setTeamProfileOpponent('41');
      component.setTeamProfilePhaseFilter('group-1');
      component.setTeamProfileMatchFilter('PENDING');
      expect(component.teamProfileHasActiveFilters).toBeTrue();
      expect(component.visibleTeamProfileMatches).toEqual([]);
      const calls=api.teamProfileMatches.calls.count();
      component.clearTeamProfileFilters();
      expect(component.teamProfileHasActiveFilters).toBeFalse();
      expect(component.visibleTeamProfileMatches.map(m=>m.id)).toEqual([70]);
      expect(component.teamProfileOpponentTeam).toBeUndefined();
      expect(api.teamProfileMatches.calls.count()).toBe(calls);
    });

    it('scopes recent form and phase counts to the selected team and loaded pages', () => {
      const first={id:70,roundNumber:1,groupNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED' as const,
        homeScore:2,awayScore:1};
      const second={...first,id:71,roundNumber:2,status:'SCHEDULED' as const};
      api.teams.and.returnValue(of([team]));
      api.teamProfileMatches.and.returnValues(
        of({matches:[first],page:0,hasMore:true}),
        of({matches:[second],page:1,hasMore:false})
      );
      component.teamPageId=40;
      component.selectTournament({...teamDraft,format:'GROUP_KNOCKOUT',groupCount:2,status:'IN_PROGRESS'});
      expect(component.focusedTeamJourney.form.map(x=>x.fixture.id)).toEqual([70]);
      expect(component.focusedTeamJourney.phases.map(x=>x.key)).toEqual(['group-1']);
      expect(component.focusedTeamJourney.phases[0].recorded).toBe(1);
      component.loadTeamProfileMatches();
      expect(component.focusedTeamJourney.phases[0].published).toBe(2);
      expect(component.focusedTeamJourney.phases[0].recorded).toBe(1);
      component.setTeamProfilePhaseFilter('group-1');
      expect(component.visibleTeamProfileMatches).toHaveSize(2);
      component.teamPageId=99;
      component.ngOnChanges({teamPageId:new SimpleChange(40,99,false)});
      expect(component.focusedTeamJourney.form).toEqual([]);
      expect(component.focusedTeamJourney.phases).toEqual([]);
    });

    it('keeps the team journey scoped to loaded results and resets on switching teams', () => {
      api.teams.and.returnValue(of([team,{...team,id:41,name:'Azuis'}]));
      const first={id:70,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED' as const,
        homeScore:2,awayScore:1};
      const second={id:71,roundNumber:2,homeTeamId:41,homeTeamName:'Azuis',
        awayTeamId:40,awayTeamName:'Verdes',status:'SCHEDULED' as const};
      api.teamProfileMatches.and.returnValues(
        of({matches:[first],page:0,hasMore:true}),
        of({matches:[second],page:1,hasMore:false}),
        of({matches:[second],page:0,hasMore:false})
      );
      component.teamPageId=40;
      component.selectTournament({...teamDraft,format:'KNOCKOUT',status:'IN_PROGRESS'});
      expect(component.focusedTeamJourney.recent.map(x=>x.fixture.id)).toEqual([70]);
      expect(component.focusedTeamJourney.pending).toEqual([]);
      expect(component.focusedTeamJourney.advancement).toBeNull();
      component.loadTeamProfileMatches();
      expect(component.focusedTeamJourney.advancement?.nextFixture.id).toBe(71);
      expect(component.focusedTeamJourney.pending.map(x=>x.fixture.id)).toEqual([71]);
      component.teamPageId=41;
      component.ngOnChanges({teamPageId:new SimpleChange(40,41,false)});
      expect(component.focusedTeamJourney.recent).toEqual([]);
      expect(component.focusedTeamJourney.pending.map(x=>x.fixture.id)).toEqual([71]);
      expect(component.focusedTeamJourney.advancement).toBeNull();
    });

    it('shows only the selected team official group, sorted without inventing qualification', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamPageId=40;
      component.teams=[team,{...team,id:41,name:'Azuis'}];
      const standing=(id:number,position:number)=>({
        teamId:id,teamName:'Equipa '+id,position,played:3,won:2,
        drawn:0,lost:1,goalsFor:4,goalsAgainst:2,goalDifference:2,points:6
      });
      component.teamGroups={tournamentId:19,knockoutStarted:false,groups:[
        {groupNumber:1,standings:[standing(41,2),standing(40,1)]},
        {groupNumber:2,standings:[standing(42,1),standing(43,2)]}
      ]};
      expect(component.focusedTeamGroupOverview?.groupNumber).toBe(1);
      expect(component.focusedTeamGroupOverview?.rows.map(row=>row.teamId)).toEqual([40,41]);
      expect(component.focusedTeamGroupOverview?.qualified).toBeFalse();
      expect(component.focusedTeamStanding?.teamId).toBe(40);
      component.teamGroups.knockoutStarted=true;
      expect(component.focusedTeamGroupOverview?.qualified).toBeTrue();
      component.teamPageId=41;
      expect(component.focusedTeamGroupOverview?.rows.map(row=>row.teamId)).toEqual([40,41]);
      component.teamPageId=40;
      component.teamGroups={...component.teamGroups,tournamentId:123};
      expect(component.focusedTeamGroupOverview).toBeNull();
      expect(component.focusedTeamStanding).toBeUndefined();
      component.teamGroups={...component.teamGroups,tournamentId:19};
      component.teamGroups.groups[1].standings.push(standing(40,2));
      expect(component.focusedTeamGroupOverview).toBeNull();
      component.teamGroups.groups[1].standings.pop();
      component.teamGroups.groups[0].standings.push(standing(40,3));
      expect(component.focusedTeamGroupOverview).toBeNull();
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      expect(component.focusedTeamGroupOverview).toBeNull();
    });

    it('opens only a uniquely published first-round group qualifier on the team page', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:4};
      component.teamPageId=40;
      component.teams=[team];
      const row={teamId:40,teamName:'Verdes',position:2,played:3,won:1,
        drawn:1,lost:1,goalsFor:2,goalsAgainst:2,goalDifference:0,points:4};
      component.teamGroups={tournamentId:19,knockoutStarted:true,groups:[
        {groupNumber:1,standings:[row]}]};
      const first={id:200,groupNumber:null,roundNumber:1,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:51,awayTeamName:'Pretos',status:'SCHEDULED' as const};
      component.teamProfileMatches=[first];
      expect(component.focusedTeamGroupOverview?.firstFixture?.id).toBe(200);
      const jump=spyOn(component,'showTeamProfileFixture');
      component.showTeamProfileFixture(first);
      expect(jump).toHaveBeenCalledWith(first);
      component.teamProfileMatches=[{...first,roundNumber:2}];
      expect(component.focusedTeamGroupOverview?.firstFixture).toBeNull();
      component.teamProfileMatches=[{...first,groupNumber:1}];
      expect(component.focusedTeamGroupOverview?.firstFixture).toBeNull();
      component.teamProfileMatches=[first,{...first,id:201}];
      expect(component.focusedTeamGroupOverview?.firstFixture).toBeNull();
      component.teamProfileMatches=[first];
      component.teamGroups.knockoutStarted=false;
      expect(component.focusedTeamGroupOverview?.qualified).toBeFalse();
      expect(component.focusedTeamGroupOverview?.firstFixture).toBeNull();
    });

    it('highlights only recorded league rankings, with a separate current-team position when outside the top three', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      component.teams=[
        {...team,id:40,players:[{profileId:1,username:'owner',displayName:'Organizador'}]},
        {...team,id:41,name:'Azuis'}, {...team,id:42,name:'Roxos'},
        {...team,id:43,name:'Brancos'}, {...team,id:44,name:'Amarelos'}
      ];
      const standing=(id:number, position:number, played:number) => ({
        position,teamId:id,teamName:'Equipa '+id,played,won:played,drawn:0,
        lost:0,goalsFor:played,goalsAgainst:0,goalDifference:played,points:played*3
      });
      component.teamStandings={
        tournamentId:19,status:'IN_PROGRESS',totalMatches:10,completedMatches:4,
        winPoints:3,drawPoints:1,lossPoints:0,standings:[
          standing(44,5,0),standing(40,4,1),standing(43,3,2),
          standing(41,1,3),standing(42,2,2)
        ]
      };
      expect(component.teamLeagueHighlights.map(r=>r.teamId)).toEqual([41,42,43]);
      expect(component.myLeagueHighlightOutsideTop?.teamId).toBe(40);
      component.teamStandings.standings[1].position=2;
      expect(component.myLeagueHighlightOutsideTop).toBeUndefined();
      component.teamStandings={...component.teamStandings,tournamentId:123};
      expect(component.teamLeagueHighlights).toEqual([]);
      expect(component.myLeagueHighlightOutsideTop).toBeUndefined();
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE',
        scoringMode:'RELAY_BEST_TIME'};
      expect(component.teamLeagueHighlights).toEqual([]);
    });

    it('reveals large league standings progressively without changing published ranking or fetching again', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      const standings=Array.from({length:29},(_,i)=>({
        position:i+1,teamId:100+i,teamName:'Equipa '+(i+1),
        played:i===28?0:2,won:1,drawn:0,lost:1,
        goalsFor:2,goalsAgainst:1,goalDifference:1,points:3
      }));
      component.teamStandings={
        tournamentId:19,status:'IN_PROGRESS',totalMatches:44,completedMatches:30,
        winPoints:3,drawPoints:1,lossPoints:0,standings
      };
      expect(component.visibleTeamStandings.map(row=>row.teamId))
        .toEqual(standings.slice(0,12).map(row=>row.teamId));
      expect(component.hasMoreTeamStandings).toBeTrue();
      const calls=api.teamStandings.calls.count();
      component.expandTeamStandings();
      expect(component.visibleTeamStandings).toHaveSize(24);
      component.expandTeamStandings();
      expect(component.visibleTeamStandings).toHaveSize(29);
      expect(component.hasMoreTeamStandings).toBeFalse();
      component.expandTeamStandings();
      expect(component.visibleTeamStandings).toHaveSize(29);
      expect(component.teamStandings.standings).toBe(standings);
      expect(api.teamStandings.calls.count()).toBe(calls);
      component.collapseTeamStandings();
      expect(component.visibleTeamStandings).toHaveSize(12);
      component.teamStandings={...component.teamStandings,tournamentId:100};
      expect(component.visibleTeamStandings).toEqual([]);
      expect(component.hasMoreTeamStandings).toBeFalse();
      component.selected={...teamDraft,status:'IN_PROGRESS',scoringMode:'RELAY_BEST_TIME'};
      expect(component.visibleTeamStandings).toEqual([]);
    });

    it('resets expanded league rankings when selecting a different tournament', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      component.teamStandingsLimit=36;
      component.selectTournament({...teamDraft,id:29,name:'Outra liga'});
      expect(component.teamStandingsLimit).toBe(12);
    });

    it('shows the leading recorded standings of each independent group without inventing qualification', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',
        format:'GROUP_KNOCKOUT',groupCount:2};
      const standing=(id:number,position:number,played:number)=>({
        position,teamId:id,teamName:'Equipa '+id,played,won:played,
        drawn:0,lost:0,goalsFor:played,goalsAgainst:0,goalDifference:played,
        points:played*3
      });
      component.teamGroups={
        tournamentId:19,knockoutStarted:false,groups:[
          {groupNumber:1,standings:[standing(1,3,1),standing(2,1,2),
            standing(3,2,1)]},
          {groupNumber:2,standings:[standing(4,1,0),standing(5,2,0)]}
        ]
      };
      expect(component.teamGroupHighlights).toEqual([
        {groupNumber:1,rows:[standing(2,1,2),standing(3,2,1)]}
      ]);
      component.teamGroups={...component.teamGroups, tournamentId:123};
      expect(component.teamGroupHighlights).toEqual([]);
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      expect(component.teamGroupHighlights).toEqual([]);
    });

    it('keeps group standings isolated and jumps only to published groups', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:4};
      component.teamGroups={tournamentId:19,knockoutStarted:false,groups:[
        {groupNumber:2,standings:[{position:1,teamId:41,teamName:'Azuis',played:2,
          won:1,drawn:1,lost:0,goalsFor:3,goalsAgainst:1,goalDifference:2,points:4}]},
        {groupNumber:4,standings:[]}
      ]};
      expect(component.selectedTeamGroupNumber).toBe(2);
      const panel=document.createElement('section');
      const details=document.createElement('details');
      details.dataset['teamGroupNumber']='4';
      const heading=document.createElement('summary');
      details.appendChild(heading);
      panel.appendChild(details);
      const scroll=jasmine.createSpy('scrollIntoView');
      details.scrollIntoView=scroll;
      const focus=spyOn(heading,'focus');
      (component as any).teamTournamentStandings={nativeElement:panel};
      component.showTeamStandingsGroup(4);
      expect(component.selectedTeamGroupNumber).toBe(4);
      expect(details.open).toBeTrue();
      expect(scroll).toHaveBeenCalledOnceWith({behavior:'smooth',block:'start'});
      expect(focus).toHaveBeenCalledOnceWith({preventScroll:true});
      component.showTeamStandingsGroup(3);
      component.showTeamStandingsGroup(NaN);
      expect(component.selectedTeamGroupNumber).toBe(4);
      expect(scroll).toHaveBeenCalledTimes(1);
      component.teamGroups={...component.teamGroups,tournamentId:29};
      expect(component.selectedTeamGroupNumber).toBeNull();
      component.teamGroups={tournamentId:19,knockoutStarted:false,groups:[
        {groupNumber:2,standings:[]}
      ]};
      expect(component.selectedTeamGroupNumber).toBe(2);
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      expect(component.selectedTeamGroupNumber).toBeNull();
      component.showTeamStandingsGroup(2);
      expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('resets the selected group on tournament changes', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamGroups={tournamentId:19,knockoutStarted:false,groups:[
        {groupNumber:1,standings:[]},{groupNumber:2,standings:[]}
      ]};
      component.showTeamStandingsGroup(2);
      expect(component.selectedTeamGroupNumber).toBe(2);
      component.selectTournament({...teamDraft,id:29,format:'GROUP_KNOCKOUT',groupCount:2});
      expect(component.selectedTeamGroupNumber).toBeNull();
    });

    it('summarizes only loaded group fixtures and keeps groups independent', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamGroups={tournamentId:19,knockoutStarted:false,groups:[
        {groupNumber:1,standings:[]},{groupNumber:2,standings:[]}]};
      component.teamMatches=[
        {id:11,roundNumber:2,groupNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:41,awayTeamName:'Azuis',status:'COMPLETED',homeScore:1,awayScore:0},
        {id:10,roundNumber:1,groupNumber:1,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:42,awayTeamName:'Roxos',status:'COMPLETED',homeScore:2,awayScore:1},
        {id:14,roundNumber:3,groupNumber:1,homeTeamId:41,homeTeamName:'Azuis',
          awayTeamId:42,awayTeamName:'Roxos',status:'SCHEDULED'},
        {id:12,roundNumber:1,groupNumber:2,homeTeamId:43,homeTeamName:'Brancos',
          awayTeamId:44,awayTeamName:'Pretos',status:'COMPLETED',homeScore:0,awayScore:0},
        {id:13,roundNumber:1,groupNumber:null,homeTeamId:40,homeTeamName:'Verdes',
          awayTeamId:43,awayTeamName:'Brancos',status:'SCHEDULED'}
      ];
      expect(component.publishedGroupFixtureOverview(1)).toEqual({
        total:3,completed:2,results:[component.teamMatches[0],component.teamMatches[1]],
        pending:[component.teamMatches[2]]});
      expect(component.publishedGroupFixtureOverview(2)).toEqual({
        total:1,completed:1,results:[component.teamMatches[3]],pending:[]});
      expect(component.publishedGroupFixtureOverview(3).total).toBe(0);
      component.teamGroups={...component.teamGroups,tournamentId:20};
      expect(component.publishedGroupFixtureOverview(1).total).toBe(0);
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      expect(component.publishedGroupFixtureOverview(1).total).toBe(0);
    });

    it('opens a genuine group fixture without retaining conflicting filters', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      const fixture={id:18,roundNumber:1,groupNumber:2,
        homeTeamId:40,homeTeamName:'Verdes',awayTeamId:43,awayTeamName:'Brancos',
        status:'COMPLETED' as const,homeScore:2,awayScore:1};
      component.teamMatches=[fixture];
      component.teamPhaseFilter='ALL';
      component.teamMatchFilter='PENDING';
      component.editingTeamResultId=18;
      component.showPublishedGroupFixture(2,fixture);
      expect(component.teamPhaseFilter).toBe('group-2');
      expect(component.teamMatchFilter).toBe('ALL');
      expect(component.editingTeamResultId).toBeNull();
      component.showPublishedGroupFixture(1,fixture);
      expect(component.teamPhaseFilter).toBe('group-2');
      component.showPublishedGroupFixture(2,{...fixture,id:999});
      expect(component.teamPhaseFilter).toBe('group-2');
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      component.showPublishedGroupFixture(2,fixture);
      expect(component.teamPhaseFilter).toBe('group-2');
    });

    it('links only qualified group teams to their uniquely published first knockout match', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      const standing=(teamId:number,position:number)=>({
        teamId,position,teamName:'Equipa '+teamId,played:3,won:2,drawn:0,
        lost:1,goalsFor:4,goalsAgainst:2,goalDifference:2,points:6
      });
      component.teamGroups={tournamentId:19,knockoutStarted:false,groups:[
        {groupNumber:1,standings:[standing(40,1),standing(41,2),standing(42,3)]},
        {groupNumber:2,standings:[standing(43,1),standing(44,2)]}
      ]};
      const semi={id:86,roundNumber:1,groupNumber:null,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:44,awayTeamName:'Amarelos',
        status:'SCHEDULED' as const};
      component.teamMatches=[semi];
      expect(component.publishedGroupKnockoutFixture(1,40)).toBeNull();
      component.teamGroups.knockoutStarted=true;
      expect(component.publishedGroupKnockoutFixture(1,40)?.id).toBe(86);
      expect(component.publishedGroupKnockoutFixture(2,44)?.id).toBe(86);
      expect(component.publishedGroupKnockoutFixture(1,42)).toBeNull();
      expect(component.publishedGroupKnockoutFixture(2,40)).toBeNull();
      expect(component.publishedGroupKnockoutFixture(1,99)).toBeNull();
      const focus=spyOn(component,'focusPublishedKnockoutInBoard');
      component.showGroupTeamKnockout(1,40);
      expect(component.knockoutFocusTeamId).toBe(40);
      expect(focus).toHaveBeenCalledOnceWith(semi);
      component.showGroupTeamKnockout(1,42);
      expect(focus).toHaveBeenCalledTimes(1);
      component.teamMatches=[{...semi,groupNumber:1}];
      expect(component.publishedGroupKnockoutFixture(1,40)).toBeNull();
      component.teamMatches=[semi,{...semi,id:87}];
      expect(component.publishedGroupKnockoutFixture(1,40)).toBeNull();
      component.teamMatches=[semi];
      component.teamGroups.groups[1].standings.push(standing(40,2));
      expect(component.publishedGroupKnockoutFixture(1,40)).toBeNull();
      component.teamGroups={...component.teamGroups,tournamentId:777};
      expect(component.publishedGroupKnockoutFixture(1,40)).toBeNull();
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      expect(component.publishedGroupKnockoutFixture(1,40)).toBeNull();
    });

    it('links bracket contenders back only to their verified backend group', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      const standing=(id:number,position:number)=>({
        teamId:id,teamName:'Equipa '+id,position,played:2,won:1,drawn:0,lost:1,
        goalsFor:2,goalsAgainst:1,goalDifference:1,points:3
      });
      component.teamGroups={tournamentId:19,knockoutStarted:true,groups:[
        {groupNumber:1,standings:[standing(40,1),standing(41,3)]},
        {groupNumber:2,standings:[standing(43,2)]}
      ]};
      const fixture={id:91,roundNumber:1,groupNumber:null,homeTeamId:40,
        homeTeamName:'Verdes',awayTeamId:43,awayTeamName:'Brancos',
        status:'SCHEDULED' as const};
      component.teamMatches=[fixture];
      expect(component.publishedKnockoutSourceGroup(fixture,40)).toBe(1);
      expect(component.publishedKnockoutSourceGroup(fixture,43)).toBe(2);
      expect(component.publishedKnockoutSourceGroup(fixture,41)).toBeNull();
      expect(component.publishedKnockoutSourceGroup({...fixture,roundNumber:2},40)).toBeNull();
      expect(component.publishedKnockoutSourceGroup({...fixture,groupNumber:1},40)).toBeNull();
      expect(component.publishedKnockoutSourceGroup({...fixture,id:92},40)).toBeNull();
      component.teamMatches=[fixture,{...fixture,id:92,awayTeamId:42}];
      expect(component.publishedKnockoutSourceGroup(fixture,40)).toBeNull();
      component.teamMatches=[fixture];
      component.teamGroups.groups[1].standings.push(standing(40,2));
      expect(component.publishedKnockoutSourceGroup(fixture,40)).toBeNull();
      component.teamGroups.groups[1].standings.pop();
      component.teamGroups.knockoutStarted=false;
      expect(component.publishedKnockoutSourceGroup(fixture,40)).toBeNull();
      component.teamGroups.knockoutStarted=true;
      component.teamGroups.tournamentId=777;
      expect(component.publishedKnockoutSourceGroup(fixture,40)).toBeNull();
      component.teamGroups.tournamentId=19;
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      expect(component.publishedKnockoutSourceGroup(fixture,40)).toBeNull();
    });

    it('never links a later knockout stage as the immediate group qualifier', () => {
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:4};
      component.teamGroups={tournamentId:19,knockoutStarted:true,groups:[
        {groupNumber:1,standings:[{teamId:40,teamName:'Verdes',position:1,played:2,
          won:2,drawn:0,lost:0,goalsFor:4,goalsAgainst:0,goalDifference:4,points:6}]}
      ]};
      component.teamMatches=[{id:91,roundNumber:2,groupNumber:null,
        homeTeamId:40,homeTeamName:'Verdes',awayTeamId:44,
        awayTeamName:'Amarelos',status:'SCHEDULED'}];
      expect(component.publishedGroupKnockoutFixture(1,40)).toBeNull();
      component.teamMatches=[{...component.teamMatches[0],roundNumber:1}];
      expect(component.publishedGroupKnockoutFixture(1,40)?.id).toBe(91);
    });

    it('offers only actual published team sections, never draft or relay brackets', () => {
      component.selectTournament(teamDraft);
      expect(component.teamOverviewSections).toEqual(['teams']);
      // selectTournament intentionally ignores reselecting the same ID.
      // Simulate the backend's in-progress status update directly.
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'};
      expect(component.teamOverviewSections).toEqual(['teams','fixtures']);
      component.teamMatches=[{id:71,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'SCHEDULED'}];
      expect(component.teamOverviewSections).toEqual(['teams','fixtures','bracket']);
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'GROUP_KNOCKOUT',groupCount:2};
      component.teamMatches[0]={...component.teamMatches[0],groupNumber:1};
      expect(component.teamOverviewSections).toEqual(['teams','fixtures','standings']);
      component.teamMatches[0]={...component.teamMatches[0],groupNumber:null};
      expect(component.teamOverviewSections).toEqual(['teams','fixtures','bracket','standings']);
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE'};
      expect(component.teamOverviewSections).toEqual(['teams','fixtures','standings']);
      component.selected={...teamDraft,status:'IN_PROGRESS',format:'LEAGUE',scoringMode:'RELAY_BEST_TIME'};
      expect(component.teamOverviewSections).toEqual(['teams']);
      component.teamPageId=40;
      expect(component.teamOverviewSections).toEqual([]);
    });

    it('focuses an existing overview section without touching results or page filters', () => {
      component.selectTournament({...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'});
      const game={id:71,roundNumber:1,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'SCHEDULED' as const};
      component.teamMatches=[game];
      const section=document.createElement('details');
      section.open=false;
      const scroll=jasmine.createSpy('scrollIntoView');
      const focus=jasmine.createSpy('focus');
      section.scrollIntoView=scroll;
      section.focus=focus;
      (component as any).teamTournamentBracket={nativeElement:section};
      component.teamMatchFilter='COMPLETED';
      component.showTeamOverviewSection('bracket');
      expect(section.open).toBeTrue();
      expect(scroll).toHaveBeenCalledOnceWith({behavior:'smooth',block:'start'});
      expect(focus).toHaveBeenCalledOnceWith({preventScroll:true});
      expect(component.teamMatchFilter).toBe('COMPLETED');
      component.showTeamOverviewSection('standings');
      expect(scroll).toHaveBeenCalledTimes(1);
      component.selected={...teamDraft,status:'DRAFT'};
      component.showTeamOverviewSection('bracket');
      expect(scroll).toHaveBeenCalledTimes(1);
    });

    it('navigates a verified team fixture by clearing filters and focusing its real card', () => {
      const game={id:90,roundNumber:2,homeTeamId:40,homeTeamName:'Verdes',
        awayTeamId:41,awayTeamName:'Azuis',status:'SCHEDULED' as const};
      api.teams.and.returnValue(of([team]));
      api.teamProfileMatches.and.returnValue(of({matches:[game],page:0,hasMore:false}));
      component.teamPageId=40;
      component.selectTournament({...teamDraft,status:'IN_PROGRESS',format:'KNOCKOUT'});
      component.teamProfileMatchFilter='COMPLETED';
      component.teamProfilePhaseFilter='round-2';
      const row={scrollIntoView:jasmine.createSpy('scrollIntoView'),
        focus:jasmine.createSpy('focus')};
      const querySelector=jasmine.createSpy('querySelector').and.returnValue(row);
      (component as any).teamProfileSection={nativeElement:{querySelector}};
      component.showTeamProfileFixture(game);
      expect(component.teamProfileMatchFilter).toBe('ALL');
      expect(component.teamProfilePhaseFilter).toBe('ALL');
      expect(querySelector).toHaveBeenCalledWith('[data-team-profile-fixture-id="90"]');
      expect(row.scrollIntoView).toHaveBeenCalled();
      expect(row.focus).toHaveBeenCalled();
      component.teamProfileMatchFilter='COMPLETED';
      component.showTeamProfileFixture({...game,id:100,homeTeamId:800,awayTeamId:900});
      expect(component.teamProfileMatchFilter).toBe('COMPLETED');
      expect(querySelector).toHaveBeenCalledTimes(1);
    });

    it('filters the team page by real group and elimination phases, not global fixtures', () => {
      const groups={...teamDraft,format:'GROUP_KNOCKOUT' as const,groupCount:2 as const,
        status:'IN_PROGRESS' as const};
      api.teams.and.returnValue(of([team,{...team,id:41}]));
      api.teamProfileMatches.and.returnValue(of({matches:[
        {id:90,roundNumber:1,groupNumber:1,homeTeamId:40,homeTeamName:'A',
          awayTeamId:41,awayTeamName:'B',status:'COMPLETED',homeScore:1,awayScore:0},
        {id:91,roundNumber:2,groupNumber:1,homeTeamId:41,homeTeamName:'B',
          awayTeamId:40,awayTeamName:'A',status:'SCHEDULED'},
        {id:92,roundNumber:1,groupNumber:null,homeTeamId:40,homeTeamName:'A',
          awayTeamId:42,awayTeamName:'C',status:'SCHEDULED'}
      ],page:0,hasMore:false}));
      component.teamPageId=40;
      component.selectTournament(groups);
      const expected=[['group-1','Grupo A',1,2],['round-1','Meias-finais',0,1]];
      expect(component.teamProfilePhases.map(phase=>
        [phase.key,phase.label,phase.completed,phase.loaded])).toEqual(expected);
      const loadedCalls=api.teamProfileMatches.calls.count();
      component.setTeamProfilePhaseFilter('group-1');
      expect(component.visibleTeamProfileMatches.map(game=>game.id)).toEqual([90,91]);
      component.setTeamProfileMatchFilter('PENDING');
      expect(component.visibleTeamProfileMatches.map(game=>game.id)).toEqual([91]);
      component.setTeamProfilePhaseFilter('round-1');
      expect(component.visibleTeamProfileMatches.map(game=>game.id)).toEqual([92]);
      component.setTeamProfileMatchFilter('COMPLETED');
      expect(component.visibleTeamProfileMatches).toEqual([]);
      component.setTeamProfilePhaseFilter('round-9');
      expect(component.teamProfilePhaseFilter).toBe('round-1');
      component.setTeamProfileMatchFilter('ALL');
      component.setTeamProfilePhaseFilter('ALL');
      expect(component.visibleTeamProfileMatches.map(game=>game.id)).toEqual([90,91,92]);
      expect(api.teamProfileMatches.calls.count()).toBe(loadedCalls);
      expect(component.teamMatches).toEqual([]); // The global board is a different source.
      component.teamPageId=41;
      component.ngOnChanges({teamPageId:new SimpleChange(40,41,false)});
      expect(component.teamProfilePhaseFilter).toBe('ALL');
      expect(component.teamProfileMatchFilter).toBe('ALL');
    });

    it('never invents later league rounds while loading paginated team fixtures', () => {
      const fixture={id:100,roundNumber:2,homeTeamId:40,homeTeamName:'A',
        awayTeamId:41,awayTeamName:'B',status:'SCHEDULED' as const};
      api.teams.and.returnValue(of([team]));
      api.teamProfileMatches.and.returnValues(
        of({matches:[fixture],page:0,hasMore:true}),
        of({matches:[{...fixture,id:101,roundNumber:4,status:'COMPLETED',
          homeScore:2,awayScore:1}],page:1,hasMore:false})
      );
      component.teamPageId=40;
      component.selectTournament({...teamDraft,status:'IN_PROGRESS'});
      expect(component.teamProfilePhases.map(phase=>phase.key)).toEqual(['round-2']);
      component.setTeamProfilePhaseFilter('round-4');
      expect(component.teamProfilePhaseFilter).toBe('ALL');
      component.loadTeamProfileMatches();
      expect(component.teamProfilePhases.map(phase=>phase.key)).toEqual(['round-2','round-4']);
      component.setTeamProfilePhaseFilter('round-4');
      expect(component.visibleTeamProfileMatches.map(game=>game.id)).toEqual([101]);
      component.selectTournament({...teamDraft,id:20});
      expect(component.teamProfilePhaseFilter).toBe('ALL');
      expect(component.teamProfilePhases).toEqual([]);
    });

    it('prioritizes exact matches in the main team directory without changing API order', () => {
      const many: TournamentTeam[] = Array.from({ length: 26 }, (_, i) => ({
        ...team, id: 100 + i, name: 'Clube Águias ' + i, players: []
      }));
      many[22] = { ...many[22], name: 'Águias', players: [] };
      many[23] = { ...many[23], name: 'Águias do Norte', players: [] };
      many[24] = { ...many[24], name: 'Equipa 24', players: [
        { profileId: 88, username: 'aguias', displayName: 'Jogador 88' }
      ] };
      api.teams.and.returnValue(of(many));
      component.selectTournament(teamDraft);
      component.setTeamDirectoryQuery(' AGUIAS ');
      expect(component.filteredTournamentTeams).toHaveSize(26);
      expect(component.visibleTournamentTeams.slice(0, 3).map(item => item.id))
        .toEqual([122, 124, 123]);
      expect(component.visibleTournamentTeams).toHaveSize(12);
      expect(component.teams.map(item => item.id)).toEqual(many.map(item => item.id));
      component.expandTeamDirectory();
      expect(component.visibleTournamentTeams).toHaveSize(24);
      component.setTeamDirectoryQuery('');
      expect(component.visibleTournamentTeams.slice(0, 3).map(item => item.id))
        .toEqual([100, 101, 102]);
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
    });

    it('finds multiword player names and teams without requiring adjacent words', () => {
      const entries: TournamentTeam[] = [
        { ...team, id: 51, name: 'João Silva', players: [] },
        { ...team, id: 52, name: 'Equipa Azul', players: [
          { profileId: 17, username: 'joao.silva', displayName: 'João da Silva' }
        ] },
        { ...team, id: 53, name: 'Clube João da Silva', players: [] },
        { ...team, id: 54, name: 'Clube Silva', players: [
          { profileId: 18, username: 'maria.santos', displayName: 'Maria Santos' }
        ] }
      ];
      api.teams.and.returnValue(of(entries));
      component.selectTournament(teamDraft);
      component.setTeamDirectoryQuery('  JOÃO    SILVA  ');
      expect(component.visibleTournamentTeams.map(item => item.id)).toEqual([51, 52, 53]);
      component.setTeamDirectoryQuery('João inexistente');
      expect(component.visibleTournamentTeams).toEqual([]);
      expect(component.teams.map(item => item.id)).toEqual([51, 52, 53, 54]);
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
    });

    it('searches the team directory without changing saved teams or fixtures', () => {
      const blue = { ...team, id: 41, name: 'São Azul' };
      const green = { ...team, id: 42, name: 'Verdes' };
      api.teams.and.returnValue(of([team, blue, green]));
      component.selectTournament(teamDraft);
      expect(component.visibleTournamentTeams.length).toBe(3);
      const calls = api.teams.calls.count();
      component.teamDirectoryQuery = '  SAO az  ';
      expect(component.visibleTournamentTeams.map(entry => entry.id)).toEqual([41]);
      expect(component.teams.length).toBe(3);
      expect(api.teams.calls.count()).toBe(calls);
      component.teamDirectoryQuery = 'inexistente';
      expect(component.visibleTournamentTeams).toEqual([]);
      component.teamDirectoryQuery = '';
      expect(component.visibleTournamentTeams.length).toBe(3);
    });

    it('finds a team through a player name or username without exposing extra cards', () => {
      const rio = { ...team, id: 41, name: 'Azuis', players: [
        { profileId: 102, username: 'joao.silva', displayName: 'João da Silva' }
      ] };
      const verde = { ...team, id: 42, name: 'Verdes', players: [
        { profileId: 103, username: 'maria.santos', displayName: 'Maria Santos' }
      ] };
      api.teams.and.returnValue(of([rio, verde]));
      component.selectTournament(teamDraft);
      const initialCount = component.teams.length;
      const calls = api.teams.calls.count();

      component.setTeamDirectoryQuery('  JOAO  ');
      expect(component.visibleTournamentTeams.map(entry => entry.id)).toEqual([41]);
      component.setTeamDirectoryQuery('MARIA.SANTOS');
      expect(component.visibleTournamentTeams.map(entry => entry.id)).toEqual([42]);
      component.setTeamDirectoryQuery('azuis');
      expect(component.visibleTournamentTeams.map(entry => entry.id)).toEqual([41]);
      component.setTeamDirectoryQuery('inexistente');
      expect(component.visibleTournamentTeams).toEqual([]);
      component.setTeamDirectoryQuery('');
      expect(component.visibleTournamentTeams.map(entry => entry.id)).toEqual([41, 42]);
      expect(component.teams.length).toBe(initialCount);
      expect(api.teams.calls.count()).toBe(calls);
    });

    it('clears a team-directory search when switching tournaments', () => {
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      component.teamDirectoryQuery = 'Verdes';
      component.selectTournament(draft);
      expect(component.teamDirectoryQuery).toBe('');
      expect(component.visibleTournamentTeams).toEqual([]);
    });

    it('localizes directory and team-management headings in PT and EN', () => {
      const previous = localStorage.getItem('d24-language');
      try {
        localStorage.setItem('d24-language', 'pt');
        expect(t('communities.tournaments.teamPage.manageTitle')).toBe('Gerir a equipa');
        expect(t('communities.tournaments.teamPage.searchCount', { shown: 2, total: 12 })).toContain('2 de 12');
        localStorage.setItem('d24-language', 'en');
        expect(t('communities.tournaments.teamPage.playersTitle')).toBe('Players');
        expect(t('communities.tournaments.teamPage.searchCount', { shown: 2, total: 12 })).toContain('2 of 12');
      } finally {
        if (previous === null) localStorage.removeItem('d24-language');
        else localStorage.setItem('d24-language', previous);
      }
    });

    it('opens one dedicated team without changing tournament permissions or invitation IDs', () => {
      api.teams.and.returnValue(of([team, { ...team, id: 41, name: 'Azuis' }]));
      component.teamPageId = 41;
      component.selectTournament(teamDraft);
      expect(component.focusedTeam?.name).toBe('Azuis');
      expect(component.selected?.id).toBe(19);
      expect(component.invitedTeam).toBeUndefined();
      component.teamPageId = 999;
      expect(component.focusedTeam).toBeUndefined();
      component.teamPageId = null;
      expect(component.focusedTeam).toBeUndefined();
      component.invitedTournamentId = 19;
      component.invitedTeamId = 40;
      expect(component.invitedTeam?.id).toBe(40);
      expect(component.teamInviteUrl(team)).toContain('team=40');
      expect(component.teamInviteUrl(team)).toContain('teamPage=40');
      expect(component.teamInviteUrl({ ...team, id: 999 })).toBe('');
      expect(component.teamWhatsAppUrl({ ...team, id: 999 })).toBe('');
      component.selectTournament(draft);
      expect(component.teamInviteUrl(team)).toBe('');
    });

    it('never exposes team invite links while rosters are unavailable, full or closed', () => {
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      expect(component.teamInviteUrl(team)).toContain('team=40');
      expect(component.teamWhatsAppUrl(team)).toContain('wa.me');
      const filled = { ...team, players: Array.from({ length: 5 }, (_, i) => ({
        profileId: i + 1, username: 'player' + i, displayName: 'Player ' + i
      })) };
      component.teams = [filled];
      expect(component.teamInviteUrl(team)).toBe('');
      expect(component.teamWhatsAppUrl(team)).toBe('');
      component.teams = [team];
      component.detailsLoading = true;
      expect(component.teamInviteUrl(team)).toBe('');
      component.detailsLoading = false;
      component.teamsLoadError = true;
      expect(component.teamInviteUrl(team)).toBe('');
      component.teamsLoadError = false;
      component.selected = { ...teamDraft, status: 'IN_PROGRESS' };
      expect(component.teamInviteUrl(team)).toBe('');
      expect(component.teamWhatsAppUrl(team)).toBe('');
      component.selected = teamDraft;
      component.community = { ...component.community, myRole: 'MEMBER' };
      expect(component.teamInviteUrl(team)).toBe('');
      expect(component.teamWhatsAppUrl(team)).toBe('');
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
    });

    it('shares the current team name, not a stale card name, via WhatsApp', () => {
      const renamed = { ...team, name: 'Águias de Lisboa' };
      api.teams.and.returnValue(of([renamed]));
      component.selectTournament(teamDraft);
      const link = component.teamWhatsAppUrl(team);
      const message = new URL(link).searchParams.get('text');
      expect(message).toContain('Águias de Lisboa');
      expect(message).not.toContain('Verdes');
      expect(message).toContain('team=40');
      expect(component.teamWhatsAppUrl({ ...team, id: 999 })).toBe('');
    });

    it('does not restore copied-link feedback after a roster reload during clipboard write', async () => {
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      let finishCopy!: () => void;
      const deferred = new Promise<void>(resolve => { finishCopy = resolve; });
      const oldClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jasmine.createSpy('writeText').and.returnValue(deferred) }
      });
      try {
        const pending = component.copyTeamInvite(team);
        component.loadTeams();
        expect(component.inviteCopyFeedback).toEqual({});
        finishCopy();
        await pending;
        expect(component.inviteCopyFeedback).toEqual({});
        expect(api.removeTeamPlayer).not.toHaveBeenCalled();
      } finally {
        if (oldClipboard) Object.defineProperty(navigator, 'clipboard', oldClipboard);
        else delete (navigator as any).clipboard;
      }
    });

    it('ignores clipboard completion after switching tournaments', async () => {
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      let finishCopy!: () => void;
      const deferred = new Promise<void>(resolve => { finishCopy = resolve; });
      const oldClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jasmine.createSpy('writeText').and.returnValue(deferred) }
      });
      try {
        const pending = component.copyTeamInvite(team);
        component.selectTournament(draft);
        finishCopy();
        await pending;
        expect(component.inviteCopyFeedback[team.id]).toBeUndefined();
      } finally {
        if (oldClipboard) Object.defineProperty(navigator, 'clipboard', oldClipboard);
        else delete (navigator as any).clipboard;
      }
    });

    it('does not copy invitations for stale, full or unavailable team rosters', async () => {
      api.teams.and.returnValue(of([{ ...team, players: [
        { profileId: 1, username: 'one', displayName: 'One' },
        { profileId: 2, username: 'two', displayName: 'Two' },
        { profileId: 3, username: 'three', displayName: 'Three' },
        { profileId: 4, username: 'four', displayName: 'Four' },
        { profileId: 5, username: 'five', displayName: 'Five' }
      ] }]));
      component.selectTournament(teamDraft);
      const clipboard = jasmine.createSpy('writeText').and.resolveTo();
      const oldClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { writeText: clipboard }
      });
      try {
        await component.copyTeamInvite(team);
        await component.copyTeamInvite({ ...team, id: 999 });
        expect(clipboard).not.toHaveBeenCalled();

        component.teams = [team];
        component.detailsLoading = true;
        await component.copyTeamInvite(team);
        expect(clipboard).not.toHaveBeenCalled();

        component.detailsLoading = false;
        component.teamsLoadError = true;
        await component.copyTeamInvite(team);
        expect(clipboard).not.toHaveBeenCalled();
      } finally {
        if (oldClipboard) Object.defineProperty(navigator, 'clipboard', oldClipboard);
        else delete (navigator as any).clipboard;
      }
    });

    it('does not report a copied invitation after the roster becomes full', async () => {
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      let finishCopy!: () => void;
      const deferred = new Promise<void>(resolve => { finishCopy = resolve; });
      const oldClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jasmine.createSpy('writeText').and.returnValue(deferred) }
      });
      try {
        const pending = component.copyTeamInvite(team);
        component.teams = [{ ...team, players: [
          { profileId: 1, username: 'one', displayName: 'One' },
          { profileId: 2, username: 'two', displayName: 'Two' },
          { profileId: 3, username: 'three', displayName: 'Three' },
          { profileId: 4, username: 'four', displayName: 'Four' },
          { profileId: 5, username: 'five', displayName: 'Five' }
        ] }];
        finishCopy();
        await pending;
        expect(component.inviteCopyFeedback[team.id]).toBeUndefined();
      } finally {
        if (oldClipboard) Object.defineProperty(navigator, 'clipboard', oldClipboard);
        else delete (navigator as any).clipboard;
      }
    });

    it('provides roster-specific search labels and result counts in PT and EN', () => {
      const previous = localStorage.getItem('d24-language');
      try {
        localStorage.setItem('d24-language', 'pt');
        expect(t('communities.tournaments.teamPage.rosterSearch'))
          .toBe('Pesquisar jogadores da equipa');
        expect(t('communities.tournaments.teamPage.rosterSearchCount', { shown: 3, total: 12 }))
          .toBe('3 de 12 jogadores');
        localStorage.setItem('d24-language', 'en');
        expect(t('communities.tournaments.teamPage.rosterSearch'))
          .toBe('Search team players');
        expect(t('communities.tournaments.teamPage.rosterSearchCount', { shown: 3, total: 12 }))
          .toBe('3 of 12 players');
      } finally {
        if (previous === null) localStorage.removeItem('d24-language');
        else localStorage.setItem('d24-language', previous);
      }
    });

    it('keeps a roster filter accessible when a team drops below nine players', () => {
      const players = Array.from({ length: 9 }, (_, i) => ({
        profileId: i + 1, username: 'player' + (i + 1),
        displayName: 'Atleta ' + (i + 1)
      }));
      const nine = { ...team, players };
      expect(component.showTeamRosterSearch(nine)).toBeTrue();
      component.setTeamRosterSearch(nine.id, 'player9');
      const eight = { ...nine, players: players.slice(0, 8) };
      expect(component.showTeamRosterSearch(eight)).toBeTrue();
      expect(component.filteredTeamRoster(eight)).toEqual([]);
      component.setTeamRosterSearch(eight.id, '');
      expect(component.showTeamRosterSearch(eight)).toBeFalse();
      expect(component.filteredTeamRoster(eight)).toHaveSize(8);
      expect(eight.players).toHaveSize(8);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('dismisses only a hidden player removal confirmation when roster search changes', () => {
      const roster = { ...team, players: [
        { profileId: 1, username: 'ana', displayName: 'Ana' },
        { profileId: 2, username: 'bruno', displayName: 'Bruno' }
      ] };
      api.teams.and.returnValue(of([roster]));
      component.selectTournament(teamDraft);
      component.requestTeamPlayerRemoval(roster, 1);
      expect(component.confirmingTeamPlayerRemoval).toEqual({ teamId: 40, profileId: 1 });
      component.setTeamRosterSearch(40, 'ana');
      expect(component.confirmingTeamPlayerRemoval).toEqual({ teamId: 40, profileId: 1 });
      component.setTeamRosterSearch(41, 'bruno');
      expect(component.confirmingTeamPlayerRemoval).toEqual({ teamId: 40, profileId: 1 });
      component.setTeamRosterSearch(40, 'bruno');
      expect(component.confirmingTeamPlayerRemoval).toBeNull();
      expect(component.filteredTeamRoster(roster).map(player => player.profileId)).toEqual([2]);
      expect(roster.players).toHaveSize(2);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('clears only the selected team roster search without changing player data', () => {
      const first = { ...team, players: [
        { profileId: 1, username: 'ana', displayName: 'Ana' },
        { profileId: 2, username: 'bruno', displayName: 'Bruno' }
      ] };
      const second = { ...team, id: 41, name: 'Azuis', players: [
        { profileId: 3, username: 'carla', displayName: 'Carla' }
      ] };
      component.setTeamRosterSearch(40, 'inexistente');
      component.setTeamRosterSearch(41, 'Carla');
      expect(component.filteredTeamRoster(first)).toEqual([]);
      component.setTeamRosterSearch(40, '');
      expect(component.filteredTeamRoster(first)).toEqual(first.players);
      expect(component.filteredTeamRoster(second)).toEqual(second.players);
      expect(component.teamRosterSearch[41]).toBe('Carla');
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
    });

    it('keeps team roster filters and own-team lookup safe with missing usernames', () => {
      const anonymous = { profileId: 7, username: null as unknown as string, displayName: 'Álvaro' };
      const named = { profileId: 8, username: 'owner', displayName: 'Organizador' };
      const unlabelled = { profileId: 9, username: null as unknown as string,
        displayName: null as unknown as string };
      const roster = { ...team, players: [named, unlabelled, anonymous] };
      api.teams.and.returnValue(of([roster]));
      component.selectTournament(teamDraft);
      expect(component.myTeam?.id).toBe(team.id);
      expect(component.filteredTeamRoster(roster).map(player => player.profileId)).toEqual([9, 7, 8]);
      component.setTeamRosterSearch(team.id, 'ALVARO');
      expect(component.filteredTeamRoster(roster).map(player => player.profileId)).toEqual([7]);
      component.setTeamRosterSearch(team.id, 'not-found');
      expect(component.filteredTeamRoster(roster)).toEqual([]);
      expect(roster.players.map(player => player.profileId)).toEqual([8, 9, 7]);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('displays team players alphabetically without reordering the API roster', () => {
      const players = [
        { profileId: 5, username: 'zoe', displayName: 'Zoé' },
        { profileId: 2, username: 'ana', displayName: 'Ana' },
        { profileId: 9, username: 'alvaro', displayName: 'Álvaro' },
        { profileId: 4, username: 'bruno', displayName: 'Bruno' }
      ];
      const roster = { ...team, players };
      const originalOrder = players.map(player => player.profileId);
      expect(component.filteredTeamRoster(roster).map(player => player.profileId))
        .toEqual([9, 2, 4, 5]);
      component.setTeamRosterSearch(roster.id, 'zoe');
      expect(component.filteredTeamRoster(roster).map(player => player.profileId)).toEqual([5]);
      expect(roster.players.map(player => player.profileId)).toEqual(originalOrder);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('filters large team rosters by name or username without changing membership', () => {
      const players = Array.from({ length: 20 }, (_, i) => ({
        profileId: i + 1, username: 'player' + (i + 1),
        displayName: 'Atleta ' + (i + 1)
      }));
      players[18] = { ...players[18], username: 'aguia19', displayName: 'Águia de Lisboa' };
      const largeTeam = { ...team, players };
      api.teams.and.returnValue(of([largeTeam]));
      component.selectTournament(teamDraft);
      component.teamPageId = 40;
      expect(component.filteredTeamRoster(largeTeam)).toHaveSize(20);
      component.setTeamRosterSearch(40, '  AGUIA ');
      expect(component.filteredTeamRoster(largeTeam).map(p => p.profileId)).toEqual([19]);
      component.setTeamRosterSearch(40, 'PLAYER2');
      expect(component.filteredTeamRoster(largeTeam).map(p => p.profileId)).toEqual([2, 20]);
      component.setTeamRosterSearch(40, 'inexistente');
      expect(component.filteredTeamRoster(largeTeam)).toEqual([]);
      expect(largeTeam.players).toHaveSize(20);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
      component.selectTournament(draft);
      expect(component.teamRosterSearch).toEqual({});
    });

    it('cancels pending destructive roster actions when changing the team page', () => {
      const blue = { ...team, id: 41, name: 'Azuis', players: [] };
      const green = { ...team, players: [
        { profileId: 1, username: 'ana', displayName: 'Ana' }
      ] };
      api.teams.and.returnValue(of([green, blue]));
      component.selectTournament(teamDraft);
      component.teamPageId = 40;
      component.requestTeamPlayerRemoval(green, 1);
      expect(component.confirmingTeamPlayerRemoval).toEqual({ teamId: 40, profileId: 1 });
      component.teamPageId = 41;
      component.ngOnChanges({ teamPageId: new SimpleChange(40, 41, false) });
      expect(component.confirmingTeamPlayerRemoval).toBeNull();
      component.requestEmptyTeamDeletion(blue);
      expect(component.confirmingEmptyTeamId).toBe(41);
      component.teamPageId = 40;
      component.ngOnChanges({ teamPageId: new SimpleChange(41, 40, false) });
      expect(component.confirmingEmptyTeamId).toBeNull();
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
      expect(api.deleteTeam).not.toHaveBeenCalled();
    });

    it('switches between focused teams without sending changes to the backend', () => {
      const blue = { ...team, id: 41, name: 'Azuis' };
      api.teams.and.returnValue(of([team, blue]));
      component.selectTournament(teamDraft);
      component.teamPageId = 40;
      expect(component.focusedTeam?.name).toBe('Verdes');
      component.teamPageId = 41;
      expect(component.focusedTeam?.name).toBe('Azuis');
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
      expect(api.deleteTeam).not.toHaveBeenCalled();
      component.selectTournament(draft);
      expect(component.focusedTeam).toBeUndefined();
    });

    it('loads only teams for team tournaments, without individual standings or fixtures', () => {
      const oldParticipantCalls = api.participants.calls.count();
      const oldMatchCalls = api.matches.calls.count();
      const oldStandingCalls = api.standings.calls.count();
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      expect(component.teams).toEqual([team]);
      expect(api.teams).toHaveBeenCalledWith(7, 19);
      expect(api.participants.calls.count()).toBe(oldParticipantCalls);
      expect(api.matches.calls.count()).toBe(oldMatchCalls);
      expect(api.standings.calls.count()).toBe(oldStandingCalls);
      expect(component.canPublishSchedule).toBeFalse();
    });

    it('creates teams and invites free community members without enrolling them before consent', async () => {
      component.community = { ...community, members, memberCount: 3 };
      component.selectTournament(teamDraft);
      api.createTeam.and.returnValue(of(team));
      api.teams.and.returnValue(of([team]));
      component.teamNameDraft = '  Verdes  ';
      await component.createTournamentTeam();
      expect(api.createTeam).toHaveBeenCalledWith(7, 19, 'Verdes');
      expect(component.teams[0].name).toBe('Verdes');

      // The API now returns an unchanged roster when an invitation is sent.
      api.addTeamPlayer.and.returnValue(of(team));
      component.teamPlayerDraft[40] = 2;
      await component.assignTeamPlayer(team);
      expect(api.addTeamPlayer).toHaveBeenCalledOnceWith(7, 19, 40, 2);
      expect(component.teamPlayerDraft[40]).toBeNull();
      expect(component.availableTeamMembers.map(x => x.profileId)).toEqual([1, 2, 3]);
      expect(component.teams[0].players).toEqual([]);

      // A second invitation may be retried; the backend deduplicates pending invites.
      component.teamPlayerDraft[40] = 2;
      await component.assignTeamPlayer(team);
      expect(api.addTeamPlayer).toHaveBeenCalledTimes(2);
      expect(component.teams[0].players).toEqual([]);
    });

    it('keeps member search working when a community record has a missing username', () => {
      const incomplete = { ...members[1], username: null as unknown as string };
      component.community = {
        ...community, members: [incomplete, members[2]], memberCount: 2
      };
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      component.setTeamMemberSearch(team.id, 'ANA');
      expect(component.filteredTeamMembers(team.id).map(member => member.profileId)).toEqual([2]);
      component.setTeamMemberSearch(team.id, 'BRUNO');
      expect(component.filteredTeamMembers(team.id).map(member => member.profileId)).toEqual([3]);
      component.setTeamMemberSearch(team.id, 'missing');
      expect(component.filteredTeamMembers(team.id)).toEqual([]);
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
    });

    it('finds available members by accent-insensitive name and username per team', () => {
      const largeMembers = [...members,
        { profileId: 4, username: 'joao-silva', fullName: 'João Silva',
          profilePicUrl: null, role: 'MEMBER' as const },
        { profileId: 5, username: 'rute-padel', fullName: 'Rute Dias',
          profilePicUrl: null, role: 'MEMBER' as const }
      ];
      component.community = { ...community, members: largeMembers, memberCount: 5 };
      api.teams.and.returnValue(of([{ ...team, players: [
        { profileId: 2, username: 'ana', displayName: 'Ana' }
      ] }]));
      component.selectTournament(teamDraft);
      expect(component.availableTeamMembers.map(x => x.profileId)).toEqual([1,3,4,5]);
      component.setTeamMemberSearch(40, 'JOAO');
      expect(component.filteredTeamMembers(40).map(x => x.profileId)).toEqual([4]);
      component.setTeamMemberSearch(40, 'rute-PAD');
      expect(component.filteredTeamMembers(40).map(x => x.profileId)).toEqual([5]);
      component.setTeamMemberSearch(40, 'ANA');
      expect(component.filteredTeamMembers(40)).toEqual([]);
      component.setTeamMemberSearch(40, '');
      expect(component.filteredTeamMembers(40).map(x => x.profileId)).toEqual([1,3,4,5]);
    });

    it('explains the capped assignment dropdown in Portuguese and English', () => {
      const previous = localStorage.getItem('d24-language');
      try {
        localStorage.setItem('d24-language', 'pt');
        expect(t('communities.tournaments.teamUi.memberListLimited', { shown: 30, total: 75 }))
          .toContain('30 de 75 membros disponíveis');
        localStorage.setItem('d24-language', 'en');
        expect(t('communities.tournaments.teamUi.memberListLimited', { shown: 30, total: 75 }))
          .toContain('30 of 75 available members');
      } finally {
        if (previous === null) localStorage.removeItem('d24-language');
        else localStorage.setItem('d24-language', previous);
      }
    });

    it('clearing manual member search resets its hidden selection without touching another team', () => {
      component.community = { ...community, members, memberCount: 3 };
      api.teams.and.returnValue(of([team, { ...team, id: 41, name: 'Azuis' }]));
      component.selectTournament(teamDraft);
      component.setTeamMemberSearch(team.id, 'ana');
      component.setTeamMemberSearch(41, 'bruno');
      component.teamPlayerDraft[team.id] = 2;
      component.teamPlayerDraft[41] = 3;
      expect(component.showTeamMemberSearch(team.id)).toBeTrue();
      component.setTeamMemberSearch(team.id, '');
      expect(component.teamMemberSearch[team.id]).toBe('');
      expect(component.teamPlayerDraft[team.id]).toBeNull();
      expect(component.teamMemberSearch[41]).toBe('bruno');
      expect(component.teamPlayerDraft[41]).toBe(3);
      expect(component.filteredTeamMembers(team.id)).toHaveSize(3);
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
    });

    it('keeps an active assignment search accessible after every member is assigned', () => {
      component.community = { ...community, members, memberCount: 3 };
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      component.setTeamMemberSearch(team.id, 'ana');
      expect(component.showTeamMemberSearch(team.id)).toBeTrue();
      component.teams = [{ ...team, players: members.map(member => ({
        profileId: member.profileId, username: member.username,
        displayName: member.fullName
      })) }];
      expect(component.availableTeamMembers).toEqual([]);
      expect(component.showTeamMemberSearch(team.id)).toBeTrue();
      expect(component.filteredTeamMembers(team.id)).toEqual([]);
      component.setTeamMemberSearch(team.id, '');
      expect(component.showTeamMemberSearch(team.id)).toBeFalse();
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
    });

    it('keeps the candidate search visible when available team members shrink', () => {
      const many = Array.from({ length: 7 }, (_, i) => ({
        profileId: 100 + i, username: 'member-' + i,
        fullName: 'Membro ' + i, profilePicUrl: null, role: 'MEMBER' as const
      }));
      component.community = { ...community, members: many, memberCount: 7 };
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      expect(component.showTeamMemberSearch(team.id)).toBeTrue();
      component.setTeamMemberSearch(team.id, 'member-6');
      component.community = { ...component.community, members: many.slice(0, 6), memberCount: 6 };
      expect(component.showTeamMemberSearch(team.id)).toBeTrue();
      expect(component.filteredTeamMembers(team.id)).toEqual([]);
      component.setTeamMemberSearch(team.id, '');
      expect(component.showTeamMemberSearch(team.id)).toBeFalse();
      expect(component.filteredTeamMembers(team.id)).toHaveSize(6);
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
    });

    it('prioritizes exact and prefix identity matches before limiting large member searches', () => {
      const many = Array.from({ length: 40 }, (_, i) => ({
        profileId: 100 + i, username: 'member-' + i,
        fullName: 'Pessoa Ana ' + i, profilePicUrl: null, role: 'MEMBER' as const
      }));
      const exact = { profileId: 900, username: 'ana', fullName: 'Utilizadora',
        profilePicUrl: null, role: 'MEMBER' as const };
      const prefix = { profileId: 901, username: 'ana-atleta', fullName: 'Atleta',
        profilePicUrl: null, role: 'MEMBER' as const };
      component.community = {
        ...community, members: [...many, prefix, exact], memberCount: 42
      };
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      component.setTeamMemberSearch(team.id, ' ANA ');
      const results = component.filteredTeamMembers(team.id);
      expect(results.length).toBe(30);
      expect(results.slice(0, 2).map(member => member.profileId)).toEqual([900, 901]);
      expect(results.some(member => member.profileId === 900)).toBeTrue();
      expect(component.community.members?.map(member => member.profileId).slice(-2))
        .toEqual([901, 900]);
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
    });

    it('limits a large member dropdown without preventing a late member from joining', async () => {
      const many = Array.from({length: 75}, (_, i) => ({
        profileId: 1000 + i, username: 'member-' + i,
        fullName: 'Membro ' + i, profilePicUrl: null,
        role: 'MEMBER' as const
      }));
      many[65] = { ...many[65], username: 'aguia-65', fullName: 'Águia Especial' };
      component.community = { ...community, members: many, memberCount: 75 };
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      expect(component.availableTeamMembers.length).toBe(75);
      expect(component.filteredTeamMembers(team.id).length).toBe(30);
      expect(component.filteredTeamMembers(team.id).some(member => member.profileId === 1065)).toBeFalse();
      component.setTeamMemberSearch(team.id, 'AGUIA ESPECIAL');
      expect(component.filteredTeamMembers(team.id).map(member => member.profileId)).toEqual([1065]);
      component.teamPlayerDraft[team.id] = 1065;
      api.addTeamPlayer.and.returnValue(of({ ...team, players: [
        { profileId: 1065, username: 'aguia-65', displayName: 'Águia Especial' }
      ] }));
      await component.assignTeamPlayer(team);
      expect(api.addTeamPlayer).toHaveBeenCalledWith(7, 19, team.id, 1065);
      component.setTeamMemberSearch(team.id, '');
      expect(component.teamPlayerDraft[team.id]).toBeNull();
    });

    it('clears hidden member selections and search when the competition changes', async () => {
      component.community = { ...community, members, memberCount: 3 };
      component.selectTournament(teamDraft);
      component.teamPlayerDraft[40] = 2;
      component.setTeamMemberSearch(40, 'bruno');
      expect(component.teamPlayerDraft[40]).toBeNull();
      component.teamPlayerDraft[40] = 2; // Hidden by the active search.
      await component.assignTeamPlayer(team);
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
      component.teamPlayerDraft[40] = 3;
      expect(component.filteredTeamMembers(40).map(x => x.profileId)).toEqual([3]);
      component.selectTournament(draft);
      expect(component.teamMemberSearch).toEqual({});
      expect(component.teamPlayerDraft).toEqual({});
    });

    it('localizes roster readiness and invitation helper labels in PT and EN', () => {
      const previous = localStorage.getItem('d24-language');
      try {
        localStorage.setItem('d24-language', 'pt');
        expect(t('communities.tournaments.teamUi.rosterReady')).toBe('Pronta para competir');
        expect(t('communities.tournaments.teamUi.showInviteLink')).toBe('Ver link do convite');
        localStorage.setItem('d24-language', 'en');
        expect(t('communities.tournaments.teamUi.rosterIncomplete')).toBe('Needs players');
        expect(t('communities.tournaments.teamUi.searchMember')).toBe('Search community members');
      } finally {
        if (previous === null) localStorage.removeItem('d24-language');
        else localStorage.setItem('d24-language', previous);
      }
    });

    it('can remove players, then delete only an empty team', async () => {
      const occupied = { ...team, players: [{ profileId: 2, username: 'ana', displayName: 'Ana' }] };
      component.community = { ...community, members, memberCount: 3 };
      api.teams.and.returnValue(of([occupied]));
      component.selectTournament(teamDraft);
      await component.deleteTournamentTeam(occupied);
      expect(api.deleteTeam).not.toHaveBeenCalled();
      api.removeTeamPlayer.and.returnValue(of(void 0));
      api.teams.and.returnValue(of([team]));
      await component.removeTeamPlayer(occupied, 2);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
      component.requestTeamPlayerRemoval(occupied, 2);
      await component.removeTeamPlayer(occupied, 2);
      expect(api.removeTeamPlayer).toHaveBeenCalledWith(7, 19, 40, 2);
      expect(component.confirmingTeamPlayerRemoval).toBeNull();
      api.deleteTeam.and.returnValue(of(void 0));
      api.teams.and.returnValue(of([]));
      await component.deleteTournamentTeam(team);
      expect(api.deleteTeam).not.toHaveBeenCalled();
      component.requestEmptyTeamDeletion(team);
      await component.deleteTournamentTeam(team);
      expect(api.deleteTeam).toHaveBeenCalledWith(7, 19, 40);
      expect(component.confirmingEmptyTeamId).toBeNull();
    });

    it('clears stale invitation feedback whenever the loaded roster changes', () => {
      api.teams.and.returnValue(of([team]));
      component.selectTournament(teamDraft);
      component.inviteCopyFeedback[team.id] = 'Link copiado';
      const occupied = { ...team, players: [
        { profileId: 2, username: 'ana', displayName: 'Ana' }
      ] };
      api.teams.and.returnValue(of([occupied]));
      component.loadTeams();
      expect(component.inviteCopyFeedback).toEqual({});
      expect(component.teams[0].players.map(player => player.profileId)).toEqual([2]);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('rejects stale roster actions for teams not in the loaded tournament', async () => {
      const occupied = { ...team, players: [
        { profileId: 2, username: 'ana', displayName: 'Ana' }
      ] };
      component.community = { ...community, members, memberCount: 3 };
      api.teams.and.returnValue(of([{ ...team, id: 41, name: 'Azuis', players: [] }]));
      component.selectTournament(teamDraft);
      component.teamPlayerDraft[40] = 2;
      await component.assignTeamPlayer(occupied);
      component.requestTeamPlayerRemoval(occupied, 2);
      component.requestEmptyTeamDeletion(team);
      await component.removeTeamPlayer(occupied, 2);
      await component.deleteTournamentTeam(team);
      expect(component.confirmingTeamPlayerRemoval).toBeNull();
      expect(component.confirmingEmptyTeamId).toBeNull();
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
      expect(api.deleteTeam).not.toHaveBeenCalled();

      const staleEmpty = { ...team, players: [] };
      const currentOccupied = { ...occupied };
      api.teams.and.returnValue(of([currentOccupied]));
      component.loadTeams();
      component.requestEmptyTeamDeletion(staleEmpty);
      await component.deleteTournamentTeam(staleEmpty);
      expect(api.deleteTeam).not.toHaveBeenCalled();
      component.requestTeamPlayerRemoval(occupied, 2);
      api.teams.and.returnValue(of([staleEmpty]));
      component.loadTeams();
      await component.removeTeamPlayer(occupied, 2);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('cancels an unconfirmed squad removal without any write', async () => {
      const occupied = { ...team, players: [
        { profileId: 2, username: 'ana', displayName: 'Ana' }
      ] };
      api.teams.and.returnValue(of([occupied]));
      component.selectTournament(teamDraft);
      component.requestTeamPlayerRemoval(occupied, 2);
      expect(component.confirmingTeamPlayerRemoval).toEqual({ teamId: 40, profileId: 2 });
      component.cancelTeamRosterConfirmation();
      expect(component.confirmingTeamPlayerRemoval).toBeNull();
      await component.removeTeamPlayer(occupied, 2);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();

      api.teams.and.returnValue(of([team]));
      component.loadTeams();
      component.requestEmptyTeamDeletion(team);
      expect(component.confirmingEmptyTeamId).toBe(40);
      component.cancelTeamRosterConfirmation();
      await component.deleteTournamentTeam(team);
      expect(api.deleteTeam).not.toHaveBeenCalled();
    });

    it('drops pending roster confirmations after switching to another competition', async () => {
      const occupied = { ...team, players: [
        { profileId: 2, username: 'ana', displayName: 'Ana' }
      ] };
      api.teams.and.returnValue(of([occupied]));
      component.selectTournament(teamDraft);
      component.requestTeamPlayerRemoval(occupied, 2);
      component.selectTournament(draft);
      expect(component.confirmingTeamPlayerRemoval).toBeNull();
      expect(component.confirmingEmptyTeamId).toBeNull();
      await component.removeTeamPlayer(occupied, 2);
      expect(api.removeTeamPlayer).not.toHaveBeenCalled();
    });

    it('keeps completed team fixtures collapsed until a permitted correction is requested', async () => {
      const match = {
        id: 412, roundNumber: 1, homeTeamId: 40, homeTeamName: 'Verdes',
        awayTeamId: 41, awayTeamName: 'Azuis', status: 'COMPLETED' as const,
        homeScore: 3, awayScore: 1
      };
      component.selectTournament({ ...teamDraft, status: 'IN_PROGRESS' });
      expect(component.editingTeamResultId).toBeNull();
      expect(component.teamScoreUnchanged(match)).toBeTrue();
      await component.saveTeamScore(match);
      expect(api.recordTeamResult).not.toHaveBeenCalled();
      component.toggleTeamResultCorrection(match);
      expect(component.editingTeamResultId).toBe(412);
      component.setTeamScore(match, 'home', 4);
      expect(component.teamScoreUnchanged(match)).toBeFalse();
      component.toggleTeamResultCorrection(match);
      expect(component.editingTeamResultId).toBeNull();
      expect(component.teamScoreDraft(match)).toEqual({ home: 3, away: 1 });
      expect(component.teamScoreUnchanged(match)).toBeTrue();

      component.toggleTeamResultCorrection(match);
      component.selectTournament(draft);
      expect(component.editingTeamResultId).toBeNull();
    });

    it('prevents members from editing any squad', async () => {
      component.community = { ...community, myRole: 'MEMBER', members };
      component.selectTournament(teamDraft);
      component.teamNameDraft = 'Tentativa';
      component.teamPlayerDraft[40] = 2;
      await component.createTournamentTeam();
      await component.assignTeamPlayer(team);
      await component.deleteTournamentTeam(team);
      expect(api.createTeam).not.toHaveBeenCalled();
      expect(api.addTeamPlayer).not.toHaveBeenCalled();
      expect(api.deleteTeam).not.toHaveBeenCalled();
      expect(component.teams).toEqual([]);
    });

    it('ignores delayed team responses when a different competition is selected', () => {
      const delayed = new Subject<TournamentTeam[]>();
      api.teams.and.returnValue(delayed.asObservable());
      component.selectTournament(teamDraft);
      component.selectTournament(draft);
      delayed.next([team]);
      delayed.complete();
      expect(component.selected?.id).toBe(9);
      expect(component.teams).toEqual([]);
    });


    it('rejects repeated or invalid player IDs when checking if a squad is ready', () => {
      const player = { profileId: 2, username: 'ana', displayName: 'Ana' };
      const other = { profileId: 3, username: 'rui', displayName: 'Rui' };
      const flexible: TournamentTeam = {
        id: 40, name: 'Azuis', playersPerTeam: null,
        createdAt: '2026-10-16T12:00:00Z', players: [player, player]
      };
      expect(component.isTeamRosterReady(flexible)).toBeFalse();
      expect(component.isTeamRosterReady({...flexible, players: [player, other]})).toBeTrue();
      expect(component.isTeamRosterReady({...flexible, players: [{...player, profileId: 0}]})).toBeFalse();
      expect(component.isTeamRosterReady({...flexible, players: [{...player, profileId: NaN}]})).toBeFalse();
      const fixed = {...flexible, playersPerTeam: 2};
      expect(component.isTeamRosterReady(fixed)).toBeFalse();
      expect(component.isTeamRosterReady({...fixed, players: [player, other]})).toBeTrue();
    });

    it('never treats empty or malformed fixed-size squads as ready for fixtures', async () => {
      const one = { profileId: 11, username:'one', displayName:'One' };
      const two = { profileId: 12, username:'two', displayName:'Two' };
      const zero: TournamentTeam = {
        id: 40, name:'Team zero', playersPerTeam:0,
        createdAt:'2026-10-16T12:00:00Z', players:[]
      };
      expect(component.isTeamRosterReady(zero)).toBeFalse();
      for (const size of [-1, 1.5, NaN, 31, Infinity]) {
        expect(component.isTeamRosterReady({...zero, playersPerTeam:size}))
          .withContext('invalid playersPerTeam ' + size).toBeFalse();
      }
      expect(component.isTeamRosterReady({...zero, playersPerTeam:1, players:[one]})).toBeTrue();
      expect(component.isTeamRosterReady({...zero, playersPerTeam:2, players:[one, two]})).toBeTrue();

      component.selectTournament({...teamDraft, entryType:'TEAM'});
      component.teams = [zero, {
        ...zero, id:41, name:'Other team', playersPerTeam:1, players:[two]
      }];
      expect(component.canPublishTeamSchedule).toBeFalse();
      component.confirmAction = 'schedule';
      await component.publishTeamSchedule();
      expect(api.generateTeamSchedule).not.toHaveBeenCalled();
    });

    it('requires a supported group count before generating group-knockout fixtures', async () => {
      const makeTeam = (id: number): TournamentTeam => ({
        ...team, id, playersPerTeam: null,
        players: [{ profileId: id + 100, username: 'p' + id, displayName: 'Player ' + id }]
      });
      component.selectTournament({...teamDraft, format: 'GROUP_KNOCKOUT', groupCount: 2});
      component.teams = Array.from({ length: 8 }, (_, i) => makeTeam(40 + i));
      expect(component.canPublishTeamSchedule).toBeTrue();
      // Simulate a malformed legacy/API payload outside the strict TypeScript model.
      component.selected = {...component.selected!, groupCount: 3 as unknown as 2 | 4};
      expect(component.canPublishTeamSchedule).toBeFalse();
      component.confirmAction = 'schedule';
      await component.publishTeamSchedule();
      expect(api.generateTeamSchedule).not.toHaveBeenCalled();

      component.selected = {...component.selected!, groupCount: undefined};
      expect(component.canPublishTeamSchedule).toBeFalse();
      component.selected = {...component.selected!, groupCount: 4};
      expect(component.canPublishTeamSchedule).toBeTrue();
    });

    it('does not publish a calendar when one player appears on two opposing teams', async () => {
      const player = { profileId: 2, username: 'ana', displayName: 'Ana' };
      component.selectTournament(teamDraft);
      component.teams = [
        {...team, id: 40, playersPerTeam: null, players: [player]},
        {...team, id: 41, playersPerTeam: null, players: [{...player}]}
      ];
      expect(component.readyTeamCount).toBe(2);
      expect(component.canPublishTeamSchedule).toBeFalse();
      component.confirmAction = 'schedule';
      await component.publishTeamSchedule();
      expect(api.generateTeamSchedule).not.toHaveBeenCalled();

      component.teams[1].players = [{...player, profileId:3, username:'rui'}];
      expect(component.canPublishTeamSchedule).toBeTrue();
    });

    it('does not publish a team calendar with duplicate or invalid team IDs', async () => {
      const playerOne = {profileId: 2, username:'ana', displayName:'Ana'};
      const playerTwo = {profileId: 3, username:'rui', displayName:'Rui'};
      const teamA: TournamentTeam = {...team, id:40, playersPerTeam:null, players:[playerOne]};
      const teamB: TournamentTeam = {...team, id:41, playersPerTeam:null, players:[playerTwo]};
      component.selectTournament(teamDraft);
      component.teams = [teamA, {...teamB, id:40}];
      expect(component.readyTeamCount).toBe(2);
      expect(component.canPublishTeamSchedule).toBeFalse();
      component.confirmAction = 'schedule';
      await component.publishTeamSchedule();
      expect(api.generateTeamSchedule).not.toHaveBeenCalled();

      component.teams = [teamA, {...teamB, id:0}];
      expect(component.canPublishTeamSchedule).toBeFalse();
      component.teams = [teamA, teamB];
      expect(component.canPublishTeamSchedule).toBeTrue();
    });

    it('only enables publication when at least two teams have complete squads', () => {
      component.selectTournament(teamDraft);
      expect(component.canPublishTeamSchedule).toBeFalse();
      const complete = (id: number, name: string) => ({
        ...team, id, name, players: Array.from({ length: 5 }, (_, i) => ({
          profileId: id * 10 + i, username: 'player' + (id * 10 + i),
          displayName: 'Jogador ' + (i + 1)
        }))
      });
      component.teams = [complete(40, 'Verdes'), complete(41, 'Azuis')];
      expect(component.canPublishTeamSchedule).toBeTrue();
      component.teams[1].players.pop();
      expect(component.canPublishTeamSchedule).toBeFalse();
      component.teams[1].players.push({
        profileId: 999, username: 'extra', displayName: 'Extra'
      });
      component.community = { ...community, myRole: 'MEMBER' };
      expect(component.canPublishTeamSchedule).toBeFalse();
    });

    it('publishes real team fixtures without using the individual match endpoint', async () => {
      const competition = { ...teamDraft };
      const teamA: TournamentTeam = {
        ...team, players: Array.from({ length: 5 }, (_, i) => ({
          profileId: i + 1, username: 'green-' + i, displayName: 'Verde ' + i
        }))
      };
      const teamB: TournamentTeam = {
        ...teamA, id: 41, name: 'Azuis',
        players: teamA.players.map((p, i) => ({
          ...p, profileId: i + 20, username: 'blue-' + i
        }))
      };
      api.teams.and.returnValue(of([teamA, teamB]));
      api.generateTeamSchedule.and.returnValue(of({
        tournamentId: 19, status: 'IN_PROGRESS', teamCount: 2, roundCount: 1, matchCount: 1
      }));
      api.teamMatches.and.returnValue(of({ matches: [{
        id: 65, roundNumber: 1, homeTeamId: 40, homeTeamName: 'Verdes',
        awayTeamId: 41, awayTeamName: 'Azuis', status: 'SCHEDULED'
      }], page: 0, hasMore: false }));
      component.selectTournament(competition);
      expect(component.canPublishTeamSchedule).toBeTrue();
      component.confirmAction = 'schedule';
      await component.publishTeamSchedule();
      expect(api.generateTeamSchedule).toHaveBeenCalledWith(7, 19);
      expect(api.generateSchedule).not.toHaveBeenCalled();
      expect(component.selected?.status).toBe('IN_PROGRESS');
      expect(component.teamMatches.length).toBe(1);
      expect(component.teamMatches[0].homeTeamName).toBe('Verdes');
      expect(component.canManageTeamRoster).toBeFalse();
    });

    it('does not publish team fixtures before explicit confirmation', async () => {
      component.selectTournament(teamDraft);
      await component.publishTeamSchedule();
      expect(api.generateTeamSchedule).not.toHaveBeenCalled();
    });

    it('ignores stale fixture pages when another tournament is selected', () => {
      const loading = new Subject<any>();
      api.teams.and.returnValue(of([team]));
      api.teamMatches.and.returnValue(loading.asObservable());
      component.selectTournament({ ...teamDraft, status: 'IN_PROGRESS' });
      expect(api.teamMatches).toHaveBeenCalledWith(7, 19, 0);
      component.selectTournament(draft);
      loading.next({ matches: [{
        id: 77, roundNumber: 1, homeTeamId: 40, homeTeamName: 'A',
        awayTeamId: 41, awayTeamName: 'B', status: 'SCHEDULED'
      }], page: 0, hasMore: false });
      loading.complete();
      expect(component.teamMatches).toEqual([]);
    });

    it('allows pagination of real team fixtures', () => {
      api.teams.and.returnValue(of([team]));
      api.teamMatches.and.returnValues(
        of({ matches: [{
          id: 70, roundNumber: 1, homeTeamId: 40, homeTeamName: 'Verdes',
          awayTeamId: 41, awayTeamName: 'Azuis', status: 'SCHEDULED' as const
        }], page: 0, hasMore: true }),
        of({ matches: [{
          id: 71, roundNumber: 2, homeTeamId: 41, homeTeamName: 'Azuis',
          awayTeamId: 42, awayTeamName: 'Brancos', status: 'SCHEDULED' as const
        }], page: 1, hasMore: false })
      );
      component.selectTournament({ ...teamDraft, status: 'IN_PROGRESS' });
      expect(component.teamMatchesHasMore).toBeTrue();
      component.loadTeamMatches();
      expect(api.teamMatches).toHaveBeenCalledWith(7, 19, 1);
      expect(component.teamMatches.length).toBe(2);
      expect(component.teamMatchesHasMore).toBeFalse();
    });

    it('saves real team results and refreshes only team standings', async () => {
      const fixture = { id: 75, roundNumber: 1, homeTeamId: 40, homeTeamName: 'Azuis',
        awayTeamId: 41, awayTeamName: 'Verdes', status: 'SCHEDULED' as const,
        homeScore: null, awayScore: null };
      api.teams.and.returnValue(of([team]));
      api.teamMatches.and.returnValue(of({ matches: [fixture], page: 0, hasMore: false }));
      api.recordTeamResult.and.returnValue(of({ ...fixture, status: 'COMPLETED',
        homeScore: 2, awayScore: 1 }));
      component.selectTournament({ ...teamDraft, status: 'IN_PROGRESS' });
      component.setTeamScore(fixture, 'home', 2);
      component.setTeamScore(fixture, 'away', 1);
      const previousIndividualStandingsCalls = api.standings.calls.count();
      await component.saveTeamScore(fixture);
      expect(api.recordTeamResult).toHaveBeenCalledWith(7, 19, 75, 2, 1);
      expect(component.teamMatches[0].status).toBe('COMPLETED');
      expect(component.teamMatches[0].homeScore).toBe(2);
      expect(api.teamStandings).toHaveBeenCalledWith(7, 19);
      expect(api.standings.calls.count()).toBe(previousIndividualStandingsCalls);
      expect(api.recordResult).not.toHaveBeenCalled();
    });

    it('only enables team closing once every real fixture is scored', async () => {
      api.teams.and.returnValue(of([team, { ...team, id: 41, name: 'Azuis' }]));
      api.teamStandings.and.returnValue(of({
        tournamentId: 19, status: 'IN_PROGRESS', totalMatches: 1, completedMatches: 0,
        winPoints: 3, drawPoints: 1, lossPoints: 0,
        standings: [
          { position: 1, teamId: 40, teamName: 'Verdes', played: 0, won: 0,
            drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 },
          { position: 2, teamId: 41, teamName: 'Azuis', played: 0, won: 0,
            drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }
        ]
      }));
      component.selectTournament({ ...teamDraft, status: 'IN_PROGRESS' });
      expect(component.canCompleteTeam).toBeFalse();
      const table = component.teamStandings!;
      table.completedMatches = 1;
      table.standings.forEach(row => row.played = 1);
      expect(component.canCompleteTeam).toBeTrue();
      component.confirmAction = 'completeTeam';
      api.completeTeam.and.returnValue(of({ ...teamDraft, status: 'COMPLETED',
        championTeamId: 40, championTeamName: 'Verdes', championPoints: 3,
        completedAt: '2026-10-17T12:00:00Z' }));
      await component.completeTeam();
      expect(api.completeTeam).toHaveBeenCalledWith(7, 19);
      expect(api.complete).not.toHaveBeenCalled();
      expect(component.selected?.championTeamName).toBe('Verdes');
      expect(component.selected?.status).toBe('COMPLETED');
      expect(component.canCompleteTeam).toBeFalse();
    });

    it('respects the module switch for team competition creation', () => {
      component.community = { ...community, teamTournamentsEnabled: false };
      component.startTeamCreation();
      expect(component.showTeamCreate).toBeFalse();
      expect(api.createTeamTournament).not.toHaveBeenCalled();
    });
  });

  it('loads tournament list, roster, fixtures and standings for the selected community', () => {
    expect(api.list).toHaveBeenCalledWith(7, 0);
    expect(api.participants).toHaveBeenCalledWith(7, 9, 0);
    expect(api.matches).toHaveBeenCalledWith(7, 9, 0);
    expect(api.standings).toHaveBeenCalledWith(7, 9);
    expect(component.selected?.id).toBe(9);
  });

  it('only shows organizer actions to owner/admin', () => {
    expect(component.canManage).toBeTrue();
    component.community = { ...community, myRole: 'MEMBER' };
    expect(component.canManage).toBeFalse();
  });

  it('creates a tournament, chooses it and reloads its details', async () => {
    const created = { ...draft, id: 12, name: 'Liga de Inverno' };
    api.create.and.returnValue(of(created));
    component.startIndividualCreation();
    component.nameDraft = ' Liga de Inverno ';
    await component.create();
    expect(api.create).toHaveBeenCalledWith(7, 'Liga de Inverno', 'Futebol', { winPoints: 3, drawPoints: 1, lossPoints: 0 });
    expect(component.selected?.id).toBe(12);
    expect(component.tournaments[0].id).toBe(12);
  });


  it('sends custom points on individual creation and resets after success', async () => {
    api.create.and.returnValue(of({ ...draft, id: 14,
      winPoints: 5, drawPoints: 2, lossPoints: 0 }));
    component.startIndividualCreation();
    component.nameDraft = 'Liga personalizada';
    component.winPointsDraft = 5;
    component.drawPointsDraft = 2;
    await component.create();
    expect(api.create).toHaveBeenCalledWith(7, 'Liga personalizada', 'Futebol',
      { winPoints: 5, drawPoints: 2, lossPoints: 0 });
    expect(component.selected?.winPoints).toBe(5);
    expect(component.winPointsDraft).toBe(3);
    expect(component.drawPointsDraft).toBe(1);
  });

  it('rejects negative, fractional and excessive points without sending a request', async () => {
    component.startIndividualCreation();
    component.nameDraft = 'Liga incompleta';
    component.winPointsDraft = -1;
    expect(component.validPointRules).toBeFalse();
    await component.create();
    expect(api.create).not.toHaveBeenCalled();
    expect(component.error).toContain('pontos inteiros');
    component.winPointsDraft = 2.5;
    expect(component.validPointRules).toBeFalse();
    component.winPointsDraft = 101;
    expect(component.validPointRules).toBeFalse();
    component.winPointsDraft = 0;
    component.drawPointsDraft = 0;
    component.lossPointsDraft = 0;
    expect(component.validPointRules).toBeTrue();
  });

  it('requires a sport when a community has several before a tournament can be created', async () => {
    api.list.and.returnValue(of({ tournaments: [], page: 0, hasMore: false }));
    component.community = { ...community, sports: ['Futebol', 'Padel'] };
    component.ngOnChanges({ community: new SimpleChange(community, component.community, false) });
    expect(component.sportDraft).toBe('');
    component.startIndividualCreation();
    component.nameDraft = 'Liga de outono';
    await component.create();
    expect(api.create).not.toHaveBeenCalled();
    expect(component.error).toContain('modalidade');

    component.chooseSport('Padel');
    api.create.and.returnValue(of({ ...draft, id: 14, sport: 'Padel' }));
    await component.create();
    expect(api.create).toHaveBeenCalledWith(7, 'Liga de outono', 'Padel', { winPoints: 3, drawPoints: 1, lossPoints: 0 });
  });

  it('recognizes a different sport but avoids a false 1v1 swimming competition', async () => {
    component.community = { ...community, sports: ['Futebol', 'Padel'] };
    component.ngOnChanges({ community: new SimpleChange(community, component.community, false) });
    component.sportSearch = 'natação';
    expect(component.suggestedSports).toContain('Natação');
    component.chooseSport('Natação');
    component.startIndividualCreation();
    component.nameDraft = 'Liga de natação';
    await component.create();
    expect(api.create).not.toHaveBeenCalled();
    expect(component.error).toContain('jornadas');
    expect(component.classificationProfile.format).toBe('race');
    expect(component.community.sport).toBe('Futebol');
  });

  it('keeps legacy community modalities selectable without inventing their scoring', async () => {
    component.community = { ...community, sports: ['Desporto local tradicional', 'Futebol'] };
    component.ngOnChanges({ community: new SimpleChange(community, component.community, false) });
    component.sportSearch = 'tradicional';
    expect(component.suggestedSports).toContain('Desporto local tradicional');
    component.chooseSport('Desporto local tradicional');
    component.startIndividualCreation();
    component.nameDraft = 'Torneio local';
    await component.create();
    expect(api.create).not.toHaveBeenCalled();
    expect(component.classificationProfile.format).toBe('unknown');
    expect(component.error).toContain('jornadas');
  });

  it('uses the selected tournament sport for scoring rather than the community primary sport', () => {
    component.selected = { ...draft, sport: 'Padel' };
    expect(component.scoring.scoreInput).toContain('Sets');
    component.selected = { ...draft, sport: 'Basquetebol' };
    expect(component.scoring.scoreInput).toContain('Pontos');
    component.selected = { ...draft, sport: null };
    expect(component.scoring.scoreInput).toContain('Marcador');
  });


  it('shows onboarding for an empty community and leaves team creation unavailable', () => {
    api.list.and.returnValue(of({ tournaments: [], page: 0, hasMore: false }));
    component.ngOnChanges({ community: new SimpleChange(community, community, false) });
    expect(component.showGuide).toBeTrue();
    expect(component.showIndividualCreate).toBeFalse();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('removes the selected trial only after explicit confirmation and resets the view', async () => {
    api.delete.and.returnValue(of(void 0));
    api.list.and.returnValue(of({ tournaments: [], page: 0, hasMore: false }));
    component.confirmAction = 'delete';
    await component.deleteSelected();
    expect(api.delete).toHaveBeenCalledWith(7, 9);
    expect(component.selected).toBeUndefined();
    expect(component.tournaments).toEqual([]);
    expect(component.feedback).toBe('Competição eliminada.');
  });

  it('does not delete without confirmation or management rights', async () => {
    await component.deleteSelected();
    expect(api.delete).not.toHaveBeenCalled();
    component.confirmAction = 'delete';
    component.community = { ...community, myRole: 'MEMBER' };
    await component.deleteSelected();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('does not create teams against a loading or failed roster', async () => {
    component.selected = {...draft, entryType:'TEAM'};
    component.teamNameDraft = 'Nova equipa';
    api.createTeam.and.returnValue(of({} as TournamentTeam));
    component.detailsLoading = true;
    await component.createTournamentTeam();
    expect(api.createTeam).not.toHaveBeenCalled();
    component.detailsLoading = false;
    component.teamsLoadError = true;
    await component.createTournamentTeam();
    expect(api.createTeam).not.toHaveBeenCalled();
    expect(component.teamNameDraft).toBe('Nova equipa');
  });

  it('enrolls only the current player and requests updated roster', async () => {
    const entry = {
      profileId: 4, username: 'owner', displayName: 'Owner',
      status: 'PENDING' as const, joinedAt: '2026-10-16T12:01:00Z'
    };
    api.join.and.returnValue(of(entry));
    api.participants.and.returnValue(of({ participants: [entry], page: 0, hasMore: false }));
    await component.join();
    expect(api.join).toHaveBeenCalledWith(7, 9);
    expect(component.myEnrollment?.status).toBe('PENDING');
  });

  it('does not confirm or remove a stale player card from another roster', async () => {
    const pending: TournamentParticipant = {
      profileId: 21, username: 'old', displayName: 'Old player',
      status: 'PENDING', joinedAt: '2026-10-16T12:01:00Z'
    };
    component.rosterReady = true;
    component.participants = [{
      profileId: 22, username: 'new', displayName: 'New player',
      status: 'PENDING', joinedAt: '2026-10-16T12:01:00Z'
    }];
    await component.confirm(pending);
    await component.remove(pending);
    expect(api.confirm).not.toHaveBeenCalled();
    expect(api.removeParticipant).not.toHaveBeenCalled();
  });

  it('does not reconfirm a player after the roster was updated', async () => {
    const pending: TournamentParticipant = {
      profileId: 21, username: 'player', displayName: 'Player',
      status: 'PENDING', joinedAt: '2026-10-16T12:01:00Z'
    };
    component.rosterReady = true;
    component.participants = [{...pending, status: 'CONFIRMED'}];
    await component.confirm(pending);
    await component.confirm(component.participants[0]);
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it('does not register before the roster is loaded or while a refresh is pending', async () => {
    api.join.and.returnValue(of({
      profileId: 4, username: 'owner', displayName: 'Owner',
      status: 'PENDING', joinedAt: '2026-10-16T12:01:00Z'
    }));
    component.rosterReady = false;
    await component.join();
    expect(api.join).not.toHaveBeenCalled();
    component.rosterReady = true;
    component.detailsLoading = true;
    await component.join();
    expect(api.join).not.toHaveBeenCalled();
  });

  it('does not cancel registration against an unloaded roster', async () => {
    const player: TournamentParticipant = {
      profileId: 4, username: 'owner', displayName: 'Owner',
      status: 'PENDING', joinedAt: '2026-10-16T12:01:00Z'
    };
    component.participants = [player];
    component.rosterReady = false;
    await component.leave();
    expect(api.leave).not.toHaveBeenCalled();
    component.rosterReady = true;
    component.detailsLoading = true;
    await component.leave();
    expect(api.leave).not.toHaveBeenCalled();
  });

  it('does not publish a schedule without explicit confirmation', async () => {
    api.generateSchedule.and.returnValue(of({
      tournamentId: 9, participantCount: 2, matchCount: 1, roundCount: 1, status: 'IN_PROGRESS'
    }));
    component.rosterReady = true;
    component.participants = [1, 2].map(id => ({
      profileId: id, username: 'p' + id, displayName: 'Jogador ' + id,
      status: 'CONFIRMED' as const, joinedAt: '2026-10-16T12:00:00Z'
    }));
    await component.publishSchedule();
    expect(api.generateSchedule).not.toHaveBeenCalled();
    component.confirmAction = 'schedule';
    await component.publishSchedule();
    expect(api.generateSchedule).toHaveBeenCalledWith(7, 9);
    expect(component.selected?.status).toBe('IN_PROGRESS');
  });

  it('rejects invalid results before issuing an HTTP request', async () => {
    component.selected = { ...draft, status: 'IN_PROGRESS' };
    const game: TournamentMatch = {
      id: 22, roundNumber: 1, homeProfileId: 1, homeUsername: 'ana',
      awayProfileId: 2, awayUsername: 'rui', status: 'SCHEDULED',
      homeScore: null, awayScore: null
    };
    component.setScore(game, 'home', -1);
    component.setScore(game, 'away', 1);
    await component.saveScore(game);
    expect(api.recordResult).not.toHaveBeenCalled();
    expect(component.error).toContain('0 e 999');
  });

  it('does not close an unfinished tournament', async () => {
    component.selected = { ...draft, status: 'IN_PROGRESS' };
    component.confirmAction = 'complete';
    await component.complete();
    expect(api.complete).not.toHaveBeenCalled();
  });

  it('resets data when navigating between communities', () => {
    api.list.and.returnValue(of({ tournaments: [], page: 0, hasMore: false }));
    component.community = { ...community, id: 10, name: 'Outra equipa' };
    component.ngOnChanges({ community: new SimpleChange(community, component.community, false) });
    expect(api.list).toHaveBeenCalledWith(10, 0);
    expect(component.selected).toBeUndefined();
    expect(component.participants.length).toBe(0);
  });
  it('allows public tournament previews without requesting private rosters or standings', () => {
    api.participants.calls.reset();
    api.matches.calls.reset();
    api.standings.calls.reset();
    component.community = { ...community, id: 8, myRole: null, visibility: 'PUBLIC' };
    component.ngOnChanges({ community: new SimpleChange(community, component.community, false) });

    expect(component.selected?.id).toBe(9);
    expect(component.isMember).toBeFalse();
    expect(component.canManage).toBeFalse();
    expect(api.list).toHaveBeenCalledWith(8, 0);
    expect(api.participants).not.toHaveBeenCalled();
    expect(api.matches).not.toHaveBeenCalled();
    expect(api.standings).not.toHaveBeenCalled();
    expect(component.error).toBe('');
  });

  it('requires a full round-robin calendar and one game per player before enabling completion', () => {
    component.selected = { ...draft, status: 'IN_PROGRESS' };
    component.standings = {
      tournamentId: 9, status: 'IN_PROGRESS', totalMatches: 2, completedMatches: 2,
      winPoints: 3, drawPoints: 1, lossPoints: 0,
      standings: [1, 2, 3].map(id => ({
        position: id, profileId: id, username: 'p' + id, displayName: 'Player ' + id,
        played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 1, goalsAgainst: 1,
        goalDifference: 0, points: 3
      }))
    };
    expect(component.canComplete).toBeFalse();
    component.standings.totalMatches = 3;
    component.standings.completedMatches = 3;
    expect(component.canComplete).toBeTrue();
    component.standings.standings[0].played = 1;
    expect(component.canComplete).toBeFalse();
  });

  it('does not suggest another registration when the roster is not fully loaded', async () => {
    component.participantsHasMore = true;
    expect(component.myEnrollment).toBeUndefined();
    await component.join();
    expect(api.join).not.toHaveBeenCalled();
  });

  it('ignores a previous community list response after switching communities', () => {
    const oldResponse = new Subject<TournamentPage>();
    api.list.and.returnValue(oldResponse);
    component.community = { ...community, id: 11 };
    component.ngOnChanges({ community: new SimpleChange(community, component.community, false) });
    api.list.and.returnValue(of({ tournaments: [], page: 0, hasMore: false }));
    component.community = { ...community, id: 12 };
    component.ngOnChanges({ community: new SimpleChange(community, component.community, false) });

    oldResponse.next({ tournaments: [draft], page: 0, hasMore: false });
    oldResponse.complete();

    expect(component.selected).toBeUndefined();
    expect(component.tournaments).toEqual([]);
    expect(component.loading).toBeFalse();
    expect(api.list).toHaveBeenCalledWith(12, 0);
  });

  it('keeps previously loaded fixture pages after saving a result and refreshes standings', async () => {
    const match: TournamentMatch = {
      id: 84, roundNumber: 9, homeProfileId: 1, homeUsername: 'ana',
      awayProfileId: 2, awayUsername: 'rui', status: 'SCHEDULED',
      homeScore: null, awayScore: null
    };
    component.selected = { ...draft, status: 'IN_PROGRESS' };
    component.matches = [match];
    component.matchesPage = 3;
    component.matchesHasMore = true;
    component.setScore(match, 'home', 2);
    component.setScore(match, 'away', 1);
    api.recordResult.and.returnValue(of({
      ...match, status: 'COMPLETED', homeScore: 2, awayScore: 1
    }));
    api.participants.calls.reset();
    api.matches.calls.reset();
    api.standings.calls.reset();

    await component.saveScore(match);

    expect(api.recordResult).toHaveBeenCalledWith(7, 9, 84, 2, 1);
    expect(component.matchesPage).toBe(3);
    expect(component.matchesHasMore).toBeTrue();
    expect(component.matches.length).toBe(1);
    expect(component.matches[0].status).toBe('COMPLETED');
    expect(component.scoreDraft(match)).toEqual({ home: 2, away: 1 });
    expect(api.matches).not.toHaveBeenCalled();
    expect(api.participants).not.toHaveBeenCalled();
    expect(api.standings).toHaveBeenCalledWith(7, 9);
  });

  it('does not paginate before the initial roster is ready or while it is reloading', () => {
    component.participantsHasMore = true;
    component.rosterReady = false;
    api.participants.calls.reset();
    component.loadMoreParticipants();
    expect(api.participants).not.toHaveBeenCalled();

    component.rosterReady = true;
    component.detailsLoading = true;
    component.loadMoreParticipants();
    expect(api.participants).not.toHaveBeenCalled();
    expect(component.busy).toBeFalse();
    expect(component.participantsPage).toBe(0);
  });

  it('deduplicates overlapping participant pages and keeps the latest enrollment status', () => {
    const original: TournamentParticipant = {
      profileId: 21, username: 'ana', displayName: 'Ana',
      status: 'PENDING', joinedAt: '2026-10-16T12:01:00Z'
    };
    const newcomer: TournamentParticipant = {
      profileId: 22, username: 'rui', displayName: 'Rui',
      status: 'PENDING', joinedAt: '2026-10-16T12:02:00Z'
    };
    component.participants = [original];
    component.participantsPage = 0;
    component.rosterReady = true;
    component.participantsHasMore = true;
    api.participants.and.returnValue(of({
      participants: [{...original, status: 'CONFIRMED'}, newcomer],
      page: 1, hasMore: false
    }));
    component.loadMoreParticipants();
    expect(api.participants).toHaveBeenCalledWith(7, 9, 1);
    expect(component.participants.map(p => p.profileId)).toEqual([21, 22]);
    expect(component.participants[0].status).toBe('CONFIRMED');
    expect(component.confirmedCount).toBe(1);
    expect(component.participantsPage).toBe(1);
    expect(component.participantsHasMore).toBeFalse();
  });

  it('does not advance the roster cursor when the API returns the wrong page', () => {
    const player: TournamentParticipant = {
      profileId: 21, username: 'ana', displayName: 'Ana',
      status: 'PENDING', joinedAt: '2026-10-16T12:01:00Z'
    };
    component.participants = [player];
    component.participantsPage = 0;
    component.rosterReady = true;
    component.participantsHasMore = true;
    api.participants.calls.reset();
    api.participants.and.returnValue(of({
      participants: [{...player, status:'CONFIRMED'}], page:0, hasMore:false
    }));
    component.loadMoreParticipants();
    expect(api.participants).toHaveBeenCalledWith(7, 9, 1);
    expect(component.participants).toEqual([player]);
    expect(component.participantsPage).toBe(0);
    expect(component.participantsHasMore).toBeTrue();
    expect(component.error).toBeTruthy();
    expect(component.busy).toBeFalse();

    api.participants.and.returnValue(of({participants:[],page:1,hasMore:false}));
    component.loadMoreParticipants();
    expect(api.participants).toHaveBeenCalledTimes(2);
    expect(component.participantsPage).toBe(1);
    expect(component.participantsHasMore).toBeFalse();
  });

  it('releases the busy state on tournament switch while an old participants page is loading', () => {
    const pendingPage = new Subject<TournamentParticipantPage>();
    api.participants.and.returnValue(pendingPage);
    component.rosterReady = true;
    component.participantsHasMore = true;
    component.loadMoreParticipants();
    expect(component.busy).toBeTrue();

    api.participants.and.returnValue(of({ participants: [], page: 0, hasMore: false }));
    component.selectTournament({ ...draft, id: 21, name: 'Outra liga' });
    expect(component.busy).toBeFalse();
    expect(component.selected?.id).toBe(21);

    pendingPage.next({
      participants: [{ profileId: 100, username: 'stale', displayName: 'Antigo',
        joinedAt: '2026-10-16T12:00:00Z', status: 'CONFIRMED' }],
      page: 1, hasMore: false
    });
    pendingPage.complete();
    expect(component.participants).toEqual([]);
    expect(component.busy).toBeFalse();
    expect(component.error).toBe('');
  });

  it('discards a previous tournament mutation error after selecting a different tournament', async () => {
    const pendingJoin = new Subject<TournamentParticipant>();
    api.join.and.returnValue(pendingJoin);
    const joining = component.join();
    expect(component.busy).toBeTrue();

    component.selectTournament({ ...draft, id: 22, name: 'Liga nova' });
    expect(component.busy).toBeFalse();
    pendingJoin.error(new Error('A operação anterior falhou'));
    await joining;

    expect(component.selected?.id).toBe(22);
    expect(component.error).toBe('');
    expect(component.feedback).toBe('');
    expect(component.busy).toBeFalse();
  });

  it('ignores a stale success even if the user returns to the same tournament', async () => {
    const pendingJoin = new Subject<TournamentParticipant>();
    api.join.and.returnValue(pendingJoin);
    const joining = component.join();

    component.selectTournament({ ...draft, id: 25 });
    component.selectTournament({ ...draft });
    pendingJoin.next({
      profileId: 1, username: 'owner', displayName: 'Owner',
      joinedAt: '2026-10-16T12:00:00Z', status: 'PENDING'
    });
    pendingJoin.complete();
    await joining;

    expect(component.selected?.id).toBe(9);
    expect(component.feedback).toBe('');
    expect(component.error).toBe('');
    expect(component.busy).toBeFalse();
  });

  it('rejects one-character tournament names before calling the API', async () => {
    component.nameDraft = ' A ';
    expect(component.nameTooShort).toBeTrue();
    await component.create();
    expect(api.create).not.toHaveBeenCalled();
    expect(component.error).toContain('2 e 120');
    component.nameDraft = 'Liga';
    expect(component.nameTooShort).toBeFalse();
  });

  it('shows marker validation only after the match inputs are touched', () => {
    const game: TournamentMatch = {
      id: 50, roundNumber: 1, homeProfileId: 1, homeUsername: 'owner',
      awayProfileId: 2, awayUsername: 'rui', status: 'SCHEDULED',
      homeScore: null, awayScore: null
    };
    expect(component.isScoreInvalid(game)).toBeFalse();
    component.setScore(game, 'home', -1);
    expect(component.isScoreInvalid(game)).toBeTrue();
    component.setScore(game, 'home', 2);
    component.setScore(game, 'away', 1);
    expect(component.isScoreInvalid(game)).toBeFalse();
  });

  it('blocks scheduling while the roster has more pages or detail did not load', async () => {
    component.participants = [1, 2].map(id => ({
      profileId: id, username: 'p' + id, displayName: 'Jogador ' + id,
      status: 'CONFIRMED' as const, joinedAt: '2026-10-16T12:00:00Z'
    }));
    component.confirmAction = 'schedule';
    component.rosterReady = false;
    expect(component.canPublishSchedule).toBeFalse();
    await component.publishSchedule();
    expect(api.generateSchedule).not.toHaveBeenCalled();

    component.rosterReady = true;
    component.participantsHasMore = true;
    expect(component.canPublishSchedule).toBeFalse();
    await component.publishSchedule();
    expect(api.generateSchedule).not.toHaveBeenCalled();

    component.participantsHasMore = false;
    expect(component.canPublishSchedule).toBeTrue();
  });

  it('refuses scheduling with more than 32 confirmed players', async () => {
    component.rosterReady = true;
    component.participants = Array.from({ length: 33 }, (_, i) => ({
      profileId: i + 1, username: 'p' + (i + 1), displayName: 'Jogador ' + (i + 1),
      status: 'CONFIRMED' as const, joinedAt: '2026-10-16T12:00:00Z'
    }));
    component.confirmAction = 'schedule';
    expect(component.confirmedCount).toBe(33);
    expect(component.canPublishSchedule).toBeFalse();
    await component.publishSchedule();
    expect(api.generateSchedule).not.toHaveBeenCalled();
  });

  it('shows goal terminology only for goal-based sports', () => {
    expect(tournamentScoreTerminology('Futebol').scoreInput).toBe('Golos de');
    expect(tournamentScoreTerminology('Andebol').forAbbrev).toBe('GM');
    expect(tournamentScoreTerminology('Futsal').differenceTitle).toBe('Diferença de golos');
  });

  it('uses points for basketball, rugby and American football instead of goals', () => {
    expect(tournamentScoreTerminology('Basquetebol').scoreInput).toBe('Pontos de');
    expect(tournamentScoreTerminology('Basquetebol 3x3').forAbbrev).toBe('PM');
    expect(tournamentScoreTerminology('Rugby').againstTitle).toBe('Pontos sofridos');
    expect(tournamentScoreTerminology('Futebol Americano').forAbbrev).toBe('PM');
    component.community = { ...community, sport: 'Futebol' };
    component.selected = { ...draft, sport: 'Basquetebol' };
    expect(component.scoring.scoreInput).toBe('Pontos de');
  });

  it('uses sets terminology without implying full per-set scoring or pairs', () => {
    for (const sport of ['Pádel', 'Ténis', 'Voleibol', 'Badminton', 'Ténis de mesa']) {
      const terms = tournamentScoreTerminology(sport);
      expect(terms.scoreInput).toBe('Sets ganhos de');
      expect(terms.differenceAbbrev).toBe('DS');
      expect(terms.note).toContain('Não regista o resultado de cada set');
    }
  });

  it('localizes individual sport scoring terms and registration statuses without changing the sport profile', () => {
    const original = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'en');
      component.selected = { ...draft, sport: 'Futebol' };
      expect(component.scoring.scoreInput).toBe('Goals for');
      expect(component.scoring.forAbbrev).toBe('GF');
      expect(component.scoring.againstAbbrev).toBe('GA');
      expect(component.scoring.differenceTitle).toBe('Goal difference');
      expect(component.formatStatus('PENDING')).toBe('Awaiting approval');
      expect(component.formatStatus('CONFIRMED')).toBe('Confirmed');
      component.selected = { ...draft, sport: 'Basquetebol' };
      expect(component.scoring.scoreInput).toBe('Points for');
      expect(component.scoring.forAbbrev).toBe('PF');
      component.selected = { ...draft, sport: 'Ténis' };
      expect(component.scoring.scoreInput).toBe('Sets won by');
      expect(component.scoring.forAbbrev).toBe('SW');
      component.selected = { ...draft, sport: 'Xadrez' };
      expect(component.scoring.scoreInput).toBe('Score for');
      expect(component.scoring.forAbbrev).toBe('SF');

      localStorage.setItem('d24-language', 'pt');
      component.selected = { ...draft, sport: 'Futebol' };
      expect(component.scoring.forAbbrev).toBe('GM');
      expect(component.scoring.scoreInput).toBe('Golos de');
      expect(component.formatStatus('PENDING')).toBe('A aguardar aprovação');
      expect(component.formatStatus('CONFIRMED')).toBe('Confirmado');
    } finally {
      if (original === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', original);
    }
  });

  it('does not call unknown sports football by default', () => {
    for (const sport of [null, 'Ciclismo', 'Natação', 'Atletismo']) {
      const terms = tournamentScoreTerminology(sport);
      expect(terms.scoreInput).toBe('Marcador de');
      expect(terms.forAbbrev).toBe('MF');
      expect(terms.note).toContain('não suporta pares');
    }
  });

  it('navigates to the exact original row in a multi-phase historical archive', () => {
    const rows: HistoricalMatchArchive['rows'] = Array.from({ length: 61 }, (_, index) => ({
      sourceRow: index + 100,
      home: 'Casa ' + index, away: 'Fora ' + index,
      homeScore: 2, awayScore: 1,
      sourceRound: index < 52 ? 'Jornada 1' : index < 56 ? 'Quartos de final'
        : index < 58 ? 'Meias-finais' : 'Final',
      sourceDate: '', potentialDuplicate: false
    }));
    component.historicalArchive = {
      id: 7, title: 'Arquivo QA', entryType: 'TEAM',
      sourceFilename: 'historico.xlsx', createdAt: '2026-10-25T00:00:00Z', rows
    };
    const target = jasmine.createSpyObj<HTMLElement>('row', ['scrollIntoView']);
    const section = jasmine.createSpyObj<HTMLElement>('section', ['querySelector', 'scrollIntoView']);
    section.querySelector.and.returnValue(target);
    (component as any).historicalArchiveFixtures = { nativeElement: section };

    component.showHistoricalKnockoutPhase(58);
    expect(component.historicalArchivePage).toBe(1);
    expect(section.querySelector).toHaveBeenCalledWith('[data-historical-source-row="158"]');
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(section.scrollIntoView).not.toHaveBeenCalled();
  });

  it('cycles only flagged quarterfinal rows in source order across pages and wraps', () => {
    const rows: HistoricalMatchArchive['rows'] = Array.from({ length: 53 }, (_, index) => ({
      sourceRow: 500 + index,
      home: 'Casa', away: 'Fora', homeScore: index === 49 ? 1 : 2,
      awayScore: index === 49 ? 1 : 0,
      sourceRound: index === 49 || index === 50 || index === 51
        ? 'Quartos de final' : 'Jornada 1',
      sourceDate: '', potentialDuplicate: index === 51
    }));
    component.historicalArchive = {
      id: 90, title: 'Copa QA', entryType: 'TEAM',
      sourceFilename: 'copa.xlsx', createdAt: '2026-10-25T00:00:00Z', rows
    };
    const target = jasmine.createSpyObj<HTMLElement>('row', ['scrollIntoView']);
    const section = jasmine.createSpyObj<HTMLElement>('section', ['querySelector', 'scrollIntoView']);
    section.querySelector.and.returnValue(target);
    (component as any).historicalArchiveFixtures = { nativeElement: section };

    const quarter = component.historicalKnockoutPhases[0];
    expect(quarter.reviewArchiveIndices).toEqual([49, 51]);
    component.showNextHistoricalReview(quarter);
    expect(component.historicalArchivePage).toBe(0);
    expect(section.querySelector).toHaveBeenCalledWith('[data-historical-source-row="549"]');
    expect(component.historicalReviewCursor.quarterfinal).toBe(0);

    component.showNextHistoricalReview(quarter);
    expect(component.historicalArchivePage).toBe(1);
    expect(section.querySelector).toHaveBeenCalledWith('[data-historical-source-row="551"]');
    expect(component.historicalReviewCursor.quarterfinal).toBe(1);

    component.showNextHistoricalReview(quarter);
    expect(component.historicalArchivePage).toBe(0);
    expect(component.historicalReviewCursor.quarterfinal).toBe(0);
    expect(target.scrollIntoView).toHaveBeenCalledTimes(3);
    expect(rows[49].homeScore).toBe(1);
    expect(rows[51].potentialDuplicate).toBeTrue();
  });

  it('does not navigate to an inferred review fixture on mere stage count mismatch', () => {
    const rows: HistoricalMatchArchive['rows'] = [{
      sourceRow: 17, home: 'Casa', away: 'Fora', homeScore: 3, awayScore: 0,
      sourceRound: 'Quartos de final', sourceDate: '', potentialDuplicate: false
    }];
    component.historicalArchive = {
      id: 99, title: 'Copa QA', entryType: 'TEAM',
      sourceFilename: 'copa.xlsx', createdAt: '2026-10-25T00:00:00Z', rows
    };
    const quarter = component.historicalKnockoutPhases[0];
    expect(quarter.requiresReview).toBeTrue();
    expect(quarter.reviewArchiveIndices).toEqual([]);
    component.showNextHistoricalReview(quarter);
    expect(component.historicalArchivePage).toBe(0);
    expect(component.historicalReviewCursor.quarterfinal).toBe(-1);
  });

  it('falls back to the archived section when the target row is not rendered', () => {
    const rows: HistoricalMatchArchive['rows'] = [{
      sourceRow: 404, home: 'A', away: 'B', homeScore: 1, awayScore: 0,
      sourceRound: 'Final', sourceDate: '', potentialDuplicate: false
    }];
    component.historicalArchive = {
      id: 8, title: 'Arquivo QA', entryType: 'TEAM',
      sourceFilename: 'historico.xlsx', createdAt: '2026-10-25T00:00:00Z', rows
    };
    const section = jasmine.createSpyObj<HTMLElement>('section', ['querySelector', 'scrollIntoView']);
    section.querySelector.and.returnValue(null);
    (component as any).historicalArchiveFixtures = { nativeElement: section };

    component.showHistoricalKnockoutPhase(0);
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    component.showHistoricalKnockoutPhase(9);
    expect(section.querySelector).toHaveBeenCalledTimes(1);
  });

  it('translates tournament detail notices and irreversible delete confirmation in PT/EN', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'en');
      expect(t('communities.tournaments.detailUi.pointsSummary', { win: 3, draw: 1, loss: 0 }))
        .toBe('Win 3 · Draw 1 · Loss 0 points');
      expect(t('communities.tournaments.detailUi.deleteWarning', { name: 'Autumn Cup' }))
        .toContain('Delete “Autumn Cup”?');
      expect(t('communities.tournaments.detailUi.groupQualification')).toContain('draw order');
      expect(t('communities.tournaments.detailUi.chessPoints')).toBe('Chess · Win 1 · Draw ½ · Loss 0');
      localStorage.setItem('d24-language', 'pt');
      expect(t('communities.tournaments.detailUi.pointsSummary', { win: 3, draw: 1, loss: 0 }))
        .toBe('Vitória 3 · Empate 1 · Derrota 0 pontos');
      expect(t('communities.tournaments.detailUi.deleteWarning', { name: 'Taça de Outono' }))
        .toContain('Eliminar “Taça de Outono”?');
      expect(t('communities.tournaments.detailUi.chessPoints')).toBe('Xadrez · Vitória 1 · Empate ½ · Derrota 0');
      expect(api.delete).not.toHaveBeenCalled();
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('localizes backend completion conflicts and never leaks unknown Portuguese API errors in English', async () => {
    const original = localStorage.getItem('d24-language');
    try {
      component.startIndividualCreation();
      component.nameDraft = 'Liga QA';
      component.sportDraft = 'Futebol';
      api.create.and.returnValue(throwError(() => ({
        error: { detail: 'Todos os confrontos da liga precisam de estar concluídos' }, status: 409
      })));
      localStorage.setItem('d24-language', 'en');
      await component.create();
      expect(component.error).toBe('All league matches must be completed before closing the tournament.');
      expect(component.selected?.id).toBe(9);
      expect(component.feedback).toBe('');
      expect(component.busy).toBeFalse();

      localStorage.setItem('d24-language', 'pt');
      await component.create();
      expect(component.error).toBe('Todos os confrontos da liga precisam de estar concluídos');

      api.create.and.returnValue(throwError(() => ({
        error: { detail: 'Erro inesperado do servidor' }, status: 422
      })));
      localStorage.setItem('d24-language', 'en');
      await component.create();
      expect(component.error).toBe('Could not complete the operation. Check the information and try again.');
      localStorage.setItem('d24-language', 'pt');
      await component.create();
      expect(component.error).toBe('Erro inesperado do servidor');

      api.create.and.returnValue(throwError(() => ({ error: { detail: '   ' }, status: 500 })));
      await component.create();
      expect(component.error).toBe('Não foi possível concluir a operação. Verifica os dados e tenta novamente.');
      expect(api.create).toHaveBeenCalledTimes(5);
    } finally {
      if (original === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', original);
    }
  });

  it('uses the existing PT/EN standings abbreviations consistently without touching match totals', () => {
    const original = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'en');
      expect(['playedCol', 'winsCol', 'drawsCol', 'lossesCol', 'pointsCol'].map(col =>
        t('communities.tournaments.finalUi.' + col))).toEqual(['P', 'W', 'D', 'L', 'Pts']);
      localStorage.setItem('d24-language', 'pt');
      expect(['playedCol', 'winsCol', 'drawsCol', 'lossesCol', 'pointsCol'].map(col =>
        t('communities.tournaments.finalUi.' + col))).toEqual(['J', 'V', 'E', 'D', 'Pts']);
    } finally {
      if (original === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', original);
    }
  });

  it('uses skating-only copy and status instead of generic WDL point labels', () => {
    component.startIndividualCreation();
    component.sportDraft = 'Patinagem de Velocidade';
    expect(component.isInlineSpeedDraft).toBeTrue();
    expect(component.isSportFormatSupported).toBeTrue();
    expect(component.speedTournamentStatus('DRAFT')).toBe(
      t('communities.inlineSpeed.status.DRAFT'));
    expect(component.speedTournamentStatus('IN_PROGRESS')).toBe(
      t('communities.inlineSpeed.status.IN_PROGRESS'));
    expect(component.isInlineSpeedTournament({ ...draft, sport: 'Patinagem de Velocidade' })).toBeTrue();
    expect(component.isInlineSpeedTournament({ ...draft, sport: 'Futebol' })).toBeFalse();
    expect(component.isInlineSpeedTournament({ ...draft, sport: 'Patinagem de Velocidade',
      historicalArchiveId: 32 })).toBeFalse();
  });

  it('explains three-way cutoff ties before offering any arbitrary selection, PT/EN', () => {
    const p = { sourceStage: 'FIRST', targetStage: 'QUARTER', playerIds: [],
      expectedCount: 16, ready: false, warning: 'Empate múltiplo no limite do 16.º' } as any;
    const previous = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'pt');
      expect(component.speedProposalWarning(p)).toContain('Empate de três');
      localStorage.setItem('d24-language', 'en');
      expect(component.speedProposalWarning(p)).toContain('Three or more');
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('never lets the jury select a disqualified skater until source result correction', () => {
    component.speedOverview = {
      tournamentId: 9, discipline: 'TRACK_500D', availableHeats: [], decisions: [],
      proposals: [], linkedHeats: [{
        roundId: 101, heatNumber: 1, name: 'QA fictícia',
        eventType: 'INLINE_TRACK_500D_FIRST_ROUND',
        skaters: [
          { playerId: 1, name: 'Ana', disqualified: false, position: null, seconds: 30 },
          { playerId: 2, name: 'Bruno', disqualified: true, position: null, seconds: 31 }
        ]
      }]
    };
    component.speedSelections = { FIRST: [1] };
    component.toggleSpeedChosen('FIRST', 2);
    expect(component.speedSelections['FIRST']).toEqual([1]);
    component.toggleSpeedChosen('FIRST', 1);
    expect(component.speedSelections['FIRST']).toEqual([]);
  });

  it('requires a detailed explanation for an exceptional 17th qualifier without a time tie', async () => {
    component.selected = { ...draft, sport: 'Patinagem de Velocidade' };
    component.speedOverview = {
      tournamentId: 9, discipline: 'TRACK_500D', availableHeats: [], decisions: [],
      proposals: [], linkedHeats: [{
        roundId: 102, heatNumber: 1, name: '20 fictional skaters',
        eventType: 'INLINE_TRACK_500D_FIRST_ROUND',
        skaters: Array.from({ length: 20 }, (_, index) => ({
          playerId: index + 1, name: 'QA ' + (index + 1),
          disqualified: false, position: null, seconds: index + 30
        }))
      }]
    };
    component.speedSelections = { FIRST: Array.from({ length: 17 }, (_, i) => i + 1) };
    component.speedReasons = { FIRST: 'Júri confirma' };
    const p = { sourceStage: 'FIRST', targetStage: 'QUARTER',
      expectedCount: 16, ready: true, warning: '',
      playerIds: Array.from({ length: 16 }, (_, i) => i + 1) } as any;
    await component.confirmSpeedStage(p);
    expect(component.error).toBe(t('communities.inlineSpeed.exceptionReasonRequired'));
    expect(api.inlineSpeedOverview).not.toHaveBeenCalled();
  });

  it('creates speed skating with zero generic football points and loads heat progression', async () => {
    component.startIndividualCreation();
    component.nameDraft = 'Campeonato de Patinagem 2026';
    component.sportDraft = 'Patinagem de Velocidade';
    api.create.and.returnValue(of({
      ...draft, name: component.nameDraft, sport: 'Patinagem de Velocidade',
      winPoints: 0, drawPoints: 0, lossPoints: 0
    }));
    await component.create();
    expect(api.create).toHaveBeenCalledWith(7, 'Campeonato de Patinagem 2026',
      'Patinagem de Velocidade', { winPoints: 0, drawPoints: 0, lossPoints: 0 });
    expect(component.selected?.sport).toBe('Patinagem de Velocidade');
    expect(api.inlineSpeedOverview).toHaveBeenCalled();
    expect(api.generateSchedule).not.toHaveBeenCalled();
  });

  it('requires a separate recorded jury tie-break to resolve a fictional three-way cutoff', async () => {
    component.selected = { ...draft, sport: 'Patinagem de Velocidade' };
    const skaters = Array.from({ length: 20 }, (_, i) => ({
      playerId: i + 1, name: 'Fictício ' + (i + 1),
      seconds: i >= 15 && i <= 17 ? 30.16 : 30 + (i + 1) / 100,
      position: null, disqualified: false
    }));
    const proposal = {
      sourceStage: 'FIRST' as const, targetStage: 'QUARTER' as const,
      playerIds: [], expectedCount: 16, ready: false,
      warning: 'Empate múltiplo no limite do 16.º'
    };
    const overview = {
      tournamentId: 9, discipline: 'TRACK_500D' as const,
      linkedHeats: [{
        roundId: 100, name: 'Manga fictícia', eventType: 'INLINE_TRACK_500D_FIRST_ROUND',
        heatNumber: 1, skaters
      }], availableHeats: [], proposals: [proposal], decisions: [],
      tieBreaks: []
    };
    component.speedOverview = overview;
    expect(component.isSpeedMultiwayTie(proposal)).toBeTrue();
    const candidates = component.speedTieCandidates();
    expect(candidates.length).toBe(18);
    expect(candidates.filter(s => component.speedTieGuaranteed(s)).length).toBe(15);
    component.speedSelections = { FIRST: Array.from({ length: 15 }, (_, i) => i + 1) };
    component.toggleSpeedChosen('FIRST', 1);
    expect(component.speedSelections['FIRST']).toContain(1);
    component.toggleSpeedChosen('FIRST', 18);
    expect(component.speedSelections['FIRST']?.length).toBe(16);
    component.speedReasons = { FIRST: 'Curto' };
    await component.resolveSpeedTie(proposal);
    expect(api.resolveInlineSpeedTieBreak).not.toHaveBeenCalled();
    component.speedReasons = { FIRST: 'O júri reviu a prova de desempate com vídeo oficial' };
    component.speedEvidenceType = 'OFFICIAL_MINUTES';
    component.speedEvidenceReference = 'Ata oficial 2026-011';
    api.resolveInlineSpeedTieBreak.and.returnValue(of({
      ...overview, proposals: [{ ...proposal, ready: true,
        playerIds: component.speedSelections['FIRST'] ?? [] }],
      tieBreaks: [{ sourceStage: 'FIRST', selectedPlayerIds: component.speedSelections['FIRST'] ?? [],
        reason: component.speedReasons['FIRST'] ?? '', confirmedBy: 'owner',
        confirmedAt: '2026-10-25T15:00:00Z', stale: false }]
    }));
    await component.resolveSpeedTie(proposal);
    expect(api.resolveInlineSpeedTieBreak).toHaveBeenCalledWith(7, 9,
      Array.from({ length: 15 }, (_, i) => i + 1).concat(18),
      'O júri reviu a prova de desempate com vídeo oficial',
      'OFFICIAL_MINUTES', 'Ata oficial 2026-011', [], '');
  });

  it('preserves tie-break revision history and blocks edits after ratification', () => {
    component.selected = { ...draft, status: 'IN_PROGRESS', sport: 'Patinagem de Velocidade' };
    const proposal = { sourceStage: 'FIRST' as const,
      targetStage: 'QUARTER' as const, playerIds: Array.from({ length: 16 }, (_, i) => i + 1),
      expectedCount: 16, ready: true, warning: '' };
    const ruling = { sourceStage: 'FIRST' as const,
      selectedPlayerIds: [...proposal.playerIds],
      reason: 'A prova de desempate foi analisada pelo júri',
      confirmedBy: 'owner', confirmedAt: '2026-10-25T16:00:00Z', stale: false,
      evidenceType: 'VIDEO_REVIEW' as const,
      evidenceReference: 'Vídeo oficial #011',
      revisions: [{ revision: 1, selectedPlayerIds: [...proposal.playerIds],
        reason: 'A prova de desempate foi analisada pelo júri',
        confirmedBy: 'owner', confirmedAt: '2026-10-25T16:00:00Z', stale: false,
        evidenceType: 'VIDEO_REVIEW' as const,
        evidenceReference: 'Vídeo oficial #011' }] };
    component.speedOverview = { tournamentId: 9, discipline: 'TRACK_500D',
      linkedHeats: [], availableHeats: [], proposals: [proposal], decisions: [],
      tieBreaks: [ruling] };
    expect(component.speedCanAmendTie(proposal)).toBeTrue();
    component.startSpeedTieCorrection(proposal);
    expect(component.speedTieCorrectionOpen).toBeTrue();
    expect(component.speedSelections['FIRST']).toEqual(ruling.selectedPlayerIds);
    expect(component.speedReasons['FIRST']).toBe(ruling.reason);
    expect(component.speedEvidenceType).toBe('VIDEO_REVIEW');
    expect(component.speedEvidenceReference).toBe('Vídeo oficial #011');
    component.speedOverview.decisions = [{ sourceStage: 'FIRST', targetStage: 'QUARTER',
      playerIds: proposal.playerIds, reason: 'Ratificado', confirmedBy: 'owner',
      confirmedAt: '2026-10-25T16:15:00Z', stale: false }];
    expect(component.speedCanAmendTie(proposal)).toBeFalse();
  });

  it('links the real trial to one jury revision and never ratifies automatically', async () => {
    component.selected = { ...draft, status: 'IN_PROGRESS', sport: 'Patinagem de Velocidade' };
    const skaters = Array.from({ length: 20 }, (_, i) => ({
      playerId: i + 1, name: 'Patinador QA ' + (i + 1),
      seconds: i >= 15 && i <= 17 ? 30.16 : 30 + (i + 1) / 100,
      position: null, disqualified: false
    }));
    const proposal = {
      sourceStage: 'FIRST' as const, targetStage: 'QUARTER' as const,
      expectedCount: 16, playerIds: [], ready: false,
      warning: 'Empate múltiplo no limite do 16.º'
    };
    const trial = {
      id: 101, sourceStage: 'FIRST' as const,
      heldAt: '2026-10-25T10:00:00Z', officialReference: 'Ata QA #101',
      reason: 'Prova adicional realmente realizada', recordedBy: 'owner',
      recordedAt: '2026-10-25T11:00:00Z', stale: false, results: []
    };
    const overview = {
      tournamentId: 9, discipline: 'TRACK_500D' as const,
      linkedHeats: [{ roundId: 100, name: 'Manga QA',
        eventType: 'INLINE_TRACK_500D_FIRST_ROUND', heatNumber: 1, skaters }],
      availableHeats: [], proposals: [proposal], decisions: [], tieBreaks: [],
      trials: [trial, { ...trial, id: 102, stale: true }]
    };
    component.speedOverview = overview;
    component.speedSelections = {
      FIRST: Array.from({ length: 15 }, (_, i) => i + 1).concat(18)
    };
    component.speedReasons = {
      FIRST: 'A prova de desempate real foi analisada e registada pelo júri'
    };
    component.speedEvidenceType = 'TIEBREAK_TRIAL';
    component.speedEvidenceReference = 'Ata oficial da prova de desempate #101';
    expect(component.speedAvailableTieTrials().map(t => t.id)).toEqual([101]);
    component.toggleSpeedTrialLink(102, true);
    expect(component.speedTieTrialIds).toEqual([]);
    await component.resolveSpeedTie(proposal);
    expect(api.resolveInlineSpeedTieBreak).not.toHaveBeenCalled();
    component.toggleSpeedTrialLink(101, true);
    const chosen = component.speedSelections['FIRST'];
    const reason = component.speedReasons['FIRST'];
    const savedOverview: InlineSpeedOverview = {
      ...overview, tieBreaks: [{
        sourceStage: 'FIRST', selectedPlayerIds: chosen, reason, confirmedBy: 'owner',
        confirmedAt: '2026-10-25T12:00:00Z', stale: false, trialIds: [101],
        revisions: [{
          revision: 1, selectedPlayerIds: chosen, reason, confirmedBy: 'owner',
          confirmedAt: '2026-10-25T12:00:00Z', stale: false, trialIds: [101]
        }]
      }]
    };
    api.resolveInlineSpeedTieBreak.and.returnValue(of(savedOverview));
    api.inlineSpeedOverview.and.returnValue(of(savedOverview));
    await component.resolveSpeedTie(proposal);
    expect(api.resolveInlineSpeedTieBreak).toHaveBeenCalledWith(
      7, 9, chosen, reason, 'TIEBREAK_TRIAL',
      'Ata oficial da prova de desempate #101', [101], '');
    expect(component.speedOverview?.decisions.length).toBe(0);
    expect(component.speedTrialUsedRevisions(101)).toEqual([1]);
    const ruling = component.speedTieBreak('FIRST')!;
    component.speedOverview!.proposals = [{ ...proposal, ready: true }];
    component.startSpeedTieCorrection({ ...proposal, ready: true });
    expect(component.speedTieTrialIds).toEqual(ruling.trialIds ?? []);
  });

  it('requires an explicit jury reason when selected skater placed behind an excluded one', async () => {
    component.selected = { ...draft, status: 'IN_PROGRESS', sport: 'Patinagem de Velocidade' };
    const proposal = { sourceStage: 'FIRST' as const, targetStage: 'QUARTER' as const,
      expectedCount: 16, playerIds: [], ready: false,
      warning: 'Empate múltiplo no limite do 16.º' };
    const chosen = Array.from({ length: 16 }, (_, i) => i + 1);
    const trial = {
      id: 301, sourceStage: 'FIRST' as const,
      heldAt: '2026-10-25T10:00:00Z', officialReference: 'Ata de QA 301',
      reason: 'Prova realizada perante júri', recordedBy: 'owner',
      recordedAt: '2026-10-25T11:00:00Z', stale: false,
      results: [{ playerId: 18, place: 1, seconds: 31.001 },
        { playerId: 17, place: 2, seconds: 31.002 },
        { playerId: 16, place: 3, seconds: 31.003 }]
    };
    const overview: InlineSpeedOverview = { tournamentId: 9, discipline: 'TRACK_500D',
      linkedHeats: [], availableHeats: [], proposals: [proposal], decisions: [],
      tieBreaks: [], trials: [trial] };
    component.speedOverview = overview;
    component.speedSelections = { FIRST: chosen };
    component.speedTieTrialIds = [301];
    component.speedReasons = { FIRST: 'O júri reviu a decisão de desempate com toda a documentação' };
    component.speedEvidenceType = 'TIEBREAK_TRIAL';
    component.speedEvidenceReference = 'Ata oficial da prova de desempate QA 301';
    expect(component.speedTrialOrderConflicts().length).toBe(2);
    await component.resolveSpeedTie(proposal);
    expect(api.resolveInlineSpeedTieBreak).not.toHaveBeenCalled();
    const override = 'A ordem da prova foi reavaliada perante irregularidade registada na ata oficial';
    component.speedTrialOrderExceptionReason = override;
    api.resolveInlineSpeedTieBreak.and.returnValue(of(overview));
    api.inlineSpeedOverview.and.returnValue(of(overview));
    await component.resolveSpeedTie(proposal);
    expect(api.resolveInlineSpeedTieBreak).toHaveBeenCalledWith(
      7, 9, chosen, component.speedReasons['FIRST'], 'TIEBREAK_TRIAL',
      'Ata oficial da prova de desempate QA 301', [301], override);
    expect(component.speedOverview?.decisions.length).toBe(0);
  });

  it('records only an actual fictional cutoff trial and never confirms qualifiers', async () => {
    component.selected = { ...draft, status: 'IN_PROGRESS', sport: 'Patinagem de Velocidade' };
    const skaters = Array.from({ length: 20 }, (_, i) => ({
      playerId: i + 1, name: 'Patinador QA ' + (i + 1),
      seconds: i >= 15 && i <= 17 ? 30.16 : 30 + (i + 1) / 100,
      position: null, disqualified: false
    }));
    const proposal = { sourceStage: 'FIRST' as const,
      targetStage: 'QUARTER' as const, playerIds: [], expectedCount: 16,
      ready: false, warning: 'Empate múltiplo no limite do 16.º' };
    const overview = {
      tournamentId: 9, discipline: 'TRACK_500D' as const,
      linkedHeats: [{ roundId: 202, name: 'Manga QA', eventType: 'INLINE_TRACK_500D_FIRST_ROUND',
        heatNumber: 1, skaters }], availableHeats: [], proposals: [proposal],
      decisions: [], tieBreaks: [], trials: []
    };
    component.speedOverview = overview;
    expect(component.speedTrialCandidates().map(s => s.playerId)).toEqual([16, 17, 18]);
    component.openSpeedTrial();
    expect(component.speedTrialOpen).toBeTrue();
    component.speedTrialHeldAt = '2026-10-25T10:00';
    component.speedTrialReference = 'Ata oficial de QA 101';
    component.speedTrialReason = 'Uma prova adicional foi efetivamente realizada perante o júri.';
    component.speedTrialPlaces = { 16: 3, 17: 2, 18: 1 };
    component.speedTrialTimes = { 16: 31.003, 17: 31.002, 18: 31.001 };
    api.recordInlineSpeedTrial.and.returnValue(of({ ...overview, trials: [{
      id: 101, sourceStage: 'FIRST', heldAt: '2026-10-25T10:00:00Z',
      officialReference: 'Ata oficial de QA 101', reason: component.speedTrialReason,
      recordedBy: 'owner', recordedAt: '2026-10-25T11:00:00Z', stale: false,
      results: [{ playerId: 18, place: 1, seconds: 31.001 },
        { playerId: 17, place: 2, seconds: 31.002 },
        { playerId: 16, place: 3, seconds: 31.003 }]
    }] }));
    await component.recordSpeedTrial();
    expect(api.recordInlineSpeedTrial).toHaveBeenCalledTimes(1);
    const [cId, tId, payload] = api.recordInlineSpeedTrial.calls.mostRecent().args;
    expect([cId, tId]).toEqual([7, 9]);
    expect(payload.actuallyHeld).toBeTrue();
    expect(payload.results).toEqual([
      { playerId: 16, place: 3, seconds: 31.003 },
      { playerId: 17, place: 2, seconds: 31.002 },
      { playerId: 18, place: 1, seconds: 31.001 }
    ]);
    expect(component.speedTrialOpen).toBeFalse();
    expect(component.speedOverview?.decisions.length).toBe(0);
    component.speedOverview = overview; // reset mocked GET so the fictional tie is still visible
    component.openSpeedTrial();
    component.speedTrialPlaces = { 16: 1, 17: 1, 18: 3 };
    await component.recordSpeedTrial();
    expect(api.recordInlineSpeedTrial).toHaveBeenCalledTimes(1);
    component.speedOverview!.decisions = [{
      sourceStage: 'FIRST', targetStage: 'QUARTER', playerIds: Array.from({ length: 16 }, (_, i) => i + 1),
      reason: 'Ratificação oficial', confirmedBy: 'owner',
      confirmedAt: '2026-10-25T12:00:00Z', stale: false
    }];
    component.speedTrialOpen = false;
    component.openSpeedTrial();
    expect(component.speedTrialOpen).toBeFalse();
    await component.recordSpeedTrial();
    expect(api.recordInlineSpeedTrial).toHaveBeenCalledTimes(1);
  });

  it('separates ongoing championships and lets members expand an archived season', () => {
    const open = {
      id: 101, communityId: 7, name: 'Época atual', sport: 'Futebol',
      seasonLabel: '2026/27', createdAt: '2026-11-01T00:00:00Z',
      competitions: [], winnerStandings: [], closedAt: null,
      championEntryType: null, championParticipantId: null, championDisplayName: null
    };
    const archived = {
      ...open, id: 100, name: 'Época anterior', seasonLabel: '2025/26',
      closedAt: '2026-06-30T00:00:00Z',
      championEntryType: 'TEAM' as const, championParticipantId: 55,
      championDisplayName: 'Águias'
    };
    component.championships = [open, archived];
    expect(component.activeChampionshipCount).toBe(1);
    expect(component.archivedChampionshipCount).toBe(1);
    component.showChampionshipHistory();
    expect(component.championshipHistoryView).toBe('HISTORY');
    component.toggleArchivedChampionship(100);
    expect(component.expandedArchivedChampionshipId).toBe(100);
    component.toggleArchivedChampionship(101);
    expect(component.expandedArchivedChampionshipId).toBe(100);
    component.toggleArchivedChampionship(100);
    expect(component.expandedArchivedChampionshipId).toBeNull();
    component.showActiveChampionships();
    expect(component.championshipHistoryView).toBe('ACTIVE');
  });

  it('clears historical team data on championship refresh to avoid stale cross-revision views', () => {
    component.championships = [{
      id: 11, communityId: 7, name: 'Época anterior',
      seasonLabel: '2025/26', sport: 'Futebol', createdAt: '2025-01-01T00:00:00Z',
      closedAt: '2026-01-01T00:00:00Z', competitions: [], winnerStandings: [],
      championEntryType: 'TEAM', championParticipantId: 15, championDisplayName: 'Águias'
    }];
    component.championshipAggregateStandings = {
      11: { championshipId: 11, standings: [], fullyScoredCompetitions: 0,
        winnerOnlyCompetitions: 0, pendingCompetitions: 0 }
    };
    component.championshipTeamRegistries = {
      11: { championshipId: 11, teams: [{ id: 15, name: 'Águias', permanentTeamId: 90 }],
        competitionTeams: [] }
    };
    component.permanentTeamRegistry = {
      communityId: 7, teams: [{ id: 90, name: 'Águias' }]
    };
    component.championshipHonours = {
      communityId: 7, completedSeasons: 1,
      titles: [], individualHonours: [], teamHonours: [], competitionTitles: []
    };
    component.openPermanentTeamProfile(90);
    component.rankingChartSport = 'Futebol';
    component.chooseComparisonOlder(11);
    component.refreshChampionships();
    expect(component.championships).toEqual([]);
    expect(component.championshipTeamRegistries).toEqual({});
    expect(component.championshipAggregateStandings).toEqual({});
    expect(component.selectedPermanentTeamId).toBeNull();
    expect(component.rankingChartSport).toBe('');
    expect(component.comparisonOlderChampionshipId).toBeNull();
  });

  it('opens and closes a permanent team detail only for this community', () => {
    component.permanentTeamRegistry = {
      communityId: 7, teams: [{ id: 90, name: 'Águias FC' }]
    };
    component.championshipHonours = {
      communityId: 7, completedSeasons: 0, titles: [], individualHonours: [],
      teamHonours: [], competitionTitles: []
    };
    component.openPermanentTeamProfile(90);
    expect(component.selectedPermanentTeamId).toBe(90);
    expect(component.championshipHistoryView).toBe('HISTORY');
    expect(component.selectedPermanentTeamProfile?.name).toBe('Águias FC');
    expect(component.selectedPermanentTeamProfile?.championships).toBe(0);
    component.openPermanentTeamProfile(100);
    expect(component.selectedPermanentTeamId).toBe(90);
    component.closePermanentTeamProfile();
    expect(component.selectedPermanentTeamId).toBeNull();
    component.openPermanentTeamProfile(90);
    component.showActiveChampionships();
    expect(component.selectedPermanentTeamId).toBeNull();
  });

  it('keeps separate league and cup totals for a permanent team', () => {
    component.championshipHonours = {
      communityId: 7, completedSeasons: 1, individualHonours: [],
      titles: [], teamHonours: [
        { permanentTeamId: 8, name: 'Águias', titles: 1,
          championshipIds: [4], leagues: 2, cups: 1 }
      ],
      competitionTitles: [
        { championshipId: 4, tournamentId: 11, tournamentName: 'Liga',
          seasonLabel: '2025/26', sport: 'Futebol', format: 'LEAGUE',
          entryType: 'TEAM', winnerName: 'Águias', permanentTeamId: 8 },
        { championshipId: 4, tournamentId: 12, tournamentName: 'Taça',
          seasonLabel: '2025/26', sport: 'Futebol', format: 'KNOCKOUT',
          entryType: 'TEAM', winnerName: 'Águias', permanentTeamId: 8 }
      ]
    };
    expect(component.championshipHonours.teamHonours[0].titles).toBe(1);
    expect(component.championshipHonours.teamHonours[0].leagues).toBe(2);
    expect(component.championshipHonours.teamHonours[0].cups).toBe(1);
    expect(component.championshipHonours.competitionTitles.length).toBe(2);
  });

  it('shows permanent team titles only after confirmed backend associations', () => {
    component.championshipHonours = {
      communityId: 7, completedSeasons: 2, individualHonours: [], competitionTitles: [],
      teamHonours: [{ permanentTeamId: 90, name: 'Águias FC', titles: 2,
        championshipIds: [11, 12], leagues: 1, cups: 2 }],
      titles: [
        { championshipId: 11, championshipName: 'Época 1', seasonLabel: '2024/25',
          sport: 'Futebol', closedAt: '2025-07-01T00:00:00Z',
          entryType: 'TEAM', participantId: 1, championName: 'Águias A', permanentTeamId: 90 },
        { championshipId: 12, championshipName: 'Época 2', seasonLabel: '2025/26',
          sport: 'Futebol', closedAt: '2026-07-01T00:00:00Z',
          entryType: 'TEAM', participantId: 3, championName: 'Águias B', permanentTeamId: 90 }
      ]
    };
    expect(component.championshipHonours.teamHonours[0].titles).toBe(2);
    expect(component.filteredChampionshipTitles.map(t => t.permanentTeamId)).toEqual([90, 90]);
  });

  it('filters official championship honours by sport without changing stored titles', () => {
    component.championshipHonours = {
      communityId: 7, completedSeasons: 2, individualHonours: [], teamHonours: [], competitionTitles: [],
      titles: [
        { championshipId: 1, championshipName: 'Liga', seasonLabel: '2025/26',
          sport: 'Futebol', closedAt: '2026-06-01T00:00:00Z', entryType: 'TEAM',
          participantId: 55, championName: 'Águias', permanentTeamId: null },
        { championshipId: 2, championshipName: 'Torneio', seasonLabel: '2025/26',
          sport: 'Padel', closedAt: '2026-06-02T00:00:00Z', entryType: 'INDIVIDUAL',
          participantId: 77, championName: 'Ana', permanentTeamId: null }
      ]
    };
    expect(component.championshipHonoursSports).toEqual(['Futebol', 'Padel']);
    expect(component.filteredChampionshipTitles.length).toBe(2);
    component.championshipHonoursSportFilter = 'Padel';
    expect(component.filteredChampionshipTitles.map(title => title.championName)).toEqual(['Ana']);
    expect(component.championshipHonours.titles.length).toBe(2);
  });

  it('keeps regular individual league points intact for other sports', async () => {
    component.startIndividualCreation();
    component.nameDraft = 'Liga de Futebol';
    component.sportDraft = 'Futebol';
    expect(component.isInlineSpeedDraft).toBeFalse();
    api.create.and.returnValue(of({ ...draft, name: component.nameDraft, sport: 'Futebol' }));
    await component.create();
    expect(api.create).toHaveBeenCalledWith(7, 'Liga de Futebol', 'Futebol',
      { winPoints: 3, drawPoints: 1, lossPoints: 0 });
  });


  it('uses runs in baseball and softball team and individual score labels in PT and EN', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      for (const [language, input, scored, conceded, difference, labels] of [
        ['pt', 'Corridas de Verdes', 'CM', 'CS', 'DC', 'Corridas marcadas'],
        ['en', 'Runs for Verdes', 'RF', 'RA', 'RD', 'Runs scored']
      ]) {
        localStorage.setItem('d24-language', language);
        for (const sport of ['Basebol', 'Softbol', 'Cricket']) {
          component.selected = { ...draft, sport, entryType: 'TEAM' };
          expect(component.teamScoreInputLabel('Verdes')).withContext(sport).toBe(input);
          expect(component.teamScoreHeadings).withContext(sport).toEqual({
            for: scored, against: conceded, difference
          });
          component.selected = { ...draft, sport, entryType: 'INDIVIDUAL' };
          expect(component.scoring.forAbbrev).withContext(sport).toBe(scored);
          expect(component.scoring.forTitle).withContext(sport).toBe(labels);
        }
      }
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });


  it('localizes archived league table headers without changing historical scores', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      for (const [language, sport, expected] of [
        ['pt', 'Basebol', ['CM', 'CS', 'DC']],
        ['en', 'Basebol', ['RF', 'RA', 'RD']],
        ['pt', 'Futevólei', ['SG', 'SP', 'DS']],
        ['en', 'Futevólei', ['SW', 'SL', 'SD']],
        ['en', 'Futebol', ['GF', 'GA', 'GD']],
        ['en', 'Karting', ['SF', 'SA', 'SD']]
      ] as Array<[string, string, string[]]>) {
        localStorage.setItem('d24-language', language);
        component.selected = { ...draft, sport };
        const labels = component.historicalScoreLabels;
        expect([labels.forAbbrev, labels.againstAbbrev, labels.differenceAbbrev])
          .withContext(language + ' / ' + sport).toEqual(expected);
      }
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });


  it('switches athletics track and field engines without keeping an incompatible discipline', () => {
    component.startIndividualCreation();
    component.chooseSport('Atletismo');
    expect(component.selectedSportCreationModel).toBe('FIELD_BEST_MARK');
    expect(component.sportEventChoices.find(choice => choice.code === 'TRACK')?.supported).toBeTrue();
    expect(component.sportEventChoices.find(choice => choice.code === 'TRACK_RELAY')?.supported).toBeFalse();

    component.chooseTournamentEventType('JUMP');
    component.chooseFieldDiscipline('LONG_JUMP');
    expect(component.eventDisciplineDraft).toBe('LONG_JUMP');
    expect(component.savedSportEventType).toBe('JUMP');

    component.chooseTournamentEventType('TRACK');
    expect(component.selectedSportCreationModel).toBe('TRACK_BEST_TIME');
    expect(component.sportEventChoices.find(choice => choice.code === 'JUMP')?.supported).toBeTrue();
    expect(component.eventDisciplineDraft).toBeNull();
    expect(component.savedSportEventType).toBe('TRACK');
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseTrackDiscipline('TRACK_100');
    expect(component.isSportFormatSupported).toBeTrue();

    component.chooseTournamentEventType('THROW');
    expect(component.selectedSportCreationModel).toBe('FIELD_BEST_MARK');
    expect(component.eventDisciplineDraft).toBeNull();
    expect(component.savedSportEventType).toBe('THROW');
    expect(component.isSportFormatSupported).toBeFalse();
    component.chooseFieldDiscipline('JAVELIN');
    expect(component.isSportFormatSupported).toBeTrue();
  });

  it('explains standalone tournaments and multi-competition championships in Portuguese and English', () => {
    const previous = localStorage.getItem('d24-language');
    try {
      for (const language of ['pt', 'en']) {
        localStorage.setItem('d24-language', language);
        const tournament = t('communities.tournamentConceptText');
        const championship = t('communities.championshipConceptText');
        const example = t('communities.championshipConceptExample');
        expect(tournament).not.toBe('communities.tournamentConceptText');
        expect(championship).not.toBe('communities.championshipConceptText');
        expect(example).not.toBe('communities.championshipConceptExample');
        expect(tournament).not.toBe(championship);
        expect(example).toContain('2026/27');
        expect(t('communities.tournamentConceptTitle'))
          .not.toBe(t('communities.championshipConceptTitle'));
      }
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('opens creation through a format choice and keeps championship and tournament flows separate', () => {
    expect(component.competitionView).toBe('championships');
    expect(component.creationPickerOpen).toBeFalse();
    component.openCompetitionPicker();
    expect(component.creationPickerOpen).toBeTrue();
    component.chooseCompetitionKind('tournaments');
    expect(component.competitionView).toBe('tournaments');
    expect(component.creationPickerOpen).toBeFalse();
    expect(component.showGuide).toBeTrue();
    expect(component.championshipOpen).toBeFalse();

    component.chooseCompetitionKind('championships');
    expect(component.competitionView).toBe('championships');
    expect(component.championshipOpen).toBeTrue();
    expect(component.showGuide).toBeFalse();
  });

  it('calculates summary from real competition states without counting drafts as finished', () => {
    component.tournaments = [{ ...draft }, { ...draft, id: 10, status: 'COMPLETED' }];
    expect(component.activeTournamentCount).toBe(1);
    expect(component.completedTournamentCount).toBe(1);
  });

  it('keeps the championship explanation optional and resets it on another community', () => {
    expect(component.championshipExplainerOpen).toBeFalse();
    component.championshipExplainerOpen = true;
    expect(component.championshipExplainerOpen).toBeTrue();
    component.ngOnChanges({ community: new SimpleChange(community, {
      ...community, id: 9, name: 'Outra comunidade'
    }, false) });
    expect(component.championshipExplainerOpen).toBeFalse();
  });

});
