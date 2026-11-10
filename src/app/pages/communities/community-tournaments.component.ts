import { CommunityChampionshipsService, ChampionshipOwnedEvent, ChampionshipOwnedEventTeam, ChampionshipOwnedLeagueFixture, ChampionshipCupOpeningRound, ChampionshipOwnedEventFormat, CommunityChampionship, CommunityChampionshipStandings, CommunityChampionshipTeams, CommunityChampionshipHonours, CommunityPermanentTeams } from '../../services/community-championships.service';
import { championshipTeamProfile, ChampionshipTeamProfile } from './community-championship-team-profile';
import { compareTeamSeasons, comparableTeamSeasons, TeamSeasonComparison } from './community-championship-team-comparison';
import { teamRankingChart, teamRankingSports, TeamRankingChart } from './community-championship-team-ranking-chart';
import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { finalize, firstValueFrom, forkJoin, Observable, timeout } from 'rxjs';
import { CommunityGroup } from '../model/community-group';
import { HistoricalMatchArchive } from '../../services/community-groups.service';
import { historicalTournamentStandings, HistoricalTournamentStanding, canEstimateHistoricalLeagueStandings } from './community-historical-tournament-standings';
import { historicalTournamentOutcome, HistoricalTournamentOutcome } from './community-historical-tournament-outcome';
import { groupHistoricalTournamentSourceRows } from './community-historical-tournament-source-groups';
import { historicalKnockoutPhaseOverview, HistoricalKnockoutPhaseOverview, HistoricalKnockoutPhaseId } from './community-historical-knockout-overview';
import { historicalMatchReviewFlags } from './community-historical-match-review';
import {
  CommunityTournament, TournamentStatus, TournamentPointRules, TeamTieBreakPriority, TournamentMatch, TournamentParticipant, TournamentStandingRow,
  TournamentStandings, TournamentTeam, TournamentTeamMatch, TournamentTeamStandings, TournamentTeamStandingRow, TournamentTeamGroups,
  TournamentRaceOverview, TournamentRaceStanding, TournamentRaceEntry, TournamentTimedOverview, TournamentMeasuredOverview, RelayOverview, RelayHeat,
  InlineSpeedOverview, InlineSpeedProposal, InlineSpeedSkater, InlineSpeedStage, InlineSpeedTieEvidenceType, InlineSpeedTrialRequest
} from '../model/community-tournament';
import { CommunityTournamentsService, isRaceChampionshipSport, RaceChampionshipSport } from '../../services/community-tournaments.service';
import { AuthenticationService } from '../../services/authethication.service';
import { tournamentScoreTerminology } from './community-tournament-scoring';
import { tournamentSportCapabilities, tournamentCreationModelForEvent } from './community-tournament-capabilities';
import { championshipModeAvailability } from './community-championship-mode';
import { championshipSportGuidance } from './community-championship-sport-guidance';
import { championshipSuggestions, ChampionshipSuggestion } from './community-championship-suggestions';
import { tournamentEventChoices, validatedTournamentEventType, tournamentEventReadiness, TournamentEventReadiness, SWIM_TOURNAMENT_DISCIPLINES, FIELD_TOURNAMENT_DISCIPLINES, TRACK_TOURNAMENT_DISTANCES, RELAY_TOURNAMENT_DISCIPLINES, CANOE_K1_DISCIPLINES, ROWING_SINGLE_DISCIPLINES } from './community-tournament-event-types';
import { tournamentClassificationProfile } from './community-tournament-classification';
import { summarizePublishedTeamJourney } from './community-team-journey';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { appTranslate as t } from '../../i18n/i18n.service';
import { buildTournamentTeamInviteUrl, teamInvitationWhatsAppUrl } from './community-team-invite';
import { formatKartingDuration, kartingRaceAward, orderedKartingRaceEntries } from './community-karting-race-display';

@Component({
  selector: 'app-community-tournaments',
  templateUrl: './community-tournaments.component.html',
  styleUrls: ['./community-tournaments.component.css', './community-tournaments-v3-finish.css', './community-tournaments-team-journey.css', './community-team-honours-timeline.css', './community-competitions-dashboard.css'],
  standalone: false
})
export class CommunityTournamentsComponent implements OnChanges {
  @Input({ required: true }) community!: CommunityGroup;
  @Input() invitedTournamentId: number | null = null;
  @Input() invitedTeamId: number | null = null;
  @Input() teamPageId: number | null = null;
  /** Validated from the route's tournament-scoped fixture query parameter. */
  @Input() requestedFixtureId: number | null = null;
  focusedPublishedFixtureId: number | null = null;
  readonly directFixtureMaxExtraPages = 20;
  private directFixtureExtraPages = 0;

  readonly championshipSports = SPORTS_CATALOG;
  championships: CommunityChampionship[] = [];
  championshipAggregateStandings: Record<number, CommunityChampionshipStandings> = {};
  championshipTeamRegistries: Record<number, CommunityChampionshipTeams> = {};
  championshipHonoursSportFilter = '';
  get championshipHonoursSports(): string[] {
    return [...new Set((this.championshipHonours?.titles || []).map(title => title.sport))]
      .sort((a, b) => a.localeCompare(b, 'pt'));
  }

  get filteredChampionshipTitles(): CommunityChampionshipHonours['titles'] {
    const titles = this.championshipHonours?.titles || [];
    return this.championshipHonoursSportFilter
      ? titles.filter(title => title.sport === this.championshipHonoursSportFilter)
      : titles;
  }

  permanentTeamRegistry: CommunityPermanentTeams | null = null;
  permanentTeamNameDraft = '';

  loadPermanentTeams(): void {
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipsApi.permanentTeams(communityId).subscribe({
      next: registry => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.permanentTeamRegistry = registry;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = 'Não foi possível carregar as equipas permanentes.';
        this.changeDetector.markForCheck();
      }
    });
  }

  createPermanentTeam(): void {
    const name = this.permanentTeamNameDraft.trim();
    if (!this.canManage || this.championshipBusy || !name || name.length > 100) return;
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipBusy = true;
    this.championshipsApi.createPermanentTeam(communityId, name).subscribe({
      next: registry => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.permanentTeamRegistry = registry;
        this.permanentTeamNameDraft = '';
        this.championshipBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipBusy = false;
        this.championshipError = 'Não foi possível criar a equipa permanente.';
        this.changeDetector.markForCheck();
      }
    });
  }

  linkPermanentTeam(championshipId: number, seasonTeamId: number, permanentTeamId: number): void {
    if (!this.canManage || this.championshipBusy || !Number.isInteger(permanentTeamId)
        || permanentTeamId <= 0) return;
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipBusy = true;
    this.championshipsApi.linkPermanentTeam(
      communityId, championshipId, seasonTeamId, permanentTeamId).subscribe({
      next: registry => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.permanentTeamRegistry = registry;
        this.championshipBusy = false;
        this.loadChampionshipTeams(championshipId);
        this.loadChampionshipHonours();
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipBusy = false;
        this.championshipError = 'Não foi possível associar a equipa permanente.';
        this.changeDetector.markForCheck();
      }
    });
  }

  rankingChartSport = '';

  get availableRankingChartSports(): string[] {
    const profile = this.selectedPermanentTeamProfile;
    return profile ? teamRankingSports(profile) : [];
  }

  get selectedRankingChart(): TeamRankingChart | null {
    const profile = this.selectedPermanentTeamProfile;
    if (!profile) return null;
    const sports = teamRankingSports(profile);
    const sport = sports.find(s => s.toLocaleLowerCase() === this.rankingChartSport.toLocaleLowerCase())
      ?? sports[0];
    return sport ? teamRankingChart(profile, sport) : null;
  }

  chooseRankingChartSport(sport: string): void {
    this.rankingChartSport = sport;
  }

  comparisonOlderChampionshipId: number | null = null;
  comparisonNewerChampionshipId: number | null = null;

  get selectableTeamSeasons(): ReturnType<typeof comparableTeamSeasons> {
    const profile = this.selectedPermanentTeamProfile;
    return profile ? comparableTeamSeasons(profile) : [];
  }

  get selectedTeamSeasonComparison(): TeamSeasonComparison | null {
    const profile = this.selectedPermanentTeamProfile;
    return profile ? compareTeamSeasons(profile,
      this.comparisonOlderChampionshipId, this.comparisonNewerChampionshipId) : null;
  }

  chooseComparisonOlder(championshipId: number | null): void {
    this.comparisonOlderChampionshipId = championshipId;
  }

  chooseComparisonNewer(championshipId: number | null): void {
    this.comparisonNewerChampionshipId = championshipId;
  }

  selectedPermanentTeamId: number | null = null;

  get selectedPermanentTeamProfile(): ChampionshipTeamProfile | null {
    if (this.selectedPermanentTeamId === null || !this.championshipHonours) return null;
    return championshipTeamProfile(
      this.selectedPermanentTeamId, this.championshipHonours,
      this.championships, this.championshipTeamRegistries, this.permanentTeamRegistry,
      this.championshipAggregateStandings);
  }

  openPermanentTeamProfile(permanentTeamId: number): void {
    if (!this.permanentTeamRegistry?.teams.some(team => team.id === permanentTeamId)) return;
    this.championshipHistoryView = 'HISTORY';
    this.selectedPermanentTeamId = permanentTeamId;
    this.rankingChartSport = '';
    this.comparisonOlderChampionshipId = null;
    this.comparisonNewerChampionshipId = null;
    this.expandedArchivedChampionshipId = null;
  }

  closePermanentTeamProfile(): void {
    this.selectedPermanentTeamId = null;
    this.rankingChartSport = '';
    this.comparisonOlderChampionshipId = null;
    this.comparisonNewerChampionshipId = null;
  }

  championshipHonours: CommunityChampionshipHonours | null = null;
  championshipHonoursError = '';

  loadChampionshipHonours(): void {
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipsApi.honours(communityId).subscribe({
      next: result => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipHonours = result;
        this.championshipHonoursError = '';
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipHonoursError = 'Não foi possível carregar o palmarés.';
        this.changeDetector.markForCheck();
      }
    });
  }


  closeChampionship(championship: CommunityChampionship): void {
    if (!this.canManage || this.championshipBusy || championship.closedAt
        || !this.championshipCloseConfirmed[championship.id]) return;
    const communityId = this.community.id;
    const revision = this.championshipRevision;
    this.championshipBusy = true;
    this.championshipError = '';
    this.championshipsApi.close(communityId, championship.id).subscribe({
      next: result => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championships = this.championships.map(item => item.id === result.id ? result : item);
        this.loadChampionshipHonours();
        this.championshipBusy = false;
        this.championshipCloseConfirmed[result.id] = false;
        this.showChampionshipHistory();
        this.expandedArchivedChampionshipId = result.id;
        this.loadChampionshipStandings(result.id);
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipBusy = false;
        this.championshipError =
          'Não foi possível encerrar: verifica as provas, equipas associadas e empates no topo.';
        this.changeDetector.markForCheck();
      }
    });
  }

  /** A season can exist for any catalog sport; team management is only
   * offered when an implemented results engine supports teams, or historical
   * teams are already attached to the season. Never erase existing records. */
  championshipTeamAvailable(sport: string | null | undefined): boolean {
    return tournamentSportCapabilities(sport).team !== 'UNAVAILABLE';
  }

  /** Owned league/cup fixtures currently register teams only. Individual and
   * judged/timed sports must not silently inherit this team-fixture contract. */
  championshipOwnedTeamEventsAvailable(sport: string | null | undefined): boolean {
    return tournamentSportCapabilities(sport).team === 'NUMERIC_TEAM';
  }

  championshipIndividualAvailable(sport: string | null | undefined): boolean {
    return tournamentSportCapabilities(sport).individual !== 'UNAVAILABLE';
  }

  championshipSportModeKey(sport: string | null | undefined): string {
    const capabilities = tournamentSportCapabilities(sport);
    if (capabilities.individual !== 'UNAVAILABLE' && capabilities.team !== 'UNAVAILABLE') {
      return 'communities.competitionModes.both';
    }
    if (capabilities.team !== 'UNAVAILABLE') return 'communities.competitionModes.team';
    if (capabilities.individual !== 'UNAVAILABLE') return 'communities.competitionModes.individual';
    return 'communities.competitionModes.pending';
  }

  readonly championshipSportGuidance = championshipSportGuidance;
  readonly championshipSuggestions = championshipSuggestions;

  prepareSuggestedChampionshipEvent(championship: CommunityChampionship, suggestion: ChampionshipSuggestion): void {
    if (!this.canManage || !!championship.closedAt || this.championshipEventBusy
        || !this.championshipOwnedTeamEventsAvailable(championship.sport)
        || suggestion.nextStep !== 'OWNED_TEAM' || !suggestion.format
        || !championshipSuggestions(championship.sport).some(item => item.id === suggestion.id
          && item.format === suggestion.format && item.nextStep === 'OWNED_TEAM')) return;
    this.championshipEventNames[championship.id] = suggestion.title;
    this.championshipEventFormats[championship.id] = suggestion.format;
  }


  championshipTeamDrafts: Record<number, string> = {};
  championshipCloseConfirmed: Record<number, boolean> = {};

  loadChampionshipTeams(championshipId: number): void {
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipsApi.teams(communityId, championshipId).subscribe({
      next: registry => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipTeamRegistries = { ...this.championshipTeamRegistries, [championshipId]: registry };
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = 'Não foi possível carregar as equipas do campeonato.';
        this.changeDetector.markForCheck();
      }
    });
  }

  createChampionshipTeam(championshipId: number): void {
    const name = (this.championshipTeamDrafts[championshipId] || '').trim();
    if (!this.canManage || this.championshipBusy || !name || name.length > 100
        || this.championships.some(item => item.id === championshipId && !!item.closedAt)) return;
    const communityId = this.community.id;
    const revision = this.championshipRevision;
    this.championshipBusy = true;
    this.championshipError = '';
    this.championshipsApi.createTeam(communityId, championshipId, name).subscribe({
      next: registry => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipTeamRegistries = { ...this.championshipTeamRegistries, [championshipId]: registry };
        this.championshipTeamDrafts[championshipId] = '';
        this.championshipBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = 'Não foi possível criar a equipa. Verifica se o nome já existe.';
        this.championshipBusy = false;
        this.changeDetector.markForCheck();
      }
    });
  }

  linkChampionshipTeam(championshipId: number, tournamentTeamId: number, targetId: number): void {
    if (!this.canManage || this.championshipBusy || !Number.isInteger(targetId) || targetId <= 0
        || this.championships.some(item => item.id === championshipId && !!item.closedAt)) return;
    const communityId = this.community.id;
    const revision = this.championshipRevision;
    this.championshipBusy = true;
    this.championshipError = '';
    this.championshipsApi.linkTeam(communityId, championshipId, tournamentTeamId, targetId).subscribe({
      next: registry => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipTeamRegistries = { ...this.championshipTeamRegistries, [championshipId]: registry };
        this.championshipBusy = false;
        this.loadChampionshipStandings(championshipId);
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = 'Não foi possível associar a equipa à prova.';
        this.championshipBusy = false;
        this.changeDetector.markForCheck();
      }
    });
  }


  loadChampionshipStandings(championshipId: number): void {
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipsApi.standings(communityId, championshipId).subscribe({
      next: standings => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipAggregateStandings = {
          ...this.championshipAggregateStandings, [championshipId]: standings
        };
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = 'A classificação completa ainda não está disponível.';
        this.changeDetector.markForCheck();
      }
    });
  }

  /** Guided mode explains suggested structures; custom mode keeps the same verified backend contracts. */
  championshipCreationMode: 'GUIDED' | 'CUSTOM' = 'GUIDED';
  championshipTournamentDrafts: Record<number, number | null> = {};

  availableChampionshipTournaments(championship: CommunityChampionship): CommunityTournament[] {
    const linked = new Set(this.championships.flatMap(item => item.competitions.map(comp => comp.id)));
    return this.tournaments.filter(tournament =>
      tournament.sport === championship.sport && !linked.has(tournament.id)
      && !tournament.historicalArchiveId);
  }

  championshipStandingsModeDrafts: Record<number, 'AGGREGATE' | 'INDEPENDENT'> = {};

  canChangeChampionshipStandingsMode(championship: CommunityChampionship): boolean {
    return !championship.closedAt
      && championship.competitions.every(competition => competition.status === 'DRAFT')
      && (this.championshipOwnedEvents[championship.id] || []).length === 0;
  }

  saveChampionshipStandingsMode(championship: CommunityChampionship): void {
    const mode = this.championshipStandingsModeDrafts[championship.id] || championship.standingsMode || 'AGGREGATE';
    if (!this.canManage || this.championshipBusy
        || !this.canChangeChampionshipStandingsMode(championship)
        || (mode !== 'AGGREGATE' && mode !== 'INDEPENDENT')) return;
    const communityId = this.community.id;
    const revision = this.championshipRevision;
    this.championshipBusy = true;
    this.championshipError = '';
    this.championshipsApi.setStandingsMode(communityId, championship.id, mode).subscribe({
      next: updated => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championships = this.championships.map(item => item.id === updated.id ? updated : item);
        this.championshipStandingsModeDrafts[updated.id] = updated.standingsMode || 'AGGREGATE';
        this.championshipBusy = false;
        this.loadChampionshipStandings(updated.id);
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipBusy = false;
        this.championshipError = 'Não foi possível alterar o modo. Só é permitido antes do início das provas.';
        this.changeDetector.markForCheck();
      }
    });
  }

  championshipRankingModeDraft: 'AGGREGATE' | 'INDEPENDENT' = 'AGGREGATE';
  championshipNameDraft = '';
  championshipSeasonDraft = '2026/27';
  championshipSportDraft = '';
  get championshipSportHasTournamentEngine(): boolean {
    const model = tournamentSportCapabilities(this.championshipSportDraft);
    return model.individual !== 'UNAVAILABLE' || model.team !== 'UNAVAILABLE';
  }

  championshipHistoryView: 'ACTIVE' | 'HISTORY' = 'ACTIVE';
  expandedArchivedChampionshipId: number | null = null;

  get activeChampionshipCount(): number {
    return this.championships.filter(championship => !championship.closedAt).length;
  }

  get archivedChampionshipCount(): number {
    return this.championships.filter(championship => !!championship.closedAt).length;
  }

  showChampionshipHistory(): void {
    this.selectedPermanentTeamId = null;
    this.championshipHistoryView = 'HISTORY';
    this.expandedArchivedChampionshipId = null;
  }

  showActiveChampionships(): void {
    this.selectedPermanentTeamId = null;
    this.championshipHistoryView = 'ACTIVE';
    this.expandedArchivedChampionshipId = null;
  }

  toggleArchivedChampionship(championshipId: number): void {
    if (!this.championships.some(championship => championship.id === championshipId && championship.closedAt)) return;
    this.expandedArchivedChampionshipId =
      this.expandedArchivedChampionshipId === championshipId ? null : championshipId;
  }

  championshipOwnedEvents: Record<number, ChampionshipOwnedEvent[]> = {};
  championshipEventNames: Record<number, string> = {};
  championshipEventFormats: Record<number, ChampionshipOwnedEventFormat> = {};
  championshipEventBusy = false;
  championshipOwnedEventTeams: Record<number, ChampionshipOwnedEventTeam[]> = {};
  championshipOwnedTeamDrafts: Record<number, number | null> = {};
  championshipLeagueFixtures: Record<number, ChampionshipOwnedLeagueFixture[]> = {};
  championshipLeagueLegs: Record<number, 1 | 2> = {};
  championshipLeagueBusy = false;
  championshipCupDraws: Record<number, ChampionshipCupOpeningRound> = {};
  championshipCupBusy = false;

  loadChampionshipCupDraw(championshipId: number, eventId: number): void {
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipsApi.ownedCupDraw(communityId, championshipId, eventId).subscribe({
      next: draw => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipCupDraws[eventId] = draw;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = t('communities.championshipOwned.cupLoadError');
        this.changeDetector.markForCheck();
      }
    });
  }

  generateChampionshipCup(championship: CommunityChampionship, event: ChampionshipOwnedEvent): void {
    const count = (this.championshipOwnedEventTeams[event.id] || []).length;
    if (!this.canManage || this.championshipCupBusy || championship.closedAt
        || event.format !== 'CUP' || event.status !== 'DRAFT' || count < 2 || count > 64) return;
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipCupBusy = true;
    this.championshipError = '';
    this.championshipsApi.drawOwnedCup(communityId, championship.id, event.id).subscribe({
      next: draw => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipCupDraws[event.id] = draw;
        this.championshipOwnedEvents[championship.id] = (this.championshipOwnedEvents[championship.id] || [])
          .map(item => item.id === event.id ? { ...item, status: 'SCHEDULED' as const } : item);
        this.championshipCupBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipCupBusy = false;
        this.championshipError = t('communities.championshipOwned.cupDrawError');
        this.changeDetector.markForCheck();
      }
    });
  }



  setChampionshipLeagueLegs(eventId: number, selection: string): void {
    this.championshipLeagueLegs[eventId] = selection === '2' ? 2 : 1;
  }

  leagueRounds(eventId: number): number[] {
    return [...new Set((this.championshipLeagueFixtures[eventId] || [])
      .map(fixture => fixture.round))].sort((a, b) => a - b);
  }

  leagueRoundFixtures(eventId: number, round: number): ChampionshipOwnedLeagueFixture[] {
    return (this.championshipLeagueFixtures[eventId] || [])
      .filter(fixture => fixture.round === round);
  }

  loadChampionshipLeagueFixtures(championshipId: number, eventId: number): void {
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipsApi.ownedLeagueFixtures(communityId, championshipId, eventId).subscribe({
      next: matches => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipLeagueFixtures[eventId] = matches;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = t('communities.championshipOwned.fixturesLoadError');
        this.changeDetector.markForCheck();
      }
    });
  }

  generateChampionshipLeague(championship: CommunityChampionship, event: ChampionshipOwnedEvent): void {
    const teamCount = (this.championshipOwnedEventTeams[event.id] || []).length;
    if (!this.canManage || this.championshipLeagueBusy || championship.closedAt
        || event.status !== 'DRAFT' || event.format !== 'LEAGUE'
        || teamCount < 2 || teamCount > 64) return;
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    const legs = this.championshipLeagueLegs[event.id] || 1;
    this.championshipLeagueBusy = true;
    this.championshipError = '';
    this.championshipsApi.scheduleOwnedLeague(communityId, championship.id, event.id, legs).subscribe({
      next: fixtures => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipLeagueFixtures[event.id] = fixtures;
        this.championshipOwnedEvents[championship.id] = (this.championshipOwnedEvents[championship.id] || [])
          .map(item => item.id === event.id ? { ...item, status: 'SCHEDULED' as const } : item);
        this.championshipLeagueBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipLeagueBusy = false;
        this.championshipError = t('communities.championshipOwned.scheduleError');
        this.changeDetector.markForCheck();
      }
    });
  }


  loadChampionshipOwnedEventTeams(championshipId: number, eventId: number): void {
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipsApi.ownedEventTeams(communityId, championshipId, eventId).subscribe({
      next: teams => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipOwnedEventTeams[eventId] = teams;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = t('communities.championshipOwned.teamsLoadError');
        this.changeDetector.markForCheck();
      }
    });
  }

  availableChampionshipTeams(championshipId: number, eventId: number) {
    const registered = new Set((this.championshipOwnedEventTeams[eventId] || [])
      .map(team => team.championshipTeamId));
    return (this.championshipTeamRegistries[championshipId]?.teams || [])
      .filter(team => !registered.has(team.id));
  }

  registerChampionshipEventTeam(championship: CommunityChampionship, event: ChampionshipOwnedEvent): void {
    const teamId = Number(this.championshipOwnedTeamDrafts[event.id]);
    if (!this.canManage || this.championshipEventBusy || championship.closedAt
        || event.status !== 'DRAFT' || !Number.isInteger(teamId) || teamId <= 0
        || !this.availableChampionshipTeams(championship.id, event.id).some(team => team.id === teamId)) return;
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipEventBusy = true;
    this.championshipError = '';
    this.championshipsApi.addOwnedEventTeam(communityId, championship.id, event.id, teamId).subscribe({
      next: registration => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipOwnedEventTeams[event.id] =
          [...(this.championshipOwnedEventTeams[event.id] || []), registration];
        this.championshipOwnedTeamDrafts[event.id] = null;
        this.championshipEventBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipEventBusy = false;
        this.championshipError = t('communities.championshipOwned.teamAddError');
        this.changeDetector.markForCheck();
      }
    });
  }

  unregisterChampionshipEventTeam(championship: CommunityChampionship,
                                  event: ChampionshipOwnedEvent, teamId: number): void {
    if (!this.canManage || this.championshipEventBusy || championship.closedAt
        || event.status !== 'DRAFT') return;
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipEventBusy = true;
    this.championshipError = '';
    this.championshipsApi.removeOwnedEventTeam(communityId, championship.id, event.id, teamId).subscribe({
      next: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipOwnedEventTeams[event.id] =
          (this.championshipOwnedEventTeams[event.id] || [])
            .filter(team => team.championshipTeamId !== teamId);
        this.championshipEventBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipEventBusy = false;
        this.championshipError = t('communities.championshipOwned.teamRemoveError');
        this.changeDetector.markForCheck();
      }
    });
  }


  editingChampionshipEventId: number | null = null;
  editingChampionshipEventName = '';
  editingChampionshipEventFormat: ChampionshipOwnedEventFormat = 'LEAGUE';
  deletingChampionshipEventId: number | null = null;

  beginEditChampionshipEvent(event: ChampionshipOwnedEvent): void {
    if (!this.canManage || this.championshipEventBusy || event.status !== 'DRAFT') return;
    this.deletingChampionshipEventId = null;
    this.editingChampionshipEventId = event.id;
    this.editingChampionshipEventName = event.name;
    this.editingChampionshipEventFormat = event.format;
  }

  cancelEditChampionshipEvent(): void {
    if (this.championshipEventBusy) return;
    this.editingChampionshipEventId = null;
    this.editingChampionshipEventName = '';
  }

  saveChampionshipEvent(championship: CommunityChampionship, event: ChampionshipOwnedEvent): void {
    const name = this.editingChampionshipEventName.trim();
    if (!this.canManage || this.championshipEventBusy || championship.closedAt
        || !this.championshipOwnedTeamEventsAvailable(championship.sport)
        || this.editingChampionshipEventId !== event.id || event.status !== 'DRAFT'
        || !name || name.length > 120) return;
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipEventBusy = true;
    this.championshipError = '';
    this.championshipsApi.updateOwnedEvent(communityId, championship.id, event.id,
      name, this.editingChampionshipEventFormat).subscribe({
      next: updated => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipOwnedEvents[championship.id] = (this.championshipOwnedEvents[championship.id] || [])
          .map(item => item.id === updated.id ? updated : item);
        this.championshipEventBusy = false;
        this.editingChampionshipEventId = null;
        this.editingChampionshipEventName = '';
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipEventBusy = false;
        this.championshipError = t('communities.championshipOwned.editError');
        this.changeDetector.markForCheck();
      }
    });
  }

  requestDeleteChampionshipEvent(event: ChampionshipOwnedEvent): void {
    if (!this.canManage || this.championshipEventBusy || event.status !== 'DRAFT') return;
    this.cancelEditChampionshipEvent();
    this.deletingChampionshipEventId = event.id;
  }

  cancelDeleteChampionshipEvent(): void {
    this.deletingChampionshipEventId = null;
  }

  deleteChampionshipEvent(championship: CommunityChampionship, event: ChampionshipOwnedEvent): void {
    if (!this.canManage || this.championshipEventBusy || championship.closedAt
        || event.status !== 'DRAFT' || this.deletingChampionshipEventId !== event.id) return;
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipEventBusy = true;
    this.championshipError = '';
    this.championshipsApi.deleteOwnedEvent(communityId, championship.id, event.id).subscribe({
      next: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipOwnedEvents[championship.id] = (this.championshipOwnedEvents[championship.id] || [])
          .filter(item => item.id !== event.id);
        this.deletingChampionshipEventId = null;
        this.championshipEventBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipEventBusy = false;
        this.championshipError = t('communities.championshipOwned.deleteError');
        this.changeDetector.markForCheck();
      }
    });
  }


  loadChampionshipOwnedEvents(championshipId: number): void {
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipsApi.ownedEvents(communityId, championshipId).subscribe({
      next: events => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipOwnedEvents[championshipId] = events;
        events.forEach(event => this.loadChampionshipOwnedEventTeams(championshipId, event.id));
        events.filter(event => event.format === 'LEAGUE').forEach(event => this.loadChampionshipLeagueFixtures(championshipId, event.id));
        events.filter(event => event.format === 'CUP').forEach(event => this.loadChampionshipCupDraw(championshipId, event.id));
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = t('communities.championshipUi.ownedLoadError');
        this.changeDetector.markForCheck();
      }
    });
  }

  createChampionshipOwnedEvent(championship: CommunityChampionship): void {
    const name = (this.championshipEventNames[championship.id] || '').trim();
    const format = this.championshipEventFormats[championship.id] || 'LEAGUE';
    if (!this.canManage || this.championshipEventBusy || championship.closedAt
        || !this.championshipOwnedTeamEventsAvailable(championship.sport)
        || !name || name.length > 120) return;
    const revision = this.championshipRevision;
    const communityId = this.community.id;
    this.championshipEventBusy = true;
    this.championshipError = '';
    this.championshipsApi.createOwnedEvent(communityId, championship.id, name, format).subscribe({
      next: created => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipOwnedEvents[championship.id] =
          [...(this.championshipOwnedEvents[championship.id] || []), created];
        this.championshipEventNames[championship.id] = '';
        this.championshipOwnedEventTeams[created.id] = [];
        this.championshipEventBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipEventBusy = false;
        this.championshipError = t('communities.championshipUi.ownedCreateError');
        this.changeDetector.markForCheck();
      }
    });
  }

  championshipExplainerOpen = false;
  championshipOpen = false;
  championshipBusy = false;
  championshipError = '';
  private championshipRevision = 0;

  private loadChampionships(): void {
    const revision = ++this.championshipRevision;
    const communityId = this.community.id;
    // A new request invalidates every dependent snapshot. Otherwise the
    // profile can momentarily combine results from different data revisions.
    this.championships = [];
    this.championshipOwnedEvents = {};
    this.championshipStandingsModeDrafts = {};
    this.championshipEventNames = {};
    this.championshipEventFormats = {};
    this.championshipOwnedEventTeams = {};
    this.championshipOwnedTeamDrafts = {};
    this.championshipLeagueFixtures = {};
    this.championshipCupDraws = {};
    this.championshipLeagueLegs = {};
    this.editingChampionshipEventId = null;
    this.editingChampionshipEventName = '';
    this.deletingChampionshipEventId = null;
    this.championshipAggregateStandings = {};
    this.championshipTeamRegistries = {};
    this.championshipHonours = null;
    this.championshipHonoursError = '';
    this.permanentTeamRegistry = null;
    this.selectedPermanentTeamId = null;
    this.rankingChartSport = '';
    this.comparisonOlderChampionshipId = null;
    this.comparisonNewerChampionshipId = null;
    this.championshipsApi.list(communityId).subscribe({
      next: championships => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championships = championships;
        this.loadChampionshipHonours();
        this.loadPermanentTeams();
        championships.forEach(item => {
          this.loadChampionshipStandings(item.id);
          this.loadChampionshipTeams(item.id);
          this.loadChampionshipOwnedEvents(item.id);
        });
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipError = 'Não foi possível carregar os campeonatos.';
        this.changeDetector.markForCheck();
      }
    });
  }

  refreshChampionships(): void {
    if (this.championshipBusy) return;
    this.championshipError = '';
    this.loadChampionships();
  }

  createChampionship(): void {
    const name = this.championshipNameDraft.trim();
    const sport = this.championshipSportDraft;
    const season = this.championshipSeasonDraft.trim();
    if (!this.canManage || this.championshipBusy || !name || !sport || !season) return;
    this.championshipBusy = true;
    this.championshipError = '';
    const communityId = this.community.id;
    const revision = this.championshipRevision;
    this.championshipsApi.create(communityId, name, sport, season, this.championshipRankingModeDraft).subscribe({
      next: championship => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championships = [championship, ...this.championships];
        this.loadChampionshipStandings(championship.id);
        this.loadChampionshipTeams(championship.id);
        this.championshipOwnedEvents[championship.id] = [];
        this.championshipNameDraft = '';
        this.championshipRankingModeDraft = 'AGGREGATE';
        this.championshipOpen = false;
        this.championshipBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipBusy = false;
        this.championshipError = 'Não foi possível criar o campeonato.';
        this.changeDetector.markForCheck();
      }
    });
  }

  linkChampionshipCompetition(championship: CommunityChampionship, tournamentId: number): void {
    if (!this.canManage || this.championshipBusy || !!championship.closedAt
        || !Number.isInteger(tournamentId) || tournamentId <= 0
        || !this.availableChampionshipTournaments(championship).some(item => item.id === tournamentId)) return;
    this.championshipBusy = true;
    this.championshipError = '';
    const communityId = this.community.id;
    const revision = this.championshipRevision;
    this.championshipsApi.addCompetition(communityId, championship.id, tournamentId).subscribe({
      next: updated => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championships = this.championships.map(c => c.id === updated.id ? updated : c);
        this.championshipTournamentDrafts[updated.id] = null;
        this.loadChampionshipStandings(updated.id);
        this.loadChampionshipTeams(updated.id);
        this.championshipBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipBusy = false;
        this.championshipError = 'Não foi possível associar esta prova. Confirma a modalidade e se já pertence a outro campeonato.';
        this.changeDetector.markForCheck();
      }
    });
  }

  setChampionshipPlacementPoints(championship: CommunityChampionship,
                                 tournamentId: number, pointsCsv: string): void {
    const chunks = pointsCsv.split(',').map(value => value.trim());
    const points = chunks.map(value => Number(value));
    if (!this.canManage || this.championshipBusy) return;
    if (chunks.length < 2 || chunks.length > 20
        || chunks.some(value => !/^[0-9]{1,5}$/.test(value))
        || points.some((point, index) => point > 10000
          || (index > 0 && point > points[index - 1]))) {
      this.championshipError = 'Indica entre 2 e 20 pontuações inteiras, por ordem decrescente (ex.: 25,18,15,10).';
      return;
    }
    const communityId = this.community.id;
    const revision = this.championshipRevision;
    this.championshipBusy = true;
    this.championshipError = '';
    this.championshipsApi.setPlacementPoints(
      communityId, championship.id, tournamentId, points.join(',')).subscribe({
      next: updated => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championships = this.championships.map(item => item.id === updated.id ? updated : item);
        this.loadChampionshipStandings(updated.id);
        this.championshipBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipBusy = false;
        this.championshipError = 'Não foi possível guardar a pontuação por posição.';
        this.changeDetector.markForCheck();
      }
    });
  }

  setChampionshipWinnerPoints(championship: CommunityChampionship,
                              tournamentId: number, rawPoints: string): void {
    const points = Number(rawPoints);
    if (!this.canManage || this.championshipBusy
        || !Number.isInteger(points) || points < 0 || points > 10000) {
      this.championshipError = 'Define um número inteiro de pontos entre 0 e 10000.';
      return;
    }
    this.championshipBusy = true;
    this.championshipError = '';
    const communityId = this.community.id;
    const revision = this.championshipRevision;
    this.championshipsApi.setWinnerPoints(communityId, championship.id, tournamentId, points).subscribe({
      next: updated => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championships = this.championships.map(item => item.id === updated.id ? updated : item);
        this.championshipBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.championshipRevision || communityId !== this.community.id) return;
        this.championshipBusy = false;
        this.championshipError = 'Não foi possível guardar os pontos da prova.';
        this.changeDetector.markForCheck();
      }
    });
  }

  championshipAvailableTournaments(championship: CommunityChampionship): CommunityTournament[] {
    const attached = new Set(this.championships.flatMap(c => c.competitions.map(t => t.id)));
    return this.tournaments.filter(t => t.sport?.toLowerCase() === championship.sport.toLowerCase()
      && !attached.has(t.id));
  }

  tournaments: CommunityTournament[] = [];
  selected?: CommunityTournament;
  historicalArchive?: HistoricalMatchArchive;
  historicalArchivePage = 0;
  /** Each phase advances independently across its explicitly flagged source rows. */
  historicalReviewCursor: Record<HistoricalKnockoutPhaseId, number> =
    { quarterfinal: -1, semifinal: -1, final: -1 };
  readonly historicalMatchReviewFlags = historicalMatchReviewFlags;
  @ViewChild('historicalArchiveFixtures') private historicalArchiveFixtures?: ElementRef<HTMLElement>;
  @ViewChild('teamFixturesList') private teamFixturesList?: ElementRef<HTMLElement>;
  @ViewChild('teamProfileSection') private teamProfileSection?: ElementRef<HTMLElement>;
  @ViewChild('teamProfileFixtures') private teamProfileFixtures?: ElementRef<HTMLElement>;
  @ViewChild('teamProfileRoster') private teamProfileRoster?: ElementRef<HTMLElement>;
  @ViewChild('teamTournamentTeams') private teamTournamentTeams?: ElementRef<HTMLElement>;
  @ViewChild('teamTournamentFixtures') private teamTournamentFixtures?: ElementRef<HTMLElement>;
  @ViewChild('teamTournamentBracket') private teamTournamentBracket?: ElementRef<HTMLElement>;
  @ViewChild('teamTournamentStandings') private teamTournamentStandings?: ElementRef<HTMLElement>;

  /** Source-labelled stages, without inventing a fixture, bracket or official rank. */
  get historicalKnockoutPhases() {
    return this.historicalArchive ? historicalKnockoutPhaseOverview(this.historicalArchive) : [];
  }

  /** Navigate to the original row page and reveal the existing fixture list. */
  showHistoricalKnockoutPhase(firstArchiveIndex: number): void {
    if (!this.historicalArchive || firstArchiveIndex < 0
      || firstArchiveIndex >= this.historicalArchive.rows.length) return;
    this.historicalArchivePage = Math.floor(firstArchiveIndex / 50);
    this.changeDetector.detectChanges();

    // A page can contain several source-defined stages. Jump to the actual
    // first original match, not just the archive heading or the first group.
    // Use the sourceRow from our own archived row; never build a selector from
    // user-entered phase names.
    const sourceRow = this.historicalArchive.rows[firstArchiveIndex].sourceRow;
    const section = this.historicalArchiveFixtures?.nativeElement;
    const match = section?.querySelector<HTMLElement>(
      `[data-historical-source-row="${sourceRow}"]`
    );
    (match ?? section)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** Review only actual flagged rows; a stage-count mismatch is not a fixture. */
  showNextHistoricalReview(phase: HistoricalKnockoutPhaseOverview): void {
    const current = this.historicalKnockoutPhases.find(item => item.phase === phase.phase);
    const indices = current?.reviewArchiveIndices ?? [];
    if (!indices.length) return;
    const next = (this.historicalReviewCursor[phase.phase] + 1) % indices.length;
    this.historicalReviewCursor[phase.phase] = next;
    this.showHistoricalKnockoutPhase(indices[next]);
  }

  /** Contiguous labels exactly as found in the spreadsheet, within this page. */
  get historicalArchivePageGroups() {
    if (!this.historicalArchive) return [];
    const start = this.historicalArchivePage * 50;
    return groupHistoricalTournamentSourceRows(this.historicalArchive.rows.slice(start, start + 50));
  }

  get canEstimateHistoricalLeagueTable(): boolean {
    return this.selected?.format === 'LEAGUE'
      && canEstimateHistoricalLeagueStandings(this.selected.sport);
  }

  get historicalLeagueTable(): HistoricalTournamentStanding[] {
    if (!this.canEstimateHistoricalLeagueTable || !this.historicalArchive || !this.selected) return [];
    return historicalTournamentStandings(this.historicalArchive,
      this.selected.winPoints, this.selected.drawPoints, this.selected.lossPoints);
  }

  get historicalScoreLabels() {
    return this.localizedScoreTerminology(this.selected?.sport);
  }

  get historicalOutcome(): HistoricalTournamentOutcome | null {
    if (!this.historicalArchive || !this.selected?.historicalArchiveId) return null;
    if (this.selected.format !== 'LEAGUE' && this.selected.format !== 'KNOCKOUT') return null;
    return historicalTournamentOutcome(
      this.historicalArchive, this.selected.format, this.selected.sport,
      this.selected.winPoints, this.selected.drawPoints, this.selected.lossPoints
    );
  }

  tournamentsPage = 0;
  tournamentsHasMore = false;
  participants: TournamentParticipant[] = [];
  participantsPage = 0;
  participantsHasMore = false;
  rosterReady = false;
  matches: TournamentMatch[] = [];
  matchesPage = 0;
  matchesHasMore = false;
  standings?: TournamentStandings;
  raceOverview?: TournamentRaceOverview;
  timedOverview?: TournamentTimedOverview;
  timedError = false;
  private timedRevision = 0;
  measuredOverview?: TournamentMeasuredOverview;
  measuredError = false;
  private measuredRevision = 0;
  speedOverview?: InlineSpeedOverview;
  speedError = false;
  speedHeats: Record<number, number> = {};
  speedSelections: Record<string, number[]> = {};
  speedTieCorrectionOpen = false;
  speedReasons: Record<string, string> = {};
  speedEvidenceType: InlineSpeedTieEvidenceType | '' = '';
  speedEvidenceReference = '';
  speedTieTrialIds: number[] = [];
  speedTrialOrderExceptionReason = '';
  speedTrialOpen = false;
  speedTrialHeldAt = '';
  speedTrialReference = '';
  speedTrialReason = '';
  speedTrialPlaces: Record<number, number | null> = {};
  speedTrialTimes: Record<number, number | null> = {};
  private speedRevision = 0;
  raceError = false;
  racePointsDraft = '';
  private raceRevision = 0;

  competitionView: 'championships' | 'tournaments' = 'championships';
  creationPickerOpen = false;

  get completedTournamentCount(): number {
    return this.tournaments.filter(item => item.status === 'COMPLETED').length;
  }

  get activeTournamentCount(): number {
    return this.tournaments.filter(item => item.status !== 'COMPLETED').length;
  }

  selectCompetitionView(view: 'championships' | 'tournaments'): void {
    this.competitionView = view;
    this.creationPickerOpen = false;
    this.showGuide = false;
    this.championshipOpen = false;
    this.showIndividualCreate = false;
    this.showTeamCreate = false;
  }

  openCompetitionPicker(): void {
    if (!this.canManage) return;
    this.creationPickerOpen = !this.creationPickerOpen;
  }

  chooseCompetitionKind(kind: 'championships' | 'tournaments'): void {
    if (!this.canManage) return;
    this.competitionView = kind;
    this.creationPickerOpen = false;
    if (kind === 'championships') {
      this.championshipOpen = true;
      this.showGuide = false;
      this.showIndividualCreate = false;
      this.showTeamCreate = false;
    } else {
      this.championshipOpen = false;
      this.showIndividualCreate = false;
      this.showTeamCreate = false;
      this.showGuide = true;
    }
  }

  showGuide = false;
  showIndividualCreate = false;
  showTeamCreate = false;
  roundRobinLegsDraft: 1 | 2 = 1;
  teamFormatDraft: 'LEAGUE' | 'KNOCKOUT' | 'GROUP_KNOCKOUT' = 'LEAGUE';
  teamGroupCountDraft: 2 | 4 = 2;
  teamTieBreakPriorityDraft: TeamTieBreakPriority = 'GOAL_DIFFERENCE_FIRST';
  winPointsDraft = 3;
  drawPointsDraft = 1;
  lossPointsDraft = 0;
  teamNameDraft = '';
  relayOverview?: RelayOverview;
  relayError = false;
  private relayRevision=0;
  relayHeatDraft: Record<number, number> = {};
  relayTimeDraft: Record<number, number | null> = {};
  relayLegDraft: Record<number, number[]> = {};
  relayFinalConfirm=false;
  relayDecisionReasons:Record<number,string>={};
  readonly relayLegIndexes=[0,1,2,3] as const;
  teamPlayerDraft: Record<number, number | null> = {};
  teamMemberSearch: Record<number, string> = {};
  teamRosterSearch: Record<number, string> = {};
  inviteCopyFeedback: Record<number, string> = {};
  teams: TournamentTeam[] = [];
  teamDirectoryQuery = '';
  teamQuickSwitchQuery = '';
  readonly teamQuickSwitchPreviewSize = 12;
  teamQuickSwitchLimit = 12;
  readonly teamDirectoryPageSize = 12;
  teamDirectoryLimit = 12;
  teamsLoadError = false;
  teamMatches: TournamentTeamMatch[] = [];
  /** Independent, server-scoped fixture pagination for the selected team page. */
  teamProfileMatches: TournamentTeamMatch[] = [];
  teamProfileMatchesPage = -1;
  teamProfileMatchesHasMore = false;
  teamProfileMatchesLoading = false;
  teamProfileMatchesError = false;
  teamProfileMatchFilter: 'ALL' | 'PENDING' | 'COMPLETED' = 'ALL';
  teamProfilePhaseFilter = 'ALL';
  teamProfileOpponentId: number | null = null;
  teamProfileOpponentsExpanded = false;
  readonly teamProfileOpponentPreviewSize = 6;
  private teamProfileMatchesRevision = 0;
  teamMatchFilter: 'ALL' | 'PENDING' | 'COMPLETED' = 'ALL';
  teamPhaseFilter = 'ALL';
  knockoutFocusTeamId: number | null = null;
  knockoutMatchQuery = '';
  knockoutStatusFilter: 'ALL' | 'PENDING' | 'COMPLETED' = 'ALL';
  knockoutSearchFixtureId: number | null = null;
  selectedKnockoutRound: number | null = null;
  /** Compact group navigation; never changes the official group standings. */
  private requestedTeamGroupNumber: number | null = null;
  readonly knockoutCompactLimit = 4;
  readonly knockoutCompactThreshold = 6;
  expandedKnockoutRounds = new Set<number>();
  knockoutRoundLimits = new Map<number,number>();
  teamMatchesPage = 0;
  teamMatchesHasMore = false;
  teamMatchesLoading = false;
  teamMatchesError = false;
  private teamMatchesRevision = 0;
  teamStandings?: TournamentTeamStandings;
  /** Display-only pagination; the full ranking stays in the API response. */
  readonly teamStandingsPageSize = 12;
  teamStandingsLimit = 12;
  get visibleTeamStandings(): TournamentTeamStandingRow[] {
    if (!this.isTeamCompetition || this.selected?.format !== 'LEAGUE'
        || this.isRelayCompetition || this.teamStandingsError || !this.teamStandings
        || this.teamStandings.tournamentId !== this.selected.id) return [];
    return this.teamStandings.standings.slice(0, this.teamStandingsLimit);
  }
  get hasMoreTeamStandings(): boolean {
    return !!this.teamStandings && this.teamStandings.tournamentId === this.selected?.id
      && this.teamStandings.standings.length > this.teamStandingsLimit;
  }
  expandTeamStandings(): void {
    if (this.hasMoreTeamStandings) {
      this.teamStandingsLimit += this.teamStandingsPageSize;
      this.changeDetector.markForCheck();
    }
  }
  collapseTeamStandings(): void {
    this.teamStandingsLimit = this.teamStandingsPageSize;
    this.changeDetector.markForCheck();
  }
  teamGroups?: TournamentTeamGroups;
  teamGroupsLoading = false;
  teamGroupsError = false;
  private teamGroupsRevision = 0;
  teamStandingsLoading = false;
  teamStandingsError = false;
  private teamStandingsRevision = 0;
  teamScoreDrafts: Record<number, { home: number | null; away: number | null }> = {};
  teamScoreTouched = new Set<number>();
  editingTeamResultId: number | null = null;
  confirmingTeamPlayerRemoval: { teamId: number; profileId: number } | null = null;
  confirmingEmptyTeamId: number | null = null;
  nameDraft = '';
  sportDraft = '';
  eventTypeDraft: string | null = null;
  eventDisciplineDraft: string | null = null;
  sportSearch = '';
  editingSport = false;
  expandedCommunitySports = false;
  readonly communitySportPreviewSize = 6;
  get communitySportOptions(): string[] {
    const selected = this.community?.sports;
    return selected?.length ? selected : (this.community?.sport ? [this.community.sport] : []);
  }

  get visibleCommunitySportOptions(): string[] {
    const sports = this.communitySportOptions;
    return this.expandedCommunitySports ? sports : sports.slice(0, this.communitySportPreviewSize);
  }

  toggleCommunitySportOptions(): void {
    if (this.busy || this.communitySportOptions.length <= this.communitySportPreviewSize) return;
    this.expandedCommunitySports = !this.expandedCommunitySports;
  }

  // In a multisport community, keep the registered sports available while
  // explicitly editing a selection. The selected chip uses aria-pressed, so
  // switching is visible without implying a second simultaneous selection.
  get showCommunitySportShortcuts(): boolean {
    return this.communitySportOptions.length > 0
      && (!this.sportDraft || (this.editingSport && this.communitySportOptions.length > 1));
  }

  /**
   * Tournament creation currently uses numeric head-to-head results.
   * Clearly distinguish that contract from the sport-specific formats
   * available when recording community rounds. Presentation only.
   */
  /** One result-contract decision for all 121 catalog sports and both creation flows. */
  get championshipAvailability() {
    return championshipModeAvailability(this.sportDraft);
  }

  get selectedSportCapabilities() {
    return tournamentSportCapabilities(this.sportDraft);
  }

  get selectedSportCreationModel() {
    return tournamentCreationModelForEvent(this.sportDraft, this.showTeamCreate, this.eventTypeDraft);
  }

  get sportEventChoices() {
    const choices=tournamentEventChoices(this.sportDraft, this.selectedSportCreationModel);
    // Athletics changes result engine when switching between track races and
    // field events. Offer both valid individual event families in the picker,
    // while validating each choice against its own (not the previous) engine.
    if (this.sportDraft === 'Atletismo' && !this.showTeamCreate) {
      return choices.map(choice=>({
        ...choice,
        supported: !!validatedTournamentEventType(this.sportDraft,
          tournamentCreationModelForEvent(this.sportDraft, false, choice.code), choice.code)
      }));
    }
    return choices;
  }

  get savedSportEventType(): string | null {
    return validatedTournamentEventType(this.sportDraft, this.selectedSportCreationModel, this.eventTypeDraft);
  }

  get trackDisciplineOptions(): readonly string[] {
    return this.selectedSportCreationModel==='TRACK_BEST_TIME'
      && this.savedSportEventType==='TRACK' ? TRACK_TOURNAMENT_DISTANCES : [];
  }
  get trackFlatOptions():readonly string[] {
    return this.trackDisciplineOptions.filter(code=>!code.includes('HURDLES') && !code.includes('STEEPLE'));
  }
  get trackObstacleOptions():readonly string[] {
    return this.trackDisciplineOptions.filter(code=>code.includes('HURDLES') || code.includes('STEEPLE'));
  }
  chooseTrackDiscipline(code:string):void {
    if (this.busy || !this.trackDisciplineOptions.includes(code)) return;
    this.eventDisciplineDraft=code;
    this.changeDetector.markForCheck();
  }
  relayDisciplineLabel(code:string|null|undefined):string {
    return code ? code.replace('RELAY_4X','4×')+' m' : '—';
  }
  get relayDisciplineOptions():readonly string[] {
    return this.selectedSportCreationModel==='RELAY_BEST_TIME'
      && this.savedSportEventType==='TRACK_RELAY' ? RELAY_TOURNAMENT_DISCIPLINES : [];
  }
  chooseRelayDiscipline(code:string):void {
    if (this.busy || !this.relayDisciplineOptions.includes(code)) return;
    this.eventDisciplineDraft=code;
    this.changeDetector.markForCheck();
  }
  get isRelayDraft():boolean {
    return this.selectedSportCreationModel==='RELAY_BEST_TIME';
  }
  get isRelayCompetition():boolean {
    return this.selected?.scoringMode==='RELAY_BEST_TIME';
  }
  get rowingDisciplineOptions(): readonly string[] {
    return this.savedSportEventType==='ROWING_SINGLE'
      && this.selectedSportCreationModel==='ROWING_BEST_TIME' ? ROWING_SINGLE_DISCIPLINES : [];
  }
  chooseRowingDiscipline(code:string):void {
    if (this.busy || !this.rowingDisciplineOptions.includes(code)) return;
    this.eventDisciplineDraft=code;
    this.changeDetector.markForCheck();
  }
  get canoeDisciplineOptions(): readonly string[] {
    return this.savedSportEventType==='CANOE_SPRINT'
      && this.selectedSportCreationModel==='CANOE_BEST_TIME' ? CANOE_K1_DISCIPLINES : [];
  }
  chooseCanoeDiscipline(code:string):void {
    if (this.busy || !this.canoeDisciplineOptions.includes(code)) return;
    this.eventDisciplineDraft=code;
    this.changeDetector.markForCheck();
  }
  get swimDisciplineOptions(): readonly string[] {
    return this.savedSportEventType === 'SWIM_LCM' && this.selectedSportCreationModel === 'SWIM_BEST_TIME'
      ? SWIM_TOURNAMENT_DISCIPLINES : [];
  }
  get fieldDisciplineOptions(): readonly string[] {
    return this.selectedSportCreationModel === 'FIELD_BEST_MARK'
      ? (FIELD_TOURNAMENT_DISCIPLINES[this.savedSportEventType ?? ''] ?? []) : [];
  }
  chooseFieldDiscipline(code: string): void {
    if (this.busy || !this.fieldDisciplineOptions.includes(code)) return;
    this.eventDisciplineDraft = code;
    this.changeDetector.markForCheck();
  }
  chooseSwimDiscipline(code: string): void {
    if (this.busy || !this.swimDisciplineOptions.includes(code)) return;
    this.eventDisciplineDraft = code;
    this.changeDetector.markForCheck();
  }
  chooseTournamentEventType(code: string): void {
    // Validate the requested event with the engine it would select. Checking
    // the previous engine made it impossible to switch FIELD -> TRACK (or back).
    const candidateModel=tournamentCreationModelForEvent(this.sportDraft, this.showTeamCreate, code);
    if (this.busy || !validatedTournamentEventType(this.sportDraft, candidateModel, code)) return;
    if (this.eventTypeDraft !== code) this.eventDisciplineDraft = null;
    this.eventTypeDraft = code;
    this.changeDetector.markForCheck();
  }

  /** An unsupported route must not masquerade as a head-to-head competition. */
  get creationSportNoticeKey(): string | null {
    if (!this.sportDraft.trim()) return null;
    const model = this.selectedSportCreationModel;
    if (model !== 'UNAVAILABLE') {
      // The specialised engines and their own guides already describe valid
      // races, marks and times; a legacy 1-v-1 warning is incorrect here.
      return model === 'NUMERIC_INDIVIDUAL' || model === 'NUMERIC_TEAM'
        ? (this.selectedSportCapabilities.family === 'duel'
          ? 'communities.tournaments.creationDuelNotice' : null)
        : null;
    }
    switch (this.selectedSportCapabilities.family) {
      case 'race':
        return 'communities.tournaments.creationRaceNotice';
      case 'measured':
      case 'judged':
      case 'score':
      case 'activity':
        return 'communities.tournaments.creationPerformanceNotice';
      case 'duel':
        return 'communities.tournaments.creationDuelNotice';
      case 'unknown':
        return 'communities.tournaments.creationUnknownNotice';
      default:
        return null;
    }
  }

  get suggestedSports(): string[] {
    const normalized = this.sportSearch.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (!normalized) return [];
    // Exact and prefix matches must remain discoverable even when a community
    // has many imported/legacy sport labels. Preserve source order for ties.
    const normalize = (value: string) => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return [...new Set([...this.communitySportOptions, ...SPORTS_CATALOG])]
      .map((sport, index) => ({ sport, index, key: normalize(sport) }))
      .filter(item => item.key.includes(normalized))
      .sort((a, b) => {
        const rank = (key: string) => key === normalized ? 0 : key.startsWith(normalized) ? 1 : 2;
        return rank(a.key) - rank(b.key) || a.index - b.index;
      })
      .slice(0, 8)
      .map(item => item.sport);
  }

  chooseSport(sport: string): void {
    if (this.busy || !(SPORTS_CATALOG.includes(sport) || this.communitySportOptions.includes(sport))) return;
    if (this.sportDraft !== sport) {
      this.sportDraft = sport;
      this.eventTypeDraft = null;
      this.eventDisciplineDraft = null;
      this.resetPointRules();
    }
    this.sportSearch = '';
    this.editingSport = false;
    this.expandedCommunitySports = false;
  }

  toggleSportEditor(): void {
    if (this.busy || !this.sportDraft) return;
    this.editingSport = !this.editingSport;
    this.sportSearch = '';
  }

  loading = false;
  detailsLoading = false;
  busy = false;
  error = '';
  feedback = '';
  confirmAction: 'schedule' | 'complete' | 'completeTeam' | 'completeRace' | 'delete' | null = null;
  scoreDrafts: Record<number, { home: number | null; away: number | null }> = {};
  scoreTouched = new Set<number>();

  private focusErrorAfterRender = false;
  private focusPlayersAfterReload = false;

  // Angular 22 is zoneless; query setters focus controls when @if renders them.
  @ViewChild('errorNotice')
  set errorNotice(element: ElementRef<HTMLElement> | undefined) {
    if (element && this.focusErrorAfterRender) {
      this.focusErrorAfterRender = false;
      element.nativeElement.focus();
    }
  }

  @ViewChild('playersHeading')
  set playersHeading(element: ElementRef<HTMLElement> | undefined) {
    if (element && this.focusPlayersAfterReload) {
      this.focusPlayersAfterReload = false;
      element.nativeElement.focus();
    }
  }

  get teamTieBreakChoices(): ReadonlyArray<{
    value: TeamTieBreakPriority;
    title: string;
    explanation: string;
  }> {
    return [
      { value: 'GOAL_DIFFERENCE_FIRST', title: t('communities.tournaments.teamUi.tieDifference'),
        explanation: t('communities.tournaments.teamUi.tieDifferenceHelp') },
      { value: 'GOALS_SCORED_FIRST', title: t('communities.tournaments.teamUi.tieGoals'),
        explanation: t('communities.tournaments.teamUi.tieGoalsHelp') },
      { value: 'WINS_FIRST', title: t('communities.tournaments.teamUi.tieWins'),
        explanation: t('communities.tournaments.teamUi.tieWinsHelp') }
    ];
  }

  teamTieBreakLabel(priority: TeamTieBreakPriority | null | undefined): string {
    return this.teamTieBreakChoices.find(choice =>
      choice.value === (priority ?? 'GOAL_DIFFERENCE_FIRST'))?.title
      ?? t('communities.tournaments.teamUi.tieDifference');
  }

  get classificationProfile() {
    const profile = tournamentClassificationProfile(this.sportDraft);
    // Translate only display copy; keep all competition eligibility and scoring rules
    // from the shared, sport-aware classification profile unchanged.
    const family = profile.scoringMode === 'CHESS_HALF_POINTS' ? 'chess' : profile.format;
    const key = 'communities.tournaments.classificationUi.' + family + '.';
    return {
      ...profile,
      heading: t(key + 'heading'),
      detail: t(key + 'detail'),
      fields: t(key + 'fields')
    };
  }

  /** Generic position-based races only; subdisciplines require separate contracts. */
  get isRaceChampionshipDraft(): boolean {
    return !this.showTeamCreate && isRaceChampionshipSport(this.sportDraft);
  }

  raceSportLabel(sport: string | null | undefined): string {
    return sport === 'BMX' ? 'BMX Racing'
      : (sport || t('communities.tournaments.classificationUi.raceFallback'));
  }

  get isRaceCompetition(): boolean {
    return this.selected?.scoringMode === 'RACE_POINTS';
  }
  get isMeasuredCompetition(): boolean {
    return this.selected?.scoringMode === 'FIELD_BEST_MARK';
  }
  get isMeasuredDraft(): boolean {
    return this.selectedSportCreationModel === 'FIELD_BEST_MARK';
  }
  get isTimedCompetition(): boolean {
    return this.selected?.scoringMode === 'SWIM_BEST_TIME'
      || this.selected?.scoringMode === 'TRACK_BEST_TIME'
      || this.selected?.scoringMode === 'CANOE_BEST_TIME'
      || this.selected?.scoringMode === 'ROWING_BEST_TIME';
  }
  get isTrackCompetition():boolean {
    return this.selected?.scoringMode==='TRACK_BEST_TIME';
  }
  get isTimedDraft(): boolean {
    return this.selectedSportCreationModel === 'SWIM_BEST_TIME'
      || this.selectedSportCreationModel === 'TRACK_BEST_TIME'
      || this.selectedSportCreationModel === 'CANOE_BEST_TIME'
      || this.selectedSportCreationModel === 'ROWING_BEST_TIME';
  }
  timedUiKey(key:string):string {
    const common=['rounds','linked','unlink','link','empty','place','bestTime','attempts','unlinked','loading','loadError','available','noAvailable','resultsTitle','noResults','provisional'];
    if (this.selected?.scoringMode==='ROWING_BEST_TIME' && !common.includes(key))
      return key==='description'
        ? 'communities.tournaments.capabilities.model.ROWING_BEST_TIME'
        : key==='discipline.' ? 'row1x.d.' : 'row1x.'+key;
    if (this.selected?.scoringMode==='CANOE_BEST_TIME' && !common.includes(key))
      return key==='description'
        ? 'communities.tournaments.capabilities.model.CANOE_BEST_TIME'
        : key==='discipline.' ? 'cno.d.' : 'cno.'+key;
    return 'communities.'+(this.selected?.scoringMode==='TRACK_BEST_TIME'
      && !common.includes(key) ? 'trackTournament':'swimTournament')+'.'+key;
  }

  /** A speed-skating bracket uses timed heats, never generic league points. */
  get isInlineSpeedDraft(): boolean {
    return !this.showTeamCreate && this.sportDraft === 'Patinagem de Velocidade';
  }

  isInlineSpeedTournament(tournament: CommunityTournament | undefined): boolean {
    return tournament?.sport === 'Patinagem de Velocidade'
      && tournament.entryType !== 'TEAM'
      && tournament.scoringMode == null
      && !tournament.historicalArchiveId;
  }

  get isInlineSpeedCompetition(): boolean {
    return this.isInlineSpeedTournament(this.selected);
  }

  speedTournamentStatus(status: TournamentStatus): string {
    return t('communities.inlineSpeed.status.' + status);
  }

  speedStage(eventType: string): InlineSpeedStage {
    if (eventType.endsWith('_FIRST_ROUND')) return 'FIRST';
    if (eventType.endsWith('_QUARTER_HEAT')) return 'QUARTER';
    if (eventType.endsWith('_SEMI_HEAT')) return 'SEMI';
    return 'FINAL';
  }

  speedMaximumHeats(eventType: string): number {
    return { FIRST: 64, QUARTER: 4, SEMI: 2, FINAL: 1 }[this.speedStage(eventType)];
  }

  speedStageName(stage: InlineSpeedStage): string {
    return t('communities.inlineSpeed.stage.' + stage);
  }

  /** API warnings are authoritative but intentionally not locale-specific. */
  speedProposalWarning(proposal: InlineSpeedProposal): string {
    const warning = proposal.warning;
    if (warning.includes('Empate múltiplo'))
      return t('communities.inlineSpeed.warningMultipleTie');
    if (warning.includes('repetido')) return t('communities.inlineSpeed.warningDuplicate');
    if (warning.includes('tempos')) return t('communities.inlineSpeed.warningTimes');
    if (warning.includes('Posições')) return t('communities.inlineSpeed.warningPlaces');
    if (!proposal.ready) return t('communities.inlineSpeed.warningIncomplete');
    if (warning.includes('16.º/17.º') || proposal.playerIds.length > proposal.expectedCount)
      return t('communities.inlineSpeed.warningTie17');
    if (warning.includes('Empate')) return t('communities.inlineSpeed.warningTie');
    if (warning.includes('estrada')) return t('communities.inlineSpeed.warningRoad');
    return t('communities.inlineSpeed.warningPending');
  }

  speedStageSkaters(stage: InlineSpeedStage): InlineSpeedSkater[] {
    const athletes = new Map<number, InlineSpeedSkater>();
    for (const heat of this.speedOverview?.linkedHeats ?? []) {
      if (this.speedStage(heat.eventType) !== stage) continue;
      for (const skater of heat.skaters) athletes.set(skater.playerId, skater);
    }
    return [...athletes.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  speedTieBreak(stage: string) {
    return (this.speedOverview?.tieBreaks ?? []).find(item => item.sourceStage === stage);
  }

  /** Only real, still-current first-round trials may be cited by a new revision. */
  speedAvailableTieTrials() {
    return (this.speedOverview?.trials ?? []).filter(trial =>
      trial.sourceStage === 'FIRST' && !trial.stale)
      .sort((a, b) => a.heldAt.localeCompare(b.heldAt));
  }

  speedTrialLinked(id: number): boolean {
    return this.speedTieTrialIds.includes(id);
  }

  toggleSpeedTrialLink(id: number, checked: boolean): void {
    if (this.busy || !this.speedAvailableTieTrials().some(trial => trial.id === id)) return;
    if (checked) {
      if (!this.speedTieTrialIds.includes(id) && this.speedTieTrialIds.length < 10) {
        this.speedTieTrialIds = [...this.speedTieTrialIds, id];
      }
    } else {
      this.speedTieTrialIds = this.speedTieTrialIds.filter(value => value !== id);
    }
  }

  /** Comparisons are advisory: the jury may deliberately override finish order,
   * but the override needs a separately recorded explanation.
   */
  speedTrialOrderConflicts(): Array<{
    trialId: number; chosenId: number; chosenPlace: number;
    excludedId: number; excludedPlace: number
  }> {
    const selected = new Set(this.speedSelections['FIRST'] ?? []);
    const out: Array<{
      trialId: number; chosenId: number; chosenPlace: number;
      excludedId: number; excludedPlace: number
    }> = [];
    for (const trial of this.speedAvailableTieTrials()) {
      if (!this.speedTieTrialIds.includes(trial.id)) continue;
      for (const qualified of trial.results) {
        if (!selected.has(qualified.playerId)) continue;
        for (const unqualified of trial.results) {
          if (selected.has(unqualified.playerId) || unqualified.place >= qualified.place) continue;
          out.push({ trialId: trial.id, chosenId: qualified.playerId,
            chosenPlace: qualified.place, excludedId: unqualified.playerId,
            excludedPlace: unqualified.place });
        }
      }
    }
    return out;
  }

  speedTrialUsedRevisions(id: number): number[] {
    return (this.speedTieBreak('FIRST')?.revisions ?? [])
      .filter(revision => (revision.trialIds ?? []).includes(id))
      .map(revision => revision.revision);
  }

  speedEvidenceLabel(type: InlineSpeedTieEvidenceType | null | undefined): string {
    return type ? t('communities.inlineSpeed.evidence.' + type)
      : t('communities.inlineSpeed.evidence.legacy');
  }

  /** Keep the audit log readable with names, retaining IDs if a player was removed. */
  speedTieSkaterNames(ids: number[]): string {
    const names = new Map(this.speedStageSkaters('FIRST')
      .map(skater => [skater.playerId, skater.name]));
    return ids.map(id => names.get(id) ?? '#' + id).join(', ');
  }

  speedCanAmendTie(proposal: InlineSpeedProposal): boolean {
    return proposal.sourceStage === 'FIRST' && !!this.speedTieBreak('FIRST')
      && !this.speedDecision('FIRST') && this.canManage
      && this.selected?.status !== 'COMPLETED';
  }

  startSpeedTieCorrection(proposal: InlineSpeedProposal): void {
    if (this.busy || !this.speedCanAmendTie(proposal)) return;
    const ruling = this.speedTieBreak('FIRST');
    if (!ruling) return;
    this.speedSelections['FIRST'] = [...ruling.selectedPlayerIds];
    this.speedReasons['FIRST'] = ruling.reason;
    this.speedEvidenceType = ruling.evidenceType ?? '';
    this.speedEvidenceReference = ruling.evidenceReference ?? '';
    const available = new Set(this.speedAvailableTieTrials().map(trial => trial.id));
    this.speedTieTrialIds = (ruling.trialIds ?? []).filter(id => available.has(id));
    this.speedTrialOrderExceptionReason = ruling.trialOrderExceptionReason ?? '';
    this.speedTieCorrectionOpen = true;
  }

  /** Display only eligible cutoff candidates; never fabricate or edit recorded times. */
  isSpeedMultiwayTie(proposal: InlineSpeedProposal): boolean {
    return proposal.sourceStage === 'FIRST' && !proposal.ready
      && proposal.warning.includes('Empate múltiplo');
  }

  private speedTieOrdered(): InlineSpeedSkater[] {
    return this.speedStageSkaters('FIRST')
      .filter(s => !s.disqualified && s.seconds != null && s.seconds > 0)
      .sort((a, b) => (a.seconds ?? 0) - (b.seconds ?? 0) || a.playerId - b.playerId);
  }

  speedTieCandidates(): InlineSpeedSkater[] {
    const ordered = this.speedTieOrdered();
    if (ordered.length < 18) return [];
    const cutoff = ordered[15]?.seconds;
    return ordered.filter(s => s.seconds != null && cutoff != null && s.seconds <= cutoff);
  }

  /** Only the skaters actually tied on the qualification boundary may race a recorded trial. */
  speedTrialCandidates(): InlineSpeedSkater[] {
    return this.speedTieCandidates().filter(skater => !this.speedTieGuaranteed(skater));
  }

  openSpeedTrial(): void {
    const candidates = this.speedTrialCandidates();
    if (this.busy || !this.canManage || this.speedDecision('FIRST')
        || candidates.length < 3 || candidates.length > 6) return;
    this.speedTrialPlaces = {};
    this.speedTrialTimes = {};
    this.speedTrialHeldAt = '';
    this.speedTrialReference = '';
    this.speedTrialReason = '';
    this.speedTrialOpen = true;
  }

  async recordSpeedTrial(): Promise<void> {
    if (!this.selected || this.busy || !this.canManage || !this.speedTrialOpen
        || this.speedDecision('FIRST') || this.selected.status === 'COMPLETED') return;
    const candidates = this.speedTrialCandidates();
    if (candidates.length < 3 || candidates.length > 6) return;
    const places = candidates.map(s => Number(this.speedTrialPlaces[s.playerId]));
    const numericTimes = candidates.map(s => this.speedTrialTimes[s.playerId]);
    if (places.some(v => !Number.isInteger(v) || v < 1 || v > candidates.length)
        || new Set(places).size !== places.length
        || numericTimes.some(v => v != null && (!Number.isFinite(v) || v <= 0
             || !Number.isInteger(v * 1000)))) {
      this.showError(t('communities.inlineSpeed.trialInvalidPlaces'));
      return;
    }
    const date = new Date(this.speedTrialHeldAt);
    const reference = this.speedTrialReference.trim();
    const reason = this.speedTrialReason.trim();
    if (!this.speedTrialHeldAt || !Number.isFinite(date.getTime()) || date.getTime() > Date.now()
        || reference.length < 8 || reference.length > 500
        || reason.length < 20 || reason.length > 500) {
      this.showError(t('communities.inlineSpeed.trialRequired'));
      return;
    }
    const request: InlineSpeedTrialRequest = {
      actuallyHeld: true,
      heldAt: date.toISOString(),
      officialReference: reference,
      reason,
      results: candidates.map((skater, index) => ({
        playerId: skater.playerId, place: places[index], seconds: numericTimes[index] ?? null
      }))
    };
    await this.mutate(this.api.recordInlineSpeedTrial(this.community.id, this.selected.id, request),
      t('communities.inlineSpeed.trialSaved'), overview => {
        this.speedOverview = overview;
        this.speedTrialOpen = false;
        this.loadInlineSpeed();
      });
  }

  speedTieGuaranteed(skater: InlineSpeedSkater): boolean {
    const cutoff = this.speedTieOrdered()[15]?.seconds;
    return skater.seconds != null && cutoff != null && skater.seconds < cutoff;
  }

  private speedTieDefaultIds(): number[] {
    return this.speedTieCandidates()
      .filter(s => this.speedTieGuaranteed(s)).map(s => s.playerId);
  }

  async resolveSpeedTie(proposal: InlineSpeedProposal): Promise<void> {
    if (!this.selected || !this.canManage || this.busy
        || !(this.isSpeedMultiwayTie(proposal)
          || (this.speedTieCorrectionOpen && this.speedCanAmendTie(proposal)))) return;
    const chosen = this.speedSelections['FIRST'] ?? [];
    const reason = (this.speedReasons['FIRST'] ?? '').trim();
    if (chosen.length !== 16 || new Set(chosen).size !== 16) {
      this.showError(t('communities.inlineSpeed.tiebreakSelectionCount'));
      return;
    }
    if (reason.length < 20 || reason.length > 500) {
      this.showError(t('communities.inlineSpeed.tiebreakReasonRequired'));
      return;
    }
    const evidenceType = this.speedEvidenceType;
    const evidenceReference = this.speedEvidenceReference.trim();
    if (!evidenceType || evidenceReference.length < 8 || evidenceReference.length > 500) {
      this.showError(t('communities.inlineSpeed.evidenceRequired'));
      return;
    }
    const availableIds = new Set(this.speedAvailableTieTrials().map(trial => trial.id));
    if (this.speedTieTrialIds.length > 10
        || new Set(this.speedTieTrialIds).size !== this.speedTieTrialIds.length
        || this.speedTieTrialIds.some(id => !availableIds.has(id))
        || (evidenceType === 'TIEBREAK_TRIAL' && !this.speedTieTrialIds.length)) {
      this.showError(t('communities.inlineSpeed.trialLinkRequired'));
      return;
    }
    const conflicts = this.speedTrialOrderConflicts();
    const trialExceptionReason = conflicts.length
      ? this.speedTrialOrderExceptionReason.trim() : '';
    if (conflicts.length && (trialExceptionReason.length < 20
        || trialExceptionReason.length > 500)) {
      this.showError(t('communities.inlineSpeed.trialOrderExceptionRequired'));
      return;
    }
    await this.mutate(this.api.resolveInlineSpeedTieBreak(
      this.community.id, this.selected.id, chosen, reason, evidenceType,
      evidenceReference, [...this.speedTieTrialIds], trialExceptionReason),
      t('communities.inlineSpeed.tiebreakSaved'), overview => {
        this.speedOverview = overview;
        this.speedTieCorrectionOpen = false;
        this.loadInlineSpeed();
      });
  }

  speedChosen(stage: string, playerId: number): boolean {
    return (this.speedSelections[stage] ?? []).includes(playerId);
  }

  toggleSpeedChosen(stage: InlineSpeedStage, playerId: number): void {
    // Jury cannot approve an athlete marked DQ unless the original result
    // itself was officially corrected. Never toggle them in this panel.
    if (this.speedStageSkaters(stage).some(s => s.playerId === playerId && s.disqualified))
      return;
    if (stage === 'FIRST' && this.speedOverview?.proposals.some(
      p => this.isSpeedMultiwayTie(p) || this.speedTieCorrectionOpen) && this.speedTieCandidates().some(
      s => s.playerId === playerId && this.speedTieGuaranteed(s))) return;
    const previous = this.speedSelections[stage] ?? [];
    this.speedSelections[stage] = previous.includes(playerId)
      ? previous.filter(id => id !== playerId) : [...previous, playerId];
  }

  speedDecision(stage: string) {
    return this.speedOverview?.decisions.find(decision => decision.sourceStage === stage);
  }

  loadInlineSpeed(): void {
    const tournament = this.selected;
    if (!tournament || !this.isMember || this.detailsLoading) return;
    const communityId = this.community.id, revision = ++this.speedRevision;
    this.detailsLoading = true;
    this.speedError = false;
    this.api.inlineSpeedOverview(communityId, tournament.id).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.speedRevision) {
          this.detailsLoading = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: response => {
        if (revision !== this.speedRevision || this.community.id !== communityId
            || this.selected?.id !== tournament.id) return;
        this.speedOverview = response;
        for (const heat of response.availableHeats)
          this.speedHeats[heat.roundId] ??= 1;
        this.speedSelections = {};
        for (const proposal of response.proposals) {
          this.speedSelections[proposal.sourceStage] =
            [...(response.decisions.find(item => item.sourceStage === proposal.sourceStage)
              ?.playerIds ?? (this.isSpeedMultiwayTie(proposal)
                ? this.speedTieDefaultIds() : proposal.playerIds))];
        }
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision === this.speedRevision && this.selected?.id === tournament.id) {
          this.speedError = true;
          this.showError(t('communities.inlineSpeed.loadError'));
        }
      }
    });
  }

  async linkSpeedHeat(roundId: number): Promise<void> {
    if (!this.selected || !this.canManage || this.busy) return;
    const number = this.speedHeats[roundId] ?? 1;
    if (!Number.isInteger(number) || number < 1 || number > 64) {
      this.showError(t('communities.inlineSpeed.invalidHeat')); return;
    }
    await this.mutate(this.api.linkInlineSpeedHeat(this.community.id, this.selected.id, roundId, number),
      t('communities.inlineSpeed.linked'), overview => {
        this.speedOverview = overview;
        this.updateSelected({ ...this.selected!, status: 'IN_PROGRESS' });
        this.loadInlineSpeed();
      });
  }

  async unlinkSpeedHeat(roundId: number): Promise<void> {
    if (!this.selected || !this.canManage || this.busy) return;
    await this.mutate(this.api.unlinkInlineSpeedHeat(this.community.id, this.selected.id, roundId),
      t('communities.inlineSpeed.unlinked'), overview => {
        this.speedOverview = overview;
        if (!overview.linkedHeats.length)
          this.updateSelected({ ...this.selected!, status: 'DRAFT', startedAt: null });
        this.loadInlineSpeed();
      });
  }

  async confirmSpeedStage(proposal: InlineSpeedProposal): Promise<void> {
    if (!this.selected || !this.canManage || this.busy || !proposal.ready) return;
    const ids = this.speedSelections[proposal.sourceStage] ?? [];
    if (!ids.length || new Set(ids).size !== ids.length) {
      this.showError(t('communities.inlineSpeed.noSelection')); return;
    }
    const reason = this.speedReasons[proposal.sourceStage] ?? '';
    const selectable = this.speedStageSkaters(proposal.sourceStage)
      .filter(s => !s.disqualified).map(s => s.playerId);
    if (ids.some(id => !selectable.includes(id))) {
      this.showError(t('communities.inlineSpeed.dqNotSelectable'));
      return;
    }
    const extraWithoutTie = proposal.sourceStage === 'FIRST'
      && proposal.targetStage === 'QUARTER' && proposal.expectedCount === 16
      && proposal.playerIds.length === 16 && ids.length === 17;
    if (extraWithoutTie && reason.trim().length < 20) {
      this.showError(t('communities.inlineSpeed.exceptionReasonRequired'));
      return;
    }
    await this.mutate(this.api.confirmInlineSpeedQualification(this.community.id, this.selected.id,
      proposal.sourceStage, ids, reason), t('communities.inlineSpeed.confirmed'), overview => {
      this.speedOverview = overview;
      this.loadInlineSpeed();
    });
  }

  /** Completed championships using the validated race-result formats. */
  get kartingPalmares(): CommunityTournament[] {
    return this.tournaments
      .filter(tournament => tournament.scoringMode === 'RACE_POINTS'
        && tournament.status === 'COMPLETED')
      .sort((a, b) => (Date.parse(b.completedAt ?? '') || 0)
        - (Date.parse(a.completedAt ?? '') || 0));
  }

  /** The archived positions decide the medals, not the UI order or points alone. */
  get finalKartingPodium(): TournamentRaceStanding[] {
    if (!this.isRaceCompetition || this.selected?.status !== 'COMPLETED') return [];
    return (this.raceOverview?.standings ?? [])
      .filter(driver => Number.isInteger(driver.position)
        && driver.position >= 1 && driver.position <= 3)
      .sort((a, b) => a.position - b.position || a.playerId - b.playerId);
  }

  get hasKartingCompetitions(): boolean {
    return this.tournaments.some(tournament => tournament.scoringMode === 'RACE_POINTS');
  }

  hasRaceLaps(entries: readonly TournamentRaceEntry[]): boolean {
    return entries.some(entry => Number.isSafeInteger(entry.lapsCompleted)
      && entry.lapsCompleted! >= 0);
  }

  hasRaceBestLap(entries: readonly TournamentRaceEntry[]): boolean {
    return entries.some(entry => typeof entry.bestLapSeconds === 'number'
      && Number.isFinite(entry.bestLapSeconds) && entry.bestLapSeconds > 0);
  }

  orderedKartingRaceEntries(entries: readonly TournamentRaceEntry[]): TournamentRaceEntry[] {
    return orderedKartingRaceEntries(entries);
  }

  formatKartingDuration(seconds: number | null | undefined): string {
    return formatKartingDuration(seconds);
  }

  kartingRaceAward(entry: TournamentRaceEntry): number {
    return kartingRaceAward(entry, this.raceOverview?.pointsByPlace ?? []);
  }

  get isSportFormatSupported(): boolean {
    return this.creationReadiness === 'READY';
  }

  /** Explain the exact missing selection before allowing event-based creation. */
  get creationReadiness(): TournamentEventReadiness {
    return tournamentEventReadiness(
      this.selectedSportCreationModel,
      this.savedSportEventType,
      this.eventDisciplineDraft,
      this.teamFormatDraft
    );
  }

  get creationReadinessLabelKey(): string {
    switch (this.creationReadiness) {
      case 'READY': return 'communities.tournaments.capabilities.partialAvailable';
      case 'EVENT_REQUIRED': return 'communities.tournaments.events.title';
      case 'DISCIPLINE_REQUIRED':
        return this.selectedSportCreationModel === 'ROWING_BEST_TIME'
          ? 'row1x.disciplineTitle'
          : this.selectedSportCreationModel === 'CANOE_BEST_TIME'
          ? 'cno.disciplineTitle'
          : this.selectedSportCreationModel === 'SWIM_BEST_TIME'
          ? 'communities.swimTournament.disciplineTitle'
          : this.selectedSportCreationModel === 'FIELD_BEST_MARK'
            ? 'communities.fieldTournament.disciplineTitle'
            : this.selectedSportCreationModel === 'RELAY_BEST_TIME'
            ? 'communities.relayTournament.disciplineTitle'
            : 'communities.trackTournament.disciplineTitle';
      case 'LEAGUE_REQUIRED': return 'communities.tournaments.formatLeagueTitle';
      default: return 'communities.tournaments.capabilities.pending';
    }
  }

  get sportFormatWarning(): string {
    if (!this.showTeamCreate && this.sportDraft === 'Patinagem de Velocidade')
      return t('communities.inlineSpeed.creationHelp');
    if (this.isRaceChampionshipDraft) {
      if (this.sportDraft === 'BMX') return t('communities.race.bmxRacingOnly');
      if (this.sportDraft === 'Ciclismo de Estrada') return t('communities.roadCycling.championshipNotice');
      if (this.sportDraft === 'Ciclismo de Pista') return t('communities.trackCycling.championshipNotice');
      if (this.sportDraft === 'Ciclismo' || this.sportDraft === 'Mountain Bike'
          || this.sportDraft === 'Ciclocrosse') {
        return t('communities.race.communityScoring');
      }
      return t('communities.karting.creationHint');
    }
    const model = this.selectedSportCreationModel;
    // A supported measured/timed tournament must not display legacy guidance
    // claiming it is an incompatible numeric 1-v-1 league.
    if (model === 'FIELD_BEST_MARK') return t('communities.fieldTournament.disciplineHelp');
    if (model === 'TRACK_BEST_TIME') return t('communities.trackTournament.disciplineHelp');
    if (model === 'SWIM_BEST_TIME') return t('communities.swimTournament.disciplineHelp');
    if (model === 'CANOE_BEST_TIME') return t('cno.disciplineHelp');
    if (model === 'ROWING_BEST_TIME') return t('row1x.disciplineHelp');
    if (model === 'RELAY_BEST_TIME') return t('communities.tournaments.capabilities.model.RELAY_BEST_TIME');
    return this.showTeamCreate && this.classificationProfile.scoringMode === 'CHESS_HALF_POINTS'
      ? t('communities.tournaments.organizerUi.teamChessUnavailable')
      : this.classificationProfile.detail;
  }

  get isChessTournament(): boolean {
    return this.selected?.scoringMode === 'CHESS_HALF_POINTS';
  }

  formatTournamentPoints(points: number | null | undefined): string {
    if (points == null) return '—';
    return this.isChessTournament ? (points / 2).toLocaleString('pt-PT') : String(points);
  }

  chessOutcome(match: TournamentMatch): string {
    const score = this.scoreDraft(match);
    if (score.home === 1 && score.away === 0) return 'WHITE';
    if (score.home === 0 && score.away === 0) return 'DRAW';
    if (score.home === 0 && score.away === 1) return 'BLACK';
    return '';
  }

  displayTournamentResult(match: TournamentMatch): string {
    if (this.isChessTournament) {
      if (match.homeScore === 1 && match.awayScore === 0) return '1 – 0';
      if (match.homeScore === 0 && match.awayScore === 0) return '½ – ½';
      if (match.homeScore === 0 && match.awayScore === 1) return '0 – 1';
      return '—';
    }
    return match.homeScore + ' : ' + match.awayScore;
  }

  setChessOutcome(match: TournamentMatch, outcome: string): void {
    const mapped = outcome === 'WHITE' ? { home: 1, away: 0 }
      : outcome === 'DRAW' ? { home: 0, away: 0 }
      : outcome === 'BLACK' ? { home: 0, away: 1 }
      : { home: null, away: null };
    this.scoreDrafts[match.id] = mapped;
    this.scoreTouched.add(match.id);
  }

  validTournamentScore(match: TournamentMatch): boolean {
    const score = this.scoreDraft(match);
    if (!this.validScore(score.home) || !this.validScore(score.away)) return false;
    return !this.isChessTournament
      || ((score.home === 1 && score.away === 0)
          || (score.home === 0 && score.away === 0)
          || (score.home === 0 && score.away === 1));
  }

  get pointRulesDraft(): TournamentPointRules {
    return {
      winPoints: this.winPointsDraft,
      drawPoints: this.drawPointsDraft,
      lossPoints: this.lossPointsDraft
    };
  }

  get validPointRules(): boolean {
    return Object.values(this.pointRulesDraft)
      .every(value => Number.isInteger(value) && value >= 0 && value <= 100)
      && (!this.classificationProfile.readOnlyPoints
        || this.classificationProfile.scoringMode !== 'CHESS_HALF_POINTS'
        || (this.winPointsDraft === 2 && this.drawPointsDraft === 1 && this.lossPointsDraft === 0));
  }

  private resetPointRules(): void {
    const points = tournamentClassificationProfile(this.sportDraft).pointRules;
    this.winPointsDraft = points.winPoints;
    this.drawPointsDraft = points.drawPoints;
    this.lossPointsDraft = points.lossPoints;
  }

  get nameTooShort(): boolean {
    const len = this.nameDraft.trim().length;
    return len > 0 && len < 2;
  }

  isScoreInvalid(match: TournamentMatch): boolean {
    const score = this.scoreDraft(match);
    return this.scoreTouched.has(match.id)
      && !this.validTournamentScore(match);
  }

  private showError(message: string): void {
    this.error = message;
    this.focusErrorAfterRender = true;
    this.changeDetector.markForCheck();
  }

  private refreshRosterAndFocus(): void {
    this.focusPlayersAfterReload = true;
    this.loadDetails();
  }

  private listRevision = 0;
  private detailRevision = 0;
  private mutationRevision = 0;
  private standingsRevision = 0;

  constructor(
    private readonly api: CommunityTournamentsService,
    private readonly championshipsApi: CommunityChampionshipsService,
    private readonly authentication: AuthenticationService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['community'] && this.community?.id) {
      ++this.championshipRevision;
      this.championships = [];
      this.championshipAggregateStandings = {};
      this.championshipHonours = null;
      this.permanentTeamRegistry = null;
      this.selectedPermanentTeamId = null;
      this.rankingChartSport = '';
      this.permanentTeamNameDraft = '';
      this.championshipHonoursSportFilter = '';
      this.championshipHonoursError = '';
      this.championshipTeamRegistries = {};
      this.championshipTeamDrafts = {};
      this.championshipCloseConfirmed = {};
      this.showActiveChampionships();
      this.championshipError = '';
      this.championshipOpen = false;
      this.competitionView = 'championships';
      this.creationPickerOpen = false;
      this.championshipExplainerOpen = false;
      this.championshipBusy = false;
      this.championshipSportDraft = this.community.sports?.[0] || this.community.sport || '';
      this.loadChampionships();
      ++this.listRevision;
      ++this.detailRevision;
      ++this.mutationRevision;
      ++this.standingsRevision;
      ++this.raceRevision;
      this.raceOverview = undefined;
      this.raceError = false;
      ++this.timedRevision;
      this.timedOverview = undefined;
      this.timedError = false;
      ++this.teamMatchesRevision;
      ++this.teamStandingsRevision;
      ++this.teamGroupsRevision;
      this.busy = false;
      this.showGuide = false;
      this.showIndividualCreate = false;
      this.showTeamCreate = false;
      this.roundRobinLegsDraft = 1;
      this.teamFormatDraft = 'LEAGUE';
      this.teamGroupCountDraft = 2;
      this.teamTieBreakPriorityDraft = 'GOAL_DIFFERENCE_FIRST';
      this.resetPointRules();
      this.teamNameDraft = '';
      this.teamPlayerDraft = {};
      this.teamMemberSearch = {};
      this.teamRosterSearch = {};
      this.inviteCopyFeedback = {};
      this.teams = [];
      this.teamDirectoryQuery = '';
      this.teamDirectoryLimit = this.teamDirectoryPageSize;
      this.teamsLoadError = false;
      this.teamMatches = [];
      this.focusedPublishedFixtureId = null;
      this.directFixtureExtraPages = 0;
      this.resetTeamProfileMatches();
      this.teamMatchFilter = 'ALL';
      this.teamPhaseFilter = 'ALL';
      this.knockoutFocusTeamId = null;
      this.knockoutMatchQuery = '';
      this.knockoutStatusFilter = 'ALL';
      this.knockoutSearchFixtureId = null;
      this.selectedKnockoutRound = null;
      this.requestedTeamGroupNumber = null;
      this.expandedKnockoutRounds.clear();
      this.knockoutRoundLimits.clear();
      this.teamMatchesHasMore = false;
      this.teamMatchesLoading = false;
      this.teamMatchesError = false;
      this.teamStandings = undefined;
      this.teamGroups = undefined;
      this.teamGroupsLoading = false;
      this.teamGroupsError = false;
      this.teamStandingsLoading = false;
      this.teamStandingsError = false;
      this.teamScoreDrafts = {};
      this.teamScoreTouched.clear();
      this.editingTeamResultId = null;
      this.confirmingTeamPlayerRemoval = null;
      this.confirmingEmptyTeamId = null;
      // A sole community sport is convenient; multi-sport requires an explicit choice.
      const sports = this.community.sports;
      this.sportDraft = sports?.length === 1
        ? sports[0] : (!sports?.length ? this.community.sport || '' : '');
      this.eventTypeDraft = null;
      this.eventDisciplineDraft = null;
      this.sportSearch = '';
      this.editingSport = false;
      this.expandedCommunitySports = false;
      this.resetPointRules();
      this.selected = undefined;
      this.loading = false;
      this.detailsLoading = false;
      this.tournaments = [];
      this.participants = [];
      this.rosterReady = false;
      this.matches = [];
      this.standings = undefined;
      this.error = '';
      this.feedback = '';
      this.confirmAction = null;
      this.focusErrorAfterRender = false;
      this.focusPlayersAfterReload = false;
      this.scoreTouched.clear();
      this.loadTournaments(true);
    }
    if (changes['teamPageId'] && !changes['community']) {
      // A confirmation belongs to the team page where it was opened.
      // Navigating between teams must never leave a pending destructive action.
      this.cancelTeamRosterConfirmation();
      this.resetTeamProfileMatches();
      if (this.focusedTeam && this.selected?.status !== 'DRAFT' && !this.isRelayCompetition)
        this.loadTeamProfileMatches();
    }
    if ((changes['requestedFixtureId'] || changes['teamPageId']) && !changes['community']) {
      this.focusedPublishedFixtureId = null;
      this.directFixtureExtraPages = 0;
      this.revealRequestedTeamFixture();
    }
  }

  get canManage(): boolean {
    return this.community?.myRole === 'OWNER' || this.community?.myRole === 'ADMIN';
  }

  get isMember(): boolean {
    return this.community?.myRole === 'OWNER'
      || this.community?.myRole === 'ADMIN'
      || this.community?.myRole === 'MEMBER';
  }

  get myUsername(): string {
    if (!this.authentication.loggedInPerfilname) {
      this.authentication.isLoggedIn();
    }
    return (this.authentication.loggedInPerfilname || '').toLowerCase();
  }

  /** Only build a profile link when its username is a usable route segment. */
  teamPlayerProfileUsername(username: string | null | undefined): string | null {
    const value = username?.trim();
    return value || null;
  }

  /** Return the exact, cleaned recipient used by the direct-message route.
   * A blank username or our own account must not produce a chat link. */
  teamPlayerMessageRecipient(username: string | null | undefined): string | null {
    const recipient = this.teamPlayerProfileUsername(username);
    return recipient && this.myUsername && recipient.toLowerCase() !== this.myUsername
      ? recipient : null;
  }

  canMessageTeamPlayer(username: string | null | undefined): boolean {
    return this.teamPlayerMessageRecipient(username) !== null;
  }

  get myEnrollment(): TournamentParticipant | undefined {
    return this.participants.find(p => p.username.toLowerCase() === this.myUsername);
  }

  /** Translate visible labels only; stored tournament results remain unchanged. */
  private localizedScoreTerminology(sport: string | null | undefined) {
    const terminology = tournamentScoreTerminology(sport);
    const kind = terminology.forAbbrev === 'GM' ? 'goals'
      : terminology.forAbbrev === 'PM' ? 'points'
      : terminology.forAbbrev === 'SG' ? 'sets'
      : terminology.forAbbrev === 'CM' ? 'runs' : 'generic';
    const translated = (field: string) =>
      t('communities.tournaments.individualUi.scoring.' + kind + '.' + field);
    return {
      ...terminology,
      scoreInput: translated('scoreInput'),
      forTitle: translated('forTitle'),
      againstTitle: translated('againstTitle'),
      differenceTitle: translated('differenceTitle'),
      forAbbrev: translated('forAbbrev'),
      againstAbbrev: translated('againstAbbrev'),
      differenceAbbrev: translated('differenceAbbrev'),
      note: translated('note')
    };
  }

  get scoring() {
    return this.localizedScoreTerminology(
      this.selected?.entryType === 'TEAM' ? null : this.selected?.sport
    );
  }

  /** Display-only terminology; never infer a sport's official scoring rules. */
  private get teamScoreFamily(): 'goals' | 'points' | 'sets' | 'runs' | 'generic' {
    const labels = tournamentScoreTerminology(this.selected?.sport);
    return labels.forAbbrev === 'GM' ? 'goals'
      : labels.forAbbrev === 'PM' ? 'points'
      : labels.forAbbrev === 'SG' ? 'sets'
      : labels.forAbbrev === 'CM' ? 'runs' : 'generic';
  }

  get teamScoreHeadings(): { for: string; against: string; difference: string } {
    const key = 'communities.tournaments.teamScore.' + this.teamScoreFamily + '.';
    return {
      for: t(key + 'for'),
      against: t(key + 'against'),
      difference: t(key + 'difference')
    };
  }

  /** Accessible score editor label for the selected tournament's sport. */
  teamScoreInputLabel(teamName: string): string {
    return t('communities.tournaments.teamScore.' + this.teamScoreFamily + '.input', {
      team: teamName
    });
  }

  get isTeamCompetition(): boolean {
    return this.selected?.entryType === 'TEAM';
  }

  get availableTeamMembers() {
    const assigned = new Set(this.teams.flatMap(team => team.players.map(player => player.profileId)));
    return (this.community.members || []).filter(member => !assigned.has(member.profileId));
  }

  // Search stays scoped to one team and excludes already assigned profiles.
  // Keep the native select manageable in large communities. A member outside
  // the first 30 is still searchable and selectable by name or username.
  readonly teamMemberSuggestionLimit = 30;
  filteredTeamMembers(teamId: number) {
    const normalize = (value: string | null | undefined) => (value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
    const query = normalize(this.teamMemberSearch[teamId] || '');
    const eligible = this.availableTeamMembers;
    if (!query) return eligible.slice(0, this.teamMemberSuggestionLimit);
    const rank = (name: string | null | undefined, username: string | null | undefined) => {
      const labels = [normalize(name), normalize(username)].filter(Boolean);
      return labels.some(value => value === query) ? 0
        : labels.some(value => value.startsWith(query)) ? 1 : 2;
    };
    return eligible.filter(member =>
      normalize(member.fullName).includes(query) || normalize(member.username).includes(query))
      .sort((a, b) =>
        rank(a.fullName, a.username) - rank(b.fullName, b.username)
        || normalize(a.fullName || a.username).localeCompare(
          normalize(b.fullName || b.username), 'pt')
        || a.profileId - b.profileId)
      .slice(0, this.teamMemberSuggestionLimit);
  }

  /** Keep an active member filter editable even if fewer candidates remain. */
  showTeamMemberSearch(teamId: number): boolean {
    return this.availableTeamMembers.length > 6 || !!this.teamMemberSearch[teamId]?.trim();
  }

  /** Keep the search input visible until an active filter is cleared, even if
   * a roster shrinks below the threshold while the organizer is searching. */
  showTeamRosterSearch(team: TournamentTeam): boolean {
    return team.players.length > 8 || !!this.teamRosterSearch[team.id]?.trim();
  }

  /** Roster search affects only the focused team page. Sorting a copy makes
   * large rosters easier to scan without changing API order or player IDs. */
  filteredTeamRoster(team: TournamentTeam): TournamentTeam['players'] {
    const query = (this.teamRosterSearch[team.id] || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
    const matches = (value: string | null | undefined) => (value || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().includes(query);
    const compare = (a: string | null | undefined, b: string | null | undefined) =>
      (a || '').localeCompare(b || '', 'pt', { sensitivity: 'base' });
    return team.players
      .filter(player => !query || matches(player.displayName) || matches(player.username))
      .slice().sort((a, b) =>
        compare(a.displayName || a.username, b.displayName || b.username)
        || compare(a.username, b.username)
        || a.profileId - b.profileId);
  }

  setTeamRosterSearch(teamId: number, value: string): void {
    this.teamRosterSearch[teamId] = value;
    // Do not leave a removal confirmation attached to a hidden player.
    if (this.confirmingTeamPlayerRemoval?.teamId === teamId) {
      const team = this.teams.find(item => item.id === teamId);
      if (!team || !this.filteredTeamRoster(team).some(player =>
        player.profileId === this.confirmingTeamPlayerRemoval?.profileId)) {
        this.confirmingTeamPlayerRemoval = null;
      }
    }
  }

  setTeamMemberSearch(teamId: number, value: string): void {
    this.teamMemberSearch[teamId] = value;
    // Never submit a selection hidden by the updated search.
    this.teamPlayerDraft[teamId] = null;
  }

  /**
   * Search the current tournament's team names and roster identities. A friend
   * can be found without displaying every roster in the crowded team grid.
   * Results remain team cards; never include players from another tournament.
   */
  get filteredTournamentTeams(): TournamentTeam[] {
    return this.searchRankedTeams(this.teamDirectoryQuery);
  }

  get visibleTournamentTeams(): TournamentTeam[] {
    return this.filteredTournamentTeams.slice(0, this.teamDirectoryLimit);
  }

  get hasMoreTournamentTeams(): boolean {
    return this.filteredTournamentTeams.length > this.teamDirectoryLimit;
  }

  setTeamDirectoryQuery(query: string): void {
    this.teamDirectoryQuery = query;
    this.teamDirectoryLimit = this.teamDirectoryPageSize;
  }

  expandTeamDirectory(): void {
    this.teamDirectoryLimit += this.teamDirectoryPageSize;
  }

  get teamProfileNavigation(): {index:number; total:number; previous?:TournamentTeam; next?:TournamentTeam} {
    const index = this.teams.findIndex(team => team.id === this.teamPageId);
    return index < 0 ? {index:0,total:this.teams.length}
      : {index:index + 1,total:this.teams.length,
          previous:this.teams[index - 1],next:this.teams[index + 1]};
  }

  /** A shortcut only belongs to a valid focused team in this tournament.
   * Bound the quick-switch DOM for large competitions; searching still
   * considers all loaded team names without modifying the official teams. */
  private searchRankedTeams(search: string): TournamentTeam[] {
    const normalize = (value: string | null | undefined): string => (value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
    const query = normalize(search).replace(/\s+/g, ' ');
    if (!query) return this.teams;
    const terms = query.split(' ');
    const ranked = this.teams.map((team, index) => {
      const labels = [
        normalize(team.name),
        ...(team.players ?? []).flatMap(player => [
          normalize(player.displayName), normalize(player.username)
        ])
      ].filter(Boolean);
      const relevance = labels.some(value => value === query) ? 0
        : labels.some(value => value.startsWith(query)) ? 1
        : labels.some(value => value.includes(query)) ? 2
        : labels.some(value => {
            const words = value.split(/[\s._-]+/).filter(Boolean);
            return terms.every(term => words.some(word => word.startsWith(term)));
          }) ? 3 : 4;
      return { team, index, relevance };
    });
    return ranked.filter(item => item.relevance < 4)
      .sort((a, b) => a.relevance - b.relevance || a.index - b.index)
      .map(item => item.team);
  }

  private get matchingQuickSwitchTeams(): TournamentTeam[] {
    return this.searchRankedTeams(this.teamQuickSwitchQuery);
  }

  get teamQuickSwitchTeams(): TournamentTeam[] {
    const focused = this.focusedTeam;
    if (!focused || this.teams.length <= 4) return [];
    const query = this.teamQuickSwitchQuery.trim();
    const matching = this.matchingQuickSwitchTeams;
    const visible = matching.slice(0, this.teamQuickSwitchLimit);
    // With large rosters, keep the current team discoverable even when it
    // falls beyond the first page. Never add an unrelated search result.
    if (!query && !visible.some(team => team.id === focused.id)) {
      visible[visible.length - 1] = focused;
    }
    return visible;
  }

  setTeamQuickSwitchQuery(query: string): void {
    this.teamQuickSwitchQuery = query;
    this.teamQuickSwitchLimit = this.teamQuickSwitchPreviewSize;
  }

  expandTeamQuickSwitch(): void {
    if (this.focusedTeam && this.teamQuickSwitchTotalMatches > this.teamQuickSwitchLimit) {
      this.teamQuickSwitchLimit += this.teamQuickSwitchPreviewSize;
    }
  }

  /** Explain which roster identity made a team appear in quick search. */
  teamQuickSwitchMatchedPlayer(team: TournamentTeam): string | undefined {
    const normalize = (value: string | null | undefined): string => (value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
    const query = normalize(this.teamQuickSwitchQuery).replace(/\s+/g, ' ');
    if (!query) return undefined;
    const matches = (value: string | null | undefined): boolean => {
      const label = normalize(value);
      return label.includes(query) || query.split(' ').every(term =>
        label.split(/[\s._-]+/).some(word => word.startsWith(term)));
    };
    if (matches(team.name)) return undefined;
    const player = (team.players ?? []).find(item =>
      matches(item.displayName) || matches(item.username));
    return player ? (player.displayName || player.username || undefined) : undefined;
  }

  get teamQuickSwitchTotalMatches(): number {
    return !this.focusedTeam || this.teams.length <= 4
      ? 0 : this.matchingQuickSwitchTeams.length;
  }

  get focusedTeam(): TournamentTeam | undefined {
    return this.isTeamCompetition && this.teamPageId !== null
      ? this.teams.find(team => team.id === this.teamPageId) : undefined;
  }

  /** Never derive another team's form or classification from the tournament-wide UI. */
  /** Live positions only: trust the standings API and never infer medals or qualification. */
  get teamLeagueHighlights(): TournamentTeamStandingRow[] {
    if (!this.isTeamCompetition || this.isRelayCompetition
      || this.selected?.format !== 'LEAGUE' || this.teamStandingsError
      || !this.teamStandings || this.teamStandings.tournamentId !== this.selected.id) return [];
    return this.teamStandings.standings
      .filter(row => row.played > 0 && Number.isSafeInteger(row.position)
        && row.position > 0 && Number.isSafeInteger(row.teamId) && row.teamId > 0)
      .slice().sort((a,b) => a.position - b.position || a.teamId - b.teamId).slice(0,3);
  }

  /** A separate current-team card is only needed when absent from the top 3. */
  get myLeagueHighlightOutsideTop(): TournamentTeamStandingRow | undefined {
    const teamId = this.myTeam?.id;
    if (!teamId || !this.teamStandings || !this.isTeamCompetition
      || this.isRelayCompetition || this.selected?.format !== 'LEAGUE'
      || this.teamStandingsError || this.teamStandings.tournamentId !== this.selected.id
      || this.teamLeagueHighlights.some(row => row.teamId === teamId)) return undefined;
    return this.teamStandings.standings.find(row => row.teamId === teamId
      && row.played > 0 && Number.isSafeInteger(row.position) && row.position > 0);
  }

  /** Each group keeps its independent backend-defined ranking (never a global top 2). */
  get teamGroupHighlights(): { groupNumber: number; rows: TournamentTeamStandingRow[] }[] {
    if (!this.isGroupKnockout || this.isRelayCompetition || this.teamGroupsError
      || !this.teamGroups || this.teamGroups.tournamentId !== this.selected?.id) return [];
    return this.teamGroups.groups.map(group => ({
      groupNumber: group.groupNumber,
      rows: group.standings
        .filter(row => row.played > 0 && Number.isSafeInteger(row.position)
          && row.position > 0 && Number.isSafeInteger(row.teamId) && row.teamId > 0)
        .slice().sort((a,b) => a.position - b.position || a.teamId - b.teamId).slice(0,2)
    })).filter(group => group.rows.length > 0);
  }

  /** Group snapshot from published, currently loaded fixtures only.
   * Never describe an incomplete paginated response as the full schedule. */
  publishedGroupFixtureOverview(groupNumber: number): {
    total: number; completed: number;
    results: TournamentTeamMatch[]; pending: TournamentTeamMatch[];
  } {
    const empty = { total: 0, completed: 0,
      results: [] as TournamentTeamMatch[], pending: [] as TournamentTeamMatch[] };
    if (!this.isGroupKnockout || this.isRelayCompetition
        || !Number.isSafeInteger(groupNumber) || groupNumber < 1
        || !this.teamGroups || this.teamGroupsError
        || this.teamGroups.tournamentId !== this.selected?.id
        || !this.teamGroups.groups.some(group => group.groupNumber === groupNumber))
      return empty;
    const games = this.teamMatches.filter(game => game.groupNumber === groupNumber);
    const results = games.filter(game => game.status === 'COMPLETED')
      .sort((a,b) => b.roundNumber-a.roundNumber || b.id-a.id).slice(0,3);
    const pending = games.filter(game => game.status !== 'COMPLETED')
      .sort((a,b) => a.roundNumber-b.roundNumber || a.id-b.id).slice(0,3);
    return { total: games.length,
      completed: games.filter(game => game.status === 'COMPLETED').length,
      results, pending };
  }

  /** Navigate back to one actual loaded group fixture without changing the tournament. */
  showPublishedGroupFixture(groupNumber: number, fixture: TournamentTeamMatch): void {
    if (!this.isGroupKnockout || this.isRelayCompetition
        || !Number.isSafeInteger(groupNumber) || groupNumber < 1
        || !Number.isSafeInteger(fixture.id) || fixture.id <= 0
        || fixture.groupNumber !== groupNumber || !this.teamMatches.some(game =>
          game.id === fixture.id && game.groupNumber === groupNumber)) return;
    this.teamPhaseFilter = `group-${groupNumber}`;
    this.teamMatchFilter = 'ALL';
    this.editingTeamResultId = null;
    this.changeDetector.detectChanges();
    const match = this.teamFixturesList?.nativeElement.querySelector<HTMLElement>(
      `[data-team-fixture-id="${fixture.id}"]`);
    match?.scrollIntoView({behavior:'smooth',block:'center'});
    match?.focus({preventScroll:true});
  }

  /** Link only a backend-qualified team to its unique published first-round fixture. */
  publishedGroupKnockoutFixture(groupNumber: number, teamId: number): TournamentTeamMatch | null {
    const groups = this.teamGroups;
    if (!this.isGroupKnockout || this.isRelayCompetition || this.teamGroupsError
        || !groups?.knockoutStarted || groups.tournamentId !== this.selected?.id
        || !Number.isSafeInteger(teamId) || teamId <= 0) return null;
    const containing = groups.groups.filter(group =>
      group.standings.some(row => row.teamId === teamId));
    if (containing.length !== 1 || containing[0].groupNumber !== groupNumber) return null;
    const row = containing[0].standings.find(entry => entry.teamId === teamId);
    if (!row || !Number.isSafeInteger(row.position) || row.position < 1
        || row.position > 2) return null;
    const fixtures = this.teamMatches.filter(game =>
      this.isEliminationMatch(game) && game.roundNumber === 1
      && (game.homeTeamId === teamId || game.awayTeamId === teamId));
    return fixtures.length === 1 ? fixtures[0] : null;
  }

  /** Reverse link from an actual first knockout fixture to an official group.
   * A team must have one backend group, a qualifying position and one
   * published first-round fixture; no speculative paths are displayed. */
  publishedKnockoutSourceGroup(fixture: TournamentTeamMatch, teamId: number): number | null {
    const groups = this.teamGroups;
    if (!this.isGroupKnockout || this.isRelayCompetition || !groups?.knockoutStarted
        || this.teamGroupsError || groups.tournamentId !== this.selected?.id
        || !Number.isSafeInteger(fixture.id) || fixture.id <= 0
        || fixture.roundNumber !== 1 || fixture.groupNumber != null
        || (fixture.homeTeamId !== teamId && fixture.awayTeamId !== teamId)) return null;
    const matches = groups.groups.filter(group =>
      group.standings.some(row => row.teamId === teamId));
    if (matches.length !== 1) return null;
    const groupNumber = matches[0].groupNumber;
    return this.publishedGroupKnockoutFixture(groupNumber, teamId)?.id === fixture.id
      ? groupNumber : null;
  }

  showGroupTeamKnockout(groupNumber: number, teamId: number): void {
    const fixture = this.publishedGroupKnockoutFixture(groupNumber, teamId);
    if (!fixture) return;
    this.setKnockoutFocusTeam(teamId);
    this.focusPublishedKnockoutInBoard(fixture);
  }

  /** Official group-only context for the dedicated team page. Do not infer rankings
   * from fixtures or connect an uncertain first knockout match. */
  get focusedTeamGroupOverview(): {
    groupNumber: number; rows: TournamentTeamStandingRow[];
    qualified: boolean; firstFixture: TournamentTeamMatch | null;
  } | null {
    const team = this.focusedTeam, groups = this.teamGroups;
    if (!team || !this.isGroupKnockout || this.isRelayCompetition
        || this.teamGroupsError || !groups
        || groups.tournamentId !== this.selected?.id) return null;
    const matchingGroups = groups.groups.filter(group =>
      group.standings.some(row => row.teamId === team.id));
    if (matchingGroups.length !== 1) return null;
    const group = matchingGroups[0];
    if (!Number.isSafeInteger(group.groupNumber) || group.groupNumber < 1
        || group.standings.filter(row => row.teamId === team.id).length !== 1)
      return null;
    const rows = group.standings.filter(row =>
      Number.isSafeInteger(row.teamId) && row.teamId > 0
      && Number.isSafeInteger(row.position) && row.position > 0)
      .slice().sort((a,b) => a.position-b.position || a.teamId-b.teamId);
    const own = rows.find(row => row.teamId === team.id);
    if (!own) return null;
    const qualified = groups.knockoutStarted && own.position <= 2;
    // The team's own paginated fixtures are authoritative for this page.
    // Missing or duplicate first-round records never create a shortcut.
    const firstMatches = qualified ? this.teamProfileMatches.filter(game =>
      game.groupNumber == null && game.roundNumber === 1
      && (game.homeTeamId === team.id || game.awayTeamId === team.id)) : [];
    return {groupNumber:group.groupNumber, rows, qualified,
      firstFixture:firstMatches.length === 1 ? firstMatches[0] : null};
  }

  get focusedTeamStanding() {
    const team = this.focusedTeam;
    if (!team || this.isRelayCompetition) return undefined;
    if (this.selected?.format === 'GROUP_KNOCKOUT') {
      return this.focusedTeamGroupOverview?.rows.find(row => row.teamId === team.id);
    }
    return this.selected?.format === 'LEAGUE'
      ? this.teamStandings?.standings.find(row => row.teamId === team.id) : undefined;
  }

  get focusedTeamRelayStanding() {
    const team = this.focusedTeam;
    return team && this.isRelayCompetition
      ? this.relayOverview?.standings.find(row => row.teamId === team.id) : undefined;
  }

  get focusedTeamRelayHeats(): RelayHeat[] {
    const team = this.focusedTeam;
    return team && this.isRelayCompetition
      ? (this.relayOverview?.heats ?? []).filter(heat => heat.teamId === team.id) : [];
  }

  get invitedTeam(): TournamentTeam | undefined {
    if (!this.isTeamCompetition || !this.isMember || this.teamsLoadError
        || this.detailsLoading || !this.invitedTeamId
        || this.selected?.id !== this.invitedTournamentId) return undefined;
    return this.teams.find(team => team.id === this.invitedTeamId);
  }

  get myTeam(): TournamentTeam | undefined {
    return this.teams.find(team => team.players.some(player =>
      !!this.myUsername && player.username?.trim().toLowerCase() === this.myUsername));
  }

  /** Invite links follow the same roster and draft-only checks as copy actions. */
  teamInviteUrl(team: TournamentTeam): string {
    const current = this.currentRosterTeam(team);
    if (!this.canManageTeamRoster || !current || this.isTeamRosterFull(current)) return '';
    return buildTournamentTeamInviteUrl(
      window.location.origin, this.community.id, this.selected!.id, current.id);
  }

  teamWhatsAppUrl(team: TournamentTeam): string {
    // Invitation copy must reflect the loaded roster, not a stale team card.
    const current = this.teams.find(item => item.id === team.id);
    if (!current) return '';
    const inviteUrl = this.teamInviteUrl(current);
    if (!inviteUrl || !this.selected) return '';
    return teamInvitationWhatsAppUrl(
      this.community.name, this.selected.name, current.name, inviteUrl);
  }

  async copyTeamInvite(team: TournamentTeam): Promise<void> {
    const current = this.currentRosterTeam(team);
    if (!this.canManageTeamRoster || !current || this.isTeamRosterFull(current)) return;
    const communityId = this.community.id;
    const tournamentId = this.selected?.id;
    // A roster reload invalidates feedback from any pending clipboard write.
    const rosterRevision = this.detailRevision;
    const inviteUrl = this.teamInviteUrl(team);
    if (!inviteUrl) return;
    let success = false;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      success = true;
    } catch {
      // Failure is displayed only if this same team is still open.
    }
    const latest = this.currentRosterTeam(team);
    if (this.community.id !== communityId || this.selected?.id !== tournamentId
        || this.detailRevision !== rosterRevision
        || !this.canManageTeamRoster || !latest || this.isTeamRosterFull(latest)) return;
    this.inviteCopyFeedback[team.id] = t(success
      ? 'communities.tournaments.teamUi.copySuccess'
      : 'communities.tournaments.teamUi.copyError');
    this.changeDetector.markForCheck();
  }

  async acceptInvitedTeam(): Promise<void> {
    const team = this.invitedTeam;
    if (!team || !this.selected || !this.isTeamCompetition || !this.isMember
        || this.busy || this.detailsLoading || this.teamsLoadError
        || this.selected.status !== 'DRAFT' || this.myTeam
        || this.isTeamRosterFull(team)) return;
    await this.mutate(
      this.api.acceptTeamInvite(this.community.id, this.selected.id, team.id),
      t('communities.tournaments.teamUi.acceptSuccess', {team: team.name}),
      () => this.loadTeams()
    );
  }

  get isKnockout(): boolean {
    return this.isTeamCompetition && this.selected?.format === 'KNOCKOUT';
  }

  get isGroupKnockout(): boolean {
    return this.isTeamCompetition && this.selected?.format === 'GROUP_KNOCKOUT';
  }

  get isCupFormat(): boolean {
    return this.isKnockout || this.isGroupKnockout;
  }

  /** Only existing sections are navigable; there is no fictitious bracket in draft or relay mode. */
  get teamOverviewSections(): ('teams' | 'fixtures' | 'bracket' | 'standings')[] {
    if (!this.isTeamCompetition || !this.selected || !this.isMember
      || this.detailsLoading || this.teamPageId !== null) return [];
    const sections: ('teams' | 'fixtures' | 'bracket' | 'standings')[] = ['teams'];
    if (this.selected.status !== 'DRAFT' && !this.isRelayCompetition) {
      sections.push('fixtures');
      if (this.isCupFormat && this.teamMatches.some(game => this.isEliminationMatch(game)))
        sections.push('bracket');
      if (this.selected.format === 'LEAGUE' || this.isGroupKnockout)
        sections.push('standings');
    }
    return sections;
  }

  /** Show one backend-defined group at a time; no teams or positions are recalculated. */
  get selectedTeamGroupNumber(): number | null {
    if (!this.isGroupKnockout || this.isRelayCompetition || !this.isMember
        || !this.teamGroups || this.teamGroupsError
        || this.teamGroups.tournamentId !== this.selected?.id) return null;
    const groups = this.teamGroups.groups;
    return groups.some(group => group.groupNumber === this.requestedTeamGroupNumber)
      ? this.requestedTeamGroupNumber : groups[0]?.groupNumber ?? null;
  }

  showTeamStandingsGroup(groupNumber: number): void {
    if (!Number.isSafeInteger(groupNumber) || groupNumber < 1 || this.selected?.status === 'DRAFT'
        || !this.teamGroups?.groups.some(group => group.groupNumber === groupNumber)
        || this.selectedTeamGroupNumber === null) return;
    this.requestedTeamGroupNumber = groupNumber;
    this.changeDetector.detectChanges();
    const details = this.teamTournamentStandings?.nativeElement
      .querySelector<HTMLDetailsElement>(`[data-team-group-number="${groupNumber}"]`);
    if (details) {
      details.open = true;
      details.scrollIntoView({behavior:'smooth',block:'start'});
      details.querySelector<HTMLElement>('summary')?.focus({preventScroll:true});
    }
  }

  /** Scroll and keyboard focus stay within the selected tournament and actual DOM. */
  showTeamOverviewSection(section: 'teams' | 'fixtures' | 'bracket' | 'standings'): void {
    if (!this.teamOverviewSections.includes(section)) return;
    const element = {
      teams: this.teamTournamentTeams,
      fixtures: this.teamTournamentFixtures,
      bracket: this.teamTournamentBracket,
      standings: this.teamTournamentStandings
    }[section]?.nativeElement;
    if (!element) return;
    if (section === 'bracket' && element instanceof HTMLDetailsElement)
      element.open = true;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    element.focus({ preventScroll: true });
  }

  /**
   * Only backend-published fixtures contribute to the phase view.
   * In group cups each group is one overview card; elimination fixtures are
   * organised by actual knockout round. No future bracket is invented.
   */
  get teamPhases(): { key: string; label: string; loaded: number; completed: number }[] {
    const stages = new Map<string, { key: string; label: string; loaded: number; completed: number; order: number }>();
    for (const game of this.teamMatches) {
      const isGroup = this.isGroupKnockout && game.groupNumber != null;
      const key = isGroup ? `group-${game.groupNumber}` : `round-${game.roundNumber}`;
      let stage = stages.get(key);
      if (!stage) {
        stage = {
          key, label: isGroup
            ? t('communities.tournaments.finalUi.groupLabel', { group: this.groupLabel(game.groupNumber!) })
            : this.teamMatchStageLabel(game),
          loaded: 0, completed: 0,
          order: isGroup ? game.groupNumber! : 100 + game.roundNumber
        };
        stages.set(key, stage);
      }
      stage.loaded++;
      if (game.status === 'COMPLETED') stage.completed++;
    }
    return [...stages.values()].sort((a, b) => a.order - b.order)
      .map(({order, ...stage}) => stage);
  }

  teamPhaseKey(game: TournamentTeamMatch): string {
    return this.isGroupKnockout && game.groupNumber != null
      ? `group-${game.groupNumber}` : `round-${game.roundNumber}`;
  }

  /** Phase and status filters are only a view on already loaded matches. */
  get visibleTeamMatches(): TournamentTeamMatch[] {
    return this.teamMatches.filter(game =>
      (this.teamPhaseFilter === 'ALL' || this.teamPhaseFilter === this.teamPhaseKey(game))
      && (this.teamMatchFilter === 'ALL' || (this.teamMatchFilter === 'COMPLETED'
        ? game.status === 'COMPLETED' : game.status !== 'COMPLETED')));
  }

  setTeamPhaseFilter(key: string): void {
    if (key !== 'ALL' && !this.teamPhases.some(stage => stage.key === key)) return;
    this.teamPhaseFilter = key;
    this.editingTeamResultId = null;
    this.changeDetector.markForCheck();
  }

  setTeamMatchFilter(filter: 'ALL' | 'PENDING' | 'COMPLETED'): void {
    if (this.teamMatchFilter === filter) return;
    this.teamMatchFilter = filter;
    this.editingTeamResultId = null;
    this.changeDetector.markForCheck();
  }

  /**
   * Actual published cup fixtures, grouped in columns by knockout round.
   * Completed scores identify the winner; advancement is only confirmed by a
   * published next-round fixture containing that team. Do not fill in byes,
   * fabricate matches or assume a completed match awards the championship.
   */
  get knockoutBracket(): {
    round: number; label: string;
    matches: { game: TournamentTeamMatch; winnerId: number | null;
      nextFixture: TournamentTeamMatch | null; advanced: boolean; champion: boolean;
      incoming: { game: TournamentTeamMatch; winnerName: string }[] }[];
  }[] {
    if (!this.isCupFormat || this.isRelayCompetition) return [];
    const fixtures = this.teamMatches.filter(game => this.isEliminationMatch(game));
    const lastPublishedRound = fixtures.reduce((last, game) => Math.max(last, game.roundNumber), 0);
    const finalRound = this.knockoutTotalRounds;
    const publishedFinals = fixtures.filter(game => game.roundNumber === finalRound);
    const rounds = new Map<number, TournamentTeamMatch[]>();
    for (const fixture of fixtures) {
      const matches = rounds.get(fixture.roundNumber) ?? [];
      matches.push(fixture);
      rounds.set(fixture.roundNumber, matches);
    }
    const bracket = [...rounds].sort(([a], [b]) => a - b).map(([round, matches]) => ({
      round, label: this.teamMatchStageLabel(matches[0]),
      matches: matches.sort((a, b) => a.id - b.id).map(game => {
        const valid = game.status === 'COMPLETED'
          && typeof game.homeScore === 'number' && Number.isFinite(game.homeScore)
          && typeof game.awayScore === 'number' && Number.isFinite(game.awayScore)
          && game.homeScore >= 0 && game.awayScore >= 0 && game.homeScore !== game.awayScore;
        const winnerId = valid
          ? (game.homeScore! > game.awayScore! ? game.homeTeamId : game.awayTeamId)
          : null;
        // One published fixture in the immediately following round is proof
        // of progression. Duplicated or missing links cannot prove advancement.
        // A team must have a unique source match within the same round.
        // Duplicate appearances never establish a reliable progression link.
        const uniqueSource = winnerId !== null && fixtures.filter(previous =>
          previous.roundNumber === round
          && (previous.homeTeamId === winnerId || previous.awayTeamId === winnerId)
        ).length === 1;
        const nextFixtures = !uniqueSource ? [] : fixtures.filter(next =>
          next.roundNumber === round + 1
          && (next.homeTeamId === winnerId || next.awayTeamId === winnerId));
        const nextFixture = nextFixtures.length === 1 ? nextFixtures[0] : null;
        const advanced = nextFixture !== null;
        // The last *loaded* round is not necessarily the actual final.
        const champion = winnerId !== null && this.selected?.status === 'COMPLETED'
          && !this.teamMatchesHasMore && !this.teamMatchesLoading
          && !this.teamMatchesError && finalRound > 0
          && game.roundNumber === finalRound && lastPublishedRound === finalRound
          && publishedFinals.length === 1
          && this.selected.championTeamId === winnerId;
        return { game, winnerId, nextFixture, advanced, champion };
      })
    }));
    // Show incoming links only for a uniquely verified winner in the immediately
    // preceding published round. Ambiguous duplicate winners are never linked.
    const incomingByFixture = new Map<number,
      { game: TournamentTeamMatch; winnerId: number; winnerName: string }[]>();
    for (const round of bracket) {
      for (const item of round.matches) {
        if (!item.nextFixture || item.winnerId === null) continue;
        const incoming = incomingByFixture.get(item.nextFixture.id) ?? [];
        incoming.push({
          game: item.game, winnerId: item.winnerId,
          winnerName: item.winnerId === item.game.homeTeamId
            ? item.game.homeTeamName : item.game.awayTeamName
        });
        incomingByFixture.set(item.nextFixture.id, incoming);
      }
    }
    return bracket.map(round => ({
      ...round,
      matches: round.matches.map(item => {
        const sources = incomingByFixture.get(item.game.id) ?? [];
        const winnerCounts = new Map<number, number>();
        for (const source of sources)
          winnerCounts.set(source.winnerId, (winnerCounts.get(source.winnerId) ?? 0) + 1);
        return {
          ...item,
          incoming: sources.filter(source => winnerCounts.get(source.winnerId) === 1)
            .map(({game, winnerName}) => ({game, winnerName}))
        };
      })
    }));
  }

  /** Status filter affects only loaded fixtures on screen, not saved results. */
  knockoutStatusMatches(game: TournamentTeamMatch): boolean {
    return this.knockoutStatusFilter === 'ALL'
      || (this.knockoutStatusFilter === 'COMPLETED'
        ? game.status === 'COMPLETED' : game.status !== 'COMPLETED');
  }

  knockoutCompletedCount(matches: {game: TournamentTeamMatch}[]): number {
    return matches.filter(item => item.game.status === 'COMPLETED').length;
  }

  setKnockoutStatusFilter(filter: 'ALL' | 'PENDING' | 'COMPLETED'): void {
    if (!this.isCupFormat || this.isRelayCompetition
        || !['ALL','PENDING','COMPLETED'].includes(filter)) return;
    this.knockoutStatusFilter = filter;
    if (this.selectedKnockoutRound !== null && !this.knockoutBracket.some(round =>
      round.round === this.selectedKnockoutRound
      && round.matches.some(item => this.knockoutStatusMatches(item.game)
        && this.knockoutQueryMatches(item.game)))) this.selectedKnockoutRound = null;
    this.knockoutSearchFixtureId = this.knockoutSearchMatches[0]?.id ?? null;
    this.changeDetector.markForCheck();
  }

  /** Preserve compact boards until a name or status filter is applied. */
  visibleKnockoutMatches<T extends {game: TournamentTeamMatch}>(
    round: number, matches: T[]
  ): T[] {
    if (this.knockoutMatchQuery.trim() || this.knockoutStatusFilter !== 'ALL')
      return matches.filter(item =>
        this.knockoutStatusMatches(item.game) && this.knockoutQueryMatches(item.game));
    if (matches.length <= this.knockoutCompactThreshold
        || this.expandedKnockoutRounds.has(round)) return matches;
    return matches.filter((item, index) =>
      index < (this.knockoutRoundLimits.get(round) ?? this.knockoutCompactLimit)
      || this.isKnockoutTeamFocused(item.game));
  }

  /** Filter bracket columns without altering any loaded fixture or phase filter. */
  shownKnockoutRounds<T extends {round: number; matches:{game:TournamentTeamMatch}[]}>(rounds: T[]): T[] {
    const selected = this.selectedKnockoutRound === null
      ? rounds : rounds.filter(item => item.round === this.selectedKnockoutRound);
    return this.knockoutMatchQuery.trim() || this.knockoutStatusFilter !== 'ALL'
      ? selected.filter(round => round.matches.some(item =>
        this.knockoutStatusMatches(item.game) && this.knockoutQueryMatches(item.game)))
      : selected;
  }

  /** Search only real published names, ignoring accents and letter case. */
  knockoutQueryMatches(game: TournamentTeamMatch): boolean {
    const plain = (name: string) => name.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    const query = plain(this.knockoutMatchQuery.trim());
    return !query || plain(game.homeTeamName).includes(query)
      || plain(game.awayTeamName).includes(query);
  }

  /** Search navigation follows only loaded, published elimination fixtures. */
  get knockoutSearchMatches(): TournamentTeamMatch[] {
    if (!this.knockoutMatchQuery.trim() || !this.isCupFormat || this.isRelayCompetition) return [];
    return this.teamMatches.filter(game =>
      this.isEliminationMatch(game) && this.knockoutStatusMatches(game)
      && this.knockoutQueryMatches(game))
      .sort((a,b) => a.roundNumber - b.roundNumber || a.id - b.id);
  }

  get knockoutSearchPosition(): number {
    return this.knockoutSearchMatches.findIndex(game => game.id === this.knockoutSearchFixtureId) + 1;
  }

  /** The active result must still be a real match in the visible search. */
  get currentKnockoutSearchFixture(): TournamentTeamMatch | null {
    return this.knockoutSearchMatches.find(game =>
      game.id === this.knockoutSearchFixtureId) ?? null;
  }

  /** Jump from a highlighted bracket result to its official fixture row. */
  openCurrentKnockoutSearchFixture(): void {
    const fixture = this.currentKnockoutSearchFixture;
    if (fixture) this.showPublishedKnockoutFixture(fixture);
  }

  /** Cycle through matches in visual round order, never changing saved fixtures. */
  moveKnockoutSearch(direction: -1 | 1): void {
    const results = this.knockoutSearchMatches;
    if (!results.length) return;
    const current = results.findIndex(game => game.id === this.knockoutSearchFixtureId);
    const index = current < 0
      ? (direction === 1 ? 0 : results.length - 1)
      : (current + direction + results.length) % results.length;
    this.knockoutSearchFixtureId = results[index].id;
    // Keep the selected fixture visible when browsing across filtered rounds.
    if (this.selectedKnockoutRound !== null)
      this.selectedKnockoutRound = results[index].roundNumber;
    const board = this.teamTournamentBracket?.nativeElement;
    if (board instanceof HTMLDetailsElement) board.open = true;
    this.changeDetector.detectChanges();
    const match = board?.querySelector<HTMLElement>(
      `[data-knockout-fixture-id="${this.knockoutSearchFixtureId}"]`
    );
    match?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    match?.focus({preventScroll:true});
  }

  setKnockoutMatchQuery(value: string): void {
    if (!this.isCupFormat || this.isRelayCompetition) return;
    this.knockoutMatchQuery = (value ?? '').slice(0, 80);
    this.knockoutSearchFixtureId = this.knockoutSearchMatches[0]?.id ?? null;
    if (this.knockoutMatchQuery.trim()) {
      this.selectedKnockoutRound = null;
      this.knockoutFocusTeamId = null;
    }
    this.changeDetector.markForCheck();
  }

  showAllKnockoutRounds(): void {
    if (!this.isCupFormat || this.isRelayCompetition) return;
    this.selectedKnockoutRound = null;
    this.changeDetector.markForCheck();
  }

  /** Reveal more published fixtures in one round without modifying match data. */
  showMoreKnockoutMatches(round: number): void {
    const stage = this.knockoutBracket.find(item => item.round === round);
    if (!Number.isSafeInteger(round) || this.isRelayCompetition || !stage
        || stage.matches.length <= this.knockoutCompactThreshold
        || this.expandedKnockoutRounds.has(round)) return;
    const limit = this.knockoutRoundLimits.get(round) ?? this.knockoutCompactLimit;
    if (limit >= stage.matches.length) return;
    this.knockoutRoundLimits.set(round,
      Math.min(stage.matches.length,limit + this.knockoutCompactLimit));
    this.changeDetector.markForCheck();
  }

  toggleKnockoutRound(round: number): void {
    const stage = this.knockoutBracket.find(item => item.round === round);
    if (!Number.isSafeInteger(round) || this.isRelayCompetition || !stage
        || stage.matches.length <= this.knockoutCompactThreshold) return;
    if (this.expandedKnockoutRounds.has(round)
        || (this.knockoutRoundLimits.get(round) ?? 0) >= stage.matches.length) {
      this.expandedKnockoutRounds.delete(round);
      this.knockoutRoundLimits.delete(round);
    } else this.expandedKnockoutRounds.add(round);
    this.changeDetector.markForCheck();
  }

  /** Jump to one already published column; leave fixture filters unchanged. */
  jumpToKnockoutRound(round: number): void {
    if (!Number.isSafeInteger(round) || round < 1 || !this.isCupFormat
        || this.isRelayCompetition || !this.knockoutBracket.some(stage =>
          stage.round === round && stage.matches.some(item =>
            this.knockoutStatusMatches(item.game) && this.knockoutQueryMatches(item.game))))
      return;
    this.selectedKnockoutRound = round;
    if (this.knockoutMatchQuery.trim())
      this.knockoutSearchFixtureId = this.knockoutSearchMatches
        .find(game => game.roundNumber === round)?.id ?? null;
    const board = this.teamTournamentBracket?.nativeElement;
    if (board instanceof HTMLDetailsElement) board.open = true;
    this.changeDetector.detectChanges();
    const column = board?.querySelector<HTMLElement>(
      `[data-knockout-round="${round}"]`
    );
    column?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'start'});
    column?.querySelector<HTMLElement>('.team-knockout-round-title')
      ?.focus({preventScroll:true});
  }

  /** The selector only offers teams found in actually loaded elimination fixtures. */
  get knockoutFocusTeams(): { id: number; name: string }[] {
    if (!this.isCupFormat || this.isRelayCompetition) return [];
    const teams = new Map<number, string>();
    for (const game of this.teamMatches.filter(match => this.isEliminationMatch(match))) {
      if (Number.isSafeInteger(game.homeTeamId) && game.homeTeamId > 0)
        teams.set(game.homeTeamId, game.homeTeamName);
      if (Number.isSafeInteger(game.awayTeamId) && game.awayTeamId > 0)
        teams.set(game.awayTeamId, game.awayTeamName);
    }
    return [...teams].map(([id,name]) => ({id,name}))
      .sort((a,b) => a.name.localeCompare(b.name) || a.id-b.id);
  }

  setKnockoutFocusTeam(value: number | string | null): void {
    if (value == null || value === 'ALL') {
      this.knockoutFocusTeamId = null;
      return;
    }
    const id = Number(value);
    if (Number.isSafeInteger(id) && id > 0
        && this.knockoutFocusTeams.some(team => team.id === id)) {
      this.knockoutMatchQuery = '';
      this.knockoutStatusFilter = 'ALL';
      this.knockoutSearchFixtureId = null;
      this.knockoutFocusTeamId = id;
    }
  }

  isKnockoutTeamFocused(game: TournamentTeamMatch): boolean {
    return this.knockoutFocusTeamId !== null &&
      (game.homeTeamId === this.knockoutFocusTeamId
        || game.awayTeamId === this.knockoutFocusTeamId);
  }

  /** This visual route contains published fixtures only, and an arrow only when
   * a unique winning team appears in the immediately following published round. */
  get focusedKnockoutPath(): { game: TournamentTeamMatch; linkedToNext: boolean }[] {
    const teamId = this.knockoutFocusTeamId;
    if (teamId === null || !this.knockoutFocusTeams.some(team => team.id === teamId))
      return [];
    const matches = this.knockoutBracket.flatMap(round => round.matches)
      .filter(item => item.game.homeTeamId === teamId || item.game.awayTeamId === teamId);
    return matches.map((item, index) => ({
      game: item.game,
      linkedToNext: item.winnerId === teamId &&
        item.nextFixture?.id === matches[index+1]?.game.id
    }));
  }

  /** Keep focus inside the published bracket; the existing fixture list
   * remains available through the normal match navigation. */
  focusPublishedKnockoutInBoard(fixture: TournamentTeamMatch): void {
    if (!this.isCupFormat || this.isRelayCompetition || !Number.isSafeInteger(fixture.id)
        || !this.isKnockoutTeamFocused(fixture)
        || !this.teamMatches.some(game =>
          game.id === fixture.id && this.isEliminationMatch(game))) return;
    this.knockoutStatusFilter = 'ALL';
    this.selectedKnockoutRound = fixture.roundNumber;
    const board = this.teamTournamentBracket?.nativeElement;
    if (board instanceof HTMLDetailsElement) board.open = true;
    this.changeDetector.detectChanges();
    const match = board?.querySelector<HTMLElement>(
      `[data-knockout-fixture-id="${fixture.id}"]`
    );
    match?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    match?.focus({preventScroll:true});
  }

  /** Open the real loaded fixture for a confirmed progression, without
   * navigating to an invented matchup or leaving an incompatible filter on. */
  showPublishedKnockoutFixture(fixture: TournamentTeamMatch): void {
    if (!this.isCupFormat || this.isRelayCompetition
      || !Number.isSafeInteger(fixture.id) || fixture.id <= 0
      || !this.teamMatches.some(game => game.id === fixture.id && this.isEliminationMatch(game))) return;
    this.teamPhaseFilter = this.teamPhaseKey(fixture);
    this.teamMatchFilter = 'ALL';
    this.editingTeamResultId = null;
    this.changeDetector.detectChanges();
    const element = this.teamFixturesList?.nativeElement.querySelector<HTMLElement>(
      `[data-team-fixture-id="${fixture.id}"]`
    );
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  }

  isEliminationMatch(game: TournamentTeamMatch): boolean {
    return this.isKnockout || (this.isGroupKnockout && game.groupNumber == null);
  }

  groupLabel(number: number): string {
    return String.fromCharCode(64 + number);
  }

  teamMatchStageLabel(game: TournamentTeamMatch): string {
    if (!this.isGroupKnockout) {
      return t(this.isKnockout
        ? 'communities.tournaments.stageUi.knockoutRound'
        : 'communities.tournaments.stageUi.leagueRound', { round: game.roundNumber });
    }
    if (game.groupNumber != null) {
      return t('communities.tournaments.stageUi.groupRound', {
        group: this.groupLabel(game.groupNumber), round: game.roundNumber
      });
    }
    const totalRounds = this.selected?.groupCount === 4 ? 3 : 2;
    const remaining = totalRounds - game.roundNumber;
    return remaining === 2 ? t('communities.tournaments.stageUi.quarterFinal')
      : remaining === 1 ? t('communities.tournaments.stageUi.semiFinal')
      : remaining === 0 ? t('communities.tournaments.stageUi.final')
      : t('communities.tournaments.stageUi.knockoutFallback', { round: game.roundNumber });
  }

  get knockoutTotalRounds(): number {
    return this.isGroupKnockout
      ? (this.selected?.groupCount === 4 ? 3 : 2)
      : (this.teams.length >= 2 ? Math.ceil(Math.log2(this.teams.length)) : 0);
  }

  get currentKnockoutRound(): number {
    return this.teamMatches.filter(game => this.isEliminationMatch(game))
      .reduce((latest, game) => Math.max(latest, game.roundNumber), 1);
  }

  isPastKnockoutRound(match: TournamentTeamMatch): boolean {
    return this.isEliminationMatch(match) && match.roundNumber < this.currentKnockoutRound;
  }

  get knockoutFirstRoundByes(): TournamentTeam[] {
    // An incomplete fixtures page cannot distinguish a true bye from an
    // unrequested first-round match. Never announce speculative byes.
    if (!this.isKnockout || this.teamMatchesHasMore || this.teamMatchesLoading
      || this.teamMatchesError || this.teamsLoadError || this.teams.length < 3
      || !this.teamMatches.some(game => game.roundNumber === 1)) return [];
    const competing = new Set(this.teamMatches.filter(game => game.roundNumber === 1)
      .flatMap(game => [game.homeTeamId, game.awayTeamId]));
    return this.teams.filter(team => !competing.has(team.id));
  }

  get canManageTeamRoster(): boolean {
    return this.canManage && this.isTeamCompetition && this.selected?.status === 'DRAFT' && !this.busy;
  }

  // Existing tournaments retain their exact roster size. New tournaments with
  // no preset size can start once each team has at least one member.
  isTeamRosterReady(team: TournamentTeam): boolean {
    // Every squad slot must belong to a distinct, valid player. A duplicated
    // roster entry must never count as a second registered teammate.
    const playerIds = team.players.map(player => player.profileId);
    if (playerIds.some(id => !Number.isSafeInteger(id) || id <= 0)
        || new Set(playerIds).size !== playerIds.length) return false;
    if (team.playersPerTeam != null
        && (!Number.isSafeInteger(team.playersPerTeam)
          || team.playersPerTeam < 1 || team.playersPerTeam > 30)) return false;
    return team.playersPerTeam == null
      ? team.players.length >= 1 && team.players.length <= 30
      : team.players.length === team.playersPerTeam;
  }

  isTeamRosterFull(team: TournamentTeam): boolean {
    return team.players.length >= (team.playersPerTeam ?? 30);
  }

  get readyTeamCount(): number {
    return this.teams.filter(team => this.isTeamRosterReady(team)).length;
  }

  get canPublishTeamSchedule(): boolean {
    const teamIds = this.teams.map(team => team.id);
    const participantIds = this.teams.flatMap(team => team.players.map(player => player.profileId));
    const groupCount = this.selected?.groupCount;
    return !this.isRelayCompetition && this.canManageTeamRoster && !this.detailsLoading && !this.teamsLoadError
      // The group/knockout bracket only supports an explicit 2- or 4-group layout.
      && (!this.isGroupKnockout || groupCount === 2 || groupCount === 4)
      && this.teams.length >= (this.isGroupKnockout ? groupCount! * 2 : 2)
      && this.teams.length <= 32
      // A duplicated team ID would make generated fixtures ambiguous.
      && teamIds.every(id => Number.isSafeInteger(id) && id > 0)
      && new Set(teamIds).size === teamIds.length
      // One participant cannot represent opposing teams in the same competition.
      && new Set(participantIds).size === participantIds.length
      && this.readyTeamCount === this.teams.length;
  }

  get canCompleteTeam(): boolean {
    const table = this.teamStandings;
    if (!table || this.isRelayCompetition || !this.canManage || this.selected?.entryType !== 'TEAM'
        || this.selected.format !== 'LEAGUE'
        || this.selected.status !== 'IN_PROGRESS' || this.teamStandingsLoading
        || this.teamStandingsError || this.busy) return false;
    const size = table.standings.length;
    const expected = size * (size - 1) / 2 * (this.selected.roundRobinLegs ?? 1);
    return size >= 2 && size <= 32
      && table.totalMatches === expected && table.completedMatches === expected
      && table.standings.every(row => row.played === (size - 1) * (this.selected?.roundRobinLegs ?? 1));
  }

  get confirmedCount(): number {
    return this.participants.filter(p => p.status === 'CONFIRMED').length;
  }

  get canPublishSchedule(): boolean {
    return this.canManage && this.selected?.status === 'DRAFT'
      && this.rosterReady && !this.detailsLoading && !this.busy
      && !this.participantsHasMore
      && this.confirmedCount >= 2 && this.confirmedCount <= 32;
  }

  get canComplete(): boolean {
    if (this.selected?.status !== 'IN_PROGRESS' || !this.isMember || !this.standings) {
      return false;
    }
    const players = this.standings.standings.length;
    const expected = players * (players - 1) / 2;
    return players >= 2 && players <= 32
      && this.standings.totalMatches === expected
      && this.standings.completedMatches === expected
      && this.standings.standings.every(row => row.played === players - 1);
  }

  loadTournaments(reset = false): void {
    if (!this.community?.id || this.loading) return;
    const communityId = this.community.id;
    const revision = ++this.listRevision;
    const page = reset ? 0 : this.tournamentsPage + 1;
    this.loading = true;
    this.error = '';
    this.api.list(communityId, page).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.listRevision) {
          this.loading = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: result => {
        if (revision !== this.listRevision || this.community.id !== communityId) return;
        this.tournaments = reset ? result.tournaments : [...this.tournaments, ...result.tournaments];
        this.tournamentsPage = page;
        this.tournamentsHasMore = result.hasMore;
        if (reset && !result.tournaments.length && !this.showIndividualCreate && !this.showTeamCreate) this.showGuide = true;
        if (reset && !this.selected && this.invitedTournamentId) {
          const invited = result.tournaments.find(item => item.id === this.invitedTournamentId);
          if (invited) {
            this.selectTournament(invited);
          } else {
            // Older tournaments may be on later pages. Fetch the exact scoped ID,
            // rather than silently opening an unrelated competition.
            this.api.details(communityId, this.invitedTournamentId)
              .pipe(timeout(12000)).subscribe({
                next: detail => {
                  if (revision !== this.listRevision || this.community.id !== communityId
                      || this.selected) return;
                  this.selectTournament(detail);
                },
                error: () => {
                  if (revision === this.listRevision) {
                    this.showError(t('communities.tournaments.organizerUi.inviteExpired'));
                  }
                }
              });
          }
        } else if (reset && !this.selected && result.tournaments.length) {
          this.selectTournament(result.tournaments[0]);
        }
      },
      error: () => {
        if (revision === this.listRevision) this.showError(t('communities.tournaments.organizerUi.listError'));
      }
    });
  }

  selectTournament(tournament: CommunityTournament): void {
    if (this.selected?.id === tournament.id && !this.error) return;
    ++this.detailRevision;
    ++this.mutationRevision;
    ++this.standingsRevision;
    ++this.raceRevision;
    this.raceOverview = undefined;
    this.raceError = false;
    ++this.timedRevision;
    this.timedOverview = undefined;
    this.timedError = false;
    ++this.measuredRevision;
    this.measuredOverview = undefined;
    this.measuredError = false;
    ++this.teamMatchesRevision;
    ++this.teamStandingsRevision;
    ++this.teamGroupsRevision;
    // A request for the previous tournament must not leave this one disabled.
    this.busy = false;
    this.detailsLoading = false;
    this.selected = tournament;
    ++this.speedRevision;
    this.speedOverview = undefined;
    this.speedError = false;
    this.speedSelections = {};
    this.speedTieCorrectionOpen = false;
    this.speedEvidenceType = '';
    this.speedEvidenceReference = '';
    this.speedTieTrialIds = [];
    this.speedTrialOrderExceptionReason = '';
    this.speedTrialOpen = false;
    this.speedTrialHeldAt = '';
    this.speedTrialReference = '';
    this.speedTrialReason = '';
    this.speedTrialPlaces = {};
    this.speedTrialTimes = {};
    this.historicalArchive = undefined;
    this.historicalArchivePage = 0;
    this.historicalReviewCursor = { quarterfinal: -1, semifinal: -1, final: -1 };
    this.confirmAction = null;
    this.feedback = '';
    this.error = '';
    this.participantsPage = 0;
    this.matchesPage = 0;
    this.participants = [];
    this.rosterReady = false;
    this.matches = [];
    this.standings = undefined;
    this.teams = [];
    this.relayOverview=undefined;
    this.relayError=false;
    this.relayTimeDraft={};
    this.relayHeatDraft={};
    this.relayLegDraft={};
    this.relayFinalConfirm=false;
    this.relayDecisionReasons={};
    ++this.relayRevision;
    this.teamDirectoryQuery = '';
    this.teamQuickSwitchQuery = '';
    this.teamQuickSwitchLimit = this.teamQuickSwitchPreviewSize;
    this.teamDirectoryLimit = this.teamDirectoryPageSize;
    this.teamPlayerDraft = {};
    this.teamMemberSearch = {};
    this.teamRosterSearch = {};
    this.teamsLoadError = false;
    this.teamMatches = [];
    this.focusedPublishedFixtureId = null;
    this.directFixtureExtraPages = 0;
    this.resetTeamProfileMatches();
    this.teamMatchFilter = 'ALL';
    this.teamPhaseFilter = 'ALL';
    this.knockoutFocusTeamId = null;
    this.knockoutMatchQuery = '';
    this.knockoutStatusFilter = 'ALL';
    this.knockoutSearchFixtureId = null;
    this.selectedKnockoutRound = null;
    this.requestedTeamGroupNumber = null;
    this.expandedKnockoutRounds.clear();
    this.knockoutRoundLimits.clear();
    this.teamMatchesHasMore = false;
    this.teamMatchesLoading = false;
    this.teamMatchesError = false;
    this.teamStandings = undefined;
    this.teamStandingsLimit = this.teamStandingsPageSize;
    this.teamGroups = undefined;
    this.teamGroupsLoading = false;
    this.teamGroupsError = false;
    this.teamStandingsLoading = false;
    this.teamStandingsError = false;
    this.teamScoreDrafts = {};
    this.teamScoreTouched.clear();
    this.editingTeamResultId = null;
    this.confirmingTeamPlayerRemoval = null;
    this.confirmingEmptyTeamId = null;
    this.scoreDrafts = {};
    this.scoreTouched.clear();
    this.focusPlayersAfterReload = false;
    if (this.isMember) {
      this.loadDetails();
    }
  }

  loadDetails(): void {
    const tournament = this.selected;
    if (!tournament || !this.isMember || this.detailsLoading) return;
    if (tournament.historicalArchiveId) {
      this.loadHistoricalTournament(tournament);
      return;
    }
    if (tournament.entryType === 'TEAM') {
      this.loadTeams();
      return;
    }
    if (this.isInlineSpeedCompetition) {
      this.loadInlineSpeed();
      return;
    }
    if (tournament.scoringMode === 'RACE_POINTS') {
      this.loadRaceOverview();
      return;
    }
    if (tournament.scoringMode === 'SWIM_BEST_TIME'
        || tournament.scoringMode === 'TRACK_BEST_TIME'
        || tournament.scoringMode === 'CANOE_BEST_TIME'
        || tournament.scoringMode === 'ROWING_BEST_TIME') {
      this.loadTimedOverview();
      return;
    }
    if (tournament.scoringMode === 'FIELD_BEST_MARK') {
      this.loadMeasuredOverview();
      return;
    }
    const communityId = this.community.id;
    const revision = ++this.detailRevision;
    ++this.standingsRevision;
    this.detailsLoading = true;
    this.rosterReady = false;
    this.error = '';
    forkJoin({
      members: this.api.participants(communityId, tournament.id, 0),
      games: this.api.matches(communityId, tournament.id, 0),
      table: this.api.standings(communityId, tournament.id)
    }).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.detailRevision) {
          this.detailsLoading = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: ({ members, games, table }) => {
        if (revision !== this.detailRevision || this.community.id !== communityId
            || this.selected?.id !== tournament.id) return;
        this.participants = members.participants;
        this.rosterReady = true;
        this.participantsPage = 0;
        this.participantsHasMore = members.hasMore;
        this.matches = games.matches;
        this.matchesPage = 0;
        this.matchesHasMore = games.hasMore;
        this.standings = table;
        this.updateDraftScores(games.matches);
      },
      error: () => {
        if (revision === this.detailRevision) {
          this.focusPlayersAfterReload = false;
          this.showError(t('communities.tournaments.organizerUi.detailsError'));
        }
      }
    });
  }

  loadHistoricalTournament(tournament: CommunityTournament): void {
    if (!tournament.historicalArchiveId || !this.isMember || this.detailsLoading) return;
    const cid = this.community.id;
    const revision = ++this.detailRevision;
    this.detailsLoading = true;
    this.error = '';
    this.api.historicalArchive(cid, tournament.historicalArchiveId).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.detailRevision) {
          this.detailsLoading = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: archive => {
        if (revision !== this.detailRevision || this.community.id !== cid
            || this.selected?.id !== tournament.id) return;
        this.historicalArchive = archive;
        this.historicalArchivePage = 0;
        this.historicalReviewCursor = { quarterfinal: -1, semifinal: -1, final: -1 };
      },
      error: () => {
        if (revision === this.detailRevision && this.selected?.id === tournament.id) {
          this.showError(t('communities.matches.detailError'));
        }
      }
    });
  }


  /** Provisional swimming standings use source seconds and one exact discipline. */
  loadTimedOverview(): void {
    const tournament=this.selected;
    if (!tournament || (tournament.scoringMode!=='SWIM_BEST_TIME'
        && tournament.scoringMode!=='TRACK_BEST_TIME'
        && tournament.scoringMode!=='CANOE_BEST_TIME'
        && tournament.scoringMode!=='ROWING_BEST_TIME')
        || !this.isMember || this.detailsLoading) return;
    const communityId=this.community.id, revision=++this.timedRevision;
    this.detailsLoading=true;this.timedError=false;
    this.api.timedOverview(communityId,tournament.id).pipe(
      timeout(12000),
      finalize(()=>{
        if(revision===this.timedRevision){
          this.detailsLoading=false;this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next:result=>{
        if(revision!==this.timedRevision || this.community.id!==communityId
            || this.selected?.id!==tournament.id)return;
        this.timedOverview=result;
      },
      error:()=>{
        if(revision===this.timedRevision && this.selected?.id===tournament.id)
          this.timedError=true;
      }
    });
  }
  async linkTimedRound(roundId:number):Promise<void>{
    if(!this.selected || !this.isTimedCompetition || !this.canManage
        || this.selected.status==='COMPLETED')return;
    await this.mutate(this.api.linkTimedRound(this.community.id,this.selected.id,roundId),
      t(this.timedUiKey('linkedSuccess')),result=>{
        this.timedOverview=result;
        this.updateSelected({...this.selected!,status:'IN_PROGRESS'});
      });
  }
  async unlinkTimedRound(roundId:number):Promise<void>{
    if(!this.selected || !this.isTimedCompetition || !this.canManage
        || this.selected.status==='COMPLETED')return;
    await this.mutate(this.api.unlinkTimedRound(this.community.id,this.selected.id,roundId),
      t(this.timedUiKey('unlinked')),result=>{
        this.timedOverview=result;
        if(!result.linkedRounds.length)
          this.updateSelected({...this.selected!,status:'DRAFT',startedAt:null});
      });
  }

  /** Provisional athletics standings use source marks in metres and one exact discipline. */
  loadMeasuredOverview(): void {
    const tournament=this.selected;
    if (!tournament || tournament.scoringMode!=='FIELD_BEST_MARK'
        || !this.isMember || this.detailsLoading) return;
    const communityId=this.community.id, revision=++this.measuredRevision;
    this.detailsLoading=true;this.measuredError=false;
    this.api.measuredOverview(communityId,tournament.id).pipe(
      timeout(12000),
      finalize(()=>{
        if(revision===this.measuredRevision){
          this.detailsLoading=false;this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next:result=>{
        if(revision!==this.measuredRevision || this.community.id!==communityId
            || this.selected?.id!==tournament.id)return;
        this.measuredOverview=result;
      },
      error:()=>{
        if(revision===this.measuredRevision && this.selected?.id===tournament.id)
          this.measuredError=true;
      }
    });
  }
  async linkMeasuredRound(roundId:number):Promise<void>{
    if(!this.selected || !this.isMeasuredCompetition || !this.canManage
        || this.selected.status==='COMPLETED')return;
    await this.mutate(this.api.linkMeasuredRound(this.community.id,this.selected.id,roundId),
      t('communities.fieldTournament.linked'),result=>{
        this.measuredOverview=result;
        this.updateSelected({...this.selected!,status:'IN_PROGRESS'});
      });
  }
  async unlinkMeasuredRound(roundId:number):Promise<void>{
    if(!this.selected || !this.isMeasuredCompetition || !this.canManage
        || this.selected.status==='COMPLETED')return;
    await this.mutate(this.api.unlinkMeasuredRound(this.community.id,this.selected.id,roundId),
      t('communities.fieldTournament.unlinked'),result=>{
        this.measuredOverview=result;
        if(!result.linkedRounds.length)
          this.updateSelected({...this.selected!,status:'DRAFT',startedAt:null});
      });
  }


  /** Race championships read real rounds, not fake 1-vs-1 fixtures. */
  loadRaceOverview(): void {
    const tournament = this.selected;
    if (!tournament || tournament.scoringMode !== 'RACE_POINTS'
        || !this.isMember || this.detailsLoading) return;
    const cid = this.community.id, revision = ++this.raceRevision;
    this.detailsLoading = true;
    this.raceError = false;
    this.api.raceOverview(cid, tournament.id).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.raceRevision) {
          this.detailsLoading = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: result => {
        if (revision !== this.raceRevision || this.community.id !== cid
            || this.selected?.id !== tournament.id) return;
        this.raceOverview = result;
        this.racePointsDraft = result.pointsByPlace.join(',');
      },
      error: () => {
        if (revision === this.raceRevision && this.selected?.id === tournament.id) {
          this.raceError = true;
          this.showError(t('communities.karting.loadErrorToast'));
        }
      }
    });
  }

  async linkTournamentRace(roundId: number): Promise<void> {
    if (!this.selected || !this.canManage || this.isRaceCompetition === false) return;
    await this.mutate(this.api.linkRace(this.community.id, this.selected.id, roundId),
      t('communities.karting.raceLinked'), result => {
        this.raceOverview = result;
        this.updateSelected({ ...this.selected!, status: 'IN_PROGRESS' });
      });
  }

  async unlinkTournamentRace(roundId: number): Promise<void> {
    if (!this.selected || !this.canManage || this.isRaceCompetition === false) return;
    await this.mutate(this.api.unlinkRace(this.community.id, this.selected.id, roundId),
      t('communities.karting.raceUnlinked'), result => {
        this.raceOverview = result;
        if (!result.linkedRaces.length) {
          this.updateSelected({ ...this.selected!, status: 'DRAFT', startedAt: null });
        }
      });
  }

  get canCompleteRace(): boolean {
    return this.isRaceCompetition && this.canManage && !this.busy
      && this.selected?.status === 'IN_PROGRESS'
      && (this.raceOverview?.linkedRaces.length ?? 0) > 0
      && (this.raceOverview?.standings.length ?? 0) >= 2
      && !this.detailsLoading && !this.raceError;
  }

  async completeRace(): Promise<void> {
    if (!this.selected || !this.canCompleteRace || this.confirmAction !== 'completeRace') return;
    const tournamentId = this.selected.id;
    this.confirmAction = null;
    await this.mutate(this.api.completeRaceChampionship(this.community.id, tournamentId),
      t('communities.karting.finishSaved'), tournament => {
        this.updateSelected(tournament);
        this.raceOverview = undefined;
        this.loadRaceOverview();
      });
  }

  async saveRacePoints(): Promise<void> {
    if (!this.selected || !this.canManage || !this.isRaceCompetition
        || this.raceOverview?.linkedRaces.length || this.selected.status !== 'DRAFT') return;
    const text = this.racePointsDraft.trim();
    const points = text.split(',').map(v => v.trim());
    if (points.length < 1 || points.length > 20
        || points.some((p, i) => !/^\d{1,4}$/.test(p)
          || Number(p) > 1000
          || (i > 0 && Number(p) > Number(points[i - 1])))) {
      this.showError(t('communities.karting.pointsInvalid'));
      return;
    }
    await this.mutate(this.api.setRacePoints(this.community.id, this.selected.id, text),
      t('communities.karting.pointsSaved'), result => {
        this.raceOverview = result;
        this.racePointsDraft = result.pointsByPlace.join(',');
      });
  }

  loadMoreParticipants(): void {
    // The first roster page must have been loaded successfully before its
    // pagination cursor can be trusted.
    if (!this.selected || !this.isMember || !this.rosterReady
        || this.detailsLoading || this.busy || !this.participantsHasMore) return;
    const cid = this.community.id, tid = this.selected.id, revision = this.detailRevision;
    const requestedPage = this.participantsPage + 1;
    this.busy = true;
    this.api.participants(cid, tid, requestedPage).pipe(
      timeout(12000), finalize(() => {
        if (revision === this.detailRevision && this.selected?.id === tid && this.community.id === cid) {
          this.busy = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: result => {
        if (revision !== this.detailRevision || this.selected?.id !== tid || this.community.id !== cid) return;
        if (result.page !== requestedPage) {
          // Reject stale or incorrectly cached pages; preserve the existing
          // cursor and roster so the organizer can retry the same page.
          this.showError(t('communities.tournaments.organizerUi.participantsLoadError'));
          return;
        }
        // Pages can overlap after registrations change between requests.
        // Keep the latest status for each profile without showing duplicates.
        const unique = new Map(this.participants.map(player => [player.profileId, player]));
        for (const player of result.participants) unique.set(player.profileId, player);
        this.participants = [...unique.values()];
        this.participantsPage = result.page;
        this.participantsHasMore = result.hasMore;
      },
      error: () => {
        if (revision === this.detailRevision && this.selected?.id === tid && this.community.id === cid) {
          this.showError(t('communities.tournaments.organizerUi.participantsLoadError'));
        }
      }
    });
  }

  loadMoreMatches(): void {
    if (!this.selected || !this.isMember || this.busy || !this.matchesHasMore) return;
    const cid = this.community.id, tid = this.selected.id, revision = this.detailRevision;
    this.busy = true;
    this.api.matches(cid, tid, this.matchesPage + 1).pipe(
      timeout(12000), finalize(() => {
        if (revision === this.detailRevision && this.selected?.id === tid && this.community.id === cid) {
          this.busy = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: result => {
        if (revision !== this.detailRevision || this.selected?.id !== tid || this.community.id !== cid) return;
        this.matches = [...this.matches, ...result.matches];
        this.matchesPage = result.page;
        this.matchesHasMore = result.hasMore;
        this.updateDraftScores(result.matches);
      },
      error: () => {
        if (revision === this.detailRevision && this.selected?.id === tid && this.community.id === cid) {
          this.showError(t('communities.tournaments.organizerUi.matchesLoadError'));
        }
      }
    });
  }

  private updateDraftScores(matches: TournamentMatch[]): void {
    for (const match of matches) {
      this.scoreDrafts[match.id] = { home: match.homeScore, away: match.awayScore };
    }
  }

  scoreDraft(match: TournamentMatch): { home: number | null; away: number | null } {
    return this.scoreDrafts[match.id] || { home: match.homeScore, away: match.awayScore };
  }

  setScore(match: TournamentMatch, side: 'home' | 'away', value: number | null): void {
    if (!this.scoreDrafts[match.id]) this.scoreDrafts[match.id] = this.scoreDraft(match);
    this.scoreDrafts[match.id][side] = value;
    this.scoreTouched.add(match.id);
  }

  validScore(value: number | null): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999;
  }

  startIndividualCreation(selectedSport?: string): void {
    if (!this.canManage || this.community?.individualTournamentsEnabled === false || this.busy) return;
    this.showGuide = false;
    this.showTeamCreate = false;
    this.showIndividualCreate = true;
    this.eventTypeDraft = null;
    this.eventDisciplineDraft = null;
    this.editingSport = false;
    this.sportSearch = '';
    if (selectedSport && SPORTS_CATALOG.includes(selectedSport)) this.sportDraft = selectedSport;
    this.error = '';
  }

  startTeamCreation(selectedSport?: string): void {
    if (!this.canManage || this.community?.teamTournamentsEnabled === false || this.busy) return;
    this.showGuide = false;
    this.showIndividualCreate = false;
    this.showTeamCreate = true;
    this.eventTypeDraft = null;
    this.eventDisciplineDraft = null;
    this.editingSport = false;
    this.sportSearch = '';
    if (selectedSport && SPORTS_CATALOG.includes(selectedSport)) this.sportDraft = selectedSport;
    this.error = '';
  }

  /** A roster is independent of the older individual participant/fixture endpoints. */
  loadTeams(): void {
    const tournament = this.selected;
    if (!tournament || tournament.entryType !== 'TEAM' || !this.isMember || this.detailsLoading) return;
    const communityId = this.community.id;
    const revision = ++this.detailRevision;
    this.detailsLoading = true;
    this.teamsLoadError = false;
    this.api.teams(communityId, tournament.id).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.detailRevision) {
          this.detailsLoading = false;
          this.revealRequestedTeamFixture();
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: teams => {
        if (revision !== this.detailRevision || this.community.id !== communityId
            || this.selected?.id !== tournament.id) return;
        this.teams = teams;
        this.resetTeamProfileMatches();
        if (this.focusedTeam && tournament.status !== 'DRAFT' && !this.isRelayCompetition)
          this.loadTeamProfileMatches();
        if(this.isRelayCompetition) {
          for(const team of teams) {
            if(!this.relayLegDraft[team.id] || this.relayLegDraft[team.id].length!==4)
              this.relayLegDraft[team.id]=team.players.map(p=>p.profileId).slice(0,4);
            this.relayHeatDraft[team.id] ??= 1;
            this.relayTimeDraft[team.id] ??= null;
          }
          this.loadRelayOverview();
        }
        this.teamPlayerDraft = {};
        this.teamMemberSearch = {};
        // A copied-link status belongs to the previous roster snapshot.
        this.inviteCopyFeedback = {};
        this.confirmingTeamPlayerRemoval = null;
        this.confirmingEmptyTeamId = null;
        if (tournament.status !== 'DRAFT' && !this.isRelayCompetition) {
          this.loadTeamMatches(true);
          if (tournament.format === 'LEAGUE') this.loadTeamStandings();
          if (tournament.format === 'GROUP_KNOCKOUT') this.loadGroupStandings();
        }
      },
      error: () => {
        if (revision === this.detailRevision && this.community.id === communityId
            && this.selected?.id === tournament.id) {
          this.teamsLoadError = true;
          this.showError(t('communities.tournaments.organizerUi.teamLoadError'));
        }
      }
    });
  }

  loadRelayOverview():void {
    const tournament=this.selected;
    if(!tournament || !this.isRelayCompetition || !this.isMember) return;
    const cid=this.community.id,revision=++this.relayRevision;
    this.relayError=false;
    this.api.relayOverview(cid,tournament.id).pipe(timeout(12000)).subscribe({
      next: overview=>{
        if(revision!==this.relayRevision || this.community.id!==cid
           || this.selected?.id!==tournament.id)return;
        this.relayOverview=overview;this.changeDetector.markForCheck();
      },
      error:()=>{
        if(revision===this.relayRevision){this.relayError=true;this.changeDetector.markForCheck();}
      }
    });
  }

  get relayEligibleTeams():TournamentTeam[] {
    const overview=this.relayOverview;
    if(!overview?.finalPublished) return this.teams;
    return this.teams.filter(team=>overview.finalists?.some(f=>f.teamId===team.id));
  }
  get canPublishRelayFinal():boolean {
    const overview=this.relayOverview;
    const rows=overview?.qualifyingStandings??overview?.standings??[];
    return this.canManage && !this.busy && this.selected?.status==='IN_PROGRESS'
      && !overview?.finalPublished && rows.length>=2
      && !(rows.length>8 && rows[7].bestSeconds===rows[8].bestSeconds);
  }
  async publishRelayFinal():Promise<void> {
    if(!this.selected || !this.canPublishRelayFinal || !this.relayFinalConfirm)return;
    await this.mutate(this.api.publishRelayFinal(this.community.id,this.selected.id),
      t('communities.inlineSpeed.confirmed'),overview=>{
        this.relayOverview=overview;
        this.relayFinalConfirm=false;
        this.relayHeatDraft={};
        this.relayTimeDraft={};
      });
  }
  canDecideRelayHeat(heat:RelayHeat):boolean {
    return this.canManage && !this.busy && this.selected?.status!=='COMPLETED'
      && (!this.relayOverview?.finalPublished || heat.stage==='FINAL');
  }
  async decideRelayHeat(heat:RelayHeat):Promise<void> {
    if(!this.selected || !this.canDecideRelayHeat(heat))return;
    const reason=(this.relayDecisionReasons[heat.id]??'').trim();
    if(reason.length<5 || reason.length>500){
      this.showError(t('communities.race.decisionReason'));return;
    }
    const status=heat.decisionStatus==='DISQUALIFIED'?'VALID':'DISQUALIFIED';
    await this.mutate(this.api.decideRelayHeat(this.community.id,this.selected.id,
      heat.id,status,reason),t('communities.tournaments.organizerUi.teamScoreSaved'),overview=>{
        this.relayOverview=overview;
        this.relayDecisionReasons[heat.id]='';
      });
  }
  relayRunnerNames(teamId:number,ids:number[]):string {
    const team=this.teams.find(t=>t.id===teamId);
    return ids.map(id=>team?.players.find(p=>p.profileId===id)?.displayName??String(id)).join(' · ');
  }
  setRelayLeg(teamId:number,index:number,value:number|null):void {
    const current=[...(this.relayLegDraft[teamId]??[])];
    current[index]=value??0;
    this.relayLegDraft[teamId]=current;
  }
  relayTeamReady(team:TournamentTeam):boolean {
    const legs=this.relayLegDraft[team.id]??[];
    return team.players.length===4 && legs.length===4
      && new Set(legs).size===4
      && legs.every(id=>team.players.some(p=>p.profileId===id));
  }
  async saveRelayHeat(team:TournamentTeam):Promise<void> {
    const heat=this.relayHeatDraft[team.id]??1;
    const seconds=this.relayTimeDraft[team.id];
    if(!this.isRelayCompetition || !this.canManage || this.busy || !this.selected
       || this.selected.status==='COMPLETED' || !this.relayTeamReady(team)
       || !Number.isInteger(heat) || heat<1 || heat>20
       || seconds==null || !Number.isFinite(seconds) || seconds<=0 || seconds>=1e8
       || Math.round(seconds*1000)/1000!==seconds) {
      this.showError(t('communities.relay.bad'));return;
    }
    if(!this.relayEligibleTeams.some(eligible=>eligible.id===team.id)){
      this.showError(t('communities.relay.bad'));return;
    }
    await this.mutate(this.api.recordRelayHeat(this.community.id,this.selected.id,
      team.id,heat,seconds,[...this.relayLegDraft[team.id]],!!this.relayOverview?.finalPublished),
      t('communities.tournaments.organizerUi.teamScoreSaved'),overview=>{
        this.relayOverview=overview;
        if(this.selected?.status==='DRAFT')
          this.updateSelected({...this.selected!,status:'IN_PROGRESS'});
        this.changeDetector.markForCheck();
      });
  }

  private resetTeamProfileMatches(): void {
    ++this.teamProfileMatchesRevision;
    this.teamProfileMatches = [];
    this.teamProfileMatchesPage = -1;
    this.teamProfileMatchesHasMore = false;
    this.teamProfileMatchesLoading = false;
    this.teamProfileMatchesError = false;
    this.teamProfileMatchFilter = 'ALL';
    this.teamProfilePhaseFilter = 'ALL';
    this.teamProfileOpponentId = null;
    this.teamProfileOpponentsExpanded = false;
  }

  /**
   * A team's own published fixture pages define its available stages. Never
   * borrow tournament-wide matches or fabricate rounds not returned by the API.
   */
  get teamProfilePhases(): { key: string; label: string; loaded: number; completed: number }[] {
    if (!this.focusedTeam || this.isRelayCompetition) return [];
    const phases = new Map<string, { key: string; label: string; loaded: number;
      completed: number; order: number }>();
    for (const game of this.teamProfileMatches) {
      const isGroup = this.isGroupKnockout && game.groupNumber != null;
      const key = this.teamPhaseKey(game);
      let phase = phases.get(key);
      if (!phase) {
        phase = {
          key,
          label: isGroup
            ? t('communities.tournaments.finalUi.groupLabel', { group: this.groupLabel(game.groupNumber!) })
            : this.teamMatchStageLabel(game),
          loaded: 0, completed: 0,
          order: isGroup ? game.groupNumber! : 100 + game.roundNumber
        };
        phases.set(key, phase);
      }
      phase.loaded++;
      if (game.status === 'COMPLETED') phase.completed++;
    }
    return [...phases.values()].sort((a, b) => a.order - b.order)
      .map(({ order, ...phase }) => phase);
  }

  /** Read-only results based only on the selected team's loaded fixture pages. */
  get focusedTeamJourney() {
    return summarizePublishedTeamJourney(
      this.teamProfileMatches, this.focusedTeam?.id ?? -1,
      this.selected?.format ?? 'LEAGUE', this.teamProfileMatchesHasMore
    );
  }

  /** Only real opponents from the selected team's loaded fixtures. */
  get teamProfileOpponents(): {id:number; name:string}[] {
    const teamId: number | undefined = this.focusedTeam?.id;
    if (!teamId || this.isRelayCompetition) return [];
    const names = new Map<number,string>();
    for (const game of this.teamProfileMatches) {
      if (!Number.isSafeInteger(game.id) || game.id <= 0) continue;
      const isHome: boolean = game.homeTeamId === teamId;
      if (!isHome && game.awayTeamId !== teamId) continue;
      const id: number = isHome ? game.awayTeamId : game.homeTeamId;
      const name: string = isHome ? game.awayTeamName : game.homeTeamName;
      if (Number.isSafeInteger(id) && id > 0 && id !== teamId && !names.has(id))
        names.set(id,name);
    }
    return [...names].map(([id,name])=>({id,name}))
      .sort((a,b)=>a.name.localeCompare(b.name) || a.id-b.id);
  }

  setTeamProfileOpponent(value: string): void {
    if (value === 'ALL') this.teamProfileOpponentId = null;
    else {
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id <= 0
          || !this.teamProfileOpponents.some(team=>team.id === id)) return;
      this.teamProfileOpponentId = id;
    }
    this.changeDetector.markForCheck();
  }

  /**
   * Rival summaries use only the selected team's published fixture pages.
   * The same fixture ID never counts twice across overlapping API pages.
   * Completed games with missing/invalid scores do not imply any outcome.
   */
  get teamProfileOpponentCards(): {
    id: number; name: string; played: number; wins: number;
    draws: number; losses: number; pending: number
  }[] {
    const teamId = this.focusedTeam?.id;
    if (!teamId || this.isRelayCompetition) return [];
    const cards = new Map(this.teamProfileOpponents.map(item => [item.id, {
      ...item, played: 0, wins: 0, draws: 0, losses: 0, pending: 0
    }]));
    const seen = new Set<number>();
    for (const fixture of this.teamProfileMatches) {
      if (!Number.isSafeInteger(fixture.id) || fixture.id <= 0 || seen.has(fixture.id)) continue;
      const home = fixture.homeTeamId === teamId;
      if (!home && fixture.awayTeamId !== teamId) continue;
      const card = cards.get(home ? fixture.awayTeamId : fixture.homeTeamId);
      if (!card) continue;
      seen.add(fixture.id);
      if (fixture.status !== 'COMPLETED') {
        card.pending++;
        continue;
      }
      const own = home ? fixture.homeScore : fixture.awayScore;
      const other = home ? fixture.awayScore : fixture.homeScore;
      if (!Number.isSafeInteger(own) || !Number.isSafeInteger(other)
          || own! < 0 || other! < 0) continue;
      card.played++;
      if (own! > other!) card.wins++;
      else if (own! < other!) card.losses++;
      else card.draws++;
    }
    return [...cards.values()];
  }

  get visibleTeamProfileOpponentCards() {
    const cards = this.teamProfileOpponentCards;
    if (this.teamProfileOpponentsExpanded || cards.length <= this.teamProfileOpponentPreviewSize)
      return cards;
    const visible = cards.slice(0, this.teamProfileOpponentPreviewSize);
    // Keep an actively filtered opponent reachable when collapsing the overview.
    const selected = cards.find(item => item.id === this.teamProfileOpponentId);
    if (selected && !visible.some(item => item.id === selected.id)) visible.push(selected);
    return visible;
  }

  /** A quick card toggles only filters; the official fixture data stays unchanged. */
  showTeamProfileOpponentCard(opponentId: number): void {
    if (!this.teamProfileOpponentCards.some(card => card.id === opponentId)) return;
    this.teamProfileMatchFilter = 'ALL';
    this.teamProfilePhaseFilter = 'ALL';
    this.setTeamProfileOpponent(this.teamProfileOpponentId === opponentId ? 'ALL' : String(opponentId));
    this.changeDetector.detectChanges();
    const list = this.teamProfileFixtures?.nativeElement;
    list?.scrollIntoView({behavior:'smooth',block:'start'});
    list?.focus({preventScroll:true});
  }

  /** Comparison stays provisional while only part of the team's fixtures is loaded. */
  get teamProfileHeadToHead(): {
    opponentName: string; played: number; wins: number; draws: number;
    losses: number; pending: number
  } | null {
    const card = this.teamProfileOpponentCards.find(item => item.id === this.teamProfileOpponentId);
    return card ? {opponentName: card.name, played: card.played,
      wins: card.wins, draws: card.draws, losses: card.losses, pending: card.pending} : null;
  }

  /** A loaded knockout opponent must also belong to this tournament's roster. */
  teamPathOpponent(fixture: TournamentTeamMatch): TournamentTeam | undefined {
    const ownId = this.focusedTeam?.id;
    if (!ownId || !this.isCupFormat || this.isRelayCompetition
        || this.selected?.status === 'DRAFT'
        || !this.teamProfileMatches.some(game => game.id === fixture.id
          && game.homeTeamId === fixture.homeTeamId
          && game.awayTeamId === fixture.awayTeamId
          && (game.homeTeamId === ownId || game.awayTeamId === ownId)))
      return undefined;
    const otherId = fixture.homeTeamId === ownId
      ? fixture.awayTeamId : fixture.homeTeamId;
    return this.teams.find(team => team.id === otherId && otherId !== ownId);
  }

  /** Existing tournament roster is the only safe source for rival page links. */
  get teamProfileOpponentTeam(): TournamentTeam | undefined {
    const id = this.teamProfileOpponentId;
    return id === null ? undefined : this.teams.find(team => team.id === id);
  }

  get teamProfileHasActiveFilters(): boolean {
    return this.teamProfileMatchFilter !== 'ALL'
      || this.teamProfilePhaseFilter !== 'ALL' || this.teamProfileOpponentId !== null;
  }

  clearTeamProfileFilters(): void {
    this.teamProfileMatchFilter = 'ALL';
    this.teamProfilePhaseFilter = 'ALL';
    this.teamProfileOpponentId = null;
    this.changeDetector.markForCheck();
  }

  get visibleTeamProfileMatches(): TournamentTeamMatch[] {
    const teamId = this.focusedTeam?.id;
    if (!teamId) return [];
    return this.teamProfileMatches.filter(game =>
      (game.homeTeamId === teamId || game.awayTeamId === teamId)
      && (this.teamProfileOpponentId === null
        || (game.homeTeamId === teamId
          ? game.awayTeamId : game.homeTeamId) === this.teamProfileOpponentId)
      && (this.teamProfilePhaseFilter === 'ALL'
        || this.teamProfilePhaseFilter === this.teamPhaseKey(game))
      && (this.teamProfileMatchFilter === 'ALL'
        || (this.teamProfileMatchFilter === 'COMPLETED'
          ? game.status === 'COMPLETED' : game.status !== 'COMPLETED')));
  }

  /** The fixture API has rounds, not match dates. Order by published stage/round
   * only, never imply that a match was played on a particular calendar day. */
  get teamProfileFixtureSections(): {
    status: 'PENDING' | 'COMPLETED'; matches: TournamentTeamMatch[]
  }[] {
    const matches = this.visibleTeamProfileMatches;
    const phase = (game: TournamentTeamMatch): number =>
      this.isGroupKnockout && game.groupNumber != null ? 0 : 1;
    const byPublishedRound = (a: TournamentTeamMatch,b: TournamentTeamMatch): number =>
      phase(a) - phase(b) || a.roundNumber - b.roundNumber
      || (a.groupNumber ?? 0) - (b.groupNumber ?? 0) || a.id - b.id;
    const pending = matches.filter(game => game.status !== 'COMPLETED')
      .sort(byPublishedRound);
    const completed = matches.filter(game => game.status === 'COMPLETED')
      .sort((a,b) => byPublishedRound(b,a));
    return [
      {status:'PENDING' as const,matches:pending},
      {status:'COMPLETED' as const,matches:completed}
    ].filter(section => section.matches.length > 0);
  }

  /** The team-page result is from the focused team's perspective.
   * Missing/invalid scores never imply a victory, draw, or defeat. */
  teamProfileFixtureOutcome(game: TournamentTeamMatch): 'WIN' | 'DRAW' | 'LOSS' | null {
    const team = this.focusedTeam;
    if (!team || this.isRelayCompetition || game.status !== 'COMPLETED'
        || !Number.isSafeInteger(game.id) || game.id <= 0
        || !this.teamProfileMatches.some(item => item.id === game.id
          && item.homeTeamId === game.homeTeamId && item.awayTeamId === game.awayTeamId)
        || (game.homeTeamId !== team.id && game.awayTeamId !== team.id)
        || !Number.isSafeInteger(game.homeScore) || !Number.isSafeInteger(game.awayScore)
        || game.homeScore! < 0 || game.awayScore! < 0) return null;
    const own = game.homeTeamId === team.id ? game.homeScore : game.awayScore;
    const rival = game.homeTeamId === team.id ? game.awayScore : game.homeScore;
    return own! > rival! ? 'WIN' : own! < rival! ? 'LOSS' : 'DRAW';
  }

  /** Only link to a rival's actual roster entry in this selected tournament. */
  teamProfileFixtureRival(game: TournamentTeamMatch): TournamentTeam | undefined {
    const team = this.focusedTeam;
    if (!team || !Number.isSafeInteger(game.id) || game.id <= 0
        || !this.teamProfileMatches.some(item => item.id === game.id
          && item.homeTeamId === game.homeTeamId && item.awayTeamId === game.awayTeamId))
      return undefined;
    const rivalId = game.homeTeamId === team.id ? game.awayTeamId
      : game.awayTeamId === team.id ? game.homeTeamId : null;
    return this.teams.find(rival => rival.id === rivalId && rival.id !== team.id);
  }

  /** Navigate within this loaded team's page, never to a hidden or nonexistent section. */
  showTeamProfileSection(section: 'results' | 'group' | 'roster'): void {
    if (!this.focusedTeam || !this.isMember) return;
    const element = section === 'roster' ? this.teamProfileRoster?.nativeElement
      : this.selected?.status === 'DRAFT' ? null
      : section === 'group' ? (this.focusedTeamGroupOverview
          ? this.teamProfileSection?.nativeElement.querySelector<HTMLElement>(
              '.team-page-group-overview') : null)
        : this.teamProfileSection?.nativeElement;
    element?.scrollIntoView({behavior:'smooth',block:'start'});
    element?.focus({preventScroll:true});
  }

  /** The earliest still-scheduled loaded team match, never an invented fixture. */
  showTeamProfileNextMatch(): void {
    if (!this.focusedTeam || this.isRelayCompetition || this.selected?.status === 'DRAFT') return;
    const match = this.focusedTeamJourney.pending[0];
    if (match) this.showTeamProfileFixture(match.fixture);
  }

  /** Reveal only the actual loaded team fixture; never open another team's match. */
  showTeamProfileFixture(fixture: TournamentTeamMatch): void {
    const team = this.focusedTeam;
    if (!team || this.isRelayCompetition || !Number.isSafeInteger(fixture.id)
      || fixture.id <= 0 || !this.teamProfileMatches.some(game =>
        game.id === fixture.id
        && (game.homeTeamId === team.id || game.awayTeamId === team.id))) return;
    this.teamProfilePhaseFilter = 'ALL';
    this.teamProfileMatchFilter = 'ALL';
    this.teamProfileOpponentId = null;
    this.changeDetector.detectChanges();
    const row = this.teamProfileSection?.nativeElement.querySelector<HTMLElement>(
      `[data-team-profile-fixture-id="${fixture.id}"]`
    );
    row?.scrollIntoView({behavior: 'smooth', block: 'center'});
    row?.focus({preventScroll: true});
  }

  /** Phase cards navigate to real loaded fixtures without changing other filters. */
  showTeamProfilePhase(key: string): void {
    if (!this.focusedTeam || this.isRelayCompetition || this.selected?.status === 'DRAFT'
        || !this.teamProfilePhases.some(phase => phase.key === key)) return;
    this.setTeamProfilePhaseFilter(this.teamProfilePhaseFilter === key ? 'ALL' : key);
    this.changeDetector.detectChanges();
    const section = this.teamProfileFixtures?.nativeElement;
    section?.scrollIntoView({behavior:'smooth',block:'start'});
    section?.focus({preventScroll:true});
  }

  setTeamProfilePhaseFilter(key: string): void {
    if (key !== 'ALL' && !this.teamProfilePhases.some(phase => phase.key === key)) return;
    this.teamProfilePhaseFilter = key;
    this.changeDetector.markForCheck();
  }

  setTeamProfileMatchFilter(filter: 'ALL' | 'PENDING' | 'COMPLETED'): void {
    this.teamProfileMatchFilter = filter;
  }

  loadTeamProfileMatches(): void {
    const team = this.focusedTeam;
    const tournament = this.selected;
    if (!team || !tournament || !this.isMember || tournament.status === 'DRAFT'
        || this.isRelayCompetition || this.teamProfileMatchesLoading
        || (this.teamProfileMatchesPage >= 0 && !this.teamProfileMatchesHasMore)) return;
    const communityId = this.community.id, tournamentId = tournament.id, teamId = team.id;
    const revision = ++this.teamProfileMatchesRevision;
    const page = this.teamProfileMatchesPage + 1;
    this.teamProfileMatchesLoading = true;
    this.teamProfileMatchesError = false;
    this.api.teamProfileMatches(communityId, tournamentId, teamId, page).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.teamProfileMatchesRevision) {
          this.teamProfileMatchesLoading = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: result => {
        if (revision !== this.teamProfileMatchesRevision
            || this.community.id !== communityId || this.selected?.id !== tournamentId
            || this.teamPageId !== teamId) return;
        // Pages can overlap after edits. Keep only valid, unique own-team fixtures.
        const seen = new Set(this.teamProfileMatches.map(fixture => fixture.id));
        const added: TournamentTeamMatch[] = [];
        for (const fixture of result.matches) {
          if (!Number.isSafeInteger(fixture.id) || fixture.id <= 0
              || (fixture.homeTeamId !== teamId && fixture.awayTeamId !== teamId)
              || seen.has(fixture.id)) continue;
          seen.add(fixture.id);
          added.push(fixture);
        }
        this.teamProfileMatches = [...this.teamProfileMatches, ...added];
        this.teamProfileMatchesPage = page;
        this.teamProfileMatchesHasMore = result.hasMore;
        if (this.teamProfileOpponentId !== null
            && !this.teamProfileOpponents.some(team=>team.id === this.teamProfileOpponentId))
          this.teamProfileOpponentId = null;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision === this.teamProfileMatchesRevision) {
          this.teamProfileMatchesError = true;
          this.changeDetector.markForCheck();
        }
      }
    });
  }

  retryTeamProfileMatches(): void {
    if (this.teamProfileMatchesLoading) return;
    this.teamProfileMatchesError = false;
    this.loadTeamProfileMatches();
  }

  /** Resolve only a real published tournament fixture from the requested link.
   * Later pages are scanned with a hard bound; unrelated teams cannot be inferred. */
  revealRequestedTeamFixture(): void {
    const id = this.requestedFixtureId;
    if (id === null || !Number.isSafeInteger(id) || id <= 0
        || this.teamPageId !== null || !this.isTeamCompetition
        || this.isRelayCompetition || !this.isMember || this.selected?.status === 'DRAFT'
        || this.invitedTournamentId !== this.selected?.id) return;
    const fixture = this.teamMatches.find(game => game.id === id);
    if (fixture) {
      this.focusedPublishedFixtureId = fixture.id;
      this.teamPhaseFilter = this.teamPhaseKey(fixture);
      this.teamMatchFilter = 'ALL';
      this.editingTeamResultId = null;
      this.changeDetector.detectChanges();
      const row = this.teamFixturesList?.nativeElement.querySelector<HTMLElement>(
        `[data-team-fixture-id="${fixture.id}"]`
      );
      row?.scrollIntoView({behavior:'smooth',block:'center'});
      row?.focus({preventScroll:true});
      return;
    }
    if (this.detailsLoading || this.teamMatchesLoading || this.teamMatchesError
        || !this.teamMatchesHasMore
        || this.directFixtureExtraPages >= this.directFixtureMaxExtraPages) return;
    this.directFixtureExtraPages++;
    this.loadTeamMatches();
  }

  /** Continue a large tournament search only on explicit user action.
   * Each click authorizes another bounded block, never an unlimited API scan. */
  continueRequestedTeamFixtureSearch(): void {
    if (!this.requestedTeamFixtureMissing || !this.teamMatchesHasMore
        || !this.isMember || this.teamMatchesLoading || this.teamMatchesError) return;
    this.directFixtureExtraPages = 0;
    this.revealRequestedTeamFixture();
  }

  /** A capped scan is partial while more pages exist, never a missing-fixture claim. */
  get requestedTeamFixtureMissing(): boolean {
    return this.requestedFixtureId !== null
      && this.invitedTournamentId === this.selected?.id
      && this.teamPageId === null && this.isTeamCompetition
      && !this.isRelayCompetition && this.isMember
      && this.selected?.status !== 'DRAFT'
      && !this.detailsLoading && !this.teamMatchesLoading && !this.teamMatchesError
      && this.focusedPublishedFixtureId !== this.requestedFixtureId
      && (!this.teamMatchesHasMore || this.directFixtureExtraPages >= this.directFixtureMaxExtraPages);
  }

  loadTeamMatches(reset = false): void {
    const tournament = this.selected;
    if (!tournament || tournament.entryType !== 'TEAM'
        || tournament.status === 'DRAFT' || !this.isMember || this.teamMatchesLoading) return;
    const cid = this.community.id;
    const revision = ++this.teamMatchesRevision;
    const page = reset ? 0 : this.teamMatchesPage + 1;
    this.teamMatchesLoading = true;
    this.teamMatchesError = false;
    this.api.teamMatches(cid, tournament.id, page).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.teamMatchesRevision) {
          this.teamMatchesLoading = false;
          this.revealRequestedTeamFixture();
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: result => {
        if (revision !== this.teamMatchesRevision || this.community.id !== cid
            || this.selected?.id !== tournament.id) return;
        // Pagination can overlap after organizers edit fixtures. Preserve one row per
        // published fixture so counts, filters and deep-links remain deterministic.
        const existing = reset ? [] : this.teamMatches;
        const seenFixtureIds = new Set(existing.map(game => game.id));
        const newFixtures = result.matches.filter(game => {
          if (!Number.isSafeInteger(game.id) || game.id <= 0 || seenFixtureIds.has(game.id)) return false;
          seenFixtureIds.add(game.id);
          return true;
        });
        this.teamMatches = [...existing, ...newFixtures];
        if (reset && this.teamPhaseFilter !== 'ALL'
            && !this.teamPhases.some(stage => stage.key === this.teamPhaseFilter)) {
          this.teamPhaseFilter = 'ALL';
        }
        if (reset && this.knockoutFocusTeamId !== null
            && !this.knockoutFocusTeams.some(team => team.id === this.knockoutFocusTeamId))
          this.knockoutFocusTeamId = null;
        if (reset && this.selectedKnockoutRound !== null
            && !this.knockoutBracket.some(stage => stage.round === this.selectedKnockoutRound))
          this.selectedKnockoutRound = null;
        if (reset) {
          this.knockoutRoundLimits.clear();
          const publishedRounds = new Set(this.knockoutBracket.map(stage => stage.round));
          for (const round of this.expandedKnockoutRounds)
            if (!publishedRounds.has(round)) this.expandedKnockoutRounds.delete(round);
        }
        this.teamMatchesPage = page;
        this.teamMatchesHasMore = result.hasMore;
        // A full refresh replaces the published fixture set; discard drafts
        // for fixtures no longer present. Incremental pages keep edits intact.
        if (reset) {
          this.teamScoreDrafts = {};
          this.teamScoreTouched.clear();
          this.editingTeamResultId = null;
        }
        for (const game of newFixtures) {
          this.teamScoreDrafts[game.id] = { home: game.homeScore ?? null, away: game.awayScore ?? null };
        }
      },
      error: () => {
        if (revision !== this.teamMatchesRevision || this.community.id !== cid
            || this.selected?.id !== tournament.id) return;
        this.teamMatchesError = true;
        this.showError(t('communities.tournaments.organizerUi.teamMatchesLoadError'));
      }
    });
  }


  loadTeamStandings(): void {
    const tournament = this.selected;
    if (!tournament || tournament.entryType !== 'TEAM'
        || tournament.status === 'DRAFT' || tournament.format === 'KNOCKOUT'
        || !this.isMember) return;
    const communityId = this.community.id;
    const revision = ++this.teamStandingsRevision;
    this.teamStandingsLoading = true;
    this.teamStandingsError = false;
    this.api.teamStandings(communityId, tournament.id).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.teamStandingsRevision) {
          this.teamStandingsLoading = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: table => {
        if (revision !== this.teamStandingsRevision || this.community.id !== communityId
            || this.selected?.id !== tournament.id) return;
        this.teamStandings = table;
      },
      error: () => {
        if (revision !== this.teamStandingsRevision || this.community.id !== communityId
            || this.selected?.id !== tournament.id) return;
        this.teamStandings = undefined;
        this.teamStandingsError = true;
      }
    });
  }

  loadGroupStandings(): void {
    const tournament = this.selected;
    if (!tournament || tournament.format !== 'GROUP_KNOCKOUT'
        || tournament.status === 'DRAFT' || !this.isMember) return;
    const cid = this.community.id;
    const revision = ++this.teamGroupsRevision;
    this.teamGroupsLoading = true;
    this.teamGroupsError = false;
    this.api.teamGroups(cid, tournament.id).pipe(
      timeout(12000),
      finalize(() => {
        if (revision === this.teamGroupsRevision) {
          this.teamGroupsLoading = false;
          this.changeDetector.markForCheck();
        }
      })
    ).subscribe({
      next: groups => {
        if (revision !== this.teamGroupsRevision || this.community.id !== cid
            || this.selected?.id !== tournament.id) return;
        this.teamGroups = groups;
      },
      error: () => {
        if (revision !== this.teamGroupsRevision || this.community.id !== cid
            || this.selected?.id !== tournament.id) return;
        this.teamGroups = undefined;
        this.teamGroupsError = true;
      }
    });
  }

  // Completed scores remain compact until an organizer requests a correction.
  toggleTeamResultCorrection(match: TournamentTeamMatch): void {
    if (!this.selected || !this.canManage || this.busy
        || this.selected.entryType !== 'TEAM' || this.selected.status !== 'IN_PROGRESS'
        || match.status !== 'COMPLETED' || this.isPastKnockoutRound(match)) return;
    this.editingTeamResultId = this.editingTeamResultId === match.id ? null : match.id;
    this.teamScoreDrafts[match.id] = {
      home: match.homeScore ?? null, away: match.awayScore ?? null
    };
    this.teamScoreTouched.delete(match.id);
    this.changeDetector.markForCheck();
  }

  teamScoreUnchanged(match: TournamentTeamMatch): boolean {
    const draft = this.teamScoreDraft(match);
    return match.status === 'COMPLETED'
      && draft.home === match.homeScore && draft.away === match.awayScore;
  }

  teamScoreDraft(match: TournamentTeamMatch): { home: number | null; away: number | null } {
    return this.teamScoreDrafts[match.id]
      || { home: match.homeScore ?? null, away: match.awayScore ?? null };
  }

  setTeamScore(match: TournamentTeamMatch, side: 'home' | 'away', value: number | null): void {
    if (!this.teamScoreDrafts[match.id]) {
      this.teamScoreDrafts[match.id] = { ...this.teamScoreDraft(match) };
    }
    this.teamScoreDrafts[match.id][side] = value;
    this.teamScoreTouched.add(match.id);
  }

  isTeamScoreInvalid(match: TournamentTeamMatch): boolean {
    const score = this.teamScoreDraft(match);
    return this.teamScoreTouched.has(match.id)
      && (!this.validScore(score.home) || !this.validScore(score.away)
        || (this.isEliminationMatch(match) && score.home === score.away));
  }

  async saveTeamScore(match: TournamentTeamMatch): Promise<void> {
    if (!this.selected || !this.canManage || this.selected.entryType !== 'TEAM'
        || this.selected.status !== 'IN_PROGRESS' || this.isPastKnockoutRound(match)) return;
    const score = this.teamScoreDraft(match);
    if (this.teamScoreUnchanged(match)) return;
    if (!this.validScore(score.home) || !this.validScore(score.away)) {
      this.showError(t('communities.tournaments.organizerUi.invalidScores'));
      return;
    }
    if (this.isEliminationMatch(match) && score.home === score.away) {
      this.showError(t('communities.tournaments.organizerUi.knockoutNeedsWinner'));
      return;
    }
    await this.mutate(this.api.recordTeamResult(this.community.id, this.selected.id, match.id,
      score.home!, score.away!), t('communities.tournaments.organizerUi.teamScoreSaved'), saved => {
      this.teamMatches = this.teamMatches.map(game => game.id === saved.id ? saved : game);
      this.teamScoreDrafts[saved.id] = { home: saved.homeScore ?? null, away: saved.awayScore ?? null };
      this.teamScoreTouched.delete(saved.id);
      this.editingTeamResultId = null;
      if (this.isEliminationMatch(saved)) {
        if (saved.roundNumber === this.knockoutTotalRounds && saved.homeScore !== saved.awayScore) {
          const homeWins = saved.homeScore! > saved.awayScore!;
          this.updateSelected({
            ...this.selected!, status: 'COMPLETED',
            championTeamId: homeWins ? saved.homeTeamId : saved.awayTeamId,
            championTeamName: homeWins ? saved.homeTeamName : saved.awayTeamName,
            championTied: false, championPoints: null
          });
        }
        this.loadTeamMatches(true);
      } else if (this.isGroupKnockout) {
        this.loadGroupStandings();
        this.loadTeamMatches(true);
      } else {
        this.loadTeamStandings();
      }
    });
  }

  async publishTeamSchedule(): Promise<void> {
    const tournament = this.selected;
    if (!tournament || !this.canPublishTeamSchedule || this.confirmAction !== 'schedule') return;
    this.confirmAction = null;
    await this.mutate(this.api.generateTeamSchedule(this.community.id, tournament.id),
      t('communities.tournaments.organizerUi.teamSchedulePublished'), () => {
        this.updateSelected({ ...tournament, status: 'IN_PROGRESS' });
        this.teamMatches = [];
        this.loadDetails();
      });
  }

  async createTeamCompetition(): Promise<void> {
    const name = this.nameDraft.trim();
    if (!this.canManage || this.community.teamTournamentsEnabled === false || !this.showTeamCreate || this.busy) return;
    if (name.length < 2 || name.length > 120) {
      this.showError(t('communities.tournaments.organizerUi.invalidName'));
      return;
    }
    if (!this.sportDraft || !(SPORTS_CATALOG.includes(this.sportDraft)
        || this.communitySportOptions.includes(this.sportDraft))) {
      this.showError(t('communities.tournaments.organizerUi.invalidSport'));
      return;
    }
    if (!this.isSportFormatSupported) {
      this.showError(this.sportFormatWarning);
      return;
    }
    if (this.teamFormatDraft === 'LEAGUE'
        && this.roundRobinLegsDraft !== 1 && this.roundRobinLegsDraft !== 2) {
      this.showError(t('communities.tournaments.organizerUi.invalidLegs'));
      return;
    }
    if (!this.isRelayDraft && this.teamFormatDraft !== 'KNOCKOUT' && !this.validPointRules) {
      this.showError(t('communities.tournaments.organizerUi.invalidPoints'));
      return;
    }
    if (!this.isRelayDraft && this.teamFormatDraft !== 'KNOCKOUT'
        && !this.teamTieBreakChoices.some(choice => choice.value === this.teamTieBreakPriorityDraft)) {
      this.showError(t('communities.tournaments.organizerUi.invalidTiebreak'));
      return;
    }
    const createRequest = this.isRelayDraft
      ? this.api.createRelayChampionship(this.community.id,name,
          this.eventDisciplineDraft as 'RELAY_4X100'|'RELAY_4X400')
      : this.teamFormatDraft === 'GROUP_KNOCKOUT'
      ? this.api.createTeamTournament(this.community.id, name, this.sportDraft, null,
          this.roundRobinLegsDraft, this.pointRulesDraft, this.teamTieBreakPriorityDraft,
          this.teamFormatDraft, this.teamGroupCountDraft)
      : this.api.createTeamTournament(this.community.id, name, this.sportDraft, null,
          this.roundRobinLegsDraft, this.pointRulesDraft, this.teamTieBreakPriorityDraft,
          this.teamFormatDraft);
    await this.mutate(createRequest,
      t('communities.tournaments.organizerUi.teamCreatedCompetition'), result => {
        this.nameDraft = '';
        this.roundRobinLegsDraft = 1;
        this.teamFormatDraft = 'LEAGUE';
        this.teamGroupCountDraft = 2;
        this.teamTieBreakPriorityDraft = 'GOAL_DIFFERENCE_FIRST';
        this.resetPointRules();
        this.showTeamCreate = false;
        this.selected = undefined;
        this.selectTournament(result);
        this.tournaments = [result, ...this.tournaments.filter(item => item.id !== result.id)];
      });
  }

  async createTournamentTeam(): Promise<void> {
    // Do not check the 32-team limit against a roster that is still loading
    // or whose last refresh failed.
    if (!this.canManageTeamRoster || !this.selected
        || this.detailsLoading || this.teamsLoadError) return;
    const name = this.teamNameDraft.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 100) {
      this.showError(t('communities.tournaments.organizerUi.invalidTeamName'));
      return;
    }
    if (this.teams.length >= 32) {
      this.showError(t('communities.tournaments.organizerUi.teamLimit'));
      return;
    }
    await this.mutate(this.api.createTeam(this.community.id, this.selected.id, name),
      t('communities.tournaments.organizerUi.teamCreated'), () => { this.teamNameDraft = ''; this.loadTeams(); });
  }

  /** Only mutate a roster that is present in the currently loaded tournament. */
  private currentRosterTeam(team: TournamentTeam): TournamentTeam | undefined {
    return this.isTeamCompetition && this.selected && !this.detailsLoading && !this.teamsLoadError
      ? this.teams.find(item => item.id === team.id)
      : undefined;
  }

  async assignTeamPlayer(team: TournamentTeam): Promise<void> {
    const id = this.teamPlayerDraft[team.id];
    const current = this.currentRosterTeam(team);
    if (!this.canManageTeamRoster || !this.selected || !current
        || id == null || !Number.isInteger(id)
        || this.isTeamRosterFull(current)
        || !this.filteredTeamMembers(team.id).some(member => member.profileId === id)) return;
    await this.mutate(this.api.addTeamPlayer(this.community.id, this.selected.id, team.id, id),
      t('communities.tournaments.organizerUi.teamPlayerAdded'), () => this.loadTeams());
  }

  requestTeamPlayerRemoval(team: TournamentTeam, profileId: number): void {
    const current = this.currentRosterTeam(team);
    if (!this.canManageTeamRoster || !this.selected || !current
        || !current.players.some(player => player.profileId === profileId)) return;
    this.confirmingTeamPlayerRemoval = { teamId: team.id, profileId };
    this.confirmingEmptyTeamId = null;
  }

  requestEmptyTeamDeletion(team: TournamentTeam): void {
    const current = this.currentRosterTeam(team);
    if (!this.canManageTeamRoster || !this.selected || !current
        || current.players.length > 0) return;
    this.confirmingEmptyTeamId = team.id;
    this.confirmingTeamPlayerRemoval = null;
  }

  cancelTeamRosterConfirmation(): void {
    this.confirmingTeamPlayerRemoval = null;
    this.confirmingEmptyTeamId = null;
  }

  async removeTeamPlayer(team: TournamentTeam, profileId: number): Promise<void> {
    const current = this.currentRosterTeam(team);
    if (!this.canManageTeamRoster || !this.selected || !current
        || this.confirmingTeamPlayerRemoval?.teamId !== team.id
        || this.confirmingTeamPlayerRemoval.profileId !== profileId
        || !current.players.some(p => p.profileId === profileId)) return;
    await this.mutate(this.api.removeTeamPlayer(this.community.id, this.selected.id, team.id, profileId),
      t('communities.tournaments.organizerUi.teamPlayerRemoved'), () => this.loadTeams());
  }

  async deleteTournamentTeam(team: TournamentTeam): Promise<void> {
    const current = this.currentRosterTeam(team);
    if (!this.canManageTeamRoster || !this.selected || !current
        || current.players.length > 0 || this.confirmingEmptyTeamId !== team.id) return;
    await this.mutate(this.api.deleteTeam(this.community.id, this.selected.id, team.id),
      t('communities.tournaments.organizerUi.teamDeleted'), () => this.loadTeams());
  }

  async create(): Promise<void> {
    const name = this.nameDraft.trim();
    if (!this.canManage || this.community?.individualTournamentsEnabled === false
        || !this.showIndividualCreate || this.busy || name.length < 2 || name.length > 120) {
      this.showError(t('communities.tournaments.organizerUi.invalidName'));
      return;
    }
    if (!this.sportDraft || !(SPORTS_CATALOG.includes(this.sportDraft)
      || this.communitySportOptions.includes(this.sportDraft))) {
      this.showError(t('communities.tournaments.organizerUi.invalidSport'));
      return;
    }
    if (!this.isSportFormatSupported) {
      this.showError(t('communities.tournaments.organizerUi.individualUnsupported'));
      return;
    }
    if (!this.isRaceChampionshipDraft && !this.isInlineSpeedDraft && !this.isTimedDraft && !this.isMeasuredDraft && !this.validPointRules) {
      this.showError(t('communities.tournaments.organizerUi.invalidPoints'));
      return;
    }
    const scoringMode = this.classificationProfile.scoringMode;
    const createRequest = this.selectedSportCreationModel==='ROWING_BEST_TIME'
      ? this.api.createRowingChampionship(this.community.id,name,
          this.eventDisciplineDraft as 'SINGLE_500'|'SINGLE_1000'|'SINGLE_2000')
      : this.selectedSportCreationModel==='CANOE_BEST_TIME'
      ? this.api.createCanoeChampionship(this.community.id,name,
          this.eventDisciplineDraft as 'K1_200'|'K1_500'|'K1_1000')
      : this.selectedSportCreationModel==='TRACK_BEST_TIME'
      ? this.api.createTrackChampionship(this.community.id,name,this.eventDisciplineDraft!)
      : this.isMeasuredDraft
      ? this.api.createMeasuredChampionship(this.community.id,name,
          this.savedSportEventType as 'JUMP'|'THROW',this.eventDisciplineDraft!)
      : this.isTimedDraft
      ? this.api.createTimedChampionship(this.community.id,name,this.eventDisciplineDraft!)
      : this.isInlineSpeedDraft
      ? this.api.create(this.community.id, name, this.sportDraft,
          { winPoints: 0, drawPoints: 0, lossPoints: 0 })
      : this.isRaceChampionshipDraft
      ? (this.savedSportEventType
          ? this.api.createRaceChampionship(this.community.id, name, this.sportDraft as RaceChampionshipSport,
              this.savedSportEventType)
          : this.api.createRaceChampionship(this.community.id, name, this.sportDraft as RaceChampionshipSport))
      : scoringMode
      ? (this.savedSportEventType
          ? this.api.create(this.community.id, name, this.sportDraft, this.pointRulesDraft, scoringMode,
              this.savedSportEventType)
          : this.api.create(this.community.id, name, this.sportDraft, this.pointRulesDraft, scoringMode))
      : this.api.create(this.community.id, name, this.sportDraft, this.pointRulesDraft);
    await this.mutate(createRequest,
      t('communities.tournaments.organizerUi.competitionCreated'), result => {
      this.nameDraft = '';
      this.eventTypeDraft = null;
      this.eventDisciplineDraft = null;
      this.resetPointRules();
      this.showIndividualCreate = false;
      this.selected = undefined;
      this.selectTournament(result);
      this.tournaments = [result, ...this.tournaments.filter(item => item.id !== result.id)];
    });
  }


  async deleteSelected(): Promise<void> {
    if (!this.canManage || !this.selected || this.selected.status === 'COMPLETED'
        || this.confirmAction !== 'delete' || this.busy) return;
    const tournamentId = this.selected.id;
    this.confirmAction = null;
    await this.mutate(this.api.delete(this.community.id, tournamentId),
      t('communities.tournaments.organizerUi.competitionDeleted'), () => {
        this.selected = undefined;
        this.tournaments = this.tournaments.filter(item => item.id !== tournamentId);
        this.participants = [];
        this.matches = [];
        this.standings = undefined;
        ++this.detailRevision;
        ++this.standingsRevision;
        this.loadTournaments(true);
      });
  }

  async join(): Promise<void> {
    if (!this.selected || !this.isMember || this.selected.status !== 'DRAFT'
        || !this.rosterReady || this.detailsLoading || this.busy
        || this.myEnrollment || this.participantsHasMore) return;
    await this.mutate(this.api.join(this.community.id, this.selected.id),
      t('communities.tournaments.organizerUi.registrationUpdated'), () => this.refreshRosterAndFocus());
  }

  async leave(): Promise<void> {
    if (!this.selected || !this.isMember || this.selected.status !== 'DRAFT'
        || !this.rosterReady || this.detailsLoading || this.busy
        || !this.myEnrollment) return;
    await this.mutate(this.api.leave(this.community.id, this.selected.id),
      t('communities.tournaments.organizerUi.registrationCancelled'), () => this.refreshRosterAndFocus());
  }

  /** Avoid acting on stale player cards after a tournament/roster change. */
  private isCurrentEnrollment(participant: TournamentParticipant): boolean {
    return this.rosterReady && !this.detailsLoading && !this.busy
      && this.participants.some(current => current.profileId === participant.profileId
        && current.status === participant.status);
  }

  async confirm(participant: TournamentParticipant): Promise<void> {
    if (!this.selected || !this.canManage || this.selected.status !== 'DRAFT'
      || !this.isCurrentEnrollment(participant) || participant.status !== 'PENDING') return;
    await this.mutate(this.api.confirm(this.community.id, this.selected.id, participant.profileId),
      t('communities.tournaments.organizerUi.participantConfirmed'), () => this.refreshRosterAndFocus());
  }

  async remove(participant: TournamentParticipant): Promise<void> {
    if (!this.selected || !this.canManage || this.selected.status !== 'DRAFT'
      || !this.isCurrentEnrollment(participant)) return;
    await this.mutate(this.api.removeParticipant(this.community.id, this.selected.id, participant.profileId),
      t('communities.tournaments.organizerUi.participantRemoved'), () => this.refreshRosterAndFocus());
  }

  async publishSchedule(): Promise<void> {
    const tournament = this.selected;
    if (!tournament || !this.canPublishSchedule || this.confirmAction !== 'schedule') return;
    const tournamentId = tournament.id;
    this.confirmAction = null;
    await this.mutate(this.api.generateSchedule(this.community.id, tournamentId),
      t('communities.tournaments.individualUi.schedulePublished'), () => {
        this.updateSelected({ ...this.selected!, status: 'IN_PROGRESS' });
        this.loadDetails();
      });
  }

  async saveScore(match: TournamentMatch): Promise<void> {
    if (!this.selected || !this.canManage || this.selected.status !== 'IN_PROGRESS') return;
    const score = this.scoreDraft(match);
    if (!this.validTournamentScore(match)) {
      this.showError(this.isChessTournament
        ? t('communities.tournaments.individualUi.chessInvalidToast')
        : t('communities.tournaments.individualUi.scoresInvalidToast'));
      return;
    }
    await this.mutate(
      this.api.recordResult(this.community.id, this.selected.id, match.id, score.home!, score.away!),
      t('communities.tournaments.individualUi.resultSaved'), saved => {
        // Keep the already-loaded fixture pages visible, including distant rounds.
        this.matches = this.matches.map(game => game.id === saved.id ? saved : game);
        this.scoreDrafts[saved.id] = { home: saved.homeScore, away: saved.awayScore };
        this.scoreTouched.delete(saved.id);
        this.refreshStandings();
      }
    );
  }

  async completeTeam(): Promise<void> {
    if (!this.selected || !this.canCompleteTeam || this.confirmAction !== 'completeTeam') return;
    const tournamentId = this.selected.id;
    this.confirmAction = null;
    await this.mutate(this.api.completeTeam(this.community.id, tournamentId),
      t('communities.tournaments.organizerUi.teamCompetitionCompleted'), tournament => {
        this.updateSelected(tournament);
        this.loadDetails();
      });
  }

  async complete(): Promise<void> {
    if (!this.selected || !this.canManage || !this.canComplete || this.confirmAction !== 'complete') return;
    const tournamentId = this.selected.id;
    this.confirmAction = null;
    await this.mutate(this.api.complete(this.community.id, tournamentId),
      t('communities.tournaments.organizerUi.individualCompetitionCompleted'), tournament => {
        this.updateSelected(tournament);
        this.loadDetails();
      });
  }

  private refreshStandings(): void {
    const tournament = this.selected;
    if (!tournament || !this.isMember) return;
    const communityId = this.community.id;
    const revision = ++this.standingsRevision;
    this.api.standings(communityId, tournament.id).pipe(timeout(12000)).subscribe({
      next: table => {
        if (revision === this.standingsRevision && this.community.id === communityId
            && this.selected?.id === tournament.id) {
          this.standings = table;
          this.changeDetector.markForCheck();
        }
      },
      error: () => {
        if (revision === this.standingsRevision && this.community.id === communityId
            && this.selected?.id === tournament.id) {
          this.standings = undefined;
          this.showError(t('communities.tournaments.organizerUi.standingsRefreshError'));
        }
      }
    });
  }

  private updateSelected(tournament: CommunityTournament): void {
    this.selected = tournament;
    this.tournaments = this.tournaments.map(item => item.id === tournament.id ? tournament : item);
  }

  private async mutate<T>(operation: Observable<T>, success: string, after: (result: T) => void): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.feedback = '';
    const cid = this.community.id, tid = this.selected?.id;
    const mutationRevision = ++this.mutationRevision;
    try {
      const result = await firstValueFrom(operation.pipe(timeout(12000)));
      if (mutationRevision !== this.mutationRevision || this.community.id !== cid
          || (tid !== undefined && this.selected?.id !== tid)) return;
      after(result);
      // Selection of a newly created tournament clears old notices: set the
      // current operation's success message only after switching views.
      this.feedback = success;
    } catch (error: any) {
      if (mutationRevision !== this.mutationRevision || this.community.id !== cid
          || (tid !== undefined && this.selected?.id !== tid)) return;
      const detail: unknown = error?.error?.detail || error?.error?.message;
      const safeDetail = typeof detail === 'string' && detail.trim().length > 0
        && detail.length <= 180 ? detail : null;
      // Keep the detailed server response for PT. In EN, never surface an
      // untranslated arbitrary backend string. The known completion conflict
      // keeps its exact meaning in either language.
      const knownConflict = safeDetail?.trim() === 'Todos os confrontos da liga precisam de estar concluídos';
      const english = typeof localStorage !== 'undefined'
        && localStorage.getItem('d24-language') === 'en';
      this.showError(knownConflict
        ? t('communities.tournaments.organizerUi.completeAllMatches')
        : (!english && safeDetail ? safeDetail
          : t('communities.tournaments.organizerUi.mutationFallback')));
    } finally {
      if (mutationRevision === this.mutationRevision) {
        this.busy = false;
        this.changeDetector.markForCheck();
      }
    }
  }

  formatStatus(status: string): string {
    switch (status) {
      case 'DRAFT': return t('communities.tournaments.individualUi.statusDraft');
      case 'IN_PROGRESS': return t('communities.tournaments.individualUi.statusInProgress');
      case 'COMPLETED': return t('communities.tournaments.individualUi.statusCompleted');
      case 'PENDING': return t('communities.tournaments.individualUi.statusPending');
      case 'CONFIRMED': return t('communities.tournaments.individualUi.statusConfirmed');
      case 'SCHEDULED': return t('communities.tournaments.individualUi.statusScheduled');
      default: return status;
    }
  }

  playerLabel(row: TournamentStandingRow): string {
    return row.displayName || row.username;
  }
}
