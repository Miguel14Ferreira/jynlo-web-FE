import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { JwtHelperService } from '@auth0/angular-jwt';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, firstValueFrom, Observable, retry, timeout, Subscription, TimeoutError } from 'rxjs';
import { appTranslate as t } from '../../i18n/i18n.service';
import { environment } from 'src/environment/environment';
import { communityAvatarUploadError } from './community-avatar-upload';
import { communityComparisonLookup } from './community-player-comparison';
import {
  avatarCanvasPosition, clampAvatarOffset, communityAvatarCrop,
  CommunityAvatarCrop, COMMUNITY_COVER_WIDTH, COMMUNITY_COVER_HEIGHT
} from './community-avatar-crop';
import { buildCommunityGroupInviteUrl, buildWhatsAppGroupShareUrl } from './community-group-invite';
import { communityRoundMatchup, CommunityRoundMatchup } from './community-round-matchup';
import { historicalMatchReviewFlags } from './community-historical-match-review';
import { importDiagnosticLabel as localizedImportDiagnostic, importHttpErrorLabel } from './community-import-diagnostic';
import { sportForRound, formatForSport, CommunityRoundView } from './community-round-sport';
import { eventOptionsForSport, eventView, isNeutralEvent, eventPresentationFormat,
  isInlineSpeedTimedEvent, isDiscontinuedInlineFinalB, CommunityEventType } from './community-round-event-type';
import { athleticsDisciplineOptions, athleticsDisciplineValid } from './community-field-disciplines';
import { breakingBattleError } from './community-breaking-battle';
import { trackSprintHeatError, trackSprintPlacesError } from './community-track-sprint-results';
import { trackSprintSeriesStatus } from './community-track-sprint-series';
import { availableSprintQualifiers, nextSprintRoundHeatMax } from './community-track-sprint-qualified16';
import { sprintQualificationTieGroups, emptySprintTieDraft, sprintOfficialTieDecisions,
  SprintQualificationTieGroup, SprintTieDraft } from './community-track-sprint-official-ties';
import { availableSprintBracketSlots, nextSprintBracketHeatNumber } from './community-track-sprint-bracket-picker';
import { cricketT20Error, cricketOvers } from './community-cricket-results';
import { chessGameError, chessGameScore } from './community-chess-results';
import { judoBoutError, isJudoBout } from './community-judo-results';
import { karateBoutError, isKarateEvent, isKarateKumite } from './community-karate-results';
import { isBjjEvent, isBjjPoints, bjjResultError } from './community-bjj-results';
import { isBoxingEvent, boxingResultError } from './community-boxing-results';
import { isMuayThaiEvent, muayThaiResultError } from './community-muay-thai-results';
import { isKickboxingEvent, isKickboxingPointFighting, kickboxingResultError }
  from './community-kickboxing-results';
import { isTaekwondoKyorugi, isTaekwondoEvent, taekwondoResultError }
  from './community-taekwondo-results';
import { isVolleyballEvent, isFootvolleyEvent, volleyballMaxSets, volleyballMinSets,
  volleyballMatchError, volleyballSetWinner, volleyballSetTotals,
  volleyballSideLabelKey, volleyballMemberSelectorKey,
  volleyballFormatHint, volleyballResultTitle, recordedVolleyballMatch } from './community-volleyball-results';
import { isTeamFinalEvent, teamFinalError, recordedTeamFinal, teamFinalWinner,
  teamFinalUsesGoals, teamFinalTitleKey, teamFinalHintKey,
  teamFinalUsesRuns, teamFinalScoreLabelKey, teamFinalMaxScore,
  teamFinalSideLabelKey } from './community-team-final-results';
import { isBasketballFinal, basketballScoreError,
  recordedBasketballFinal, basketballWinner } from './community-basketball-results';
import { isGroupRoutineEvent, routineGroupNames, routineGroupError,
  sortedRoutineGroups, routineGroupPlace, routineGroupMembers } from './community-group-routine-results';
import { raceSupportsLaps, formatRaceSeconds, raceEntryValidationError, roadTimeTrialEntryInvalid } from './community-race-metrics';
import { swimmingTimeError, formatSwimTime } from './community-swimming-results';
import { isInlineSpeedHeatEvent, isInlineSpeedFinalHeat, inlineSpeedHeatError,
  inlineSpeedCandidatePlace, inlineSpeedFirstHeatTooLarge } from './community-inline-speed-heats';
import { openWaterTimeError, formatOpenWaterTime } from './community-open-water-results';
import { orienteeringTimeError, formatOrienteeringTime } from './community-orienteering-results';
import { raceDecisionError } from './community-race-decisions';
import { raceRankingGroupsForCommunity } from './community-race-ranking-groups';
import { hasRecordedSeasonChampion } from './community-season-trophies.component';
import { performanceKind, performanceError, eventPerformanceEntries,
  eventPerformancePlace, performanceDisplay, surfWaveError, surfWaveTotal,
  isWaveHeatEvent } from './community-performance-results';
import { racketSupportsSets, racketUsesPointsPerSet, racketMatchWinner, recordedRacketMatch } from './community-racket-results';

import {
  CommunityCompetitionOverview,
  CommunityGroup,
  CommunityInvite,
  CommunityMatchResult,
  CommunityRole,
  CommunitySeason,
  CommunityRound,
  CommunityRoundEntry,
  CommunityRoundEntryDraft,
  CommunityStanding,
  CommunityRacketStandingGroup,
  CommunityRaceStandingGroup
} from '../model/community-group';
import {
  CommunityGroupsService,
  CommunityImportDiagnostic,
  CommunityJoinRequest,
  CommunitySearchPresentation,
  HistoricalStandingPreview,
  HistoricalStandingSummary,
  HistoricalStandingArchive,
  HistoricalMatchPreview,
  HistoricalMatchArchive,
  HistoricalMatchArchiveSummary,
  HistoricalPlayerCandidate,
  HistoricalPlayerLink,
  TrackSprintBracketOverview,
  TrackSprintBracketMatch,
  TrackSprintIncident,
  TrackSprintOfficialReview
} from '../../services/community-groups.service';
import { CommunityService } from '../../services/community.service';
import { CommunityTournamentsService } from '../../services/community-tournaments.service';
import { SessionService } from '../../services/session.service';
import { CommunityTimelineService, CommunityTimelineEntry, CommunityTimelineKind } from '../../services/community-timeline.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { ChatTypingTracker } from '../../services/chat-typing-tracker';
import { chatContinuesGroup, chatDaySeparator } from '../../shared/chat-thread-presentation';
import { ChatReadSyncService } from '../../services/chat-read-sync.service';
import { CommunityProfile } from '../model/community-profile';
import { SessionSummary } from '../model/session-summary';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';

type CommunityTab = 'home' | 'feed' | 'chat' | 'sessions' | 'tournaments' | 'ranking' | 'stats' | 'members';

@Component({
  selector: 'app-communities',
  templateUrl: './communities.component.html',
  styleUrls: ['./communities.component.css', './communities-concept-one-premium.css', './communities-neon-glass.css', './communities-v3-finish.css', './communities-owned-cards.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class CommunitiesComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('communitySearchSection') communitySearchSection?: ElementRef<HTMLElement>;
  @ViewChild('communityChatLog') communityChatLog?: ElementRef<HTMLElement>;
  @ViewChild('communityComposer') communityComposer?: ElementRef<HTMLTextAreaElement>;
  private readonly realtimeService = inject(DirectChatRealtimeService);
  readonly typing = new ChatTypingTracker(this.realtimeService);
  private readonly readSync = inject(ChatReadSyncService);
  private readonly tournamentCatalog = inject(CommunityTournamentsService);
  private readonly chatSubscriptions = new Subscription();
  private readonly jwtHelper = new JwtHelperService();

  private readonly sessionDateFormatter = new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  private readonly roundDateFormatter = new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'medium'
  });

  communities: CommunityGroup[] = [];
  invites: CommunityInvite[] = [];
  selected?: CommunityGroup;
  speedTournamentPresent = false;
  private speedTournamentLookupVersion = 0;
  readonly sportsCatalog = SPORTS_CATALOG;
  readonly importDiagnosticLabel = localizedImportDiagnostic;
  sportsDraft: string[] = [];
  sportsSearch = '';
  editingSports = false;
  savingSports = false;
  sportsMessage = '';
  competition?: CommunityCompetitionOverview;
  sprintBrackets: TrackSprintBracketOverview[] = [];
  sprintBracketNameDraft = '';
  sprintBracketFormatDraft: 'EIGHT_RIDER_FINALS' | 'SIXTEEN_RIDER_1_8' | 'TWENTY_EIGHT_RIDER_1_16' | 'OLYMPIC_TWENTY_FOUR_REPECHAGE' = 'EIGHT_RIDER_FINALS';
  sprintBracketQualifyingRoundIdDraft: number | null = null;
  sprintTieDrafts: Record<string, SprintTieDraft> = {};
  deletingSprintBracketId: number | null = null;
  sprintBracketSaving = false;
  sprintBracketLoading = false;
  sprintBracketError = '';
  sprintIncidentSaving = false;
  sprintIncidentSeriesKey: string | null = null;
  sprintIncidentBracketId: number | null = null;
  sprintIncidentType: TrackSprintIncident['incidentType'] = 'OTHER';
  sprintIncidentDetails = '';
  sprintDecisionIncidentId: number | null = null;
  sprintDecisionBracketId: number | null = null;
  sprintDecisionType: 'RESTART_REQUIRED' | 'OFFICIAL_RESULT_TO_RECORD' | 'DISCIPLINARY_RULING' | 'UNINTENTIONAL_FALL' | 'PRE_SPRINT_RESTART' = 'RESTART_REQUIRED';
  sprintDecisionSanction: 'WARNING' | 'RELEGATION' | 'DISQUALIFICATION' = 'WARNING';
  sprintDecisionSanctionedUsername = '';
  sprintDecisionReference = '';
  sprintDecisionReason = '';
  sprintFlagrantOffender = '';
  sprintFlagrantSanction: '' | 'NONE' | 'RELEGATION' | 'DISQUALIFICATION' = '';
  sprintFlagrantCutoffConfirmed = false;
  sprintFlagrantStarterConfirmed = false;
  sprintFlagrantStartBracketId: number | null = null;
  sprintFlagrantStartIncidentId: number | null = null;
  sprintFlagrantStartPosition: '' | 'INSIDE' | 'OUTSIDE' = '';
  sprintFlagrantStartChoiceConfirmed = false;
  sprintFlagrantStartReference = '';
  sprintFlagrantStartReason = '';
  sprintRerunIncidentId: number | null = null;
  sprintRerunBracketId: number | null = null;
  sprintRerunOrder: string[] = ['', ''];
  sprintRerunReference = '';
  sprintRerunReason = '';
  sprintNeutralBracketId: number | null = null;
  sprintNeutralIncidentId: number | null = null;
  sprintNeutralReference = '';
  sprintNeutralReason = '';
  sprintNeutralNoFaultConfirmed = false;
  sprintNeutralOrderConfirmed = false;
  sprintFaultBracketId: number | null = null;
  sprintFaultIncidentId: number | null = null;
  sprintFaultRider = '';
  sprintFaultStartPosition: '' | 'INSIDE' | 'OUTSIDE' = '';
  sprintFaultReference = '';
  sprintFaultReason = '';
  sprintFaultChoiceConfirmed = false;
  sprintPreSprintBeforeConfirmed = false;
  sprintPreSprintStoppedConfirmed = false;
  sprintPositionsBracketId: number | null = null;
  sprintPositionsIncidentId: number | null = null;
  sprintPositionsFirstRider = '';
  sprintPositionsSecondRider = '';
  sprintPositionsReference = '';
  sprintPositionsReason = '';
  sprintPositionsPanelConfirmed = false;
  sprintAwardBracketId: number | null = null;
  sprintAwardIncidentId: number | null = null;
  sprintAwardWinner = '';
  sprintAwardReference = '';
  sprintAwardReason = '';
  sprintIncidentError = '';
  private sprintReviewContext = '';
  sprintReviewBracketId: number | null = null;
  sprintReviewIncidentId: number | null = null;
  sprintReviewHistory: TrackSprintOfficialReview[] = [];
  sprintReviewLoading = false;
  sprintReviewSaving = false;
  sprintReviewError = '';
  sprintReviewMode: 'REQUEST' | 'DECIDE' | 'RECTIFY' = 'REQUEST';
  sprintReviewPresident = '';
  sprintReviewReference = '';
  sprintReviewPanelReference = '';
  sprintReviewReason = '';
  sprintReviewJudgeRefereeConfirmed = false;
  sprintReviewOutcome: '' | 'UPHELD' | 'OVERTURNED' = '';
  sprintReviewSanctionAnnulledConfirmed = false;
  sprintReviewRiderOrderConfirmed = false;
  sprintReviewNextHeatNumber: number | null = null;
  sprintInterruptionBracketId: number | null = null;
  sprintInterruptionReference = '';
  sprintInterruptionReason = '';
  sprintInterruptionConfirmed = false;
  sprintInterruptionSaving = false;
  sprintInterruptionError = '';
  private sprintBracketRequestVersion = 0;
  sportPointsEditor: string | null = null;
  sportPointsDraft = { winPoints: 3, drawPoints: 1, lossPoints: 0 };
  sportPointsSaving = false;
  sportPointsError = '';
  sportPointsSuccess = '';
  raceRuleSport: string | null = null;
  raceRulePoints = '25,18,15,12,10,8,6,4,2,1';
  raceRuleSaving = false;
  raceRuleError = '';
  raceRuleMessage = '';
  racePenaltyEditorKey: string | null = null;
  racePenaltyPoints = 0;
  racePenaltyReason = '';
  racePenaltySaving = false;
  racePenaltyError = '';
  racePenaltyMessage = '';
  raceDecisionEditorKey: string | null = null;
  raceDecisionTimeSeconds = 0;
  raceDecisionDisqualified = false;
  raceDecisionReason = '';
  raceDecisionSaving = false;
  raceDecisionError = '';
  raceDecisionMessage = '';
  racketRuleEditorKey: string | null = null;
  racketRuleWinPoints = 2;
  racketRuleLossPoints = 0;
  racketRuleTieBreak: 'SETS_FIRST' | 'SCORE_FIRST' = 'SETS_FIRST';
  racketRuleSaving = false;
  racketRuleError = '';
  racketRuleMessage = '';
  maxStandingPoints = 0;
  topGoalsStanding?: CommunityStanding;
  topAssistsStanding?: CommunityStanding;
  topMvpsStanding?: CommunityStanding;
  topCleanSheetsStanding?: CommunityStanding;
  mostGamesStanding?: CommunityStanding;
  bestWinRateStanding?: CommunityStanding;
  bestWinStreakStanding?: CommunityStanding;
  standingsByComparisonKey = new Map<string, CommunityStanding>();
  activeCommunitySeason?: CommunitySeason;
  communityTrophies: CommunitySeason[] = [];
  communitySessions: SessionSummary[] = [];
  recordedCommunitySessionIds = new Set<number>();
  sessionResultSession?: SessionSummary;
  sessionResultPlayers: Array<{ username: string; included: boolean; team: 'A' | 'B' | '' }> = [];
  sessionResultWinner: 'A' | 'B' | 'DRAW' | '' = '';
  sessionResultLoading = false;
  sessionResultSaving = false;
  sessionResultError = '';
  sessionResultSuccess = '';
  private sessionResultRevision = 0;
  isDetailMode = false;

  loading = false;
  saving = false;
  competitionLoading = false;
  sessionsLoading = false;
  openingSessionId?: number;
  joiningSessionId?: number;
  competitionSaving = false;
  roundSaving = false;
  errorMessage = '';

  activeTab: CommunityTab = 'home';
  timelineEntries: CommunityTimelineEntry[] = [];
  timelineLoading = false;
  timelineSending = false;
  timelineDeletingId: number | null = null;
  timelineError = '';
  feedDraft = '';
  feedImageFile?: File;
  feedVideoFile?: File;
  feedImagePreview = '';
  feedVideoPreview = '';
  chatDraft = '';
  replyingToCommunityMessage: CommunityTimelineEntry | null = null;
  chatRealtimeConnected = false;
  chatEverConnected = false;
  chatDeliveryUncertain = false;
  chatDeliveryChecking = false;
  chatOlderLoading = false;
  chatHasOlder = false;
  chatOlderError = '';
  private chatScrollRestore?: { top: number; height: number };
  private pendingChatDelivery?: { communityId: number; text: string; replyToMessageId: number | null; ids: Set<number>; at: number };
  private chatScrollRequested = false;
  newMessagesPending = 0;
  private timelineRequestVersion = 0;
  private chatEventsDuringLoad = new Map<number, CommunityTimelineEntry>();

  private currentChatUsername(): string | null {
    try {
      const token = localStorage.getItem('t');
      return token ? this.jwtHelper.decodeToken(token)?.sub ?? null : null;
    } catch { return null; }
  }

  chatDayLabelAt(index: number): string {
    const current = this.timelineEntries[index];
    return current ? chatDaySeparator(current.createdAt,
      index > 0 ? this.timelineEntries[index - 1].createdAt : null) : '';
  }

  chatContinuesGroupAt(index: number): boolean {
    if (index <= 0) return false;
    const current = this.timelineEntries[index], previous = this.timelineEntries[index - 1];
    return current.kind === 'CHAT' && previous.kind === 'CHAT'
      && chatContinuesGroup(current.username, current.createdAt,
        previous.username, previous.createdAt);
  }

  isMyChatEntry(entry: CommunityTimelineEntry): boolean {
    const username = this.currentChatUsername();
    return Boolean(username && username.toLowerCase() === entry.username.toLowerCase());
  }

  private nearChatBottom(): boolean {
    const el = this.communityChatLog?.nativeElement;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
  }

  ngAfterViewChecked(): void {
    if (this.chatScrollRestore && this.communityChatLog?.nativeElement) {
      const el = this.communityChatLog.nativeElement;
      el.scrollTop = this.chatScrollRestore.top + el.scrollHeight - this.chatScrollRestore.height;
      this.chatScrollRestore = undefined;
      return;
    }
    if (this.chatScrollRequested && this.activeTab === 'chat' && this.communityChatLog?.nativeElement) {
      this.communityChatLog.nativeElement.scrollTop = this.communityChatLog.nativeElement.scrollHeight;
      this.chatScrollRequested = false;
      this.newMessagesPending = 0;
    }
    this.markVisibleCommunityChatRead();
  }

  @HostListener('window:scroll')
  @HostListener('window:focus')
  @HostListener('document:visibilitychange')
  onCommunityChatScroll(): void {
    if (this.activeTab === 'chat' && this.nearChatBottom()) this.newMessagesPending = 0;
    this.markVisibleCommunityChatRead();
  }

  jumpToLatestMessages(): void {
    if (this.activeTab !== 'chat') return;
    const log = this.communityChatLog?.nativeElement;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
    this.newMessagesPending = 0;
    this.markVisibleCommunityChatRead();
  }

  private markVisibleCommunityChatRead(): void {
    // Never mark a community feed post as a chat message. Only the opened
    // community chat tab with an authorized, successfully loaded log counts.
    if (!this.selected || this.activeTab !== 'chat' || this.timelineLoading || this.timelineError
        || this.timelineEntries.length === 0) return;
    const highestId = this.timelineEntries.reduce((max, entry) =>
      entry.kind === 'CHAT' ? Math.max(max, entry.id) : max, 0);
    this.readSync.markVisible('community', this.selected.id,
      highestId, this.communityChatLog?.nativeElement);
  }

  ngOnDestroy(): void {
    this.clearCommunityFeedImage();
    this.clearCommunityFeedVideo();
    this.resetCommunityAvatarCrop();
    this.typing.destroy();
    this.chatSubscriptions.unsubscribe();
  }

  private sortChatEntries(entries: CommunityTimelineEntry[]): CommunityTimelineEntry[] {
    return [...entries].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  }

  loadOlderCommunityMessages(): void {
    if (!this.selected || this.activeTab !== 'chat' || this.chatOlderLoading
        || !this.chatHasOlder || !this.timelineEntries.length) return;
    const communityId = this.selected.id;
    const oldestId = this.timelineEntries[0].id;
    const el = this.communityChatLog?.nativeElement;
    const before = el ? { top: el.scrollTop, height: el.scrollHeight } : undefined;
    this.chatOlderLoading = true;
    this.chatOlderError = '';
    this.timelineService.olderMessages(communityId, oldestId)
      .pipe(timeout(10_000), finalize(() => { this.chatOlderLoading = false; }))
      .subscribe({
        next: entries => {
          if (this.selected?.id !== communityId || this.activeTab !== 'chat') return;
          const byId = new Map(this.timelineEntries.map(entry => [entry.id, entry]));
          for (const entry of entries) byId.set(entry.id, entry);
          this.timelineEntries = this.sortChatEntries([...byId.values()]);
          this.chatHasOlder = entries.length === 60;
          if (before) this.chatScrollRestore = before;
        },
        error: () => {
          if (this.selected?.id === communityId) this.chatOlderError = t('chat.olderError');
        }
      });
  }

  private mergeChatEntries(entries: CommunityTimelineEntry[], follow = false): void {
    const byId = new Map(this.timelineEntries.map(item => [item.id, item]));
    for (const entry of entries) byId.set(entry.id, entry);
    this.timelineEntries = this.sortChatEntries([...byId.values()]);
    if (follow) {
      this.newMessagesPending = 0;
      this.chatScrollRequested = true;
    }
    if (this.chatDeliveryUncertain && this.timelineEntries.some(item => this.matchesPendingChatDelivery(item))) {
      this.confirmChatDelivery();
    }
  }

  onCommunityChatRealtime(entry: CommunityTimelineEntry): void {
    if (!this.selected || this.activeTab !== 'chat' || entry.kind !== 'CHAT'
        || entry.communityId !== this.selected.id) return;
    const follow = this.nearChatBottom() || this.isMyChatEntry(entry);
    // Ignore replayed websocket IDs for the prompt; the history merge still
    // deduplicates and validates uncertain POSTs.
    if (!follow && !this.timelineEntries.some(previous => previous.id === entry.id))
      this.newMessagesPending++;
    if (this.timelineLoading) this.chatEventsDuringLoad?.set(entry.id, entry);
    this.mergeChatEntries([entry], follow);
  }

  replyToCommunityMessage(entry: CommunityTimelineEntry): void {
    if (this.activeTab !== 'chat' || !this.selected || entry.kind !== 'CHAT'
        || entry.communityId !== this.selected.id || this.timelineSending || this.chatDeliveryUncertain) return;
    this.replyingToCommunityMessage = entry;
    this.communityComposer?.nativeElement.focus({ preventScroll: true });
  }

  cancelCommunityReply(): void {
    if (!this.timelineSending && !this.chatDeliveryUncertain) this.replyingToCommunityMessage = null;
  }

  private matchesPendingChatDelivery(entry: CommunityTimelineEntry): boolean {
    const pending = this.pendingChatDelivery;
    if (!pending || entry.kind !== 'CHAT' || entry.communityId !== pending.communityId
        || pending.ids.has(entry.id) || !this.isMyChatEntry(entry) || entry.body !== pending.text) return false;
    const date = Date.parse(entry.createdAt);
    return Number.isFinite(date) && date >= pending.at - 60_000
      && (entry.replyToMessageId ?? null) === pending.replyToMessageId;
  }

  private confirmChatDelivery(): void {
    this.chatDeliveryUncertain = false;
    this.pendingChatDelivery = undefined;
    this.typing?.stop();
    this.chatDraft = '';
    this.replyingToCommunityMessage = null;
    this.timelineError = '';
    this.chatScrollRequested = true;
  }

  verifyCommunityChatDelivery(): void {
    if (!this.chatDeliveryUncertain || this.chatDeliveryChecking || !this.pendingChatDelivery) return;
    const id = this.pendingChatDelivery.communityId;
    if (this.selected?.id !== id || this.activeTab !== 'chat') return;
    if (this.timelineEntries.some(item => this.matchesPendingChatDelivery(item))) {
      this.confirmChatDelivery();
      return;
    }
    this.chatDeliveryChecking = true;
    this.timelineService.list(id, 'CHAT')
      .pipe(timeout(10_000), finalize(() => { this.chatDeliveryChecking = false; }))
      .subscribe({
        next: items => {
          if (this.selected?.id !== id || this.activeTab !== 'chat') return;
          this.mergeChatEntries(items, this.nearChatBottom());
          if (this.chatDeliveryUncertain) this.timelineError = t('chat.sendUnconfirmed');
        },
        error: () => { if (this.selected?.id === id) this.timelineError = t('chat.verifyUnavailable'); }
      });
  }

  resumeCommunityChatAfterUncertainSend(): void {
    if (this.chatDeliveryChecking) return;
    this.pendingChatDelivery = undefined;
    this.chatDeliveryUncertain = false;
    this.timelineError = t('chat.sendRetryWarning');
  }

  onTypingInput(): void {
    if (this.selected && this.activeTab === 'chat')
      this.typing.input('community', this.selected.id, this.chatDraft,
        !this.timelineSending && !this.chatDeliveryUncertain);
  }

  onCommunityChatEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.isComposing || keyboard.keyCode === 229) return;
    if (keyboard.key === 'Escape') {
      if (this.replyingToCommunityMessage && !this.timelineSending && !this.chatDeliveryUncertain) {
        keyboard.preventDefault();
        this.cancelCommunityReply();
      }
      return;
    }
    if (keyboard.key !== 'Enter' || keyboard.shiftKey || keyboard.ctrlKey || keyboard.altKey || keyboard.metaKey) return;
    keyboard.preventDefault();
    if (!this.timelineSending && !this.chatDeliveryUncertain && this.chatDraft.trim()) this.sendTimeline();
  }

  private isUncertainChatError(error: unknown): boolean {
    return error instanceof TimeoutError
      || error instanceof HttpErrorResponse
      && (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500);
  }

  get timelineKind(): CommunityTimelineKind {
    return this.activeTab === 'chat' ? 'CHAT' : 'POST';
  }

  /** Community feed identity mirrors the main feed without exposing private member data. */
  communityFeedAuthorName(username: string): string {
    const member = this.selected?.members?.find(
      item => item.username.toLowerCase() === username.toLowerCase());
    return member?.fullName?.trim() || username;
  }

  communityFeedInitials(username: string): string {
    const parts = this.communityFeedAuthorName(username).split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts)
      .map(part => part.charAt(0).toUpperCase()).join('').slice(0, 2);
  }

  communityFeedAvatar(username: string): string | null {
    const pic = this.selected?.members?.find(
      item => item.username.toLowerCase() === username.toLowerCase())?.profilePicUrl;
    if (!pic) return null;
    if (/^(https?:\/\/|data:image\/)/i.test(pic)) return pic;
    return environment.apiUrl + (pic.startsWith('/') ? pic : '/' + pic);
  }

  canDeleteCommunityPost(entry: CommunityTimelineEntry): boolean {
    return entry.kind === 'POST' && (this.canManage() || this.isMyChatEntry(entry));
  }

  get canPublishCommunityPost(): boolean {
    return !!(this.feedDraft.trim() || this.feedImageFile || this.feedVideoFile)
      && !this.timelineSending;
  }

  communityFeedMediaUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return environment.apiUrl + (path.startsWith('/') ? path : '/' + path);
  }

  onCommunityFeedImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.timelineError = t('communities.timelineInvalidImage');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.timelineError = t('communities.timelineImageTooLarge');
      return;
    }
    this.clearCommunityFeedVideo();
    this.clearCommunityFeedImage();
    this.feedImageFile = file;
    this.feedImagePreview = URL.createObjectURL(file);
    this.timelineError = '';
  }

  onCommunityFeedVideoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['video/mp4', 'video/webm'].includes(file.type)) {
      this.timelineError = t('communities.timelineInvalidVideo');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.timelineError = t('communities.timelineVideoTooLarge');
      return;
    }
    this.clearCommunityFeedImage();
    this.clearCommunityFeedVideo();
    this.feedVideoFile = file;
    this.feedVideoPreview = URL.createObjectURL(file);
    this.timelineError = '';
  }

  clearCommunityFeedImage(): void {
    if (this.feedImagePreview) URL.revokeObjectURL(this.feedImagePreview);
    this.feedImageFile = undefined;
    this.feedImagePreview = '';
  }

  clearCommunityFeedVideo(): void {
    if (this.feedVideoPreview) URL.revokeObjectURL(this.feedVideoPreview);
    this.feedVideoFile = undefined;
    this.feedVideoPreview = '';
  }



  loadTimeline(): void {
    if (!this.selected || (this.activeTab !== 'feed' && this.activeTab !== 'chat')) return;
    const communityId = this.selected.id;
    const kind = this.timelineKind;
    const version = ++this.timelineRequestVersion;
    this.timelineLoading = true;
    if (kind === 'CHAT') this.chatEventsDuringLoad?.clear();
    this.timelineError = '';
    this.timelineService.list(communityId, kind)
      .pipe(timeout(10_000), finalize(() => {
        if (version === this.timelineRequestVersion) this.timelineLoading = false;
      }))
      .subscribe({
        next: entries => {
          if (version === this.timelineRequestVersion && this.selected?.id === communityId
              && this.timelineKind === kind) {
            if (kind === 'CHAT') {
              // HTTP history is authoritative, including moderators' deletions.
              // Preserve only websocket messages received while the HTTP request ran.
              const follow = this.timelineEntries.length === 0 || this.nearChatBottom();
              const previouslySeen = new Set(this.timelineEntries.map(entry => entry.id));
              const byId = new Map(entries.map(entry => [entry.id, entry]));
              for (const entry of this.chatEventsDuringLoad?.values() ?? []) byId.set(entry.id, entry);
              this.timelineEntries = this.sortChatEntries([...byId.values()]);
              if (!follow && previouslySeen.size) this.newMessagesPending += entries.filter(
                entry => entry.kind === 'CHAT' && !previouslySeen.has(entry.id)
                  && !this.isMyChatEntry(entry) && !this.chatEventsDuringLoad?.has(entry.id)).length;
              if (follow) this.newMessagesPending = 0;
              this.chatHasOlder = this.chatHasOlder || entries.length === 60;
              this.chatEventsDuringLoad?.clear();
              if (follow) this.chatScrollRequested = true;
              if (this.chatDeliveryUncertain
                  && this.timelineEntries.some(entry => this.matchesPendingChatDelivery(entry))) {
                this.confirmChatDelivery();
              }
            } else this.timelineEntries = entries;
          }
        },
        error: () => {
          if (version === this.timelineRequestVersion) this.timelineError = t('communities.timelineLoadError');
        }
      });
  }

  sendTimeline(): void {
    if (this.activeTab === 'chat') this.typing?.stop();
    if (!this.selected || this.timelineSending ||
        (this.activeTab !== 'feed' && this.activeTab !== 'chat') ||
        (this.activeTab === 'chat' && this.chatDeliveryUncertain)) return;
    const kind = this.timelineKind;
    const communityId = this.selected.id;
    const text = kind === 'CHAT' ? this.chatDraft.trim() : this.feedDraft.trim();
    const max = kind === 'CHAT' ? 2000 : 1000;
    if ((!text && (kind === 'CHAT' || !this.feedImageFile && !this.feedVideoFile))
        || text.length > max) return;
    this.timelineSending = true;
    this.timelineError = '';
    const replyId = kind === 'CHAT' ? this.replyingToCommunityMessage?.id ?? null : null;
    if (kind === 'CHAT') this.communityComposer?.nativeElement.focus({ preventScroll: true });
    const pending = kind === 'CHAT'
      ? { communityId, text, replyToMessageId: replyId,
          ids: new Set(this.timelineEntries.map(entry => entry.id)), at: Date.now() }
      : undefined;
    const send = kind === 'POST' && (this.feedImageFile || this.feedVideoFile)
      ? this.timelineService.sendPostWithMedia(
          communityId, text, this.feedImageFile, this.feedVideoFile)
      : replyId
        ? this.timelineService.send(communityId, kind, text, replyId)
        : this.timelineService.send(communityId, kind, text);
    send
      .pipe(timeout(kind === 'POST' && (this.feedImageFile || this.feedVideoFile) ? 90_000 : 10_000),
        finalize(() => this.timelineSending = false))
      .subscribe({
        next: entry => {
          if (this.selected?.id !== communityId) return;
          if (kind === 'CHAT') {
            if (this.activeTab === 'chat') {
              this.mergeChatEntries([entry], true);
              // The authoritative recent history also reflects moderation and
              // messages sent between the HTTP POST and its acknowledgement.
              this.loadTimeline();
            }
            this.chatDraft = '';
            this.replyingToCommunityMessage = null;
            this.pendingChatDelivery = undefined;
            this.chatDeliveryUncertain = false;
          } else {
            this.feedDraft = '';
            this.clearCommunityFeedImage();
            this.clearCommunityFeedVideo();
            if (this.timelineKind === kind) this.loadTimeline();
          }
        },
        error: error => {
          if (this.selected?.id !== communityId) return;
          if (kind === 'CHAT' && pending && this.isUncertainChatError(error)) {
            this.pendingChatDelivery = pending;
            this.chatDeliveryUncertain = true;
            this.timelineError = t('chat.sendUncertain');
            this.verifyCommunityChatDelivery();
          } else this.timelineError = t('communities.timelineSendError');
        }
      });
  }

  deleteTimeline(entry: CommunityTimelineEntry): void {
    if (!this.selected || this.timelineDeletingId !== null ||
        entry.communityId !== this.selected.id || entry.kind !== this.timelineKind ||
        (entry.kind === 'POST' ? !this.canDeleteCommunityPost(entry) : !this.canManage())) return;
    const communityId = this.selected.id;
    const kind = this.timelineKind;
    this.timelineDeletingId = entry.id;
    this.timelineError = '';
    this.timelineService.delete(communityId, kind, entry.id)
      .pipe(timeout(10_000), finalize(() => this.timelineDeletingId = null))
      .subscribe({
        next: () => {
          if (this.selected?.id === communityId && this.timelineKind === kind) this.loadTimeline();
        },
        error: () => {
          if (this.selected?.id === communityId) this.timelineError = t('communities.timelineDeleteError');
        }
      });
  }

  showAllStandings = false;
  historicalPlayers: HistoricalPlayerCandidate[] = [];
  historicalPlayersLoading = false;
  historicalPlayersError = '';
  historicalPlayerId: number | null = null;
  historicalClaimAcknowledged = false;
  historicalClaimSaving = false;
  historicalClaimMessage = '';
  historicalClaims: HistoricalPlayerLink[] = [];
  historicalClaimsLoading = false;
  historicalClaimsError = '';
  historicalReleaseId: number | null = null;
  rankingHistoricalRow?: CommunityStanding;
  /** Stats belong to the historical player, not to an account. Claiming is optional. */
  rankingHistoricalClaimExpanded = false;
  rankingHistoricalCandidate?: HistoricalPlayerCandidate;
  rankingHistoricalLoading = false;
  rankingHistoricalSaving = false;
  rankingHistoricalAcknowledged = false;
  rankingHistoricalError = '';
  rankingHistoricalSuccess = '';
  private rankingHistoricalRequestVersion = 0;

  get rankingParticipants(): CommunityStanding[] {
    return (this.competition?.standings || []).filter(row => row.games > 0);
  }

  get displayedRankings(): CommunityStanding[] {
    return this.showAllStandings ? (this.competition?.standings || []) : this.rankingParticipants;
  }

  // Imported rounds retain the source name; handle exists only for a verified profile.
  roundEntryHandle(entry: Pick<CommunityRoundEntry, 'username'>): string {
    return entry.username ? '@' + entry.username : t('communities.identity.unlinked');
  }

  roundSport(round: CommunityRound): string | null {
    return sportForRound(round, this.selected);
  }

  roundView(round: CommunityRound): CommunityRoundView {
    return eventView(this.roundSport(round), round.eventType);
  }

  eventOptions(sport: string | null) {
    // The historical codes stay in the registry for old records and labels,
    // but 2026 World Skate 500 m +D / One Lap no longer have Final B.
    const all = eventOptionsForSport(sport).filter(option =>
      !isDiscontinuedInlineFinalB(option.code));
    if (!this.canRecordInlineSpeedWithoutRankings) return all;
    // Standalone sprint recording must not offer a different sport, a 200m TT
    // or the former Final B. Those are not World Skate 2026 progression heats.
    return sport === 'Patinagem de Velocidade'
      ? all.filter(option => this.isInlineSpeedProgressionHeat(option.code))
      : [];
  }

  private isInlineSpeedProgressionHeat(eventType: string | null): boolean {
    return eventType != null
      && (eventType.startsWith('INLINE_TRACK_500D_')
        || eventType.startsWith('INLINE_ROAD_LAP_'))
      && (eventType.endsWith('_FIRST_ROUND') || eventType.endsWith('_QUARTER_HEAT')
        || eventType.endsWith('_SEMI_HEAT') || eventType.endsWith('_FINAL_A'));
  }

  eventTypeLabel(type: string, sport: string | null): string {
    // Use the same explicit label mapping as the event picker, including new types.
    const key = eventOptionsForSport(sport).find(option => option.code === type)?.labelKey;
    return t(key ?? ('communities.eventType.' + type.toLowerCase()));
  }

  athleticsDisciplineOptions = athleticsDisciplineOptions;
  trackSprintSeriesStatus(round: CommunityRound) {
    return trackSprintSeriesStatus(this.competition?.rounds || [], round,
      this.competition?.selectedSeasonId ?? null);
  }

  fieldDisciplineLabel(code: string): string {
    // Reuse the championship labels for typed athletics distances so the
    // round editor and result tags show "100 m", not an internal code.
    if (['TRACK_100','TRACK_200','TRACK_400','TRACK_800','TRACK_1500',
         'TRACK_5000','TRACK_10000','TRACK_HURDLES_100','TRACK_HURDLES_110',
         'TRACK_HURDLES_400','TRACK_STEEPLE_3000'].includes(code)) {
      return t('communities.trackTournament.discipline.' + code);
    }
    if (['K1_200','K1_500','K1_1000'].includes(code))
      return t('cno.d.' + code);
    if (['SINGLE_500','SINGLE_1000','SINGLE_2000'].includes(code))
      return t('row1x.d.' + code);
    return t('communities.discipline.' + code.toLowerCase());
  }
  performanceKind = performanceKind;
  performanceDisplay = performanceDisplay;
  surfWaveTotal = surfWaveTotal;
  isWaveHeatEvent = isWaveHeatEvent;

  waveLabelKey(eventType: string | null | undefined, position: 1 | 2): string {
    return (eventType === 'BODYBOARD_HEAT' ? 'communities.bodyboard.' : 'communities.surf.')
      + 'wave' + position;
  }

  eventPerformanceEntries(round: CommunityRound): CommunityRoundEntry[] {
    return eventPerformanceEntries(round);
  }

  eventPerformancePlace(entries: CommunityRoundEntry[], entry: CommunityRoundEntry, type?: string | null): number | null {
    return eventPerformancePlace(entries, entry, type);
  }

  neutralRound(round: CommunityRound): boolean {
    return isNeutralEvent(this.roundSport(round), round.eventType);
  }

  raceSupportsLaps(sport: string | null): boolean {
    return raceSupportsLaps(sport);
  }

  /** Do not keep invisible Scratch lap metrics after switching to a timed event. */
  onRoundEventTypeChange(): void {
    this.sprintSeriesKeyDraft = '';
    this.sprintHeatNumberDraft = 1;
    if (this.newRoundEventType === 'TRACK_SPRINT_5_8'
        || this.newRoundEventType === 'TRACK_SPRINT_HEAT'
        || this.newRoundEventType === 'TRACK_SPRINT_REPECHAGE') {
      for (const entry of this.roundEntries) {
        entry.finishPosition = null;
        entry.elapsedSeconds = null;
        entry.lapsCompleted = null;
        entry.bestLapSeconds = null;
        entry.performanceValue = null;
        entry.result = 'DRAW';
      }
    }
    if (this.newRoundEventType === 'TRACK_TIME_TRIAL' || this.newRoundEventType === 'TRACK_FLYING_200') {
      for (const entry of this.roundEntries) {
        entry.lapsCompleted = null;
        entry.bestLapSeconds = null;
      }
    }
  }

  raceTime(seconds: number | null | undefined): string | null {
    return formatRaceSeconds(seconds);
  }

  swimTime = formatSwimTime;
  openWaterTime = formatOpenWaterTime;
  orienteeringTime = formatOrienteeringTime;
  inlineSpeedTime = formatSwimTime;
  isInlineSpeedTimedEvent = isInlineSpeedTimedEvent;
  isInlineSpeedHeatEvent = isInlineSpeedHeatEvent;
  isInlineSpeedFinalHeat = isInlineSpeedFinalHeat;
  inlineSpeedCandidatePlace = inlineSpeedCandidatePlace;

  roundFormatLabel(round: CommunityRound): string {
    return t('communities.resultFormat.' +
      eventPresentationFormat(this.roundSport(round), round.eventType));
  }

  get communityRoundSports(): string[] {
    return this.selected ? this.communitySports(this.selected) : [];
  }

  /** Sport-tagged active seasons only accept rounds in that sport.
   * Shared legacy seasons retain the complete community catalogue. */
  /** Historical ranking filter is never a destination for new rounds. */
  get availableSeasonSports(): string[] {
    const active = this.competition?.seasons?.filter(season => season.active) ?? [];
    if (active.some(season => !season.sport)) return [];
    const normalize = (value: string): string => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const activeSports = new Set(active.map(season => normalize(season.sport!)));
    return this.communityRoundSports.filter(sport => !activeSports.has(normalize(sport)));
  }

  get canCreateAdditionalSeason(): boolean {
    const active = this.competition?.seasons?.filter(season => season.active) ?? [];
    return active.length === 0 || this.availableSeasonSports.length > 0;
  }

  get roundTargetSeasonId(): number | null {
    const active = this.competition?.seasons?.filter(season => season.active) ?? [];
    if (active.length === 1) return active[0].id;
    const sport = this.newRoundSport;
    if (!sport) return null;
    const normalized = (value: string): string => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const matches = active.filter(season => season.sport &&
      normalized(season.sport) === normalized(sport));
    return matches.length === 1 ? matches[0].id : null;
  }

  selectedSeasonSupportsSport(sport: string): boolean {
    if (this.selectedSeasonId == null || !this.communityRoundSports.includes(sport)) return false;
    const selected = this.competition?.seasons.find(season => season.id === this.selectedSeasonId);
    if (!selected) return false;
    if (!selected.sport) return true; // Historical shared season.
    const normalize = (value: string): string => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return normalize(selected.sport) === normalize(sport);
  }

  get roundEligibleSports(): string[] {
    const available = this.communityRoundSports;
    const active = this.competition?.seasons?.filter(season => season.active) ?? [];
    // Per-sport seasons must not hide other sports in a multi-sport community.
    if (active.length > 1) return available;
    const sport = active[0]?.sport;
    if (!sport) return available;
    const normalized = (value: string): string => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return available.filter(candidate => normalized(candidate) === normalized(sport));
  }

  /** The optional W/D/L standings switch must not hide tournament heat recording. */
  get canRecordInlineSpeedWithoutRankings(): boolean {
    return !!this.selected && !this.selected.rankingsEnabled
      && this.selected.individualTournamentsEnabled !== false
      && (this.communityRoundSports.includes('Patinagem de Velocidade')
        || this.speedTournamentPresent === true);
  }

  /** Fetch only when useful; latest tournaments are listed first and never modified. */
  private loadStandaloneSpeedTournament(group: CommunityGroup): void {
    const revision = ++this.speedTournamentLookupVersion;
    this.speedTournamentPresent = false;
    if (group.rankingsEnabled || group.individualTournamentsEnabled === false
        || !this.tournamentCatalog) return;
    this.tournamentCatalog.list(group.id, 0).pipe(timeout(10_000)).subscribe({
      next: page => {
        if (revision !== this.speedTournamentLookupVersion || this.selected?.id !== group.id) return;
        this.speedTournamentPresent = page.tournaments.some(item =>
          item.sport === 'Patinagem de Velocidade'
          && item.entryType !== 'TEAM'
          && !item.historicalArchiveId && item.status !== 'COMPLETED');
      },
      error: () => { if (revision === this.speedTournamentLookupVersion) this.speedTournamentPresent = false; }
    });
  }

  get newRoundSport(): string | null {
    if (this.canRecordInlineSpeedWithoutRankings) return 'Patinagem de Velocidade';
    return this.roundEligibleSports.length === 1
      ? this.roundEligibleSports[0] : (this.roundSportDraft || null);
  }

  get newImportSport(): string | null {
    return this.communityRoundSports.length === 1
      ? this.communityRoundSports[0] : (this.importSportDraft || null);
  }

  get newRoundEventType(): CommunityEventType | null {
    return this.roundEventTypeDraft ? this.roundEventTypeDraft as CommunityEventType : null;
  }

  viewForNewRound(): CommunityRoundView {
    // While event selection is missing, do not show race or football stats.
    if (eventOptionsForSport(this.newRoundSport).length && !this.newRoundEventType)
      return 'unknown';
    return eventView(this.newRoundSport, this.newRoundEventType);
  }

  canManageRaceChampionship(): boolean {
    return this.canManage() && this.selectedSeasonId != null
      && this.isSelectedActiveSeason();
  }

  editRaceRule(group: CommunityRaceStandingGroup): void {
    if (!this.canManageRaceChampionship() || this.raceRuleSaving) return;
    this.raceRuleSport = group.sport;
    this.raceRulePoints = group.rule?.pointsByPlace.join(',') ?? '25,18,15,12,10,8,6,4,2,1';
    this.raceRuleError = '';
    this.raceRuleMessage = '';
  }

  cancelRaceRule(): void {
    if (!this.raceRuleSaving) this.raceRuleSport = null;
    this.raceRuleError = '';
  }

  saveRaceRule(group: CommunityRaceStandingGroup): void {
    if (!this.selected || !this.canManageRaceChampionship() || this.raceRuleSaving
        || this.raceRuleSport !== group.sport) return;
    const scores = this.raceRulePoints.split(',').map(s => s.trim());
    const integers = scores.map(s => Number(s));
    if (!scores.length || scores.length > 20 ||
        scores.some(s => !/^\d{1,4}$/.test(s)) ||
        integers.some((v, i) => v > 1000 || (i > 0 && v > integers[i - 1]))) {
      this.raceRuleError = t('feedback.communities.raceRuleInvalid');
      return;
    }
    const communityId = this.selected.id, seasonId = this.selectedSeasonId!;
    this.raceRuleSaving = true;
    this.raceRuleError = '';
    this.communityService.updateRaceRule(communityId, seasonId, {
      sport: group.sport, pointsByPlace: integers.join(',')
    }).pipe(timeout(10_000), finalize(() => this.raceRuleSaving = false)).subscribe({
      next: () => {
        if (this.selected?.id !== communityId || this.selectedSeasonId !== seasonId) return;
        this.raceRuleSport = null;
        this.raceRuleMessage = t('communities.race.ruleSaved');
        this.loadCompetition(this.selected, seasonId);
      },
      error: () => { this.raceRuleError = t('feedback.communities.raceRuleError'); }
    });
  }

  editRacePenalty(round: CommunityRound, entry: CommunityRoundEntry): void {
    if (!this.canManageRaceChampionship() || this.racePenaltySaving
      || entry.entryId == null || entry.finishPosition == null) return;
    this.racePenaltyEditorKey = round.id + ':' + entry.entryId;
    this.racePenaltyPoints = entry.racePenaltyPoints ?? 0;
    this.racePenaltyReason = entry.racePenaltyReason ?? '';
    this.racePenaltyError = '';
    this.racePenaltyMessage = '';
  }

  cancelRacePenalty(): void {
    if (!this.racePenaltySaving) this.racePenaltyEditorKey = null;
    this.racePenaltyError = '';
  }

  saveRacePenalty(round: CommunityRound, entry: CommunityRoundEntry): void {
    if (!this.selected || !this.canManageRaceChampionship() || this.racePenaltySaving ||
       entry.entryId == null || this.racePenaltyEditorKey !== round.id + ':' + entry.entryId) return;
    const points = Number(this.racePenaltyPoints);
    if (!Number.isInteger(points) || points < 0 || points > 1000 ||
        (points > 0 && !this.racePenaltyReason.trim()) || this.racePenaltyReason.length > 255) {
      this.racePenaltyError = t('feedback.communities.racePenaltyInvalid');
      return;
    }
    const communityId = this.selected.id, seasonId = this.selectedSeasonId!;
    this.racePenaltySaving = true;
    this.communityService.updateRacePenalty(communityId, round.id, entry.entryId, {
      penaltyPoints: points, reason: points ? this.racePenaltyReason.trim() : null
    }).pipe(timeout(10_000), finalize(() => this.racePenaltySaving = false)).subscribe({
      next: () => {
        if (this.selected?.id !== communityId || this.selectedSeasonId !== seasonId) return;
        this.racePenaltyEditorKey = null;
        this.racePenaltyMessage = t('communities.race.penaltySaved');
        this.loadCompetition(this.selected, seasonId);
      },
      error: () => { this.racePenaltyError = t('feedback.communities.racePenaltyError'); }
    });
  }

  editRaceDecision(round: CommunityRound, entry: CommunityRoundEntry): void {
    if (!this.canManageRaceChampionship() || this.raceDecisionSaving
        || entry.entryId == null || entry.finishPosition == null) return;
    this.raceDecisionEditorKey = round.id + ':' + entry.entryId;
    this.raceDecisionTimeSeconds = entry.raceTimePenaltySeconds ?? 0;
    this.raceDecisionDisqualified = entry.raceDisqualified ?? false;
    this.raceDecisionReason = entry.raceStewardReason ?? '';
    this.raceDecisionError = '';
    this.raceDecisionMessage = '';
  }

  cancelRaceDecision(): void {
    if (!this.raceDecisionSaving) this.raceDecisionEditorKey = null;
    this.raceDecisionError = '';
  }

  saveRaceDecision(round: CommunityRound, entry: CommunityRoundEntry): void {
    if (!this.selected || !this.canManageRaceChampionship() || this.raceDecisionSaving
        || entry.entryId == null
        || this.raceDecisionEditorKey !== round.id + ':' + entry.entryId) return;
    const seconds = Number(this.raceDecisionTimeSeconds);
    const reason = this.raceDecisionReason.trim();
    if (raceDecisionError(seconds, this.raceDecisionDisqualified,
        this.raceDecisionReason, entry.elapsedSeconds)) {
      this.raceDecisionError = t('feedback.communities.raceDecisionInvalid');
      return;
    }
    const communityId = this.selected.id, seasonId = this.selectedSeasonId!;
    this.raceDecisionSaving = true;
    this.raceDecisionError = '';
    this.communityService.updateRaceDecision(communityId, round.id, entry.entryId, {
      timePenaltySeconds: seconds,
      disqualified: this.raceDecisionDisqualified,
      reason: seconds > 0 || this.raceDecisionDisqualified ? reason : null
    }).pipe(timeout(10_000), finalize(() => this.raceDecisionSaving = false)).subscribe({
      next: () => {
        if (this.selected?.id !== communityId || this.selectedSeasonId !== seasonId) return;
        this.raceDecisionEditorKey = null;
        this.raceDecisionMessage = t('communities.race.decisionSaved');
        this.loadCompetition(this.selected, seasonId);
      },
      error: () => { this.raceDecisionError = t('feedback.communities.raceDecisionError'); }
    });
  }

  racketRuleKey(group: CommunityRacketStandingGroup): string {
    return group.sport.toLocaleLowerCase() + ':' + group.matchFormat;
  }

  canConfigureRacketRules(): boolean {
    return this.canManage() && this.selectedSeasonId !== null &&
      this.isSelectedActiveSeason();
  }

  editRacketRule(group: CommunityRacketStandingGroup): void {
    if (!this.canConfigureRacketRules() || this.racketRuleSaving) return;
    this.racketRuleEditorKey = this.racketRuleKey(group);
    this.racketRuleWinPoints = group.rule?.winPoints ?? 2;
    this.racketRuleLossPoints = group.rule?.lossPoints ?? 0;
    this.racketRuleTieBreak = group.rule?.tieBreak ?? 'SETS_FIRST';
    this.racketRuleMessage = '';
    this.racketRuleError = '';
  }

  cancelRacketRule(): void {
    if (this.racketRuleSaving) return;
    this.racketRuleEditorKey = null;
    this.racketRuleError = '';
  }

  saveRacketRule(group: CommunityRacketStandingGroup): void {
    if (!this.selected || !this.canConfigureRacketRules() || this.racketRuleSaving
        || this.racketRuleEditorKey !== this.racketRuleKey(group)) return;
    const win = Number(this.racketRuleWinPoints);
    const loss = Number(this.racketRuleLossPoints);
    if (!Number.isInteger(win) || !Number.isInteger(loss)
        || win > 100 || loss < 0 || win <= loss) {
      this.racketRuleError = t('feedback.communities.racketRuleInvalid');
      return;
    }
    const communityId = this.selected.id;
    const seasonId = this.selectedSeasonId!;
    const editKey = this.racketRuleEditorKey;
    this.racketRuleSaving = true;
    this.racketRuleError = '';
    this.communityService.updateRacketRule(communityId, seasonId, {
      sport: group.sport,
      matchFormat: group.matchFormat,
      winPoints: win,
      lossPoints: loss,
      tieBreak: this.racketRuleTieBreak
    }).pipe(
      timeout(10_000),
      finalize(() => this.racketRuleSaving = false)
    ).subscribe({
      next: () => {
        if (this.selected?.id !== communityId || this.selectedSeasonId !== seasonId) return;
        this.racketRuleEditorKey = null;
        this.racketRuleMessage = t('communities.racket.ruleSaved');
        this.loadCompetition(this.selected, seasonId);
      },
      error: () => {
        if (this.selected?.id !== communityId || this.selectedSeasonId !== seasonId
            || this.racketRuleEditorKey !== editKey) return;
        this.racketRuleError = t('feedback.communities.racketRuleError');
      }
    });
  }

  racketSupportsSets(sport: string | null): boolean {
    return racketSupportsSets(sport);
  }

  racketUsesPointsPerSet(sport: string | null): boolean {
    return racketUsesPointsPerSet(sport);
  }

  recordedRacketMatch(round: CommunityRound): boolean {
    return recordedRacketMatch(round);
  }
  chessGameScore = chessGameScore;
  isJudoBout = isJudoBout;
  isMuayThaiEvent = isMuayThaiEvent;
  isKickboxingEvent = isKickboxingEvent;
  clearSwimmingHiddenScores(): void {
    if (this.newRoundEventType !== 'SWIM_LCM'
        && this.newRoundEventType !== 'CANOE_SPRINT'
        && this.newRoundEventType !== 'ROWING_SINGLE'
        && this.newRoundEventType !== 'OWS_INDIVIDUAL'
        && this.newRoundEventType !== 'FOOT_ORIENTEERING'
        && !isInlineSpeedTimedEvent(this.newRoundEventType)
        && !isInlineSpeedHeatEvent(this.newRoundEventType)) return;
    this.roundEntries.forEach(entry => {
      entry.team = '';
      entry.result = 'DRAW';
      entry.goals = 0;
      entry.assists = 0;
      entry.mvp = false;
      entry.cleanSheet = false;
      entry.finishPosition = null;
      entry.bestLapSeconds = null;
      entry.lapsCompleted = null;
      entry.performanceValue = null;
      entry.waveScore1 = null;
      entry.waveScore2 = null;
    });
  }
  clearStrengthTrainingHiddenScores(): void {
    if (this.newRoundEventType !== 'STRENGTH_TRAINING') return;
    this.roundEntries.forEach(entry => {
      entry.team = '';
      entry.result = 'DRAW';
      entry.goals = 0;
      entry.assists = 0;
      entry.mvp = false;
      entry.cleanSheet = false;
      entry.finishPosition = null;
      entry.elapsedSeconds = null;
      entry.bestLapSeconds = null;
      entry.lapsCompleted = null;
      entry.performanceValue = null;
      entry.waveScore1 = null;
      entry.waveScore2 = null;
    });
  }
  isKickboxingPointFighting = isKickboxingPointFighting;
  isBoxingEvent = isBoxingEvent;
  isBjjEvent = isBjjEvent;
  isBjjPoints = isBjjPoints;
  clearMuayThaiHiddenScores(): void {
    if (isMuayThaiEvent(this.newRoundEventType)) {
      this.roundEntries.forEach(entry => {
        entry.performanceValue = null;
        entry.waveScore1 = null;
        entry.waveScore2 = null;
      });
    }
  }

  clearKickboxingHiddenScores(): void {
    if (isKickboxingEvent(this.newRoundEventType)
        && !isKickboxingPointFighting(this.newRoundEventType)) {
      this.roundEntries.forEach(entry => {
        entry.performanceValue = null;
        entry.waveScore1 = null;
        entry.waveScore2 = null;
      });
    }
  }

  clearBoxingHiddenScores(): void {
    if (isBoxingEvent(this.newRoundEventType)) {
      this.roundEntries.forEach(entry => {
        entry.performanceValue = null;
        entry.waveScore1 = null;
        entry.waveScore2 = null;
      });
    }
  }

  clearBjjSubmissionScores(): void {
    if (this.newRoundEventType === 'BJJ_IBJJF_GI_SUBMISSION') {
      this.roundEntries.forEach(entry => { entry.performanceValue = null; });
    }
  }
  isKarateEvent = isKarateEvent;
  isKarateKumite = isKarateKumite;
  isTaekwondoKyorugi = isTaekwondoKyorugi;
  isTaekwondoEvent = isTaekwondoEvent;
  cricketOvers = cricketOvers;
  isTeamFinalEvent = isTeamFinalEvent;
  recordedTeamFinal = recordedTeamFinal;
  teamFinalWinner = teamFinalWinner;
  teamFinalUsesGoals = teamFinalUsesGoals;
  teamFinalTitleKey = teamFinalTitleKey;
  teamFinalHintKey = teamFinalHintKey;
  teamFinalUsesRuns = teamFinalUsesRuns;
  teamFinalScoreLabelKey = teamFinalScoreLabelKey;
  teamFinalMaxScore = teamFinalMaxScore;
  teamFinalSideLabelKey = teamFinalSideLabelKey;
  isBasketballFinal = isBasketballFinal;
  recordedBasketballFinal = recordedBasketballFinal;
  basketballWinner = basketballWinner;
  isVolleyballEvent = isVolleyballEvent;
  isFootvolleyEvent = isFootvolleyEvent;
  volleyballFormatHint = volleyballFormatHint;
  volleyballResultTitle = volleyballResultTitle;
  volleyballMaxSets = volleyballMaxSets;
  volleyballMinSets = volleyballMinSets;
  volleyballSetWinner = volleyballSetWinner;
  volleyballSetTotals = volleyballSetTotals;
  recordedVolleyballMatch = recordedVolleyballMatch;
  volleyballSideLabelKey = volleyballSideLabelKey;
  volleyballMemberSelectorKey = volleyballMemberSelectorKey;

  resetVolleyballSets(): void {
    this.volleyballSetScores = Array.from({length: volleyballMinSets(this.newRoundEventType)},
      () => ({sideA: null, sideB: null}));
  }
  addVolleyballSet(): void {
    if (this.volleyballSetScores.length < volleyballMaxSets(this.newRoundEventType))
      this.volleyballSetScores.push({sideA: null,sideB: null});
  }
  removeVolleyballSet(index: number): void {
    if (this.volleyballSetScores.length > volleyballMinSets(this.newRoundEventType))
      this.volleyballSetScores.splice(index,1);
  }

  racketSidePlayers(round: CommunityRound, side: 'A' | 'B'): CommunityRoundEntry[] {
    return round.entries.filter(e => e.team === side);
  }

  addRacketSet(): void {
    if (this.racketSetScores.length < 5) {
      this.racketSetScores.push({ sideA: null, sideB: null });
    }
  }

  removeRacketSet(index: number): void {
    if (this.racketSetScores.length > 1) this.racketSetScores.splice(index, 1);
  }

  roundMatchup(round: CommunityRound): CommunityRoundMatchup | null {
    const mode = this.roundView(round);
    if (mode === 'race' || recordedRacketMatch(round)
        || isGroupRoutineEvent(round.eventType) || recordedBasketballFinal(round)
        || recordedVolleyballMatch(round) || recordedTeamFinal(round)) return null;
    const matchup = communityRoundMatchup(
      round, t('communities.matchup.teamA'), t('communities.matchup.teamB')
    );
    // For individual and unknown modalities accept only explicit team labels.
    return mode === 'team' || (matchup && !matchup.inferred) ? matchup : null;
  }

  get availableHistoricalPlayers(): HistoricalPlayerCandidate[] {
    return this.historicalPlayers.filter(candidate => candidate.linkStatus === 'UNLINKED');
  }
  inviteUsername = '';
  inviteSearchResults: CommunityProfile[] = [];
  inviteSearchLoading = false;
  inviteSearchPerformed = false;
  inviteMessage = '';
  groupInviteFeedback = '';
  pendingJoinRequests: CommunityJoinRequest[] = [];
  pendingJoinRequestsLoading = false;
  joinRequestActionId?: number;
  selectedJoinRequestIds = new Set<number>();
  confirmingBatchJoin = false;
  batchJoining = false;
  batchJoinProcessed = 0;
  batchJoinTotal = 0;
  batchJoinFeedback = '';
  ownershipUsername = '';
  communityDeleteConfirming = false;
  communityDeleteName = '';
  communityDeleteLoading = false;
  communityDeleteError = '';

  photoUpdating = false;
  avatarCropFile: File | null = null;
  avatarCropUrl = '';
  avatarCropReady = false;
  avatarCropExisting = false;
  avatarCropFitMode: 'COVER' | 'SHOW_ALL' = 'COVER';
  avatarCropFocusX = 50;
  avatarCropFocusY = 50;
  avatarCropAnimated = false;
  avatarCropZoom = 1;
  avatarCropOffsetX = 0;
  avatarCropOffsetY = 0;
  avatarCropMetrics: CommunityAvatarCrop | null = null;
  avatarCropError = '';
  private avatarCropImage: HTMLImageElement | null = null;
  private avatarCropCommunityId: number | null = null;
  avatarCropDrag: { id: number; x: number; y: number; offsetX: number; offsetY: number } | null = null;

  communitySearchName = '';
  communitySearchSport = '';
  communitySearchResults: CommunitySearchPresentation[] = [];
  communitySearchPage = 0;
  communitySearchHasMore = false;
  communitySearchLoading = false;
  communitySearchPerformed = false;
  communitySearchError = '';
  private communitySearchRequestVersion = 0;
  private reloadRequestVersion = 0;
  communityPresentation?: CommunitySearchPresentation;
  presentationLoading = false;
  membershipActionLoading = false;
  membershipActionMessage = '';
  joinRequestSent = false;
  pendingJoinLookupLoading = false;
  private pendingJoinLookupVersion = 0;
  private pendingRequestsLookupVersion = 0;
  private communityOpenRequestVersion = 0;
  private competitionRequestVersion = 0;
  private communitySessionsRequestVersion = 0;
  private matchArchiveListRequestVersion = 0;
  private matchArchiveDetailRequestVersion = 0;
  private standingArchiveListRequestVersion = 0;
  private standingArchiveDetailRequestVersion = 0;
  private pendingArchiveDeepLinkCommunityId: number | null = null;

  sessionPolicyEditing = false;
  sessionPolicySaving = false;
  sessionPolicyDraft = true;
  sessionPolicyFeedback = '';
  sessionPolicyError = '';

  editSessionPolicy(): void {
    if (!this.selected || !this.canManage() || this.sessionPolicySaving) return;
    this.sessionPolicyDraft = this.selected.membersCanCreateSessions !== false;
    this.sessionPolicyFeedback = '';
    this.sessionPolicyError = '';
    this.sessionPolicyEditing = true;
  }

  cancelSessionPolicy(): void {
    if (!this.sessionPolicySaving) this.sessionPolicyEditing = false;
  }

  saveSessionPolicy(): void {
    if (!this.selected || !this.canManage() || !this.sessionPolicyEditing || this.sessionPolicySaving) return;
    const id = this.selected.id;
    this.sessionPolicySaving = true;
    this.sessionPolicyError = '';
    this.sessionPolicyFeedback = '';
    this.communityService.updateSessionCreationPolicy(id, this.sessionPolicyDraft)
      .pipe(timeout(10_000), finalize(() => this.sessionPolicySaving = false))
      .subscribe({
        next: updated => {
          if (this.selected?.id !== id) return;
          this.selected = updated;
          this.replaceCommunity(updated);
          this.sessionPolicyEditing = false;
          this.sessionPolicyFeedback = t('communities.sessionPolicy.saved');
        },
        error: () => {
          if (this.selected?.id === id) this.sessionPolicyError = t('communities.sessionPolicy.error');
        }
      });
  }

  onHabitualVenueSaved(group: CommunityGroup): void {
    if (this.selected?.id !== group.id) return;
    this.selected = group;
    this.replaceCommunity(group);
  }

  featuresEditing = false;
  featuresSaving = false;
  featuresFeedback = '';
  featuresError = '';
  featuresDraft = {
    rankingsEnabled: false,
    individualTournamentsEnabled: false,
    teamTournamentsEnabled: false
  };

  hasCompetitions(group: CommunityGroup | undefined): boolean {
    return !!group && (group.individualTournamentsEnabled !== false
      || group.teamTournamentsEnabled !== false);
  }

  // Saved archives remain useful when a community turns off live standings.
  get canBrowseHistoricalArchives(): boolean {
    return !!this.selected && (this.selected.rankingsEnabled
      || this.hasCompetitions(this.selected)
      || (this.archiveSummaries?.length ?? 0) > 0
      || (this.matchArchiveSummaries?.length ?? 0) > 0);
  }

  editFeatures(): void {
    if (!this.canManage() || !this.selected || this.featuresSaving) return;
    this.featuresDraft = {
      rankingsEnabled: this.selected.rankingsEnabled,
      individualTournamentsEnabled: this.selected.individualTournamentsEnabled !== false,
      teamTournamentsEnabled: this.selected.teamTournamentsEnabled !== false
    };
    this.featuresError = '';
    this.featuresFeedback = '';
    this.featuresEditing = true;
  }

  cancelFeaturesEdit(): void {
    if (!this.featuresSaving) this.featuresEditing = false;
  }

  saveFeatures(): void {
    if (!this.canManage() || !this.selected || !this.featuresEditing || this.featuresSaving) return;
    const communityId = this.selected.id;
    const request = { ...this.featuresDraft };
    this.featuresSaving = true;
    this.featuresError = '';
    this.featuresFeedback = '';
    this.communityService.updateFeatures(communityId, request)
      .pipe(timeout(10_000), finalize(() => this.featuresSaving = false))
      .subscribe({
        next: updated => {
          if (this.selected?.id !== communityId) return;
          this.selected = updated;
          this.communities = this.communities.map(item => item.id === communityId ? updated : item);
          this.featuresEditing = false;
          this.featuresFeedback = t('communities.features.saved');
          this.activeTab = 'home';
          this.loadCompetition(updated);
        },
        error: () => { if (this.selected?.id === communityId)
          this.featuresError = t('communities.features.saveError'); }
      });
  }

  rankingsEnabledDraft = false;
  winPointsDraft = 3;
  drawPointsDraft = 1;
  lossPointsDraft = 0;

  roundName = '';
  roundPlayedAt = '';
  roundSportDraft = '';
  roundEventTypeDraft = '';
  roundDisciplineDraft = '';
  importSportDraft = '';
  racketMatchFormat: 'SINGLES' | 'DOUBLES' = 'SINGLES';
  racketSetScores: Array<{ sideA: number | null; sideB: number | null }> =
    [{ sideA: null, sideB: null }, { sideA: null, sideB: null }];
  roundEntries: CommunityRoundEntryDraft[] = [];
  roundGroupScoresDraft: Record<string, number | null> = {};
  roundBasketballScoreDraft = { sideA: null as number | null, sideB: null as number | null };
  roundTeamScoreDraft = {sideA: null as number | null, sideB: null as number | null};
  roundCricketDraft = {wicketsA: null as number | null, legalBallsA: null as number | null,
    wicketsB: null as number | null, legalBallsB: null as number | null};
  volleyballSetScores: Array<{sideA: number | null; sideB: number | null}> =
    [{sideA: null,sideB: null},{sideA: null,sideB: null}];
  isGroupRoutineEvent = isGroupRoutineEvent;
  sortedRoutineGroups = sortedRoutineGroups;
  routineGroupPlace = routineGroupPlace;
  routineGroupMembers = routineGroupMembers;

  selectedRoutineGroups(): string[] {
    return routineGroupNames(this.roundEntries.filter(e => e.included));
  }
  roundDeleteConfirmId?: number;

  selectedSeasonId: number | null = null;
  // Import destination is independent from the ranking season filter.
  importSeasonId: number | null = null;
  seasonName = '';
  seasonStartsAt = '';
  seasonSport = '';
  seasonSaving = false;
  private seasonCreationRequestVersion = 0;
  closeSeasonConfirming = false;
  closingSeasonId: number | null = null;
  editingSeasonId: number | null = null;
  editingSeasonName = '';
  deletingSeasonId: number | null = null;
  seasonDeleteAcknowledged = false;
  seasonActionSaving = false;
  seasonActionError = '';
  seasonActionMessage = '';
  private seasonActionRequestVersion = 0;

  importMode: 'ROUNDS' | 'STANDINGS' | 'MATCHES' = 'ROUNDS';
  matchPreviewLoading = false;

  // Review is advisory: preserve every imported source row and never infer a
  // knockout winner. The same flags appear in the read-only historical view.
  importMatchReviewFlags(row: HistoricalMatchPreview['rows'][number]) {
    return historicalMatchReviewFlags(row,
      this.matchArchiveDestination === 'TOURNAMENT' && this.matchArchiveFormat === 'KNOCKOUT');
  }

  get importMatchReviewCount(): number {
    return this.matchPreview?.rows.filter(row => this.importMatchReviewFlags(row).length > 0).length ?? 0;
  }

  matchPreview?: HistoricalMatchPreview;
  matchArchiveTitle = '';
  matchArchiveEntryType: 'INDIVIDUAL' | 'TEAM' = 'INDIVIDUAL';
  matchArchiveDestination: 'ARCHIVE' | 'TOURNAMENT' = 'ARCHIVE';
  matchArchiveSport = '';
  matchArchiveFormat: 'LEAGUE' | 'KNOCKOUT' = 'LEAGUE';
  matchArchiveAcknowledged = false;
  matchArchiveConfirming = false;
  matchArchiveConfirmed?: HistoricalMatchArchive;
  matchArchivesLoading = false;
  matchArchivesError = '';
  matchArchiveSummaries: HistoricalMatchArchiveSummary[] = [];
  matchArchiveOpen?: HistoricalMatchArchive;
  matchArchiveOpeningId?: number;
  matchArchivePage = 0;
  archiveTitle = '';
  archiveEntryType: 'INDIVIDUAL' | 'TEAM' = 'INDIVIDUAL';
  archiveSeasonId: number | null = null;
  archiveAcknowledged = false;
  archivePreviewLoading = false;
  archivePreview?: HistoricalStandingPreview;
  archiveConfirmed?: HistoricalStandingArchive;
  archivesLoading = false;
  archivesError = '';
  archiveSummaries: HistoricalStandingSummary[] = [];
  archiveOpen?: HistoricalStandingArchive;
  archiveOpeningId?: number;
  importFile?: File;
  importFileName = '';
  importFileError = '';
  importRevision = 0;
  sourceDatesNeedYear = false;
  importPointsAcknowledged = false;
  importPreviewLoading = false;
  importSheetName = '';
  importMappings: Array<{ columnIndex: number; header: string; field: string; confidence: number }> = [];
  importValidation?: { valid: boolean; dataRows: number; validRows: number; errors: string[]; warnings: string[];
    errorDetails?: CommunityImportDiagnostic[]; warningDetails?: CommunityImportDiagnostic[] };
  importNormalized?: { acceptedRows: number; skippedRows: number; rows: any[]; skipped: any[] };
  importMappingLoading = false;
  importDefaultYear: number | null = new Date().getFullYear();
  importSourceCompetition = '';
  importSourceRound = '';
  importPlanLoading = false;
  importFinalPlan?: any;
  importConfirming = false;
  importResult?: { createdRounds: number; skippedDuplicateRounds: number; createdEntries: number };
  get importFields(): string[] {
    if (this.importMode === 'STANDINGS') {
      return ['IGNORE', 'NAME', 'POSITION', 'POINTS', 'PLAYED', 'WINS', 'DRAWS', 'LOSSES', 'GOALS_FOR', 'GOALS_AGAINST'];
    }
    if (this.importMode === 'MATCHES') {
      return ['IGNORE', 'HOME', 'AWAY', 'SCORE', 'HOME_SCORE', 'AWAY_SCORE', 'DATE', 'ROUND'];
    }
    return ['IGNORE', 'PLAYER', 'DATE', 'RESULT', 'WIN', 'DRAW', 'LOSS', 'GOALS', 'ASSISTS', 'POINTS', 'MVP'];
  }
  importPreview?: {
    fileName: string;
    sheets: Array<{
      name: string;
      nonEmptyRows: number;
      structure: string;
      headers: string[];
      sampleRows: string[][];
      columnSuggestions: Array<{
        columnIndex: number;
        header: string;
        field: string;
        confidence: number;
      }>;
    }>;
  };

  compareSelectionA = '';
  compareSelectionB = '';

  constructor(
    private communityService: CommunityGroupsService,
    private profileService: CommunityService,
    private sessionService: SessionService,
    private timelineService: CommunityTimelineService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  private positiveQueryId(key: string): number | null {
    const raw = this.route.snapshot.queryParamMap.get(key);
    if (!raw || !/^[1-9][0-9]*$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) ? id : null;
  }

  get invitedTournamentId(): number | null {
    return this.positiveQueryId('tournament');
  }

  get requestedChampionshipId(): number | null {
    return this.positiveQueryId('championship');
  }

  get requestedChampionshipTeamId(): number | null {
    return this.requestedChampionshipId ? this.positiveQueryId('championshipTeam') : null;
  }

  get invitedTeamId(): number | null {
    return this.invitedTournamentId ? this.positiveQueryId('team') : null;
  }

  // A deep link is only an invitation, not permission to see private rosters.
  // The full team is loaded only after the community membership check.
  get hasTeamInvitationDeepLink(): boolean {
    return this.invitedTournamentId !== null && this.invitedTeamId !== null;
  }

  // Dedicated team profile is separate from the legacy invitation deep link.
  get tournamentTeamPageId(): number | null {
    return this.invitedTournamentId ? this.positiveQueryId('teamPage') : null;
  }

  /** Exact published fixture selection is scoped to a tournament, never a team invite. */
  get tournamentFixtureId(): number | null {
    return this.invitedTournamentId && !this.tournamentTeamPageId
      ? this.positiveQueryId('fixture') : null;
  }

  ngOnInit(): void {
    this.isDetailMode = Boolean(this.route.snapshot.paramMap.get('id'));
    this.reload();
    this.realtimeService.connect();
    this.chatSubscriptions.add(this.realtimeService.communityMessages$.subscribe(
      entry => this.onCommunityChatRealtime(entry)
    ));
    this.chatSubscriptions.add(this.realtimeService.connected$.subscribe(connected => {
      this.chatRealtimeConnected = connected;
      if (connected) {
        this.chatEverConnected = true;
        // Recover missed events after reconnection, but only for the open chat.
        if (this.selected && this.activeTab === 'chat') this.loadTimeline();
      }
    }));
  }

  detailMode(): boolean {
    return this.isDetailMode;
  }

  /**
   * A member lands on their communities by default; new users see onboarding.
   * Query parameters always take precedence, including the targeted invite
   * deep link sent by email. Do not use routerLinkActive exact here: extra
   * invite query parameters would incorrectly hide the recipient's inbox.
   */
  showMineView(): boolean {
    if (this.detailMode()) return false;
    const view = this.route.snapshot.queryParamMap.get('view');
    if (view === 'mine') return true;
    if (view === 'explore') return false;
    return this.communities.length > 0;
  }

  private requestedInviteId(): number | null {
    const raw = this.route.snapshot.queryParamMap.get('invite');
    const id = raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
    return Number.isSafeInteger(id) ? id : null;
  }

  isTargetedInvite(invite: CommunityInvite): boolean {
    return invite.id === this.requestedInviteId();
  }

  backToCommunities(): void {
    void this.router.navigate(['/menu/communities']);
  }

  exploreCommunities(): void {
    this.communitySearchName = '';
    this.communitySearchSport = '';
    this.searchCommunities(0);
    this.communitySearchSection?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  searchCommunities(page = 0): void {
    const name = this.communitySearchName.trim();
    const sport = this.communitySearchSport.trim();
    // A slower, older response must not replace a newer search or its loading state.
    const requestVersion = (this.communitySearchRequestVersion ?? 0) + 1;
    this.communitySearchRequestVersion = requestVersion;

    this.communitySearchLoading = true;
    this.communitySearchError = '';
    this.communityService.search(name, sport, page)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => {
          if (requestVersion === this.communitySearchRequestVersion) {
            this.communitySearchLoading = false;
          }
        })
      )
      .subscribe({
        next: result => {
          if (requestVersion !== this.communitySearchRequestVersion) return;
          this.communitySearchResults = result.communities;
          this.communitySearchPage = result.page;
          this.communitySearchHasMore = result.hasMore;
          this.communitySearchPerformed = true;
        },
        error: () => {
          if (requestVersion !== this.communitySearchRequestVersion) return;
          this.communitySearchResults = [];
          this.communitySearchHasMore = false;
          this.communitySearchPerformed = true;
          this.communitySearchError = t('feedback.communities.searchError');
        }
      });
  }

  changeCommunitySearchPage(direction: number): void {
    if (this.communitySearchLoading || (direction < 0 && this.communitySearchPage === 0)
        || (direction > 0 && !this.communitySearchHasMore)) {
      return;
    }
    this.searchCommunities(this.communitySearchPage + direction);
  }

  clearCommunitySearch(): void {
    this.communitySearchName = '';
    this.communitySearchSport = '';
    this.searchCommunities(0);
  }

  openCommunityPresentation(community: CommunitySearchPresentation): void {
    void this.router.navigate(['/menu/communities', community.id]);
  }

  private loadCommunityPresentation(id: number): void {
    this.resetCommunityAvatarCrop();
    this.pendingArchiveDeepLinkCommunityId = null;
    this.invalidateArchiveRequests();
    // Only the most recent presentation request may change this view.
    const presentationVersion = (this.communityOpenRequestVersion || 0) + 1;
    this.communityOpenRequestVersion = presentationVersion;
    this.competitionRequestVersion = (this.competitionRequestVersion || 0) + 1;
    this.communitySessionsRequestVersion = (this.communitySessionsRequestVersion || 0) + 1;
    ++this.pendingJoinLookupVersion;
    this.pendingJoinLookupLoading = false;
    this.selected = undefined;
    this.communityPresentation = undefined;
    this.presentationLoading = true;
    this.membershipActionMessage = '';
    this.joinRequestSent = false;
    this.errorMessage = '';

    this.communityService.presentation(id)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => {
          if (presentationVersion === this.communityOpenRequestVersion) {
            this.presentationLoading = false;
          }
        })
      )
      .subscribe({
        next: presentation => {
          if (presentationVersion !== this.communityOpenRequestVersion) return;
          this.communityPresentation = presentation;
          if (presentation.visibility === 'PRIVATE') {
            this.loadMyPendingJoinRequest(presentation.id);
          }
        },
        error: () => {
          if (presentationVersion === this.communityOpenRequestVersion) {
            this.errorMessage = t('feedback.communities.openError');
          }
        }
      });
  }

  private loadMyPendingJoinRequest(communityId: number): void {
    const lookupVersion = ++this.pendingJoinLookupVersion;
    this.pendingJoinLookupLoading = true;
    this.communityService.myPendingJoinRequest(communityId)
      .pipe(
        timeout(10_000),
        finalize(() => {
          if (lookupVersion === this.pendingJoinLookupVersion) {
            this.pendingJoinLookupLoading = false;
          }
        })
      )
      .subscribe({
        next: request => {
          if (lookupVersion !== this.pendingJoinLookupVersion
              || this.communityPresentation?.id !== communityId) return;
          this.joinRequestSent = Boolean(request);
          this.membershipActionMessage = request
            ? t('communities.joinRequestSent')
            : '';
        },
        error: () => {
          if (lookupVersion !== this.pendingJoinLookupVersion
              || this.communityPresentation?.id !== communityId) return;
          this.joinRequestSent = false;
          this.membershipActionMessage = '';
        }
      });
  }

  joinPresentedCommunity(): void {
    const community = this.communityPresentation;
    if (!community || this.membershipActionLoading || this.joinRequestSent
        || (community.visibility === 'PRIVATE' && this.pendingJoinLookupLoading)) {
      return;
    }

    // Older GET responses must never undo a submitted join request.
    ++this.pendingJoinLookupVersion;
    this.pendingJoinLookupLoading = false;
    this.membershipActionLoading = true;
    this.membershipActionMessage = '';
    this.errorMessage = '';

    const action: Observable<unknown> = community.visibility === 'PUBLIC'
      ? this.communityService.joinPublic(community.id)
      : this.communityService.requestJoin(community.id);

    action
      .pipe(
        timeout(10_000),
        finalize(() => this.membershipActionLoading = false)
      )
      .subscribe({
        next: () => {
          if (this.communityPresentation?.id !== community.id) return;
          if (community.visibility === 'PUBLIC') {
            this.reload();
            return;
          }

          this.joinRequestSent = true;
          this.membershipActionMessage = t('communities.joinRequestSent');
        },
        error: error => {
          if (this.communityPresentation?.id !== community.id) return;
          this.errorMessage = error.error?.message
            || t('feedback.communities.joinError');
        }
      });
  }

  reload(): void {
    // Only the latest reload can update the groups, invites or loading state.
    const reloadVersion = (this.reloadRequestVersion || 0) + 1;
    this.reloadRequestVersion = reloadVersion;
    this.loading = true;
    this.errorMessage = '';

    this.communityService.mine()
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => {
          if (reloadVersion === this.reloadRequestVersion) this.loading = false;
        })
      )
      .subscribe({
        next: communities => {
          if (reloadVersion !== this.reloadRequestVersion) return;
          this.communities = communities;

          const routeId = this.route.snapshot.paramMap.get('id');
          const requestedId = Number(routeId || this.route.snapshot.queryParamMap.get('community'));
          if (requestedId && !Number.isNaN(requestedId)) {
            const requested = communities.find(item => item.id === requestedId);
            if (requested) {
              this.communityPresentation = undefined;
              this.open(requested);
              return;
            }
            if (this.detailMode()) {
              this.loadCommunityPresentation(requestedId);
              return;
            }
          }

          if (this.selected) {
            const refreshed = communities.find(item => item.id === this.selected?.id);
            if (refreshed) {
              this.open(refreshed);
            }
          }
        },
        error: () => {
          if (reloadVersion === this.reloadRequestVersion) {
            this.errorMessage = t('feedback.communities.loadError');
          }
        }
      });

    this.communityService.myInvites()
      .pipe(
        timeout(10_000),
        retry({ count: 1 })
      )
      .subscribe({
        next: invites => {
          if (reloadVersion !== this.reloadRequestVersion) return;
          const targetInviteId = this.requestedInviteId();
          this.invites = [...invites].sort((first, second) =>
            Number(second.id === targetInviteId) - Number(first.id === targetInviteId));

        },
        error: () => {
          if (reloadVersion === this.reloadRequestVersion) this.invites = [];
        }
      });
  }

  get availableSportSuggestions(): string[] {
    const query = this.sportsSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!query) return [];
    return SPORTS_CATALOG.filter(value =>
      value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query)
      && !(this.sportsDraft || []).some(current => current.toLowerCase() === value.toLowerCase())
    ).slice(0, 8);
  }

  communitySports(group: Pick<CommunityGroup, 'sport' | 'sports'>): string[] {
    return group.sports?.length ? group.sports : (group.sport ? [group.sport] : []);
  }

  /**
   * The community catalogue is used for creating new activities, but ranking
   * panels must follow the selected sport-specific season. Legacy shared
   * seasons and the all-history view preserve the complete catalogue.
   */
  get rankingContextSports(): string[] {
    if (!this.selected) return [];
    const sports = this.communitySports(this.selected);
    if (this.selectedSeasonId == null) return sports;
    const season = this.competition?.seasons?.find(item => item.id === this.selectedSeasonId);
    const normalize = (value: string): string => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (season?.sport) {
      return sports.filter(sport => normalize(sport) === normalize(season.sport!));
    }
    // Older LIVE APIs omit CommunitySeason.sport. For a selected season,
    // use ONLY its typed rounds to choose the ranking families, rather than
    // accidentally showing Football W/D/L for a Karting-only season.
    // Untyped/shared historical rounds keep their legacy all-sports view.
    const rounds = this.competition?.rounds ?? [];
    if (!rounds.length || rounds.some(round => !round.sport?.trim())) return sports;
    const playedSports = new Set(rounds.map(round => normalize(round.sport!)));
    return sports.filter(sport => playedSports.has(normalize(sport)));
  }

  /** API-backed W/D/L standings, isolated by a sport currently selected here.
   * Older backends may omit the field entirely; retain legacy rendering then. */
  get scopedMatchRankingGroups(): NonNullable<CommunityCompetitionOverview['sportStandings']> {
    if (!this.selected || !this.competition?.sportStandings) return [];
    const normalize = (sport: string) => sport.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const selected = new Set(this.rankingContextSports.map(normalize));
    const seen = new Set<string>();
    return this.competition.sportStandings.filter(group => {
      if (!group?.sport) return false;
      const key = normalize(group.sport);
      if (!selected.has(key) || seen.has(key)) return false;
      const family = formatForSport(group.sport);
      if (family !== 'team' && family !== 'duel') return false;
      seen.add(key);
      return true;
    });
  }

  get hasScopedMatchRankingContract(): boolean {
    return Array.isArray(this.competition?.sportStandings);
  }

  /** Never present combined W/D/L statistics as one sport's results once
   * a multi-sport backend contract is available. */
  get showLegacyAggregateStats(): boolean {
    return !this.hasScopedMatchRankingContract
      || (this.selected != null && this.communitySports(this.selected).length <= 1);
  }

  /** Single-sport historic records may be untyped. Preserve their old view
   * when no scoped group can be derived. Mixed sports must not fall back
   * to a misleading combined ranking. */
  get showLegacyMatchRanking(): boolean {
    return !this.hasScopedMatchRankingContract
      || (this.showLegacyAggregateStats && !this.scopedMatchRankingGroups.length);
  }

  canEditSportPoints(sport: string): boolean {
    const normalize = (value: string): string => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return formatForSport(sport) === 'team'
      && this.rankingContextSports.some(item => normalize(item) === normalize(sport))
      && this.canManage()
      && this.selectedSeasonId != null
      && this.isSelectedActiveSeason();
  }

  editSportPoints(group: NonNullable<CommunityCompetitionOverview['sportStandings']>[number]): void {
    if (!this.canEditSportPoints(group.sport) || this.sportPointsSaving) return;
    this.sportPointsEditor = group.sport;
    this.sportPointsDraft = {
      winPoints: group.scoring?.winPoints ?? this.competition?.settings.winPoints ?? 3,
      drawPoints: group.scoring?.drawPoints ?? this.competition?.settings.drawPoints ?? 1,
      lossPoints: group.scoring?.lossPoints ?? this.competition?.settings.lossPoints ?? 0
    };
    this.sportPointsError = '';
    this.sportPointsSuccess = '';
  }

  saveSportPoints(): void {
    if (!this.selected || !this.sportPointsEditor || this.sportPointsSaving
        || !this.canEditSportPoints(this.sportPointsEditor)) return;
    const values = Object.values(this.sportPointsDraft);
    if (values.some(value => !Number.isSafeInteger(value) || value < 0 || value > 1000)) {
      this.sportPointsError = t('communities.sportPoints.invalid');
      return;
    }
    const communityId = this.selected.id;
    const seasonId = this.selectedSeasonId!;
    const sport = this.sportPointsEditor;
    this.sportPointsSaving = true;
    this.sportPointsError = '';
    this.communityService.updateSportPointsRule(communityId, seasonId, {
      sport, ...this.sportPointsDraft
    }).pipe(timeout(10_000), finalize(() => this.sportPointsSaving = false)).subscribe({
      next: () => {
        if (this.selected?.id !== communityId || this.selectedSeasonId !== seasonId) return;
        this.sportPointsEditor = null;
        this.sportPointsSuccess = t('communities.sportPoints.saved');
        this.loadCompetition(this.selected, seasonId);
      },
      error: () => { this.sportPointsError = t('feedback.communities.competitionSettingsError'); }
    });
  }

  /** Include the race-specific panel even before the first classified finish. */
  get raceRankingGroups(): CommunityRaceStandingGroup[] {
    return this.selected && this.competition
      ? raceRankingGroupsForCommunity(
          this.rankingContextSports, this.competition.raceStandings)
      : [];
  }

  /** Only display racket standings for sports still selected by this community.
   * Historic API records remain untouched; removing a sport must not render
   * its results as if they belonged to another selected modality. */
  get racketRankingGroups(): CommunityRacketStandingGroup[] {
    if (!this.selected || !this.competition) return [];
    const normalized = (sport: string): string =>
      sport.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const allowed = new Set(this.rankingContextSports.map(normalized));
    return (this.competition.racketStandings ?? []).filter(group =>
      allowed.has(normalized(group.sport)) && formatForSport(group.sport) === 'duel');
  }

  /** Modalities without a supported race standings contract get a neutral
   * explanation, never football goals/assists or speculative rankings. */
  get specializedStatsUnavailableSports(): string[] {
    if (!this.selected) return [];
    const normalize = (sport: string): string => sport.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const raceSports = new Set(this.raceRankingGroups.map(group => normalize(group.sport)));
    return this.rankingContextSports.filter(sport => {
      const family = formatForSport(sport);
      return family !== 'team' && family !== 'duel'
        && !raceSports.has(normalize(sport));
    });
  }

  /** W/D/L is not a valid fallback for Karting or other measured/judged events. */
  usesMatchPointsModel(): boolean {
    const sports = this.selected ? this.rankingContextSports : [];
    return sports.length === 0 || sports.some(sport => {
      const format = formatForSport(sport);
      return format === 'team' || format === 'duel';
    });
  }

  editSports(): void {
    if (!this.selected || !this.canManage() || this.savingSports) return;
    this.sportsDraft = [...this.communitySports(this.selected)];
    this.sportsSearch = '';
    this.sportsMessage = '';
    this.editingSports = true;
  }

  cancelSportsEdit(): void {
    if (this.savingSports) return;
    this.editingSports = false;
    this.sportsSearch = '';
  }

  addCommunitySport(value: string): void {
    if (!this.editingSports || this.savingSports || this.sportsDraft.length >= 128
        || !SPORTS_CATALOG.includes(value)
        || this.sportsDraft.some(sport => sport.toLowerCase() === value.toLowerCase())) return;
    this.sportsDraft = [...this.sportsDraft, value];
    this.sportsSearch = '';
  }

  removeCommunitySport(value: string): void {
    if (this.savingSports) return;
    this.sportsDraft = this.sportsDraft.filter(sport => sport !== value);
  }

  saveCommunitySports(): void {
    if (!this.selected || !this.canManage() || !this.editingSports || this.savingSports) return;
    const id = this.selected.id;
    this.savingSports = true;
    this.errorMessage = '';
    this.sportsMessage = '';
    this.communityService.updateSports(id, [...this.sportsDraft])
      .pipe(timeout(10_000), finalize(() => this.savingSports = false))
      .subscribe({
        next: group => {
          if (this.selected?.id !== id) return;
          this.selected = group;
          this.replaceCommunity(group);
          this.editingSports = false;
          this.sportsMessage = 'Modalidades atualizadas.';
        },
        error: () => {
          if (this.selected?.id === id) this.errorMessage = 'Não foi possível atualizar as modalidades.';
        }
      });
  }

  open(community: CommunityGroup): void {
    if (!this.detailMode()) {
      void this.router.navigate(['/menu/communities', community.id]);
      return;
    }

    this.pendingArchiveDeepLinkCommunityId = null;
    this.invalidateArchiveRequests();
    // A slower response from an earlier navigation must never replace the latest group.
    const openVersion = (this.communityOpenRequestVersion || 0) + 1;
    this.communityOpenRequestVersion = openVersion;
    this.competitionRequestVersion = (this.competitionRequestVersion || 0) + 1;
    this.communitySessionsRequestVersion = (this.communitySessionsRequestVersion || 0) + 1;
    ++this.pendingRequestsLookupVersion;
    this.presentationLoading = false;
    this.editingSports = false;
    this.sportsMessage = '';
    this.sessionPolicyEditing = false;
    this.sessionPolicyFeedback = '';
    this.sessionPolicyError = '';
    this.featuresEditing = false;
    this.featuresFeedback = '';
    this.featuresError = '';
    this.pendingJoinRequestsLoading = false;
    this.pendingJoinRequests = [];
    this.communityDeleteConfirming = false;
    this.communityDeleteName = '';
    this.communityDeleteError = '';
    ++this.timelineRequestVersion;
    this.chatEventsDuringLoad?.clear();
    this.timelineEntries = [];
    this.newMessagesPending = 0;
    this.chatHasOlder = false;
    this.chatOlderError = '';
    this.chatScrollRestore = undefined;
    this.timelineError = '';
    this.timelineLoading = false;
    this.feedDraft = '';
    this.clearCommunityFeedImage();
    this.clearCommunityFeedVideo();
    this.chatDraft = '';
    this.replyingToCommunityMessage = null;
    this.chatDeliveryUncertain = false;
    this.pendingChatDelivery = undefined;
    this.errorMessage = '';

    this.communityService.get(community.id)
      .pipe(
        timeout(10_000),
        retry({ count: 1 })
      )
      .subscribe({
      next: full => {
        if (openVersion !== this.communityOpenRequestVersion) return;
        this.selected = full;
        this.resetSeasonManagementState();
        this.loadStandaloneSpeedTournament(full);
        this.resetHistoricalLinks();
        const requestedTab = this.route.snapshot.queryParamMap.get('tab');
        if (requestedTab === 'chat') {
          // Preserve existing invitation/bookmark URLs, but never reopen a
          // second chat interface inside communities.
          void this.router.navigate(['/menu/messages'], {
            queryParams: { kind: 'community', id: full.id }, replaceUrl: true
          });
          return;
        }
        const requestedMembers = requestedTab === 'members';
        const openJoinRequests = requestedMembers
          && (full.myRole === 'OWNER' || full.myRole === 'ADMIN');
        this.activeTab = requestedMembers ? 'members'
          : requestedTab === 'feed' ? 'feed'
          : requestedTab === 'chat' ? 'chat'
          : requestedTab === 'tournaments' && this.hasCompetitions(full) ? 'tournaments'
          : requestedTab === 'ranking' && (full.rankingsEnabled || this.hasCompetitions(full)) ? 'ranking'
          : requestedTab === 'stats' && full.rankingsEnabled ? 'stats'
          : requestedTab === 'sessions' ? 'sessions'
          : 'home';
        // Archive-only communities reveal the History tab after the async lists load.
        this.pendingArchiveDeepLinkCommunityId = requestedTab === 'ranking' && this.activeTab === 'home'
          ? full.id : null;
        this.inviteUsername = '';
        this.inviteSearchResults = [];
        this.inviteSearchPerformed = false;
        this.inviteMessage = '';
        this.groupInviteFeedback = '';
        this.selectedJoinRequestIds.clear();
        this.confirmingBatchJoin = false;
        this.batchJoinFeedback = '';
        this.roundDeleteConfirmId = undefined;
        this.roundSportDraft = '';
        this.roundEventTypeDraft = '';
        this.roundDisciplineDraft = '';
        this.importSportDraft = '';
        this.racketMatchFormat = 'SINGLES';
        this.racketSetScores = [{sideA: null,sideB: null},{sideA: null,sideB: null}];
        this.selectedSeasonId = null;
        this.importSeasonId = null;
        this.importFile = undefined;
        this.importFileName = '';
        this.importPreview = undefined;
        this.resetImportAfterFile();
        this.cancelCloseSeason();
        this.prepareRoundEntries(full);
        this.archiveSummaries = [];
        this.archiveOpen = undefined;
        this.archiveConfirmed = undefined;
        this.matchArchiveSummaries = [];
        this.matchArchiveOpen = undefined;
        this.matchArchiveConfirmed = undefined;
        this.resetArchiveDraft();
        this.loadMatchArchives(full.id);
        this.loadArchivedStandings(full.id);
        this.loadCompetition(full);
        this.loadCommunitySessions(full);
        if (this.activeTab === 'feed' || this.activeTab === 'chat') this.loadTimeline();
        if (openJoinRequests) this.loadPendingJoinRequests(full.id);
      },
      error: () => {
        if (openVersion === this.communityOpenRequestVersion) {
          this.errorMessage = t('feedback.communities.openError');
        }
      }
    });
  }

  hasCommunitySeasonGames(): boolean {
    return !!this.selected && this.communitySessions.some(
      session => session.seasonCommunityId === this.selected?.id
    );
  }

  setTab(tab: CommunityTab): void {
    if ((tab === 'tournaments' && !this.hasCompetitions(this.selected))
        || (tab === 'ranking' && !this.canBrowseHistoricalArchives)
        || (tab === 'stats' && !this.selected?.rankingsEnabled)) return;
    this.activeTab = tab;
    if (tab !== 'ranking') this.closeRankingHistoricalDialog();
    if (tab === 'sessions' && this.selected && !this.selected.rankingsEnabled) {
      this.loadStandaloneSpeedTournament(this.selected);
    }
    this.replyingToCommunityMessage = null;
    this.chatDeliveryUncertain = false;
    this.pendingChatDelivery = undefined;
    ++this.timelineRequestVersion;
    this.chatEventsDuringLoad?.clear();
    this.timelineEntries = [];
    this.newMessagesPending = 0;
    this.chatHasOlder = false;
    this.chatOlderError = '';
    this.chatScrollRestore = undefined;
    this.timelineError = '';
    this.timelineLoading = false;
    if (tab === 'feed' || tab === 'chat') this.loadTimeline();
    this.pendingArchiveDeepLinkCommunityId = null;
    this.errorMessage = '';

    if (tab === 'members' && this.selected && this.canManage()) {
      this.loadPendingJoinRequests(this.selected.id);
    }
  }

  private resetHistoricalLinks(): void {
    this.closeRankingHistoricalDialog();
    this.rankingHistoricalSuccess = '';
    this.historicalPlayers = [];
    this.historicalPlayersLoading = false;
    this.historicalPlayersError = '';
    this.historicalPlayerId = null;
    this.historicalClaimAcknowledged = false;
    this.historicalClaimSaving = false;
    this.historicalClaimMessage = '';
    this.historicalClaims = [];
    this.historicalClaimsLoading = false;
    this.historicalClaimsError = '';
    this.historicalReleaseId = null;
  }

  loadHistoricalLinks(communityId: number): void {
    if (this.selected?.id !== communityId) return;
    this.historicalClaimsLoading = true;
    this.historicalClaimsError = '';
    this.communityService.myHistoricalClaims(communityId)
      .pipe(timeout(10_000), finalize(() => {
        if (this.selected?.id === communityId) this.historicalClaimsLoading = false;
      }))
      .subscribe({
        next: claims => {
          if (this.selected?.id === communityId) this.historicalClaims = claims;
        },
        error: () => {
          if (this.selected?.id === communityId) this.historicalClaimsError = t('communities.identity.loadError');
        }
      });
    this.historicalPlayersLoading = true;
    this.historicalPlayersError = '';
    this.communityService.historicalPlayerCandidates(communityId)
      .pipe(timeout(10_000), finalize(() => {
        if (this.selected?.id === communityId) this.historicalPlayersLoading = false;
      }))
      .subscribe({
        next: players => {
          if (this.selected?.id !== communityId) return;
          this.historicalPlayers = players;
          // Deleting a season can remove the previously selected imported name.
          if (this.historicalPlayerId !== null &&
              !players.some(player => player.playerId === this.historicalPlayerId)) {
            this.historicalPlayerId = null;
            this.historicalClaimAcknowledged = false;
          }
        },
        error: () => {
          if (this.selected?.id === communityId) this.historicalPlayersError = t('communities.identity.loadError');
        }
      });
  }

  /**
   * Historical ranking statistics are always available to view, even when the
   * player has no account or the viewer is not a community member.
   * Claim eligibility is checked separately and only after an explicit request.
   */
  openRankingHistoricalPlayer(row: CommunityStanding): void {
    if (!this.selected || row.username || !row.fullName?.trim()) return;
    this.closeRankingHistoricalDialog();
    this.rankingHistoricalSuccess = '';
    this.rankingHistoricalRow = row;
  }

  startRankingHistoricalClaim(): void {
    const row = this.rankingHistoricalRow;
    if (!this.selected || !row || row.username || this.rankingHistoricalSaving
        || this.rankingHistoricalLoading) return;
    this.rankingHistoricalClaimExpanded = true;
    this.rankingHistoricalCandidate = undefined;
    this.rankingHistoricalAcknowledged = false;
    this.rankingHistoricalError = '';
    if (!this.selected.myRole) {
      this.rankingHistoricalError = t('communities.identity.claimMembersOnly');
      return;
    }
    const communityId = this.selected.id;
    const requestVersion = ++this.rankingHistoricalRequestVersion;
    this.rankingHistoricalLoading = true;
    this.communityService.historicalPlayerCandidates(communityId)
      .pipe(timeout(10_000), finalize(() => {
        if (this.rankingHistoricalRequestVersion === requestVersion) {
          this.rankingHistoricalLoading = false;
        }
      }))
      .subscribe({
        next: candidates => {
          if (this.rankingHistoricalRequestVersion !== requestVersion ||
              this.selected?.id !== communityId || this.rankingHistoricalRow !== row) return;
          const name = row.fullName!.trim().normalize('NFC').toLocaleLowerCase();
          const matching = candidates.filter(candidate =>
            candidate.historicalName.trim().normalize('NFC').toLocaleLowerCase() === name);
          if (matching.length !== 1 || matching[0].linkStatus !== 'UNLINKED') {
            this.rankingHistoricalError = t('communities.identity.claimUnavailable');
            return;
          }
          this.rankingHistoricalCandidate = matching[0];
        },
        error: () => {
          if (this.rankingHistoricalRequestVersion === requestVersion &&
              this.selected?.id === communityId && this.rankingHistoricalRow === row) {
            this.rankingHistoricalError = t('communities.identity.loadError');
          }
        }
      });
  }

  closeRankingHistoricalDialog(): void {
    if (this.rankingHistoricalSaving) return;
    this.rankingHistoricalRequestVersion = (this.rankingHistoricalRequestVersion || 0) + 1;
    this.rankingHistoricalRow = undefined;
    this.rankingHistoricalClaimExpanded = false;
    this.rankingHistoricalCandidate = undefined;
    this.rankingHistoricalLoading = false;
    this.rankingHistoricalAcknowledged = false;
    this.rankingHistoricalError = '';
  }

  confirmRankingHistoricalClaim(): void {
    if (!this.selected?.myRole || !this.rankingHistoricalClaimExpanded ||
        !this.rankingHistoricalRow || !this.rankingHistoricalCandidate ||
        !this.rankingHistoricalAcknowledged || this.rankingHistoricalSaving) return;
    const communityId = this.selected.id;
    const playerId = this.rankingHistoricalCandidate.playerId;
    const requestVersion = this.rankingHistoricalRequestVersion;
    this.rankingHistoricalSaving = true;
    this.rankingHistoricalError = '';
    this.communityService.claimHistoricalPlayer(communityId, playerId)
      .pipe(timeout(10_000), finalize(() => this.rankingHistoricalSaving = false))
      .subscribe({
        next: () => {
          if (this.rankingHistoricalRequestVersion !== requestVersion ||
              this.selected?.id !== communityId) return;
          this.rankingHistoricalSaving = false;
          this.closeRankingHistoricalDialog();
          this.rankingHistoricalSuccess = t('communities.identity.claimed');
          this.loadHistoricalLinks(communityId);
          this.loadCompetition(this.selected, this.selectedSeasonId);
        },
        error: error => {
          if (this.rankingHistoricalRequestVersion === requestVersion &&
              this.selected?.id === communityId) {
            this.rankingHistoricalError = error.error?.message || t('communities.identity.claimError');
          }
        }
      });
  }

  claimHistoricalName(): void {
    if (!this.selected || this.historicalClaimSaving || !this.historicalClaimAcknowledged ||
        this.historicalPlayerId === null ||
        !this.availableHistoricalPlayers.some(player => player.playerId === this.historicalPlayerId)) return;
    const communityId = this.selected.id;
    this.historicalClaimSaving = true;
    this.historicalClaimMessage = '';
    this.historicalPlayersError = '';
    this.communityService.claimHistoricalPlayer(communityId, this.historicalPlayerId)
      .pipe(timeout(10_000), finalize(() => {
        if (this.selected?.id === communityId) this.historicalClaimSaving = false;
      }))
      .subscribe({
        next: () => {
          if (this.selected?.id !== communityId) return;
          this.historicalPlayerId = null;
          this.historicalClaimAcknowledged = false;
          this.historicalClaimMessage = t('communities.identity.claimed');
          this.loadHistoricalLinks(communityId);
          this.loadCompetition(this.selected, this.selectedSeasonId);
        },
        error: error => {
          if (this.selected?.id === communityId) {
            this.historicalPlayersError = error.error?.message || t('communities.identity.claimError');
          }
        }
      });
  }

  releaseHistoricalName(link: HistoricalPlayerLink): void {
    if (!this.selected || this.historicalReleaseId !== null ||
        !this.historicalClaims.some(claim => claim.id === link.id)) return;
    const communityId = this.selected.id;
    this.historicalReleaseId = link.id;
    this.historicalClaimsError = '';
    this.communityService.releaseHistoricalClaim(communityId, link.id)
      .pipe(timeout(10_000), finalize(() => {
        if (this.selected?.id === communityId) this.historicalReleaseId = null;
      }))
      .subscribe({
        next: () => {
          if (this.selected?.id !== communityId) return;
          this.historicalClaimMessage = t('communities.identity.released');
          this.loadHistoricalLinks(communityId);
          this.loadCompetition(this.selected, this.selectedSeasonId);
        },
        error: error => {
          if (this.selected?.id === communityId) {
            this.historicalClaimsError = error.error?.message || t('communities.identity.releaseError');
          }
        }
      });
  }

  private loadPendingJoinRequests(communityId: number): void {
    const lookupVersion = ++this.pendingRequestsLookupVersion;
    this.pendingJoinRequestsLoading = true;
    this.communityService.pendingJoinRequests(communityId)
      .pipe(
        timeout(10_000),
        finalize(() => {
          if (lookupVersion === this.pendingRequestsLookupVersion) {
            this.pendingJoinRequestsLoading = false;
          }
        })
      )
      .subscribe({
        next: requests => {
          if (lookupVersion !== this.pendingRequestsLookupVersion
              || this.selected?.id !== communityId) return;
          this.pendingJoinRequests = requests;
          this.selectedJoinRequestIds.clear();
          this.confirmingBatchJoin = false;
        },
        error: () => {
          if (lookupVersion !== this.pendingRequestsLookupVersion
              || this.selected?.id !== communityId) return;
          this.pendingJoinRequests = [];
          this.selectedJoinRequestIds.clear();
          this.confirmingBatchJoin = false;
          this.errorMessage = t('feedback.communities.joinRequestsLoadError');
        }
      });
  }

  selectedJoinRequestCount(): number {
    return this.pendingJoinRequests.filter(request => this.selectedJoinRequestIds.has(request.id)).length;
  }

  allJoinRequestsSelected(): boolean {
    return this.pendingJoinRequests.length > 0
      && this.selectedJoinRequestCount() === this.pendingJoinRequests.length;
  }

  selectJoinRequest(id: number, checked: boolean): void {
    if (this.batchJoining || this.joinRequestActionId !== undefined) return;
    if (checked) this.selectedJoinRequestIds.add(id);
    else this.selectedJoinRequestIds.delete(id);
    this.confirmingBatchJoin = false;
    this.batchJoinFeedback = '';
  }

  toggleAllJoinRequests(): void {
    if (this.batchJoining || this.joinRequestActionId !== undefined) return;
    this.selectedJoinRequestIds = this.allJoinRequestsSelected()
      ? new Set<number>()
      : new Set(this.pendingJoinRequests.map(request => request.id));
    this.confirmingBatchJoin = false;
    this.batchJoinFeedback = '';
  }

  beginBatchApproval(): void {
    if (!this.selected || !this.canManage() || this.batchJoining
        || this.joinRequestActionId !== undefined || this.selectedJoinRequestCount() === 0) return;
    this.confirmingBatchJoin = true;
    this.batchJoinFeedback = '';
  }

  cancelBatchApproval(): void {
    this.confirmingBatchJoin = false;
  }

  async confirmBatchApproval(): Promise<void> {
    const communityId = this.selected?.id;
    if (!communityId || !this.canManage() || !this.confirmingBatchJoin
        || this.batchJoining || this.joinRequestActionId !== undefined) return;
    const requests = this.pendingJoinRequests.filter(request => this.selectedJoinRequestIds.has(request.id));
    this.confirmingBatchJoin = false;
    if (!requests.length) return;

    // An earlier pending-list GET must not resurrect approved requests.
    ++this.pendingRequestsLookupVersion;
    this.pendingJoinRequestsLoading = false;
    this.batchJoining = true;
    this.batchJoinFeedback = '';
    this.batchJoinTotal = requests.length;
    this.batchJoinProcessed = 0;
    let approved = 0;
    let failed = 0;

    try {
      for (const request of requests) {
        try {
          await firstValueFrom(
            this.communityService.acceptJoinRequest(communityId, request.id).pipe(timeout(10_000))
          );
          approved++;
          this.selectedJoinRequestIds.delete(request.id);
          if (this.selected?.id === communityId) {
            this.pendingJoinRequests = this.pendingJoinRequests.filter(item => item.id !== request.id);
          }
        } catch {
          failed++;
        }
        this.batchJoinProcessed++;
      }
    } finally {
      this.batchJoining = false;
    }
    if (this.selected?.id === communityId) {
      if (approved) this.refreshSelected();
      this.batchJoinFeedback = failed
        ? t('communities.batchApprovalPartial', { approved, failed })
        : t('communities.batchApprovalSuccess', { count: approved });
    }
  }

  acceptPendingJoinRequest(request: CommunityJoinRequest): void {
    if (!this.selected || this.joinRequestActionId !== undefined || this.batchJoining) {
      return;
    }

    ++this.pendingRequestsLookupVersion;
    this.pendingJoinRequestsLoading = false;
    this.joinRequestActionId = request.id;
    this.errorMessage = '';

    this.communityService.acceptJoinRequest(this.selected.id, request.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.joinRequestActionId = undefined)
      )
      .subscribe({
        next: () => {
          this.pendingJoinRequests = this.pendingJoinRequests.filter(item => item.id !== request.id);
          this.selectedJoinRequestIds.delete(request.id);
          this.confirmingBatchJoin = false;
          this.refreshSelected();
        },
        error: error => {
          this.errorMessage = error.error?.message
            || t('feedback.communities.joinRequestActionError');
        }
      });
  }

  rejectPendingJoinRequest(request: CommunityJoinRequest): void {
    if (!this.selected || this.joinRequestActionId !== undefined || this.batchJoining) {
      return;
    }

    ++this.pendingRequestsLookupVersion;
    this.pendingJoinRequestsLoading = false;
    this.joinRequestActionId = request.id;
    this.errorMessage = '';

    this.communityService.rejectJoinRequest(this.selected.id, request.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.joinRequestActionId = undefined)
      )
      .subscribe({
        next: () => {
          this.pendingJoinRequests = this.pendingJoinRequests.filter(item => item.id !== request.id);
          this.selectedJoinRequestIds.delete(request.id);
          this.confirmingBatchJoin = false;
        },
        error: error => {
          this.errorMessage = error.error?.message
            || t('feedback.communities.joinRequestActionError');
        }
      });
  }

  loadCommunitySessions(community: CommunityGroup = this.selected as CommunityGroup): void {
    const requestVersion = (this.communitySessionsRequestVersion || 0) + 1;
    this.communitySessionsRequestVersion = requestVersion;
    if (!community) {
      this.communitySessions = [];
      return;
    }

    this.sessionsLoading = true;
    this.communityService.sessions(community.id)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => {
          if (requestVersion === this.communitySessionsRequestVersion) this.sessionsLoading = false;
        })
      )
      .subscribe({
        next: sessions => {
          if (requestVersion !== this.communitySessionsRequestVersion ||
              this.selected?.id !== community.id) return;
          this.communitySessions = sessions;
          if (this.canManage()) this.loadRecordedCommunitySessionResults(community.id);
        },
        error: () => {
          if (requestVersion !== this.communitySessionsRequestVersion ||
              this.selected?.id !== community.id) return;
          this.communitySessions = [];
          this.errorMessage = t('feedback.communities.sessionsLoadError');
        }
      });
  }

  canRecordCommunitySession(session: SessionSummary): boolean {
    return this.canManage()
      && (session.communityId == null || session.communityId === this.selected?.id)
      && (session.seasonCommunityId == null || session.seasonCommunityId === this.selected?.id)
      && !!this.competition?.settings?.rankingsEnabled
      && session.status !== 'CANCELLED'
      && Number.isFinite(Date.parse(session.gameDate))
      && Date.parse(session.gameDate) < Date.now();
  }

  loadRecordedCommunitySessionResults(communityId: number): void {
    // Keep isolated community test stubs and gradually upgraded services compatible.
    const list = this.communityService.recordedSessionResults;
    if (typeof list !== 'function') return;
    list.call(this.communityService, communityId)
      .pipe(timeout(10_000))
      .subscribe({
        next: ids => {
          if (this.selected?.id === communityId) {
            this.recordedCommunitySessionIds = new Set(ids);
          }
        },
        error: () => {
          // The server remains authoritative and rejects any duplicate confirmation.
          if (this.selected?.id === communityId) {
            this.recordedCommunitySessionIds = new Set<number>();
          }
        }
      });
  }

  closeCommunitySessionResult(): void {
    ++this.sessionResultRevision;
    this.sessionResultSession = undefined;
    this.sessionResultPlayers = [];
    this.sessionResultWinner = '';
    this.sessionResultError = '';
    this.sessionResultLoading = false;
  }

  openCommunitySessionResult(session: SessionSummary): void {
    if (!this.selected || !this.canRecordCommunitySession(session)
        || this.recordedCommunitySessionIds.has(session.id) || this.sessionResultSaving) return;
    this.closeCommunitySessionResult();
    const version = this.sessionResultRevision;
    const communityId = this.selected.id;
    this.sessionResultSession = session;
    this.sessionResultSuccess = '';
    this.sessionResultLoading = true;
    this.communityService.sessionResultRoster(communityId, session.id)
      .pipe(timeout(10_000), finalize(() => {
        if (this.sessionResultRevision === version) this.sessionResultLoading = false;
      }))
      .subscribe({
        next: players => {
          if (this.sessionResultRevision !== version || this.selected?.id !== communityId) return;
          this.sessionResultPlayers = players
            .filter(p => p.attendanceStatus !== 'NO_SHOW' && p.attendanceStatus !== 'LATE_CANCELLED')
            .map(p => ({
              username: p.username,
              included: p.attendanceStatus === 'ATTENDED',
              team: p.teamCode === 'A' || p.teamCode === 'B' ? p.teamCode : '' as const
            }));
        },
        error: () => {
          if (this.sessionResultRevision === version && this.selected?.id === communityId) {
            this.sessionResultError = t('communities.sessionResult.loadError');
          }
        }
      });
  }

  get canConfirmCommunitySessionResult(): boolean {
    if (!this.sessionResultSession || this.sessionResultLoading || this.sessionResultSaving
        || !this.sessionResultWinner) return false;
    const included = this.sessionResultPlayers.filter(p => p.included);
    return included.some(p => p.team === 'A') && included.some(p => p.team === 'B')
      && included.every(p => p.team === 'A' || p.team === 'B');
  }

  confirmCommunitySessionResult(): void {
    if (!this.selected || !this.canConfirmCommunitySessionResult
        || !this.canRecordCommunitySession(this.sessionResultSession!)
        || this.recordedCommunitySessionIds.has(this.sessionResultSession!.id)) return;
    const communityId = this.selected.id;
    const sessionId = this.sessionResultSession!.id;
    const version = this.sessionResultRevision;
    const request = {
      outcome: this.sessionResultWinner as 'A' | 'B' | 'DRAW',
      players: this.sessionResultPlayers
        .filter(p => p.included && (p.team === 'A' || p.team === 'B'))
        .map(p => ({ username: p.username, team: p.team as 'A' | 'B' }))
    };
    this.sessionResultSaving = true;
    this.sessionResultError = '';
    this.communityService.recordSessionResult(communityId, sessionId, request)
      .pipe(timeout(15_000), finalize(() => this.sessionResultSaving = false))
      .subscribe({
        next: () => {
          if (this.selected?.id !== communityId || this.sessionResultRevision !== version) return;
          this.recordedCommunitySessionIds = new Set([...this.recordedCommunitySessionIds, sessionId]);
          this.closeCommunitySessionResult();
          this.sessionResultSuccess = t('communities.sessionResult.saved');
          this.loadCompetition(this.selected, this.selectedSeasonId);
        },
        error: error => {
          if (this.selected?.id === communityId && this.sessionResultRevision === version) {
            this.sessionResultError = error?.status === 409
              ? t('communities.sessionResult.conflict')
              : error?.error?.message || t('communities.sessionResult.saveError');
            if (error?.status === 409) this.loadRecordedCommunitySessionResults(communityId);
          }
        }
      });
  }

  canJoinCommunitySession(session: SessionSummary): boolean {
    const start = Date.parse(session.gameDate);
    return !session.privateGame
      && !session.joinedByViewer
      && !session.waitlistedByViewer
      && (session.status === 'OPEN' || session.status === 'FULL')
      && Number.isFinite(start) && start > Date.now();
  }

  joinCommunitySession(session: SessionSummary): void {
    if (!this.selected || this.joiningSessionId !== undefined
        || !this.canJoinCommunitySession(session)) {
      return;
    }

    const communityId = this.selected.id;
    this.joiningSessionId = session.id;
    this.errorMessage = '';

    this.sessionService.join(session.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.joiningSessionId = undefined)
      )
      .subscribe({
        next: () => {
          if (this.selected?.id === communityId) {
            this.loadCommunitySessions(this.selected);
          }
        },
        error: error => {
          if (this.selected?.id === communityId) {
            this.errorMessage = error.error?.message
              || t('feedback.communities.joinSessionError');
          }
        }
      });
  }

  canOpenSessionToPublic(session: SessionSummary): boolean {
    const start = Date.parse(session.gameDate);
    return this.canManage()
      && session.audience === 'COMMUNITY_ONLY'
      && (session.status === 'OPEN' || session.status === 'FULL')
      && Number.isFinite(start) && start > Date.now()
      && session.participantCount < session.maxParticipants;
  }

  canRestrictSessionToMembers(session: SessionSummary): boolean {
    const start = Date.parse(session.gameDate);
    return this.canManage() && session.audience === 'PUBLIC'
      && (session.communityId === undefined || session.communityId === this.selected?.id)
      && (session.status === 'OPEN' || session.status === 'FULL')
      && Number.isFinite(start) && start > Date.now();
  }

  restrictSessionToMembers(session: SessionSummary): void {
    if (!this.selected || !this.canRestrictSessionToMembers(session)
        || this.openingSessionId !== undefined) return;
    const communityId = this.selected.id;
    this.openingSessionId = session.id;
    this.errorMessage = '';
    this.communityService.restrictSessionToMembers(communityId, session.id)
      .pipe(timeout(10_000), finalize(() => this.openingSessionId = undefined))
      .subscribe({
        next: updated => {
          if (this.selected?.id !== communityId) return;
          this.communitySessions = this.communitySessions.map(item =>
            item.id === updated.id ? updated : item);
        },
        error: () => {
          if (this.selected?.id === communityId)
            this.errorMessage = t('feedback.communities.restrictMembersError');
        }
      });
  }

  openSessionToPublic(session: SessionSummary): void {
    if (!this.selected || !this.canOpenSessionToPublic(session)
        || this.openingSessionId !== undefined) {
      return;
    }

    const communityId = this.selected.id;
    this.openingSessionId = session.id;
    this.errorMessage = '';
    this.communityService.openSessionToPublic(communityId, session.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.openingSessionId = undefined)
      )
      .subscribe({
        next: updated => {
          if (this.selected?.id === communityId) {
            this.communitySessions = this.communitySessions.map(item =>
              item.id === updated.id ? updated : item
            );
          }
        },
        error: () => {
          if (this.selected?.id === communityId) {
            this.errorMessage = t('feedback.communities.openPublicError');
          }
        }
      });
  }

  private loadSprintBrackets(communityId: number, seasonId: number | null): void {
    const requestVersion = ++this.sprintBracketRequestVersion;
    this.sprintBrackets = [];
    if (this.sprintReviewContext !== communityId + '/' + seasonId) {
      this.sprintReviewBracketId = null;
      this.sprintReviewIncidentId = null;
      this.sprintReviewHistory = [];
      this.sprintReviewContext = '';
    }
    this.sprintBracketError = '';
    if (seasonId == null || this.selectedSeasonId !== seasonId
        || !this.selectedSeasonSupportsSport('Ciclismo de Pista')) {
      this.sprintBracketLoading = false;
      return;
    }
    this.sprintBracketLoading = true;
    this.communityService.trackSprintBrackets(communityId, seasonId)
      .pipe(timeout(10_000), finalize(() => {
        if (requestVersion === this.sprintBracketRequestVersion) this.sprintBracketLoading = false;
      })).subscribe({
        next: brackets => {
          if (requestVersion !== this.sprintBracketRequestVersion
              || this.selected?.id !== communityId || this.selectedSeasonId !== seasonId) return;
          this.sprintBrackets = brackets;
        },
        error: () => {
          if (requestVersion !== this.sprintBracketRequestVersion) return;
          this.sprintBracketError = t('communities.trackCycling.bracketLoadError');
        }
      });
  }

  get availableSprintQualifyingRounds(): CommunityRound[] {
    return availableSprintQualifiers(this.competition?.rounds || [],
      this.sprintBracketFormatDraft === 'TWENTY_EIGHT_RIDER_1_16' ? 28
        : this.sprintBracketFormatDraft === 'OLYMPIC_TWENTY_FOUR_REPECHAGE' ? 24 : 16);
  }

  get sprintTieGroups(): SprintQualificationTieGroup[] {
    const round = this.availableSprintQualifyingRounds.find(
      r => r.id === this.sprintBracketQualifyingRoundIdDraft);
    const starters = this.sprintBracketFormatDraft === 'TWENTY_EIGHT_RIDER_1_16'
      ? 28 : this.sprintBracketFormatDraft === 'OLYMPIC_TWENTY_FOUR_REPECHAGE'
        ? 24 : 16;
    return sprintQualificationTieGroups(round, starters);
  }

  onSprintBracketFormatChanged(): void {
    this.sprintBracketQualifyingRoundIdDraft = null;
    this.sprintTieDrafts = {};
  }

  onSprintQualifierChanged(roundId: number | null): void {
    this.sprintBracketQualifyingRoundIdDraft = roundId;
    this.sprintTieDrafts = {};
    for (const group of this.sprintTieGroups) {
      this.sprintTieDrafts[group.key] = emptySprintTieDraft(group);
    }
  }

  canCreateSprintBracket(): boolean {
    if (!this.sprintBracketNameDraft.trim()) return false;
    if (this.sprintBracketFormatDraft === 'EIGHT_RIDER_FINALS') return true;
    if (this.sprintBracketQualifyingRoundIdDraft == null
        || !this.availableSprintQualifyingRounds.some(
          r => r.id === this.sprintBracketQualifyingRoundIdDraft)) return false;
    return sprintOfficialTieDecisions(this.sprintTieGroups, this.sprintTieDrafts) !== null;
  }

  deleteSprintBracket(bracketId: number): void {
    if (!this.selected || !this.canManage() || this.selectedSeasonId == null ||
        this.selectedSeasonId !== this.activeSeason()?.id) return;
    if (this.deletingSprintBracketId !== bracketId) {
      this.deletingSprintBracketId = bracketId;
      return;
    }
    const communityId = this.selected.id;
    const seasonId = this.selectedSeasonId;
    this.sprintBracketSaving = true;
    this.sprintBracketError = '';
    this.communityService.deleteTrackSprintBracket(communityId, seasonId, bracketId)
      .pipe(timeout(10_000), finalize(() => this.sprintBracketSaving = false))
      .subscribe({
        next: () => {
          this.deletingSprintBracketId = null;
          this.loadSprintBrackets(communityId, seasonId);
        },
        error: error => this.sprintBracketError = error.error?.message
          || t('communities.trackCycling.bracketDeleteError')
      });
  }

  createSprintBracket(): void {
    const seasonId = this.selectedSeasonId;
    const name = this.sprintBracketNameDraft.trim();
    if (!this.selected || !this.canManage() || seasonId == null ||
        !this.activeSeason() || seasonId !== this.activeSeason()?.id ||
        this.sprintBracketSaving || !name || name.length > 80 ||
        !this.canCreateSprintBracket()) {
      this.sprintBracketError = t('communities.trackCycling.bracketInvalid');
      return;
    }
    const communityId = this.selected.id;
    this.sprintBracketSaving = true;
    this.sprintBracketError = '';
    const officialTieDecisions = sprintOfficialTieDecisions(
      this.sprintTieGroups, this.sprintTieDrafts) ?? [];
    this.communityService.createTrackSprintBracket(communityId, seasonId, name,
      this.sprintBracketFormatDraft,
      this.sprintBracketFormatDraft !== 'EIGHT_RIDER_FINALS'
        ? this.sprintBracketQualifyingRoundIdDraft : null,
      officialTieDecisions)
      .pipe(timeout(10_000), finalize(() => this.sprintBracketSaving = false))
      .subscribe({
        next: () => {
          this.sprintBracketNameDraft = '';
          this.sprintBracketQualifyingRoundIdDraft = null;
          this.sprintTieDrafts = {};
          this.sprintBracketFormatDraft = 'EIGHT_RIDER_FINALS';
          this.loadSprintBrackets(communityId, seasonId);
        },
        error: error => this.sprintBracketError = error.error?.message
          || t('communities.trackCycling.bracketCreateError')
      });
  }

  get sprintReviewLastAction(): TrackSprintOfficialReview['action'] | null {
    return this.sprintReviewHistory.length
      ? this.sprintReviewHistory[this.sprintReviewHistory.length - 1].action : null;
  }

  get sprintReviewLastOverturn(): TrackSprintOfficialReview | undefined {
    return [...this.sprintReviewHistory].reverse().find(event => event.action === 'OVERTURNED');
  }

  get sprintReviewRiderOrder(): string[] {
    const bracket=this.sprintBrackets.find(b=>b.id===this.sprintReviewBracketId);
    const incident=(bracket?.incidents||[]).find(i=>i.id===this.sprintReviewIncidentId);
    const match=bracket?.matches.find(m=>m.seriesKey===incident?.seriesKey);
    return [match?.riderA,match?.riderB]
      .filter((value):value is string=>typeof value==='string' && !!value.trim());
  }

  openSprintReview(bracketId: number, incidentId: number): void {
    if (this.sprintReviewBracketId === bracketId && this.sprintReviewIncidentId === incidentId) {
      this.sprintReviewBracketId = null;
      this.sprintReviewIncidentId = null;
      this.sprintReviewHistory = [];
      this.sprintReviewContext = '';
      return;
    }
    this.sprintReviewBracketId = bracketId;
    this.sprintReviewIncidentId = incidentId;
    this.sprintReviewContext = this.selected?.id + '/' + this.selectedSeasonId;
    this.sprintReviewMode = 'REQUEST';
    this.sprintReviewPresident = '';
    this.sprintReviewReference = '';
    this.sprintReviewPanelReference = '';
    this.sprintReviewReason = '';
    this.sprintReviewJudgeRefereeConfirmed = false;
    this.sprintReviewOutcome = '';
    this.sprintReviewSanctionAnnulledConfirmed = false;
    this.sprintReviewRiderOrderConfirmed = false;
    this.sprintReviewNextHeatNumber = null;
    this.sprintReviewHistory = [];
    this.sprintReviewError = '';
    this.loadSprintReviewHistory();
  }

  private loadSprintReviewHistory(): void {
    if (!this.selected || this.selectedSeasonId == null ||
        this.sprintReviewBracketId == null || this.sprintReviewIncidentId == null) return;
    const group = this.selected.id, season = this.selectedSeasonId,
      bracket = this.sprintReviewBracketId, incident = this.sprintReviewIncidentId;
    this.sprintReviewLoading = true;
    this.communityService.sprintOfficialReviews(group, season, bracket, incident)
      .pipe(timeout(10_000), finalize(() => this.sprintReviewLoading = false)).subscribe({
        next: history => {
          if (this.selected?.id !== group || this.selectedSeasonId !== season ||
              this.sprintReviewBracketId !== bracket || this.sprintReviewIncidentId !== incident) return;
          this.sprintReviewHistory = history;
          this.sprintReviewMode = this.sprintReviewLastAction === 'OVERTURNED'
            ? 'RECTIFY' : this.sprintReviewLastAction === 'REQUESTED' ? 'DECIDE' : 'REQUEST';
          this.sprintReviewError = '';
        },
        error: e => this.sprintReviewError = e.error?.message
          || t('communities.trackCycling.reviewLoadError')
      });
  }

  saveSprintReview(): void {
    if (!this.selected || !this.canManage() || this.sprintReviewSaving ||
        this.selectedSeasonId == null || this.selectedSeasonId !== this.activeSeason()?.id ||
        this.sprintReviewBracketId == null || this.sprintReviewIncidentId == null ||
        this.sprintReviewPresident.trim().length < 3 ||
        this.sprintReviewReference.trim().length < 12 ||
        this.sprintReviewReason.trim().length < 12) return;
    const group = this.selected.id, season = this.selectedSeasonId,
      bracket = this.sprintReviewBracketId, incident = this.sprintReviewIncidentId;
    const write$ = this.sprintReviewMode === 'RECTIFY'
      ? (this.sprintReviewLastAction === 'OVERTURNED'
          && this.sprintReviewSanctionAnnulledConfirmed
          && this.sprintReviewRiderOrderConfirmed
          && this.sprintReviewLastOverturn
          && this.sprintReviewRiderOrder.length === 2
          && Number.isInteger(this.sprintReviewNextHeatNumber)
          && this.sprintReviewNextHeatNumber! >= 1
          && this.sprintReviewNextHeatNumber! <= 3
          ? this.communityService.rectifySprintOfficialReview(group, season, bracket, incident, {
              presidentName: this.sprintReviewPresident.trim(),
              instructionReference: this.sprintReviewReference.trim(),
              overturnedDecisionReference: this.sprintReviewLastOverturn.officialReference,
              reason: this.sprintReviewReason.trim(),
              sanctionAnnulledByPresident: true,
              orderedRiders: this.sprintReviewRiderOrder,
              nextHeatNumber: this.sprintReviewNextHeatNumber!
            }) : null)
      : this.sprintReviewMode === 'REQUEST'
      ? (this.sprintReviewJudgeRefereeConfirmed
        ? this.communityService.requestSprintOfficialReview(group, season, bracket, incident, {
            presidentName: this.sprintReviewPresident.trim(),
            requestReference: this.sprintReviewReference.trim(),
            reason: this.sprintReviewReason.trim(),
            originalJudgeRefereeDecision: true
          }) : null)
      : (this.sprintReviewOutcome && this.sprintReviewPanelReference.trim().length >= 12
        ? this.communityService.resolveSprintOfficialReview(group, season, bracket, incident, {
            outcome: this.sprintReviewOutcome,
            presidentName: this.sprintReviewPresident.trim(),
            panelReviewReference: this.sprintReviewPanelReference.trim(),
            presidentDecisionReference: this.sprintReviewReference.trim(),
            reason: this.sprintReviewReason.trim()
          }) : null);
    if (!write$) return;
    this.sprintReviewSaving = true;
    this.sprintReviewError = '';
    write$.pipe(timeout(10_000), finalize(() => this.sprintReviewSaving = false)).subscribe({
      next: () => {
        this.sprintReviewReference = '';
        this.sprintReviewPanelReference = '';
        this.sprintReviewReason = '';
        this.sprintReviewOutcome = '';
        this.sprintReviewJudgeRefereeConfirmed = false;
        this.sprintReviewSanctionAnnulledConfirmed = false;
        this.sprintReviewRiderOrderConfirmed = false;
        this.sprintReviewNextHeatNumber = null;
        this.loadSprintReviewHistory();
        this.loadSprintBrackets(group, season);
      },
      error: e => this.sprintReviewError = e.error?.message
        || t('communities.trackCycling.reviewSaveError')
    });
  }

  sprintCanRatifyPositions(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): boolean {
    const match=bracket.matches.find(m=>m.seriesKey===incident.seriesKey);
    return bracket.format==='OLYMPIC_TWENTY_FOUR_REPECHAGE' && !bracket.interruption
      && incident.status==='POSITIONS_PENDING'
      && incident.decisionType==='OFFICIAL_RESULT_TO_RECORD'
      && ['FALL','PUNCTURE','BICYCLE_DEFECT'].includes(incident.incidentType)
      && /^SP[1-9][0-9]*-(A(?:[1-9]|1[0-2])|C[1-8]|E[1-6]|Q[1-4]|S[1-2]|B|G)$/.test(incident.seriesKey)
      && this.sprintNeutralEligibleRiders(bracket,incident).length===2
      && !!match && (match.status==='READY'||match.status==='IN_PROGRESS')
      && match.winner==null;
  }

  editSprintOfficialPositions(bracketId: number,incidentId: number): void {
    this.sprintPositionsBracketId=bracketId;
    this.sprintPositionsIncidentId=incidentId;
    this.sprintPositionsFirstRider='';
    this.sprintPositionsSecondRider='';
    this.sprintPositionsReference='';
    this.sprintPositionsReason='';
    this.sprintPositionsPanelConfirmed=false;
    this.sprintIncidentError='';
  }

  saveSprintOfficialPositions(): void {
    const bracket=this.sprintBrackets.find(b=>b.id===this.sprintPositionsBracketId);
    const incident=(bracket?.incidents||[]).find(i=>i.id===this.sprintPositionsIncidentId);
    if(!this.selected||!this.canManage()||this.sprintIncidentSaving
        ||this.selectedSeasonId==null||this.selectedSeasonId!==this.activeSeason()?.id
        ||!bracket||!incident||!this.sprintCanRatifyPositions(bracket,incident)
        ||!this.sprintPositionsPanelConfirmed
        ||this.sprintPositionsReference.trim().length<12
        ||this.sprintPositionsReason.trim().length<12
        ||this.sprintPositionsReference.trim()===incident.decisionReference?.trim())return;
    const eligible=this.sprintNeutralEligibleRiders(bracket,incident);
    const ordered=[this.sprintPositionsFirstRider,this.sprintPositionsSecondRider];
    if(ordered[0]===ordered[1]||!ordered.every(n=>eligible.includes(n)))return;
    const group=this.selected.id,season=this.selectedSeasonId;
    this.sprintIncidentSaving=true;
    this.sprintIncidentError='';
    this.communityService.ratifySprintIncidentPositions(group,season,bracket.id,incident.id,{
      orderedRiders:ordered,panelPositionsConfirmed:true,
      reference:this.sprintPositionsReference.trim(),reason:this.sprintPositionsReason.trim()
    }).pipe(timeout(10_000),finalize(()=>this.sprintIncidentSaving=false)).subscribe({
      next:()=>{
        this.sprintPositionsBracketId=null;
        this.sprintPositionsIncidentId=null;
        this.loadSprintBrackets(group,season);
      },
      error:e=>this.sprintIncidentError=e.error?.message
        ||t('communities.trackCycling.incidentError')
    });
  }

  sprintIsPreSprintIncident(incident: TrackSprintIncident): boolean {
    return ['PRE_SPRINT_BALANCE','PRE_SPRINT_OPPONENT_CONTACT',
      'PRE_SPRINT_BARRIER_CONTACT'].includes(incident.incidentType);
  }

  sprintCanConfirmFaultStart(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): boolean {
    const match=bracket.matches.find(m=>m.seriesKey===incident.seriesKey);
    return bracket.format==='OLYMPIC_TWENTY_FOUR_REPECHAGE' && !bracket.interruption
      && incident.status==='FAULT_START_PENDING'
      && ((incident.incidentType==='FALL' && incident.decisionType==='UNINTENTIONAL_FALL')
        || (this.sprintIsPreSprintIncident(incident)
          && incident.decisionType==='PRE_SPRINT_RESTART'))
      && /^SP[1-9][0-9]*-(A(?:[1-9]|1[0-2])|C[1-8]|E[1-6]|Q[1-4]|S[1-2]|B|G)$/.test(incident.seriesKey)
      && this.sprintNeutralEligibleRiders(bracket,incident).length===2
      && !!match && (match.status==='READY'||match.status==='IN_PROGRESS')
      && !match.winner;
  }

  sprintNonFaultRider(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): string {
    return this.sprintNeutralEligibleRiders(bracket,incident)
      .find(r=>r!==this.sprintFaultRider) || '';
  }

  editSprintFaultStart(bracketId: number,incidentId: number): void {
    this.sprintFaultBracketId=bracketId;
    this.sprintFaultIncidentId=incidentId;
    this.sprintFaultRider='';
    this.sprintFaultStartPosition='';
    this.sprintFaultReference='';
    this.sprintFaultReason='';
    this.sprintFaultChoiceConfirmed=false;
    this.sprintPreSprintBeforeConfirmed=false;
    this.sprintPreSprintStoppedConfirmed=false;
    this.sprintIncidentError='';
  }

  saveSprintFaultStart(): void {
    const bracket=this.sprintBrackets.find(b=>b.id===this.sprintFaultBracketId);
    const incident=(bracket?.incidents||[]).find(i=>i.id===this.sprintFaultIncidentId);
    if(!this.selected||!this.canManage()||this.sprintIncidentSaving
        ||this.selectedSeasonId==null||this.selectedSeasonId!==this.activeSeason()?.id
        ||!bracket||!incident||!this.sprintCanConfirmFaultStart(bracket,incident)
        ||!this.sprintFaultChoiceConfirmed||!this.sprintFaultStartPosition
        ||(this.sprintIsPreSprintIncident(incident)
          && (!this.sprintPreSprintBeforeConfirmed || !this.sprintPreSprintStoppedConfirmed))
        ||this.sprintFaultReference.trim().length<12
        ||this.sprintFaultReason.trim().length<12
        ||this.sprintFaultReference.trim()===incident.decisionReference?.trim())return;
    const eligible=this.sprintNeutralEligibleRiders(bracket,incident);
    if(!eligible.includes(this.sprintFaultRider))return;
    const innocent=this.sprintNonFaultRider(bracket,incident);
    if(!innocent||innocent===this.sprintFaultRider)return;
    const group=this.selected.id,season=this.selectedSeasonId;
    this.sprintIncidentSaving=true;
    this.sprintIncidentError='';
    const apiRequest=this.sprintIsPreSprintIncident(incident)
      ? this.communityService.confirmPreSprintStart(group,season,bracket.id,incident.id,{
          incidentRider:this.sprintFaultRider,nonFaultRider:innocent,
          nonFaultStartPosition:this.sprintFaultStartPosition,
          nonFaultChoiceConfirmed:true,beforeSprintConfirmed:true,starterStoppedConfirmed:true,
          reference:this.sprintFaultReference.trim(),reason:this.sprintFaultReason.trim()
        })
      : this.communityService.confirmUnintentionalFallStart(group,season,bracket.id,incident.id,{
          faultRider:this.sprintFaultRider,nonFaultRider:innocent,
          nonFaultStartPosition:this.sprintFaultStartPosition,
          nonFaultChoiceConfirmed:true,
          reference:this.sprintFaultReference.trim(),reason:this.sprintFaultReason.trim()
        });
    apiRequest.pipe(timeout(10_000),finalize(()=>this.sprintIncidentSaving=false)).subscribe({
      next:()=>{
        this.sprintFaultBracketId=null;
        this.sprintFaultIncidentId=null;
        this.loadSprintBrackets(group,season);
      },
      error:e=>this.sprintIncidentError=e.error?.message
        ||t('communities.trackCycling.incidentError')
    });
  }

  sprintNeutralEligibleRiders(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): string[] {
    const match=bracket.matches.find(m=>m.seriesKey===incident.seriesKey);
    return match && match.riderA && match.riderB && !match.riderC && !match.riderD
      ? [match.riderA,match.riderB] : [];
  }

  sprintNeutralCause(incident: TrackSprintIncident):
    'NO_FAULT_FALL' | 'PUNCTURE' | 'ESSENTIAL_BICYCLE_BREAKAGE' | null {
    switch(incident.incidentType) {
      case 'FALL': return 'NO_FAULT_FALL';
      case 'PUNCTURE': return 'PUNCTURE';
      case 'BICYCLE_DEFECT': return 'ESSENTIAL_BICYCLE_BREAKAGE';
      default: return null;
    }
  }

  sprintCanAuthorizeNeutralRestart(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): boolean {
    const match=bracket.matches.find(m=>m.seriesKey===incident.seriesKey);
    return bracket.format==='OLYMPIC_TWENTY_FOUR_REPECHAGE' && !bracket.interruption
      && incident.status==='RESTART_PENDING'
      && incident.decisionType==='RESTART_REQUIRED'
      && this.sprintNeutralCause(incident)!==null
      && /^SP[1-9][0-9]*-(A(?:[1-9]|1[0-2])|C[1-8]|E[1-6]|Q[1-4]|S[1-2]|B|G)$/.test(incident.seriesKey)
      && this.sprintNeutralEligibleRiders(bracket,incident).length===2
      && !!match && (match.status==='READY'||match.status==='IN_PROGRESS');
  }

  editSprintNeutralRestart(bracketId: number,incidentId: number): void {
    this.sprintNeutralBracketId=bracketId;
    this.sprintNeutralIncidentId=incidentId;
    this.sprintNeutralReference='';
    this.sprintNeutralReason='';
    this.sprintNeutralNoFaultConfirmed=false;
    this.sprintNeutralOrderConfirmed=false;
    this.sprintIncidentError='';
  }

  saveSprintNeutralRestart(): void {
    const bracket=this.sprintBrackets.find(b=>b.id===this.sprintNeutralBracketId);
    const incident=(bracket?.incidents||[]).find(i=>i.id===this.sprintNeutralIncidentId);
    if(!this.selected||!this.canManage()||this.sprintIncidentSaving
        ||this.selectedSeasonId==null||this.selectedSeasonId!==this.activeSeason()?.id
        ||!bracket||!incident||!this.sprintCanAuthorizeNeutralRestart(bracket,incident)
        ||!this.sprintNeutralNoFaultConfirmed||!this.sprintNeutralOrderConfirmed
        ||this.sprintNeutralReference.trim().length<12
        ||this.sprintNeutralReason.trim().length<12) return;
    const riders=this.sprintNeutralEligibleRiders(bracket,incident);
    const cause=this.sprintNeutralCause(incident);
    if(!cause||riders.length!==2)return;
    const group=this.selected.id,season=this.selectedSeasonId;
    this.sprintIncidentSaving=true;
    this.sprintIncidentError='';
    this.communityService.authorizeNeutralSprintRestart(group,season,bracket.id,incident.id,{
      cause,noFaultConfirmed:true,orderedRiders:riders,
      reference:this.sprintNeutralReference.trim(),reason:this.sprintNeutralReason.trim()
    }).pipe(timeout(10_000),finalize(()=>this.sprintIncidentSaving=false)).subscribe({
      next:()=>{
        this.sprintNeutralBracketId=null;
        this.sprintNeutralIncidentId=null;
        this.loadSprintBrackets(group,season);
      },
      error:e=>this.sprintIncidentError=e.error?.message
        ||t('communities.trackCycling.incidentError')
    });
  }

  sprintIncidentsFor(bracket: TrackSprintBracketOverview, key: string): TrackSprintIncident[] {
    return (bracket.incidents || []).filter(i => i.seriesKey === key);
  }

  sprintIncidentPending(bracket: TrackSprintBracketOverview, key: string): boolean {
    return this.sprintIncidentsFor(bracket, key)
      .some(i => ['PENDING','ADJUDICATION_REQUIRED','RESTART_PENDING',
                  'POSITIONS_PENDING','FAULT_START_PENDING','FLAGRANT_START_PENDING']
        .includes(i.status));
  }

  editSprintIncident(bracketId: number, key: string): void {
    this.sprintIncidentBracketId = bracketId;
    this.sprintIncidentSeriesKey = key;
    this.sprintIncidentType = 'OTHER';
    this.sprintIncidentDetails = '';
    this.sprintIncidentError = '';
  }

  saveSprintIncident(): void {
    if (!this.selected || !this.canManage() || this.sprintIncidentSaving
        || this.selectedSeasonId == null || this.activeSeason()?.id !== this.selectedSeasonId
        || this.sprintIncidentBracketId == null || !this.sprintIncidentSeriesKey
        || this.sprintIncidentDetails.trim().length < 12) return;
    const group = this.selected.id, season = this.selectedSeasonId,
      bracketId = this.sprintIncidentBracketId, key = this.sprintIncidentSeriesKey;
    const nextHeat = nextSprintBracketHeatNumber(this.competition?.rounds || [], key);
    this.sprintIncidentSaving = true; this.sprintIncidentError = '';
    this.communityService.reportTrackSprintIncident(group, season, bracketId, {
      seriesKey: key, heatNumber: nextHeat,
      incidentType: this.sprintIncidentType, details: this.sprintIncidentDetails.trim()
    }).pipe(timeout(10_000), finalize(() => this.sprintIncidentSaving = false)).subscribe({
      next: () => {
        this.sprintIncidentSeriesKey = null;
        this.sprintIncidentBracketId = null;
        this.loadSprintBrackets(group, season);
      },
      error: error => this.sprintIncidentError = error.error?.message
        || t('communities.trackCycling.incidentError')
    });
  }

  get sprintDecisionEligibleRiders(): string[] {
    const bracket = this.sprintBrackets.find(b => b.id === this.sprintDecisionBracketId);
    const incident = (bracket?.incidents || []).find(i => i.id === this.sprintDecisionIncidentId);
    const match = bracket?.matches.find(m => m.seriesKey === incident?.seriesKey);
    return [match?.riderA, match?.riderB, match?.riderC, match?.riderD]
      .filter((r): r is string => typeof r === 'string' && !!r.trim());
  }

  get sprintDecisionIsDisciplinaryAllowed(): boolean {
    const bracket = this.sprintBrackets.find(b => b.id === this.sprintDecisionBracketId);
    const incident = (bracket?.incidents || []).find(i => i.id === this.sprintDecisionIncidentId);
    return incident?.incidentType === 'RULE_INFRINGEMENT' || incident?.incidentType === 'FALL';
  }

  editSprintDecision(bracketId: number, incidentId: number): void {
    this.sprintDecisionBracketId = bracketId;
    this.sprintDecisionIncidentId = incidentId;
    const bracket=this.sprintBrackets.find(b=>b.id===bracketId);
    const incident=(bracket?.incidents||[]).find(i=>i.id===incidentId);
    this.sprintDecisionType = incident && this.sprintIsPreSprintIncident(incident)
      ? 'PRE_SPRINT_RESTART' : 'RESTART_REQUIRED';
    this.sprintDecisionSanction = 'WARNING';
    this.sprintDecisionSanctionedUsername = '';
    this.sprintFlagrantOffender = '';
    this.sprintFlagrantSanction = '';
    this.sprintFlagrantCutoffConfirmed = false;
    this.sprintFlagrantStarterConfirmed = false;
    this.sprintDecisionReference = '';
    this.sprintDecisionReason = '';
    this.sprintIncidentError = '';
  }

  saveSprintDecision(): void {
    if (!this.selected || !this.canManage() || this.sprintIncidentSaving
        || this.selectedSeasonId == null || this.activeSeason()?.id !== this.selectedSeasonId
        || this.sprintDecisionBracketId == null || this.sprintDecisionIncidentId == null
        || this.sprintDecisionReference.trim().length < 12
        || this.sprintDecisionReason.trim().length < 12
        || (this.sprintDecisionType === 'DISCIPLINARY_RULING' &&
            (!this.sprintDecisionIsDisciplinaryAllowed ||
             !this.sprintDecisionEligibleRiders.includes(this.sprintDecisionSanctionedUsername)))) return;
    const group = this.selected.id, season = this.selectedSeasonId,
      bracket = this.sprintDecisionBracketId, id = this.sprintDecisionIncidentId;
    const selectedBracket=this.sprintBrackets.find(b=>b.id===bracket);
    const incident=selectedBracket?.incidents?.find(i=>i.id===id);
    if(incident?.incidentType==='FLAGRANT_BEFORE_BELL') {
      if(!this.sprintFlagrantOffender
          ||!this.sprintDecisionEligibleRiders.includes(this.sprintFlagrantOffender)
          ||!this.sprintFlagrantSanction ||!this.sprintFlagrantCutoffConfirmed
          ||!this.sprintFlagrantStarterConfirmed
          ||this.sprintDecisionReference.trim().length<12
          ||this.sprintDecisionReason.trim().length<12)return;
      this.sprintIncidentSaving=true; this.sprintIncidentError='';
      this.communityService.ruleFlagrantSprintIncident(group,season,bracket,id,{
        offendingRider:this.sprintFlagrantOffender,sanction:this.sprintFlagrantSanction,
        beforeBellOrSprintConfirmed:true,starterStoppedConfirmed:true,
        reference:this.sprintDecisionReference.trim(),reason:this.sprintDecisionReason.trim()
      }).pipe(timeout(10_000),finalize(()=>this.sprintIncidentSaving=false)).subscribe({
        next:()=>{this.sprintDecisionIncidentId=null;this.sprintDecisionBracketId=null;
          this.loadSprintBrackets(group,season);},
        error:e=>this.sprintIncidentError=e.error?.message
          ||t('communities.trackCycling.incidentError')
      });
      return;
    }
    this.sprintIncidentSaving = true; this.sprintIncidentError = '';
    this.communityService.decideTrackSprintIncident(group, season, bracket, id, {
      decisionType: this.sprintDecisionType,
      reference: this.sprintDecisionReference.trim(),
      reason: this.sprintDecisionReason.trim(),
      ...(this.sprintDecisionType === 'DISCIPLINARY_RULING'
        ? {sanctionType: this.sprintDecisionSanction,
           sanctionedUsername: this.sprintDecisionSanctionedUsername} : {})
    }).pipe(timeout(10_000), finalize(() => this.sprintIncidentSaving = false)).subscribe({
      next: () => {
        this.sprintDecisionIncidentId = null;
        this.sprintDecisionBracketId = null;
        this.loadSprintBrackets(group, season);
      },
      error: error => this.sprintIncidentError = error.error?.message
        || t('communities.trackCycling.incidentError')
    });
  }


  sprintCanConfirmFlagrantStart(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): boolean {
    const m=bracket.matches.find(x=>x.seriesKey===incident.seriesKey);
    return bracket.format==='OLYMPIC_TWENTY_FOUR_REPECHAGE' && !bracket.interruption
      && incident.incidentType==='FLAGRANT_BEFORE_BELL'
      && incident.decisionType==='FLAGRANT_RULING'
      && incident.status==='FLAGRANT_START_PENDING'
      && !incident.sanctionType && !incident.sanctionedUsername
      && !!incident.flagrantBeforeCutoffConfirmed
      && !!incident.flagrantStarterStoppedConfirmed
      && /^SP[1-9][0-9]*-(A(?:[1-9]|1[0-2])|C[1-8]|E[1-6]|Q[1-4]|S[1-2]|B|G)$/.test(incident.seriesKey)
      && !!m && !!m.riderA && !!m.riderB && !m.riderC && !m.riderD
      && ['READY','IN_PROGRESS'].includes(m.status) && !m.winner
      && [m.riderA,m.riderB].includes(incident.flagrantOffendingRider||'');
  }

  sprintFlagrantInnocent(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): string {
    return this.sprintNeutralEligibleRiders(bracket,incident)
      .find(r=>r!==incident.flagrantOffendingRider) || '';
  }

  editSprintFlagrantStart(bracketId: number,incidentId: number): void {
    this.sprintFlagrantStartBracketId=bracketId;
    this.sprintFlagrantStartIncidentId=incidentId;
    this.sprintFlagrantStartPosition='';
    this.sprintFlagrantStartChoiceConfirmed=false;
    this.sprintFlagrantStartReference='';
    this.sprintFlagrantStartReason='';
    this.sprintIncidentError='';
  }

  saveSprintFlagrantStart(): void {
    const bracket=this.sprintBrackets.find(b=>b.id===this.sprintFlagrantStartBracketId);
    const incident=bracket?.incidents?.find(i=>i.id===this.sprintFlagrantStartIncidentId);
    if(!this.selected||!this.canManage()||this.sprintIncidentSaving
        ||this.selectedSeasonId==null||this.selectedSeasonId!==this.activeSeason()?.id
        ||!bracket||!incident||!this.sprintCanConfirmFlagrantStart(bracket,incident)
        ||!this.sprintFlagrantStartChoiceConfirmed||!this.sprintFlagrantStartPosition
        ||this.sprintFlagrantStartReference.trim().length<12
        ||this.sprintFlagrantStartReason.trim().length<12
        ||this.sprintFlagrantStartReference.trim()===incident.decisionReference?.trim())return;
    const innocent=this.sprintFlagrantInnocent(bracket,incident);
    if(!innocent)return;
    const group=this.selected.id,season=this.selectedSeasonId;
    this.sprintIncidentSaving=true;this.sprintIncidentError='';
    this.communityService.confirmFlagrantNoSanctionStart(group,season,bracket.id,incident.id,{
      nonFaultRider:innocent,nonFaultStartPosition:this.sprintFlagrantStartPosition,
      nonFaultChoiceConfirmed:true,
      reference:this.sprintFlagrantStartReference.trim(),
      reason:this.sprintFlagrantStartReason.trim()
    }).pipe(timeout(10_000),finalize(()=>this.sprintIncidentSaving=false)).subscribe({
      next:()=>{
        this.sprintFlagrantStartBracketId=null;
        this.sprintFlagrantStartIncidentId=null;
        this.loadSprintBrackets(group,season);
      },
      error:e=>this.sprintIncidentError=e.error?.message
        ||t('communities.trackCycling.incidentError')
    });
  }

  sprintIsBo3Award(incident: TrackSprintIncident): boolean {
    return /^SP[1-9][0-9]*-(Q[1-4]|S[1-2]|B|G)$/.test(incident.seriesKey);
  }

  sprintCanConfirmOfficialAward(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): boolean {
    if (bracket.format !== 'OLYMPIC_TWENTY_FOUR_REPECHAGE'
        || bracket.interruption || incident.status !== 'ADJUDICATION_REQUIRED'
        || incident.incidentType !== 'FALL'
        || !['RELEGATION','DISQUALIFICATION'].includes(incident.sanctionType || '')) return false;
    const single=incident.heatNumber===1
      && /^SP[1-9][0-9]*-(A(?:[1-9]|1[0-2])|C[1-8]|E[1-6]|V[1-4])$/
          .test(incident.seriesKey);
    const bo3=this.sprintIsBo3Award(incident)
      && incident.sanctionType==='RELEGATION'
      && incident.heatNumber>=1 && incident.heatNumber<=3;
    if(!single&&!bo3) return false;
    const match=bracket.matches.find(m=>m.seriesKey===incident.seriesKey);
    return !!match
      && (bo3 ? ['READY','IN_PROGRESS'].includes(match.status) : match.status==='READY')
      && !!match.riderA && !!match.riderB && !match.riderC && !match.riderD
      && [match.riderA,match.riderB].includes(incident.sanctionedUsername || '');
  }

  sprintCanConfirmSeriesVerdict(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): boolean {
    if(bracket.format !== 'OLYMPIC_TWENTY_FOUR_REPECHAGE'
        ||bracket.interruption||incident.status!=='ADJUDICATION_REQUIRED'
        ||incident.incidentType!=='FALL'
        ||incident.sanctionType!=='DISQUALIFICATION'
        ||!this.sprintIsBo3Award(incident))return false;
    const m=bracket.matches.find(x=>x.seriesKey===incident.seriesKey);
    return !!m && ['READY','IN_PROGRESS'].includes(m.status)
        &&!!m.riderA &&!!m.riderB &&!m.riderC &&!m.riderD
        &&[m.riderA,m.riderB].includes(incident.sanctionedUsername||'');
  }

  sprintAwardEligibleWinner(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): string | null {
    if (!this.sprintCanConfirmOfficialAward(bracket,incident)
        && !this.sprintCanConfirmSeriesVerdict(bracket,incident)) return null;
    const match=bracket.matches.find(m=>m.seriesKey===incident.seriesKey)!;
    return [match.riderA!,match.riderB!]
      .find(r=>r!==incident.sanctionedUsername) || null;
  }

  editSprintOfficialAward(bracketId: number, incidentId: number): void {
    this.sprintAwardBracketId=bracketId;
    this.sprintAwardIncidentId=incidentId;
    this.sprintAwardWinner=''; // never preselect a result
    this.sprintAwardReference='';
    this.sprintAwardReason='';
    this.sprintIncidentError='';
  }

  saveSprintOfficialAward(): void {
    const bracket=this.sprintBrackets.find(b=>b.id===this.sprintAwardBracketId);
    const incident=(bracket?.incidents || []).find(i=>i.id===this.sprintAwardIncidentId);
    if (!this.selected || !this.canManage() || this.sprintIncidentSaving
        || this.selectedSeasonId==null || this.activeSeason()?.id !== this.selectedSeasonId
        || !bracket || !incident
        || (!this.sprintCanConfirmOfficialAward(bracket,incident)
            && !this.sprintCanConfirmSeriesVerdict(bracket,incident))
        || this.sprintAwardWinner !== this.sprintAwardEligibleWinner(bracket,incident)
        || this.sprintAwardReference.trim().length<12
        || this.sprintAwardReason.trim().length<12) return;
    const community=this.selected.id,season=this.selectedSeasonId;
    this.sprintIncidentSaving=true;
    this.sprintIncidentError='';
    const payload={
      winnerUsername:this.sprintAwardWinner,
      basis:'INTENTIONAL_FALL' as const,
      reference:this.sprintAwardReference.trim(),
      reason:this.sprintAwardReason.trim()
    };
    const save$=this.sprintCanConfirmSeriesVerdict(bracket,incident)
      ? this.communityService.confirmSprintBo3SeriesVerdict(
          community,season,bracket.id,incident.id,payload)
      : this.communityService.confirmSprintTwoUpOfficialAward(
          community,season,bracket.id,incident.id,payload);
    save$.pipe(timeout(10_000),finalize(()=>this.sprintIncidentSaving=false)).subscribe({
        next:()=>{
          this.sprintAwardBracketId=null;
          this.sprintAwardIncidentId=null;
          this.loadSprintBrackets(community,season);
        },
        error:error=>this.sprintIncidentError=error.error?.message
          || t('communities.trackCycling.incidentError')
      });
  }

  sprintRerunAuthorized(bracket: TrackSprintBracketOverview, key: string): boolean {
    return this.sprintIncidentsFor(bracket, key)
      .some(i => i.status === 'RESTART_AUTHORIZED');
  }

  sprintCanAuthorizeReducedRerun(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): boolean {
    if (bracket.format !== 'OLYMPIC_TWENTY_FOUR_REPECHAGE'
        || incident.status !== 'ADJUDICATION_REQUIRED'
        || !['RELEGATION', 'DISQUALIFICATION'].includes(incident.sanctionType || '')
        || !/^SP[1-9][0-9]*-(U[1-4]|W[1-2])$/.test(incident.seriesKey)) return false;
    const m = bracket.matches.find(m => m.seriesKey === incident.seriesKey);
    return !!m && m.status === 'READY'
      && !!m.riderA && !!m.riderB && !!m.riderC && !m.riderD
      && [m.riderA, m.riderB, m.riderC].includes(incident.sanctionedUsername || '');
  }

  sprintRerunEligibleRiders(bracket: TrackSprintBracketOverview,
    incident: TrackSprintIncident): string[] {
    if (!this.sprintCanAuthorizeReducedRerun(bracket, incident)) return [];
    const m = bracket.matches.find(m => m.seriesKey === incident.seriesKey)!;
    return [m.riderA!, m.riderB!, m.riderC!]
      .filter(n => n !== incident.sanctionedUsername);
  }

  editSprintRerun(bracketId: number, incidentId: number): void {
    this.sprintRerunBracketId = bracketId;
    this.sprintRerunIncidentId = incidentId;
    this.sprintRerunOrder = ['', ''];
    this.sprintRerunReference = '';
    this.sprintRerunReason = '';
    this.sprintIncidentError = '';
  }

  saveSprintRerun(): void {
    const bracket = this.sprintBrackets.find(b => b.id === this.sprintRerunBracketId);
    const incident = (bracket?.incidents || []).find(i => i.id === this.sprintRerunIncidentId);
    if (!this.selected || !this.canManage() || this.sprintIncidentSaving ||
        this.selectedSeasonId == null || this.activeSeason()?.id !== this.selectedSeasonId
        || !bracket || !incident || !this.sprintCanAuthorizeReducedRerun(bracket,incident)
        || this.sprintRerunReference.trim().length < 12
        || this.sprintRerunReason.trim().length < 12) return;
    const eligible = this.sprintRerunEligibleRiders(bracket, incident);
    if (eligible.length !== 2 || this.sprintRerunOrder[0] === this.sprintRerunOrder[1]
        || !this.sprintRerunOrder.every(n => eligible.includes(n))) return;
    const group = this.selected.id, season = this.selectedSeasonId;
    this.sprintIncidentSaving = true; this.sprintIncidentError = '';
    this.communityService.authorizeTrackSprintRerun(group, season, bracket.id, incident.id, {
      orderedRiders: [...this.sprintRerunOrder],
      reference: this.sprintRerunReference.trim(),
      reason: this.sprintRerunReason.trim()
    }).pipe(timeout(10_000), finalize(() => this.sprintIncidentSaving = false)).subscribe({
      next: () => {
        this.sprintRerunIncidentId = null;
        this.sprintRerunBracketId = null;
        this.loadSprintBrackets(group, season);
      },
      error: error => this.sprintIncidentError = error.error?.message
        || t('communities.trackCycling.incidentError')
    });
  }

  editSprintInterruption(bracketId: number): void {
    this.sprintInterruptionBracketId = bracketId;
    this.sprintInterruptionReference = '';
    this.sprintInterruptionReason = '';
    this.sprintInterruptionConfirmed = false;
    this.sprintInterruptionError = '';
  }

  saveSprintInterruption(): void {
    if (!this.selected || !this.canManage() || this.sprintInterruptionSaving ||
      this.selectedSeasonId == null || this.activeSeason()?.id !== this.selectedSeasonId ||
      !this.sprintInterruptionConfirmed || this.sprintInterruptionBracketId == null ||
      this.sprintInterruptionReference.trim().length < 12 ||
      this.sprintInterruptionReason.trim().length < 12) return;
    const bracket = this.sprintBrackets.find(b => b.id === this.sprintInterruptionBracketId);
    if (!bracket || bracket.format !== 'OLYMPIC_TWENTY_FOUR_REPECHAGE' ||
        !!bracket.interruption) return;
    const communityId = this.selected.id, seasonId = this.selectedSeasonId;
    this.sprintInterruptionSaving = true; this.sprintInterruptionError = '';
    this.communityService.endTrackSprintCompetition(communityId,seasonId,bracket.id,{
      reference: this.sprintInterruptionReference.trim(),
      reason: this.sprintInterruptionReason.trim()
    }).pipe(timeout(10_000),finalize(() => this.sprintInterruptionSaving = false)).subscribe({
      next: () => {
        this.sprintInterruptionBracketId = null;
        this.sprintInterruptionConfirmed = false;
        this.loadSprintBrackets(communityId,seasonId);
      },
      error: error => this.sprintInterruptionError = error.error?.message
        || t('communities.trackCycling.interruptionError')
    });
  }

  get availableSprintBracketMatches(): TrackSprintBracketMatch[] {
    return availableSprintBracketSlots(this.sprintBrackets, this.roundDisciplineDraft);
  }

  selectSprintBracketSeries(seriesKey: string): void {
    this.sprintSeriesKeyDraft = seriesKey;
    if (!seriesKey) {
      this.sprintHeatNumberDraft = 1;
      return;
    }
    this.sprintHeatNumberDraft = nextSprintBracketHeatNumber(
      this.competition?.rounds || [], seriesKey);
  }

  sprintBracketStatusKey(status: TrackSprintBracketMatch['status']): string {
    return 'communities.trackCycling.bracketStatus.' + status.toLowerCase();
  }

  loadCompetition(
    community: CommunityGroup = this.selected as CommunityGroup,
    seasonId: number | null = this.selectedSeasonId
  ): void {
    if (!community) {
      return;
    }

    const requestVersion = (this.competitionRequestVersion || 0) + 1;
    this.competitionRequestVersion = requestVersion;
    this.competitionLoading = true;
    this.communityService.competition(community.id, seasonId)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => {
          if (requestVersion === this.competitionRequestVersion) this.competitionLoading = false;
        })
      )
      .subscribe({
        next: competition => {
          if (requestVersion !== this.competitionRequestVersion ||
              this.selected?.id !== community.id) return;
          this.competition = competition;
          if (!this.canConfigureRacketRules()) this.racketRuleEditorKey = null;
          if (!this.canManageRaceChampionship()) {
            this.raceRuleSport = null;
            this.racePenaltyEditorKey = null;
            this.raceDecisionEditorKey = null;
          }
          this.maxStandingPoints = Math.max(
            0,
            ...competition.standings.map(item => item.points)
          );
          this.topGoalsStanding = competition.standings.reduce<CommunityStanding | undefined>(
            (best, row) => !best || row.goals > best.goals || (row.goals === best.goals && row.position < best.position) ? row : best,
            undefined
          );
          this.topAssistsStanding = competition.standings.reduce<CommunityStanding | undefined>(
            (best, row) => !best || row.assists > best.assists || (row.assists === best.assists && row.position < best.position) ? row : best,
            undefined
          );
          this.topMvpsStanding = competition.standings.reduce<CommunityStanding | undefined>(
            (best, row) => !best || row.mvps > best.mvps || (row.mvps === best.mvps && row.position < best.position) ? row : best,
            undefined
          );
          this.topCleanSheetsStanding = competition.standings.reduce<CommunityStanding | undefined>(
            (best, row) => !best || row.cleanSheets > best.cleanSheets || (row.cleanSheets === best.cleanSheets && row.position < best.position) ? row : best,
            undefined
          );
          this.mostGamesStanding = competition.standings.reduce<CommunityStanding | undefined>(
            (best, row) => !best || row.games > best.games || (row.games === best.games && row.position < best.position) ? row : best,
            undefined
          );
          this.bestWinRateStanding = competition.standings.reduce<CommunityStanding | undefined>(
            (best, row) => !best || row.winRate > best.winRate || (row.winRate === best.winRate && row.position < best.position) ? row : best,
            undefined
          );
          this.bestWinStreakStanding = competition.standings.reduce<CommunityStanding | undefined>(
            (best, row) => !best || row.bestWinStreak > best.bestWinStreak || (row.bestWinStreak === best.bestWinStreak && row.position < best.position) ? row : best,
            undefined
          );
          // A ranking row represents a player regardless of account association.
          // Regenerate selections on each season/reload so an index cannot silently
          // point to a different person if the ranking has changed.
          this.standingsByComparisonKey = communityComparisonLookup(competition.standings);
          this.compareSelectionA = '';
          this.compareSelectionB = '';
          this.activeCommunitySeason = competition.seasons.find(
            season => season.id === competition.activeSeasonId
          );
          this.communityTrophies = competition.seasons.filter(hasRecordedSeasonChampion);
          this.selectedSeasonId = competition.selectedSeasonId;
          this.loadSprintBrackets(community.id, competition.selectedSeasonId);
          if (this.editingSeasonId !== null &&
              !competition.seasons.some(item => item.id === this.editingSeasonId)) this.editingSeasonId = null;
          if (this.deletingSeasonId !== null &&
              !competition.seasons.some(item => item.id === this.deletingSeasonId)) this.deletingSeasonId = null;
          this.rankingsEnabledDraft = competition.settings.rankingsEnabled;
          this.winPointsDraft = competition.settings.winPoints;
          this.drawPointsDraft = competition.settings.drawPoints;
          this.lossPointsDraft = competition.settings.lossPoints;
        },
        error: () => {
          if (requestVersion !== this.competitionRequestVersion ||
              this.selected?.id !== community.id) return;
          this.competition = undefined;
          this.sprintBrackets = [];
          this.sprintBracketRequestVersion++;
          this.maxStandingPoints = 0;
          this.topGoalsStanding = undefined;
          this.topAssistsStanding = undefined;
          this.topMvpsStanding = undefined;
          this.topCleanSheetsStanding = undefined;
          this.mostGamesStanding = undefined;
          this.bestWinRateStanding = undefined;
          this.bestWinStreakStanding = undefined;
          this.standingsByComparisonKey.clear();
          this.compareSelectionA = '';
          this.compareSelectionB = '';
          this.activeCommunitySeason = undefined;
          this.communityTrophies = [];
          this.errorMessage = t('feedback.communities.competitionLoadError');
        }
      });
  }

  selectSeason(value: string): void {
    if (!this.selected) {
      return;
    }

    const seasonId = value === '' ? null : Number(value);
    this.selectedSeasonId = seasonId !== null && Number.isFinite(seasonId)
      ? seasonId
      : null;
    this.loadCompetition(this.selected, this.selectedSeasonId);
  }

  createSeason(): void {
    if (this.seasonSaving) {
      return;
    }

    if (!this.selected || !this.canManage()) {
      this.errorMessage = t('feedback.communities.seasonCreateError');
      return;
    }

    const name = this.seasonName.trim();
    if (!name) {
      this.errorMessage = t('feedback.communities.seasonCreateError');
      return;
    }
    // Multiple active seasons require an explicit sport. Shared legacy seasons
    // cannot overlap with per-sport seasons.
    if ((this.competition?.seasons.some(season => season.active) ?? false)
        && !this.seasonSport) {
      this.errorMessage = 'Seleciona uma modalidade para a nova época.';
      return;
    }
    // A stale draft must not duplicate a currently active sport season.
    if (this.seasonSport && !this.availableSeasonSports.includes(this.seasonSport)) {
      this.errorMessage = 'Já existe uma época ativa para esta modalidade.';
      return;
    }
    // An old draft must not create a season for a sport removed from the community.
    if (this.seasonSport && !this.communitySports(this.selected).includes(this.seasonSport)) {
      this.errorMessage = t('feedback.communities.seasonCreateError');
      return;
    }

    let startsAt: string | null = null;
    if (this.seasonStartsAt) {
      const parsed = new Date(this.seasonStartsAt);
      if (Number.isNaN(parsed.getTime())) {
        this.errorMessage = t('feedback.communities.seasonDateInvalid');
        return;
      }
      startsAt = parsed.toISOString();
    }

    const communityId = this.selected.id;
    const openVersion = this.communityOpenRequestVersion || 0;
    const requestVersion = (this.seasonCreationRequestVersion || 0) + 1;
    this.seasonCreationRequestVersion = requestVersion;
    this.seasonSaving = true;
    this.errorMessage = '';

    this.communityService.createSeason(communityId, {
      name,
      startsAt,
      ...(this.seasonSport ? { sport: this.seasonSport } : {})
    })
      .pipe(
        timeout(10_000),
        finalize(() => {
          if (requestVersion === this.seasonCreationRequestVersion) this.seasonSaving = false;
        })
      )
      .subscribe({
        next: season => {
          if (requestVersion !== this.seasonCreationRequestVersion ||
              openVersion !== (this.communityOpenRequestVersion || 0) ||
              this.selected?.id !== communityId) return;
          this.seasonName = '';
          this.seasonStartsAt = '';
          this.seasonSport = '';
          this.selectedSeasonId = season.id;
          this.loadCompetition(this.selected, season.id);
        },
        error: error => {
          if (requestVersion !== this.seasonCreationRequestVersion ||
              openVersion !== (this.communityOpenRequestVersion || 0) ||
              this.selected?.id !== communityId) return;
          this.errorMessage = error.error?.message
            || t('feedback.communities.seasonCreateError');
        }
      });
  }


  editSeason(season: CommunitySeason): void {
    if (!this.selected || !this.canManage() || this.seasonActionSaving) return;
    this.editingSeasonId = season.id;
    this.editingSeasonName = season.name;
    this.deletingSeasonId = null;
    this.seasonActionError = '';
    this.seasonActionMessage = '';
  }

  requestDeleteSeason(season: CommunitySeason): void {
    if (!this.selected || !this.canManage() || this.seasonActionSaving) return;
    this.deletingSeasonId = season.id;
    this.seasonDeleteAcknowledged = false;
    this.editingSeasonId = null;
    this.editingSeasonName = '';
    this.seasonActionError = '';
    this.seasonActionMessage = '';
  }

  /** Changing communities invalidates in-flight season management callbacks. */
  private resetSeasonManagementState(): void {
    this.seasonCreationRequestVersion = (this.seasonCreationRequestVersion || 0) + 1;
    this.seasonSaving = false;
    this.seasonActionRequestVersion = (this.seasonActionRequestVersion || 0) + 1;
    this.editingSeasonId = null;
    this.editingSeasonName = '';
    this.deletingSeasonId = null;
    this.seasonDeleteAcknowledged = false;
    this.seasonActionSaving = false;
    this.seasonActionError = '';
    this.seasonActionMessage = '';
  }

  cancelSeasonAction(): void {
    if (this.seasonActionSaving) return;
    this.editingSeasonId = null;
    this.editingSeasonName = '';
    this.deletingSeasonId = null;
    this.seasonDeleteAcknowledged = false;
    this.seasonActionError = '';
  }

  saveSeasonName(season: CommunitySeason): void {
    const name = this.editingSeasonName.trim();
    if (!this.selected || !this.canManage() || this.seasonActionSaving
        || this.editingSeasonId !== season.id) return;
    if (!name || name.length > 120) {
      this.seasonActionError = t('feedback.communities.seasonNameInvalid');
      return;
    }
    const communityId = this.selected.id;
    const requestVersion = (this.seasonActionRequestVersion || 0) + 1;
    this.seasonActionRequestVersion = requestVersion;
    this.seasonActionSaving = true;
    this.seasonActionError = '';
    this.seasonActionMessage = '';
    this.communityService.renameSeason(communityId, season.id, name)
      .pipe(timeout(10_000), finalize(() => {
        if (requestVersion === this.seasonActionRequestVersion) this.seasonActionSaving = false;
      }))
      .subscribe({
        next: () => {
          if (requestVersion !== this.seasonActionRequestVersion ||
              this.selected?.id !== communityId) return;
          this.editingSeasonId = null;
          this.editingSeasonName = '';
          this.seasonActionMessage = t('communities.seasonRenamed');
          this.loadCompetition(this.selected, this.selectedSeasonId);
        },
        error: () => {
          if (requestVersion === this.seasonActionRequestVersion &&
              this.selected?.id === communityId)
            this.seasonActionError = t('feedback.communities.seasonRenameError');
        }
      });
  }

  confirmDeleteSeason(season: CommunitySeason): void {
    if (!this.selected || !this.canManage() || this.seasonActionSaving
        || this.deletingSeasonId !== season.id || !this.seasonDeleteAcknowledged) return;
    const communityId = this.selected.id;
    const requestVersion = (this.seasonActionRequestVersion || 0) + 1;
    this.seasonActionRequestVersion = requestVersion;
    this.seasonActionSaving = true;
    this.seasonActionError = '';
    this.seasonActionMessage = '';
    this.communityService.deleteSeason(communityId, season.id)
      .pipe(timeout(10_000), finalize(() => {
        if (requestVersion === this.seasonActionRequestVersion) this.seasonActionSaving = false;
      }))
      .subscribe({
        next: () => {
          if (requestVersion !== this.seasonActionRequestVersion ||
              this.selected?.id !== communityId) return;
          this.deletingSeasonId = null;
          this.seasonDeleteAcknowledged = false;
          if (this.selectedSeasonId === season.id) this.selectedSeasonId = null;
          this.seasonActionMessage = t('communities.seasonDeleted');
          this.loadCompetition(this.selected, this.selectedSeasonId);
          this.loadHistoricalLinks(communityId);
        },
        error: (error: HttpErrorResponse) => {
          if (requestVersion !== this.seasonActionRequestVersion ||
              this.selected?.id !== communityId) return;
          this.seasonActionError = error.status === 409
            ? t('feedback.communities.seasonDeleteConflict')
            : t('feedback.communities.seasonDeleteError');
        }
      });
  }

  requestCloseSeason(seasonId: number): void {
    if (this.competition?.seasons.some(season => season.id === seasonId && season.active)) {
      this.closingSeasonId = seasonId;
      this.closeSeasonConfirming = true;
    }
  }

  cancelCloseSeason(): void {
    this.closeSeasonConfirming = false;
    this.closingSeasonId = null;
  }

  closeActiveSeason(seasonId: number): void {
    const active = this.competition?.seasons.find(season => season.id === seasonId && season.active);
    if (!this.selected || !active || !this.canManage() || this.seasonSaving
        || !this.closeSeasonConfirming || this.closingSeasonId !== seasonId) {
      return;
    }

    const communityId = this.selected.id;
    this.seasonSaving = true;
    this.errorMessage = '';

    this.communityService.closeSeason(communityId, active.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.seasonSaving = false)
      )
      .subscribe({
        next: season => {
          if (this.selected?.id !== communityId) return;
          this.cancelCloseSeason();
          this.selectedSeasonId = season.id;
          this.loadCompetition(this.selected, season.id);
        },
        error: error => {
          if (this.selected?.id !== communityId) return;
          this.errorMessage = error.error?.message
            || t('feedback.communities.seasonCloseError');
        }
      });
  }

  saveCompetitionSettings(): void {
    if (!this.selected || !this.canManage() || this.competitionSaving) {
      return;
    }

    this.competitionSaving = true;
    this.errorMessage = '';

    this.communityService.updateCompetitionSettings(this.selected.id, {
      rankingsEnabled: this.rankingsEnabledDraft,
      winPoints: this.usesMatchPointsModel() ? Math.max(0, Number(this.winPointsDraft) || 0) : null,
      drawPoints: this.usesMatchPointsModel() ? Math.max(0, Number(this.drawPointsDraft) || 0) : null,
      lossPoints: this.usesMatchPointsModel() ? Math.max(0, Number(this.lossPointsDraft) || 0) : null
    })
      .pipe(
        timeout(10_000),
        finalize(() => this.competitionSaving = false)
      )
      .subscribe({
        next: settings => {
          if (this.competition) {
            this.competition = {
              ...this.competition,
              settings
            };
          }

          const updated = {
            ...this.selected as CommunityGroup,
            rankingsEnabled: settings.rankingsEnabled
          };
          this.selected = updated;
          this.replaceCommunity(updated);
          this.loadCompetition(updated, this.selectedSeasonId);
        },
        error: error => {
          this.errorMessage = error.error?.message
            || t('feedback.communities.competitionSettingsError');
        }
      });
  }

  prepareRoundEntries(community: CommunityGroup = this.selected as CommunityGroup): void {
    if (!community) {
      this.roundEntries = [];
      this.roundGroupScoresDraft = {};
      this.roundBasketballScoreDraft = { sideA: null, sideB: null };
      this.roundTeamScoreDraft = {sideA: null, sideB: null};
      this.roundCricketDraft = {wicketsA: null, legalBallsA: null, wicketsB: null, legalBallsB: null};
      this.resetVolleyballSets();
      return;
    }

    this.roundGroupScoresDraft = {};
    this.roundBasketballScoreDraft = { sideA: null, sideB: null };
    this.roundTeamScoreDraft = {sideA: null, sideB: null};
    this.roundCricketDraft = {wicketsA: null, legalBallsA: null, wicketsB: null, legalBallsB: null};
    this.resetVolleyballSets();
    this.roundEntries = community.members.map(member => ({
      username: member.username,
      included: false,
      team: '',
      result: 'WIN' as CommunityMatchResult,
      goals: 0,
      assists: 0,
      mvp: false,
      cleanSheet: false,
      finishPosition: null,
      elapsedSeconds: null,
      bestLapSeconds: null,
      lapsCompleted: null,
      performanceValue: null,
      waveScore1: null,
      waveScore2: null
    }));
  }

  importRoundDisplayDate(value: unknown): string {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    // Date-only values must not cross timezones or shift a day.
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
  }

  get importIncludesPoints(): boolean {
    return this.importMappings?.some(mapping => mapping.field === 'POINTS') ?? false;
  }

  selectImportMode(mode: 'ROUNDS' | 'STANDINGS' | 'MATCHES'): void {
    if (this.importMode === mode) return;
    this.importMode = mode;
    this.importFileError = '';
    // The uploaded file has already been inspected: reuse it when changing the chosen kind of history.
    if (this.importPreview) this.selectImportSheet(this.importSheetName);
    else this.resetImportAfterFile();
  }

  private normalizedHeader(header: string): string {
    return header.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase().replace(/[\s._-]+/g, '');
  }

  get recommendedImportMode(): 'ROUNDS' | 'STANDINGS' | 'MATCHES' | null {
    const sheet = this.importPreview?.sheets.find(item => item.name === this.importSheetName);
    if (!sheet) return null;
    const headers = new Set(sheet.headers.map(header => this.normalizedHeader(header)));
    const has = (...names: string[]) => names.some(name => headers.has(name));
    const player = has('cepo', 'jogador', 'player', 'nome', 'name', 'atleta', 'participante');
    if (player && has('data', 'date', 'dia') &&
      has('v', 'w', 'win', 'wins', 'd', 'derrota', 'derrotas', 'resultado')) return 'ROUNDS';
    if (has('casa', 'home', 'equipa1', 'equipaa', 'jogador1') &&
      has('fora', 'away', 'equipa2', 'equipab', 'jogador2') &&
      has('resultado', 'score', 'homescore', 'goloscasa', 'golosfora')) return 'MATCHES';
    if (player && has('pontos', 'pts', 'points')) return 'STANDINGS';
    return null;
  }

  get importSheetLooksLikePivot(): boolean {
    const sheet = this.importPreview?.sheets.find(item => item.name === this.importSheetName);
    return !!sheet && (sheet.structure === 'PIVOT' ||
      sheet.headers.some(header => /^(sum of|column labels|row labels|grand total)/i.test(header)));
  }

  importFieldLabel(field: string): string {
    return t('communities.import.field.' + field);
  }

  /**
   * Known English headings from uploaded spreadsheets should be presented in
   * the selected UI language. Keep the original Excel header in mapping.header
   * so the importer still uses exactly the original source column.
   */
  importColumnHeaderLabel(header: string): string {
    const keyByHeader: Record<string, string> = {
      player: 'PLAYER', players: 'PLAYER', playername: 'PLAYER',
      win: 'WIN', wins: 'WINS', draw: 'DRAW', draws: 'DRAWS',
      loss: 'LOSS', losses: 'LOSSES',
      date: 'DATE', result: 'RESULT', goals: 'GOALS',
      assists: 'ASSISTS', points: 'POINTS',
      name: 'NAME', position: 'POSITION', played: 'PLAYED',
      home: 'HOME', away: 'AWAY', score: 'SCORE',
      homescore: 'HOME_SCORE', awayscore: 'AWAY_SCORE',
      stage: 'ROUND', phase: 'ROUND', round: 'ROUND', matchday: 'ROUND'
    };
    const field = keyByHeader[this.normalizedHeader(header)];
    return field ? this.importFieldLabel(field) : header;
  }

  importPreviewResultLabel(row: {
    result?: string | null; win?: boolean | number | null;
    draw?: boolean | number | null; loss?: boolean | number | null;
  }): string {
    const value = String(row.result || (row.win ? 'WIN'
      : row.draw ? 'DRAW' : row.loss ? 'LOSS' : '')).trim().toUpperCase();
    switch (value) {
      case 'WIN': return t('communities.result.win');
      case 'DRAW': return t('communities.result.draw');
      case 'LOSS': return t('communities.result.loss');
      default: return value || '—';
    }
  }

  private validImportFields(mode: 'ROUNDS' | 'STANDINGS' | 'MATCHES'): boolean {
    const fields = new Set(this.importMappings.map(mapping => mapping.field));
    if (mode === 'ROUNDS') return fields.has('PLAYER');
    if (mode === 'STANDINGS') return fields.has('NAME') && fields.has('POINTS');
    return fields.has('HOME') && fields.has('AWAY') &&
      (fields.has('SCORE') || (fields.has('HOME_SCORE') && fields.has('AWAY_SCORE')));
  }

  private resetArchiveDraft(): void {
    this.matchPreview = undefined;
    this.matchArchiveConfirmed = undefined;
    this.matchArchiveAcknowledged = false;
    this.archivePreview = undefined;
    this.archiveConfirmed = undefined;
    this.archiveAcknowledged = false;
  }

  private resetImportAfterFile(): void {
    ++this.importRevision;
    this.sourceDatesNeedYear = false;
    this.resetArchiveDraft();
    this.importPointsAcknowledged = false;
    this.importSheetName = '';
    this.importSourceCompetition = '';
    this.importSourceRound = '';
    this.importMappings = [];
    this.importValidation = undefined;
    this.importNormalized = undefined;
    this.importFinalPlan = undefined;
    this.importResult = undefined;
  }

  private resetImportAfterMapping(): void {
    ++this.importRevision;
    this.resetArchiveDraft();
    this.importPointsAcknowledged = false;
    this.importValidation = undefined;
    this.importNormalized = undefined;
    this.importFinalPlan = undefined;
    this.importResult = undefined;
  }

  startNewHistoricalImport(): void {
    // The successful summary remains visible until the user explicitly starts a new import.
    // The file input is recreated by the template when importResult is cleared.
    this.importMode = 'ROUNDS';
    this.importSeasonId = null;
    this.importFile = undefined;
    this.importFileName = '';
    this.importFileError = '';
    this.importPreview = undefined;
    this.resetImportAfterFile();
  }

  onImportFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.importFileError = '';
    // Clear the previous import plan even when a replacement file is rejected.
    this.importFile = undefined;
    this.importFileName = '';
    this.importPreview = undefined;
    this.importSeasonId = null;
    this.resetImportAfterFile();

    if (!file) return;

    if (!/\.(xlsx|xls|csv|tsv)$/i.test(file.name)) {
      this.importFileError = t('communities.import.invalidFile');
      input.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.importFileError = t('communities.import.tooLarge');
      input.value = '';
      return;
    }

    this.importFile = file;
    this.importFileName = file.name;
  }

  clearImportFile(input: HTMLInputElement): void {
    this.importFile = undefined;
    this.importSeasonId = null;
    this.importFileName = '';
    this.importFileError = '';
    this.importPreview = undefined;
    this.resetImportAfterFile();
    input.value = '';
  }

  /** Machine-readable import errors, with operation-specific legacy fallback. */
  private importRequestError(error: unknown, fallbackKey: string): string {
    return importHttpErrorLabel(error, fallbackKey);
  }

  inspectImportFile(): void {
    if (!this.selected || !this.importFile || this.importPreviewLoading) {
      return;
    }

    this.importPreviewLoading = true;
    this.importFileError = '';
    this.importPreview = undefined;

    this.communityService.importPreview(this.selected.id, this.importFile)
      .pipe(
        timeout(20_000),
        finalize(() => this.importPreviewLoading = false)
      )
      .subscribe({
        next: preview => {
          this.importPreview = preview;
          const sheet = preview.sheets.find(item => item.structure === 'TABULAR') || preview.sheets[0];
          this.selectImportSheet(sheet?.name || '');
        },
        error: error => {
          this.importFileError = this.importRequestError(error, 'communities.import.inspectError');
        }
      });
  }

  selectImportSheet(sheetName: string): void {
    this.importSheetName = sheetName;
    this.importFileError = '';
    this.resetImportAfterMapping();
    const sheet = this.importPreview?.sheets.find(item => item.name === sheetName);
    if (!sheet) {
      this.importMappings = [];
      return;
    }

    const suggestions = new Map(
      sheet.columnSuggestions.map(item => [item.columnIndex, item])
    );
    this.importMappings = sheet.headers.map((header, columnIndex) => {
      const suggestion = suggestions.get(columnIndex);
      return {
        columnIndex,
        header,
        field: this.importMode === 'STANDINGS'
          ? this.suggestArchiveField(header, suggestion?.field || 'IGNORE')
          : this.importMode === 'MATCHES'
            ? this.suggestMatchField(header, suggestion?.field || 'IGNORE')
            : this.suggestRoundsField(header, suggestion?.field || 'IGNORE'),
        confidence: suggestion?.confidence || 0
      };
    });
    const dateIndex = this.importMappings.find(item => item.field === 'DATE')?.columnIndex;
    const dates = dateIndex === undefined ? [] : sheet.sampleRows
      .map(row => row[dateIndex]?.trim() || '').filter(Boolean);
    this.sourceDatesNeedYear = this.importMode === 'ROUNDS' &&
      dates.some(date => /^\d{1,2}\s+[\p{L}.]+$/u.test(date) || /^\d{1,2}[-/.]\d{1,2}$/.test(date));
    if (this.sourceDatesNeedYear) this.importDefaultYear = null;
  }

  private suggestRoundsField(header: string, suggestion: string): string {
    const normalized = this.normalizedHeader(header);
    if (/^(cepo|jogador|jogadores|player|players|atleta|participante|nome|name)$/.test(normalized)) return 'PLAYER';
    if (/^(d|der|derrota|derrotas|loss|losses)$/.test(normalized)) return 'LOSS';
    if (/^(v|vit|vitoria|vitorias|win|wins)$/.test(normalized)) return 'WIN';
    if (/^(e|empate|empates|draw|draws)$/.test(normalized)) return 'DRAW';
    if (/^(pontos|pts|points|pontuacao)$/.test(normalized)) return 'POINTS';
    if (/^(data|date|dia|jornada)$/.test(normalized)) return 'DATE';
    return this.importFields.includes(suggestion) ? suggestion : 'IGNORE';
  }

  private suggestArchiveField(header: string, suggestion: string): string {
    const normalized = header.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase().replace(/[\s._-]+/g, '');
    if (/^(pos|posicao|position|rank|ranking|classificacao|lugar|#)$/.test(normalized)) return 'POSITION';
    if (/^(equipa|equipes|team|teams|jogador|jogadores|player|players|atleta|nome|name)$/.test(normalized)) return 'NAME';
    if (/^(j|pj|jogos|partidas|played|games|matches)$/.test(normalized)) return 'PLAYED';
    if (/^(v|vit|vitorias|wins)$/.test(normalized)) return 'WINS';
    if (/^(e|emp|empates|draws)$/.test(normalized)) return 'DRAWS';
    if (/^(d|der|derrotas|losses)$/.test(normalized)) return 'LOSSES';
    if (/^(gm|gf|golosmarcados|goalsfor)$/.test(normalized)) return 'GOALS_FOR';
    if (/^(gs|ga|golossofridos|goalsagainst)$/.test(normalized)) return 'GOALS_AGAINST';
    if (/^(pts|pontos|points|p)$/.test(normalized)) return 'POINTS';
    if (suggestion === 'PLAYER') return 'NAME';
    if (suggestion === 'GOALS') return 'GOALS_FOR';
    return this.importFields.includes(suggestion) ? suggestion : 'IGNORE';
  }

  private suggestMatchField(header: string, suggestion: string): string {
    const normalized = header.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLowerCase().replace(/[\s._-]+/g, '');
    if (/^(casa|home|mandante|equipa1|equipaa|jogador1|jogadora|team1|teama|player1|playera)$/.test(normalized)) return 'HOME';
    if (/^(fora|away|visitante|equipa2|equipab|jogador2|jogadorb|team2|teamb|player2|playerb)$/.test(normalized)) return 'AWAY';
    if (/^(resultadocasa|golescasa|goloscasa|golos1|golosde1|homescore|scorehome|score1)$/.test(normalized)) return 'HOME_SCORE';
    if (/^(resultadofora|golesfora|golosfora|golos2|golosde2|awayscore|scoreaway|score2)$/.test(normalized)) return 'AWAY_SCORE';
    if (/^(resultado|result|score|placar|marcador)$/.test(normalized)) return 'SCORE';
    if (/^(data|date|datadojogo|matchdate)$/.test(normalized)) return 'DATE';
    // Historical elimination spreadsheets often label this column "Fase" or
    // "Stage" rather than "Jornada". Preserve the source value as ROUND.
    if (/^(jornada|round|ronda|rodada|matchday|fase|fasedotorneio|fasedacompeticao|faseeliminatoria|eliminatoria|etapa|stage|phase|knockoutround|roundname|roundlabel)$/.test(normalized)) return 'ROUND';
    if (suggestion === 'DATE') return 'DATE';
    if (suggestion === 'RESULT') return 'SCORE';
    return 'IGNORE';
  }

  previewHistoricalMatches(): void {
    if (!this.selected || !this.canManage() || !this.importFile || !this.importSheetName
        || this.importMode !== 'MATCHES' || this.matchPreviewLoading) return;
    if (!this.validImportFields('MATCHES')) {
      this.importFileError = t('communities.matches.fieldsRequired');
      return;
    }
    const communityId = this.selected.id;
    const file = this.importFile;
    const mapping = this.historicalMapping();
    const revision = this.importRevision;
    this.matchPreview = undefined;
    this.matchArchiveConfirmed = undefined;
    this.matchArchiveAcknowledged = false;
    this.importFileError = '';
    this.matchPreviewLoading = true;
    this.communityService.previewHistoricalMatches(communityId, file, mapping)
      .pipe(timeout(20_000), finalize(() => this.matchPreviewLoading = false))
      .subscribe({
        next: preview => {
          if (this.selected?.id === communityId && this.importMode === 'MATCHES'
              && this.importFile === file && this.importSheetName === mapping.sheetName
              && this.importRevision === revision) {
            this.matchPreview = preview;
          }
        },
        error: error => {
          if (this.selected?.id === communityId && this.importMode === 'MATCHES'
              && this.importFile === file && this.importRevision === revision) {
            this.importFileError = this.importRequestError(error, 'communities.matches.previewError');
          }
        }
      });
  }

  viewImportedHistoricalTournament(): void {
    if (!this.matchArchiveConfirmed?.tournamentId || !this.selected || !this.hasCompetitions(this.selected)) return;
    this.setTab('tournaments');
  }

  confirmMatchArchive(): void {
    if (!this.selected || !this.canManage() || this.importMode !== 'MATCHES' ||
        !this.importFile || !this.importSheetName || !this.matchPreview ||
        this.matchPreview.acceptedRows < 1 || this.matchArchiveConfirming || this.matchPreviewLoading) return;
    if (this.matchArchiveTitle.trim().length < 2 || this.matchArchiveTitle.trim().length > 120 ||
        !this.matchArchiveAcknowledged) {
      this.importFileError = t('communities.matches.confirmRequired');
      return;
    }
    const communityId = this.selected.id;
    const file = this.importFile;
    const mapping = this.historicalMapping();
    if (this.matchArchiveDestination === 'TOURNAMENT' && !this.matchArchiveSport.trim()) {
      this.importFileError = t('communities.matches.tournamentSportRequired');
      return;
    }
    const context = this.matchArchiveDestination === 'TOURNAMENT'
      ? {
          title: this.matchArchiveTitle.trim(),
          entryType: this.matchArchiveEntryType,
          createTournament: true,
          sport: this.matchArchiveSport.trim(),
          format: this.matchArchiveFormat
        }
      : { title: this.matchArchiveTitle.trim(), entryType: this.matchArchiveEntryType };
    this.matchArchiveConfirming = true;
    this.importFileError = '';
    this.communityService.confirmHistoricalMatches(communityId, file, mapping, context)
      .pipe(timeout(30_000), finalize(() => this.matchArchiveConfirming = false))
      .subscribe({
        next: archive => {
          if (this.selected?.id !== communityId) return;
          this.matchArchiveConfirmed = archive;
          this.matchArchiveOpen = archive;
          this.matchArchivePage = 0;
          this.matchPreview = undefined;
          this.matchArchiveAcknowledged = false;
          this.loadMatchArchives(communityId);
        },
        error: error => {
          if (this.selected?.id === communityId) {
            this.importFileError = this.importRequestError(error, 'communities.matches.confirmError');
          }
        }
      });
  }

  private openPendingArchiveDeepLink(communityId: number): void {
    if (this.pendingArchiveDeepLinkCommunityId !== communityId
        || this.selected?.id !== communityId || !this.canBrowseHistoricalArchives) return;
    this.activeTab = 'ranking';
    this.pendingArchiveDeepLinkCommunityId = null;
  }

  // A navigation or a newer request supersedes responses from previously viewed
  // archives. Reset the busy flags so an old detail request cannot block a new group.
  private invalidateArchiveRequests(): void {
    this.matchArchiveListRequestVersion = (this.matchArchiveListRequestVersion || 0) + 1;
    this.matchArchiveDetailRequestVersion = (this.matchArchiveDetailRequestVersion || 0) + 1;
    this.standingArchiveListRequestVersion = (this.standingArchiveListRequestVersion || 0) + 1;
    this.standingArchiveDetailRequestVersion = (this.standingArchiveDetailRequestVersion || 0) + 1;
    this.matchArchivesLoading = false;
    this.archivesLoading = false;
    this.matchArchiveOpeningId = undefined;
    this.archiveOpeningId = undefined;
  }

  loadMatchArchives(communityId: number): void {
    const requestVersion = (this.matchArchiveListRequestVersion || 0) + 1;
    this.matchArchiveListRequestVersion = requestVersion;
    this.matchArchivesLoading = true;
    this.matchArchivesError = '';
    this.communityService.listHistoricalMatches(communityId)
      .pipe(timeout(15_000), finalize(() => {
        if (requestVersion === this.matchArchiveListRequestVersion) {
          this.matchArchivesLoading = false;
        }
      }))
      .subscribe({
        next: archives => {
          if (requestVersion === this.matchArchiveListRequestVersion
              && this.selected?.id === communityId) {
            this.matchArchiveSummaries = archives;
            this.openPendingArchiveDeepLink(communityId);
          }
        },
        error: () => {
          if (requestVersion === this.matchArchiveListRequestVersion
              && this.selected?.id === communityId) {
            this.matchArchivesError = t('communities.matches.listError');
          }
        }
      });
  }

  openMatchArchive(archiveId: number): void {
    if (!this.selected || this.matchArchiveOpeningId !== undefined) return;
    const communityId = this.selected.id;
    if (this.matchArchiveOpen?.id === archiveId) {
      this.matchArchiveOpen = undefined;
      return;
    }
    const requestVersion = (this.matchArchiveDetailRequestVersion || 0) + 1;
    this.matchArchiveDetailRequestVersion = requestVersion;
    this.matchArchiveOpeningId = archiveId;
    this.matchArchivesError = '';
    this.communityService.historicalMatchDetails(communityId, archiveId)
      .pipe(timeout(15_000), finalize(() => {
        if (requestVersion === this.matchArchiveDetailRequestVersion) {
          this.matchArchiveOpeningId = undefined;
        }
      }))
      .subscribe({
        next: archive => {
          if (requestVersion !== this.matchArchiveDetailRequestVersion
              || this.selected?.id !== communityId) return;
          this.matchArchiveOpen = archive;
          this.matchArchivePage = 0;
        },
        error: () => {
          if (requestVersion === this.matchArchiveDetailRequestVersion
              && this.selected?.id === communityId) {
            this.matchArchivesError = t('communities.matches.detailError');
          }
        }
      });
  }

  private historicalMapping(): { sheetName: string; columns: Array<{ columnIndex: number; field: string }> } {
    return { sheetName: this.importSheetName,
      columns: this.importMappings.map(item => ({ columnIndex: item.columnIndex, field: item.field })) };
  }

  previewArchiveImport(): void {
    if (!this.selected || !this.canManage() || !this.importFile || !this.importSheetName ||
        this.importMode !== 'STANDINGS' || this.archivePreviewLoading) return;
    if (!this.validImportFields('STANDINGS')) {
      this.importFileError = t('communities.archive.fieldsRequired');
      return;
    }
    const communityId = this.selected.id;
    this.resetArchiveDraft();
    this.importFileError = '';
    const mapping = this.historicalMapping();
    this.archivePreviewLoading = true;
    this.communityService.previewHistoricalStandings(communityId, this.importFile, mapping)
      .pipe(timeout(20_000), finalize(() => this.archivePreviewLoading = false))
      .subscribe({
        next: preview => {
          if (this.selected?.id === communityId && this.importMode === 'STANDINGS') {
            this.archivePreview = preview;
          }
        },
        error: error => {
          if (this.selected?.id === communityId) {
            this.importFileError = this.importRequestError(error, 'communities.archive.previewError');
          }
        }
      });
  }

  confirmArchiveImport(): void {
    if (!this.selected || !this.canManage() || this.importMode !== 'STANDINGS' ||
        !this.importFile || !this.archivePreview || this.importConfirming) return;
    if (this.archiveTitle.trim().length < 2 || this.archiveTitle.trim().length > 120 ||
        !this.archiveAcknowledged) {
      this.importFileError = t('communities.archive.confirmRequired');
      return;
    }
    const communityId = this.selected.id;
    const context = {
      title: this.archiveTitle.trim(),
      entryType: this.archiveEntryType,
      seasonId: this.archiveSeasonId
    };
    this.importFileError = '';
    this.importConfirming = true;
    this.communityService.confirmHistoricalStandings(
      communityId, this.importFile, this.historicalMapping(), context
    ).pipe(timeout(30_000), finalize(() => this.importConfirming = false))
      .subscribe({
        next: archive => {
          if (this.selected?.id !== communityId) return;
          this.archiveConfirmed = archive;
          this.archiveOpen = archive;
          this.archivePreview = undefined;
          this.archiveAcknowledged = false;
          this.loadArchivedStandings(communityId);
        },
        error: error => {
          if (this.selected?.id === communityId) {
            this.importFileError = this.importRequestError(error, 'communities.archive.confirmError');
          }
        }
      });
  }

  loadArchivedStandings(communityId: number): void {
    const requestVersion = (this.standingArchiveListRequestVersion || 0) + 1;
    this.standingArchiveListRequestVersion = requestVersion;
    this.archivesLoading = true;
    this.archivesError = '';
    this.communityService.listHistoricalStandings(communityId)
      .pipe(timeout(15_000), finalize(() => {
        if (requestVersion === this.standingArchiveListRequestVersion) {
          this.archivesLoading = false;
        }
      }))
      .subscribe({
        next: archives => {
          if (requestVersion === this.standingArchiveListRequestVersion
              && this.selected?.id === communityId) {
            this.archiveSummaries = archives;
            this.openPendingArchiveDeepLink(communityId);
          }
        },
        error: () => {
          if (requestVersion === this.standingArchiveListRequestVersion
              && this.selected?.id === communityId) {
            this.archivesError = t('communities.archive.listError');
          }
        }
      });
  }

  openArchivedStanding(archiveId: number): void {
    if (!this.selected || this.archiveOpeningId !== undefined) return;
    const communityId = this.selected.id;
    if (this.archiveOpen?.id === archiveId) {
      this.archiveOpen = undefined;
      return;
    }
    const requestVersion = (this.standingArchiveDetailRequestVersion || 0) + 1;
    this.standingArchiveDetailRequestVersion = requestVersion;
    this.archiveOpeningId = archiveId;
    this.archivesError = '';
    this.communityService.historicalStandingDetails(communityId, archiveId)
      .pipe(timeout(15_000), finalize(() => {
        if (requestVersion === this.standingArchiveDetailRequestVersion) {
          this.archiveOpeningId = undefined;
        }
      }))
      .subscribe({
        next: archive => {
          if (requestVersion === this.standingArchiveDetailRequestVersion
              && this.selected?.id === communityId) this.archiveOpen = archive;
        },
        error: () => {
          if (requestVersion === this.standingArchiveDetailRequestVersion
              && this.selected?.id === communityId) {
            this.archivesError = t('communities.archive.detailError');
          }
        }
      });
  }

  setImportMapping(columnIndex: number, field: string): void {
    const mapping = this.importMappings.find(item => item.columnIndex === columnIndex);
    if (mapping) {
      mapping.field = field;
      this.resetImportAfterMapping();
    }
  }

  validateImportMapping(): void {
    if (!this.selected || !this.importFile || !this.importSheetName || this.importMappingLoading) return;
    if (!this.validImportFields('ROUNDS')) {
      this.importFileError = t('communities.import.playerRequired');
      return;
    }

    const mapping = {
      sheetName: this.importSheetName,
      columns: this.importMappings.map(item => ({
        columnIndex: item.columnIndex,
        field: item.field
      }))
    };

    this.importMappingLoading = true;
    this.importFileError = '';
    this.importValidation = undefined;
    this.importNormalized = undefined;

    this.communityService.validateImport(this.selected.id, this.importFile, mapping)
      .pipe(timeout(20_000))
      .subscribe({
        next: validation => {
          this.importValidation = validation;
          if (!validation.valid) {
            this.importMappingLoading = false;
            return;
          }
          this.communityService.normalizedImportPreview(this.selected!.id, this.importFile!, mapping)
            .pipe(
              timeout(20_000),
              finalize(() => this.importMappingLoading = false)
            )
            .subscribe({
              next: preview => this.importNormalized = preview,
              error: error => this.importFileError = this.importRequestError(error, 'communities.import.normalizeError')
            });
        },
        error: error => {
          this.importMappingLoading = false;
          this.importFileError = this.importRequestError(error, 'communities.import.validateError');
        }
      });
  }

  invalidateImportPlan(): void {
    this.importPointsAcknowledged = false;
    this.importFinalPlan = undefined;
    this.importResult = undefined;
    this.importFileError = '';
  }

  get automaticImportSeasonName(): string {
    const now = new Date();
    // Current sporting season: July to June (2026/2027 in October 2026).
    const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}/${startYear + 1}`;
  }

  /** Check the sport of any known destination, including historical seasons. */
  importSeasonMatchesSport(seasonId: number): boolean {
    const season = this.competition?.seasons.find(item => item.id === seasonId);
    if (!season) return this.competition == null; // Pre-load legacy callers.
    if (!season.sport) return true; // Historical shared seasons.
    const sport = this.newImportSport;
    if (!sport) return false;
    const normalize = (value: string): string => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return normalize(season.sport) === normalize(sport);
  }

  get importDestinationSeasonId(): number | null {
    const seasons = this.competition?.seasons ?? [];
    // An explicitly selected import destination may be archived, but must
    // belong to the selected import sport when the season is sport-tagged.
    if (this.importSeasonId != null)
      return this.importSeasonMatchesSport(this.importSeasonId) ? this.importSeasonId : null;
    const active = seasons.filter(season => season.active);
    if (active.length > 1) {
      // The ranking filter must not silently decide where Excel results land.
      // Require an import sport and an unambiguous active season for that sport.
      const sport = this.newImportSport;
      if (!sport) return null;
      const normalize = (value: string): string => value.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      const matching = active.filter(season =>
        season.sport && normalize(season.sport) === normalize(sport));
      return matching.length === 1 ? matching[0].id : null;
    }
    // A single sport-tagged season is not an automatic destination for a
    // different imported sport; shared legacy seasons retain their behavior.
    if (active.length === 1) {
      const seasonSport = active[0].sport;
      const importSport = this.newImportSport;
      if (seasonSport && importSport) {
        const normalize = (value: string): string => value.normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        if (normalize(seasonSport) !== normalize(importSport)) return null;
      }
      return active[0].id;
    }
    // Older API payloads expose activeSeasonId without active flags on each
    // season. Prefer that ID unless the season is explicitly closed.
    const legacyActive = seasons.find(season =>
      season.id === this.competition?.activeSeasonId && season.active !== false);
    if (legacyActive && this.importSeasonMatchesSport(legacyActive.id))
      return legacyActive.id;
    if (this.selectedSeasonId != null &&
        (!this.competition || seasons.some(season => season.id === this.selectedSeasonId))) {
      return this.importSeasonMatchesSport(this.selectedSeasonId)
        ? this.selectedSeasonId : null;
    }
    const latest = seasons[0]?.id;
    return latest != null && this.importSeasonMatchesSport(latest) ? latest : null;
  }

  selectImportSeason(seasonId: number | null): void {
    this.importSeasonId = seasonId;
    this.invalidateImportPlan();
  }

  get canAutoCreateImportSeason(): boolean {
    // Never create a season when the competition has not loaded or already has seasons.
    return this.importDestinationSeasonId == null &&
      this.competition != null && this.competition.seasons.length === 0;
  }

  buildImportFinalPlan(): void {
    if (!this.selected || !this.importFile || !this.importSheetName || this.importPlanLoading) return;
    if (this.importDestinationSeasonId == null && !this.canAutoCreateImportSeason) {
      this.importFileError = t('communities.import.seasonRequired');
      return;
    }
    if (this.communityRoundSports.length > 1 && !this.newImportSport) {
      this.importFileError = t('feedback.communities.roundSportRequired');
      return;
    }
    if (this.sourceDatesNeedYear && (!Number.isInteger(this.importDefaultYear) ||
        (this.importDefaultYear ?? 0) < 1900 || (this.importDefaultYear ?? 0) > 2100)) {
      this.importFileError = t('communities.import.explicitYearRequired');
      return;
    }

    const communityId = this.selected.id;
    const file = this.importFile;
    const revision = this.importRevision;
    const mapping = {
      sheetName: this.importSheetName,
      columns: this.importMappings.map(item => ({ columnIndex: item.columnIndex, field: item.field }))
    };

    this.importPlanLoading = true;
    this.importFileError = '';
    this.importFinalPlan = undefined;
    this.importResult = undefined;

    const prepareForSeason = (seasonId: number): void => {
      // A user may switch communities or choose a different file during creation.
      if (this.selected?.id !== communityId || this.importFile !== file || this.importRevision !== revision) {
        this.importPlanLoading = false;
        return;
      }
      const context = {
        seasonId,
        defaultYear: this.importDefaultYear || null,
        sourceCompetition: this.importSourceCompetition?.trim() || null,
        sourceRound: this.importSourceRound?.trim() || null,
        ...(this.newImportSport ? { sport: this.newImportSport } : {})
      };
      this.communityService.finalImportPlan(communityId, file, mapping, context)
        .pipe(timeout(20_000), finalize(() => {
          if (this.selected?.id === communityId && this.importRevision === revision) {
            this.importPlanLoading = false;
          }
        }))
        .subscribe({
          next: plan => {
            if (this.selected?.id === communityId && this.importRevision === revision) {
              this.importFinalPlan = plan;
            }
          },
          error: error => {
            if (this.selected?.id === communityId && this.importRevision === revision) {
              this.importFileError = this.importRequestError(error, 'communities.import.planError');
            }
          }
        });
    };

    if (this.importDestinationSeasonId != null) {
      prepareForSeason(this.importDestinationSeasonId);
      return;
    }

    // No season in this community: create the default only after Excel mapping was validated.
    this.communityService.createSeason(communityId, {
      name: this.automaticImportSeasonName,
      startsAt: null
    }).pipe(timeout(10_000)).subscribe({
      next: season => {
        if (this.selected?.id !== communityId) {
          this.importPlanLoading = false;
          return;
        }
        this.importSeasonId = season.id;
        this.selectedSeasonId = season.id;
        this.loadCompetition(this.selected, season.id);
        prepareForSeason(season.id);
      },
      error: error => {
        this.importPlanLoading = false;
        if (this.selected?.id === communityId && this.importRevision === revision) {
          this.importFileError = this.importRequestError(error, 'communities.import.seasonCreateError');
          // Another manager may have created a season meanwhile: show it for selection.
          if (error?.status === 409) this.loadCompetition(this.selected);
        }
      }
    });
  }

  confirmHistoricalImport(): void {
    const destinationSeasonId = this.importDestinationSeasonId;
    if (!this.selected || !this.importFile || !this.importSheetName || destinationSeasonId == null || !this.importFinalPlan || this.importConfirming) return;
    if (this.communityRoundSports.length > 1 && !this.newImportSport) {
      this.importFileError = t('feedback.communities.roundSportRequired');
      return;
    }
    if (this.importIncludesPoints && !this.importPointsAcknowledged) {
      this.importFileError = t('communities.import.pointsAcknowledgementRequired');
      return;
    }
    if (this.importFinalPlan.invalidDates > 0 || this.importFinalPlan.roundsNeedingYear > 0 ||
        this.importFinalPlan.rounds.some((round: any) => round.unresolvedResults > 0)) {
      this.importFileError = t('communities.import.notReady');
      return;
    }
    const communityId = this.selected.id;
    const file = this.importFile;
    const revision = this.importRevision;
    const mapping = { sheetName: this.importSheetName, columns: this.importMappings.map(item => ({ columnIndex: item.columnIndex, field: item.field })) };
    const context = {
      seasonId: destinationSeasonId,
      defaultYear: this.importDefaultYear || null,
      sourceCompetition: this.importSourceCompetition?.trim() || null,
      sourceRound: this.importSourceRound?.trim() || null,
      ...(this.newImportSport ? { sport: this.newImportSport } : {})
    };
    this.importConfirming = true;
    this.importFileError = '';
    this.importResult = undefined;
    this.communityService.confirmImportRounds(communityId, file, mapping, context)
      .pipe(timeout(30_000), finalize(() => this.importConfirming = false))
      .subscribe({
        next: result => {
          if (this.selected?.id !== communityId || this.importFile !== file ||
              this.importRevision !== revision) return;
          this.importResult = result;
          this.selectedSeasonId = destinationSeasonId;
          this.loadCompetition(this.selected, destinationSeasonId);
        },
        error: error => {
          if (this.selected?.id === communityId && this.importFile === file &&
              this.importRevision === revision) {
            this.importFileError = this.importRequestError(error, 'communities.import.confirmError');
          }
        }
      });
  }

  sprintSeriesKeyDraft = '';
  sprintHeatNumberDraft = 1;

  createRound(): void {
    if (!this.selected || !this.canManage() || this.roundSaving) {
      return;
    }
    if (isDiscontinuedInlineFinalB(this.newRoundEventType)) {
      this.errorMessage = t('feedback.communities.inlineFinalBDiscontinued');
      return;
    }
    if (this.canRecordInlineSpeedWithoutRankings
        && !this.isInlineSpeedProgressionHeat(this.newRoundEventType)) {
      this.errorMessage = t('communities.inlineSpeed.selectProgressionHeat');
      return;
    }
    if (this.roundEligibleSports.length > 1 && !this.newRoundSport) {
      this.errorMessage = t('feedback.communities.roundSportRequired');
      return;
    }
    // Never silently create a seasonless round when several seasons are active.
    // Explicitly selecting another sport requires its own active season first.
    if ((this.competition?.seasons?.filter(season => season.active).length ?? 0) > 1
        && this.roundTargetSeasonId == null) {
      this.errorMessage = 'Cria ou seleciona uma época ativa para esta modalidade antes de registares a jornada.';
      return;
    }
    if (eventOptionsForSport(this.newRoundSport).length && !this.newRoundEventType) {
      this.errorMessage = t('feedback.communities.roundEventTypeRequired');
      return;
    }
    if (!athleticsDisciplineValid(this.newRoundSport, this.newRoundEventType,
      this.roundDisciplineDraft || null)) {
      this.errorMessage = t('feedback.communities.disciplineRequired');
      return;
    }
    const race = this.viewForNewRound() === 'race';
    const neutral = isNeutralEvent(this.newRoundSport, this.newRoundEventType);
    const breaking = this.newRoundEventType === 'BREAKING_BATTLE';
    const sprintPlaces = this.newRoundEventType === 'TRACK_SPRINT_5_8';
    const sprintHeat = sprintPlaces || this.newRoundEventType === 'TRACK_SPRINT_HEAT'
      || this.newRoundEventType === 'TRACK_SPRINT_REPECHAGE';
    const chess = this.newRoundEventType === 'CHESS_GAME';
    const judo = isJudoBout(this.newRoundEventType);
    const karate = isKarateEvent(this.newRoundEventType);
    const bjj = isBjjEvent(this.newRoundEventType);
    const boxing = isBoxingEvent(this.newRoundEventType);
    const kickboxing = isKickboxingEvent(this.newRoundEventType);
    const muayThai = isMuayThaiEvent(this.newRoundEventType);
    const taekwondo = isTaekwondoEvent(this.newRoundEventType);
    const kyorugi = isTaekwondoKyorugi(this.newRoundEventType);
    const groupRoutine = isGroupRoutineEvent(this.newRoundEventType);
    const basketball = isBasketballFinal(this.newRoundEventType);
    const teamFinal = isTeamFinalEvent(this.newRoundEventType);
    const cricket = this.newRoundEventType === 'CRICKET_T20';
    const volleyball = isVolleyballEvent(this.newRoundEventType);
    const racket = racketSupportsSets(this.newRoundSport);

    const selectedEntries = this.roundEntries.filter(entry => entry.included);
    if (volleyball) {
      const invalid = volleyballMatchError(this.newRoundEventType,
        selectedEntries, this.volleyballSetScores);
      if (invalid) {
        this.errorMessage = t('feedback.communities.' + invalid);
        return;
      }
    }
    if (teamFinal) {
      const invalid = teamFinalError(this.newRoundEventType, selectedEntries, this.roundTeamScoreDraft);
      if (invalid) { this.errorMessage = t('feedback.communities.' + invalid); return; }
    }
    if (cricket && cricketT20Error(this.roundCricketDraft, this.roundTeamScoreDraft)) {
      this.errorMessage = t('feedback.communities.cricketInvalid');
      return;
    }
    if (basketball) {
      const invalid = basketballScoreError(this.newRoundEventType,
        selectedEntries, this.roundBasketballScoreDraft);
      if (invalid) {
        this.errorMessage = t('feedback.communities.' + invalid);
        return;
      }
    }
    const racketWinner = racket
      ? racketMatchWinner(selectedEntries, this.racketMatchFormat, this.racketSetScores)
      : null;
    if (racket && !racketWinner) {
      this.errorMessage = t('feedback.communities.racketInvalidScore');
      return;
    }
    if (neutral && isWaveHeatEvent(this.newRoundEventType) && surfWaveError(selectedEntries)) {
      this.errorMessage = t(this.newRoundEventType === 'BODYBOARD_HEAT'
        ? 'feedback.communities.bodyboardInvalid' : 'feedback.communities.surfInvalid');
      return;
    }
    const routineGroups = groupRoutine ? this.selectedRoutineGroups() : [];
    const groupScores = routineGroups.map(groupName => ({
      groupName, score: this.roundGroupScoresDraft[groupName.toLocaleLowerCase()] ?? null
    }));
    const routineError = routineGroupError(this.newRoundEventType, selectedEntries, groupScores);
    if (routineError) {
      this.errorMessage = t('feedback.communities.' + routineError);
      return;
    }
    if (chess && chessGameError(selectedEntries)) {
      this.errorMessage = t('feedback.communities.chessInvalid');
      return;
    }
    if (taekwondo && taekwondoResultError(this.newRoundEventType, selectedEntries)) {
      this.errorMessage = t('feedback.communities.taekwondoInvalid');
      return;
    }
    if (muayThai && muayThaiResultError(this.newRoundEventType, selectedEntries)) {
      this.errorMessage = t('feedback.communities.muayThaiInvalid');
      return;
    }
    if (kickboxing && kickboxingResultError(this.newRoundEventType, selectedEntries)) {
      this.errorMessage = t('feedback.communities.kickboxingInvalid');
      return;
    }
    if (boxing && boxingResultError(this.newRoundEventType, selectedEntries)) {
      this.errorMessage = t('feedback.communities.boxingInvalid');
      return;
    }
    if (bjj && bjjResultError(this.newRoundEventType, selectedEntries)) {
      this.errorMessage = t('feedback.communities.bjjInvalid');
      return;
    }
    if (karate && karateBoutError(this.newRoundEventType, selectedEntries)) {
      this.errorMessage = t('feedback.communities.karateInvalid');
      return;
    }
    if (judo && judoBoutError(selectedEntries)) {
      this.errorMessage = t('feedback.communities.judoInvalid');
      return;
    }
    if (sprintHeat && this.sprintSeriesKeyDraft.trim() &&
        (!this.activeSeason() || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,39}$/.test(this.sprintSeriesKeyDraft.trim())
          || !Number.isInteger(Number(this.sprintHeatNumberDraft))
          || Number(this.sprintHeatNumberDraft) < 1
          || Number(this.sprintHeatNumberDraft) >
             nextSprintRoundHeatMax(this.roundDisciplineDraft))) {
      this.errorMessage = t('communities.trackCycling.seriesInvalid');
      return;
    }
    if ((this.newRoundEventType === 'TRACK_SPRINT_REPECHAGE' || sprintPlaces) &&
        (!this.sprintSeriesKeyDraft.trim() ||
          !this.availableSprintBracketMatches.some(m=>m.seriesKey===this.sprintSeriesKeyDraft))) {
      this.errorMessage = t('communities.trackCycling.repechageRequiresBracket');
      return;
    }
    if (sprintPlaces && trackSprintPlacesError(selectedEntries)) {
      this.errorMessage = t('communities.trackCycling.placements58Invalid');
      return;
    }
    if (sprintHeat && !sprintPlaces && trackSprintHeatError(selectedEntries, this.roundDisciplineDraft)) {
      this.errorMessage = t('communities.trackCycling.sprintInvalid');
      return;
    }
    if (this.newRoundEventType === 'BREAKING_BATTLE' && breakingBattleError(selectedEntries)) {
      this.errorMessage = t('feedback.communities.breakingInvalid');
      return;
    }
    if (neutral && !sprintHeat && !karate && !taekwondo && !bjj && !boxing && !kickboxing && !muayThai
      && !isWaveHeatEvent(this.newRoundEventType)
      && performanceError(this.newRoundEventType, selectedEntries)) {
      this.errorMessage = t(performanceKind(this.newRoundEventType) === 'golf'
        ? 'feedback.communities.golfInvalid'
        : this.newRoundEventType === 'TRAMPOLINE_INDIVIDUAL'
          ? 'feedback.communities.trampolineInvalid' : 'feedback.communities.performanceInvalid');
      return;
    }
    if (this.newRoundEventType === 'FOOT_ORIENTEERING' && orienteeringTimeError(selectedEntries)) {
      this.errorMessage = t('feedback.communities.orienteeringInvalid');
      return;
    }
    if (this.newRoundEventType === 'OWS_INDIVIDUAL' && openWaterTimeError(selectedEntries)) {
      this.errorMessage = t('feedback.communities.openWaterInvalid');
      return;
    }
    if (isInlineSpeedHeatEvent(this.newRoundEventType)
        && inlineSpeedHeatError(this.newRoundEventType, selectedEntries)) {
      this.errorMessage = t('feedback.communities.speedSkatingHeatInvalid');
      return;
    }
    // World Skate 2026: timed 500 m +D / road one-lap qualifiers are
    // individual heats of at most six, not one round with every entrant.
    // The 200 m individual time trial keeps its existing behavior.
    if (inlineSpeedFirstHeatTooLarge(this.newRoundEventType, selectedEntries.length)) {
      this.errorMessage = t('feedback.communities.speedSkatingFirstHeatLimit');
      return;
    }
    if (isInlineSpeedTimedEvent(this.newRoundEventType) && swimmingTimeError(selectedEntries)) {
      this.errorMessage = t('feedback.communities.speedSkatingInvalid');
      return;
    }
    if (this.newRoundEventType === 'SWIM_LCM' && swimmingTimeError(selectedEntries)) {
      this.errorMessage = t('feedback.communities.swimmingInvalid');
      return;
    }
    if (race) {
      if ((this.newRoundSport === 'Ciclismo de Estrada' && this.newRoundEventType === 'TIME_TRIAL'
          || this.newRoundSport === 'Ciclismo de Pista' && (this.newRoundEventType === 'TRACK_TIME_TRIAL' || this.newRoundEventType === 'TRACK_FLYING_200'))
          && roadTimeTrialEntryInvalid(selectedEntries)) {
        this.errorMessage = t(this.newRoundEventType === 'TRACK_TIME_TRIAL' || this.newRoundEventType === 'TRACK_FLYING_200'
          ? 'communities.trackCycling.timeTrialInvalid'
          : 'communities.roadCycling.timeTrialInvalid');
        return;
      }
      const invalid = raceEntryValidationError(selectedEntries);
      if (invalid) {
        this.errorMessage = t('feedback.communities.' + invalid);
        return;
      }
    }

    const entries = selectedEntries
      .map(entry => ({
        username: entry.username,
        team: groupRoutine || basketball || volleyball || teamFinal || chess || judo || karate || kyorugi || bjj || boxing || kickboxing || muayThai ? entry.team.trim()
          : race || neutral ? null : (entry.team.trim() || null),
        result: sprintHeat || breaking || chess || judo || karate || kyorugi || bjj || boxing || kickboxing || muayThai ? entry.result
          : race || neutral ? 'DRAW' as CommunityMatchResult
          : racket ? (entry.team === racketWinner ? 'WIN' : 'LOSS') as CommunityMatchResult
          : entry.result,
        goals: race || neutral || racket || chess ? 0 : Math.max(0, Number(entry.goals) || 0),
        assists: race || neutral || racket || chess ? 0 : Math.max(0, Number(entry.assists) || 0),
        mvp: !race && !neutral && !racket && !chess && Boolean(entry.mvp),
        cleanSheet: !race && !neutral && !racket && !chess && Boolean(entry.cleanSheet),
        ...(neutral && !isWaveHeatEvent(this.newRoundEventType)
          ? { performanceValue: sprintHeat ? null : entry.performanceValue ?? null } : {}),
        ...(neutral && isWaveHeatEvent(this.newRoundEventType)
          ? { waveScore1: entry.waveScore1 ?? null, waveScore2: entry.waveScore2 ?? null } : {}),
        ...(race ? {
          finishPosition: entry.finishPosition ?? null,
          elapsedSeconds: entry.elapsedSeconds ?? null,
          bestLapSeconds: this.raceSupportsLaps(this.newRoundSport) && this.newRoundEventType !== 'TRACK_TIME_TRIAL' && this.newRoundEventType !== 'TRACK_FLYING_200' && !isInlineSpeedTimedEvent(this.newRoundEventType) && !isInlineSpeedHeatEvent(this.newRoundEventType) ? entry.bestLapSeconds ?? null : null,
          lapsCompleted: this.raceSupportsLaps(this.newRoundSport) && this.newRoundEventType !== 'TRACK_TIME_TRIAL' && this.newRoundEventType !== 'TRACK_FLYING_200' && !isInlineSpeedTimedEvent(this.newRoundEventType) && !isInlineSpeedHeatEvent(this.newRoundEventType) ? entry.lapsCompleted ?? null : null
        } : {})
      }));

    if (!this.roundName.trim() || !this.roundPlayedAt || entries.length === 0) {
      this.errorMessage = t('feedback.communities.roundRequired');
      return;
    }

    const playedAt = new Date(this.roundPlayedAt);
    if (Number.isNaN(playedAt.getTime())) {
      this.errorMessage = t('feedback.communities.roundRequired');
      return;
    }

    this.roundSaving = true;
    this.errorMessage = '';

    this.communityService.createRound(this.selected.id, {
      name: this.roundName.trim(),
      playedAt: playedAt.toISOString(),
      // Always tie the round to the active season, never an archived filter.
      ...(this.roundTargetSeasonId != null ? { seasonId: this.roundTargetSeasonId } : {}),
      sport: this.newRoundSport,
      eventType: this.newRoundEventType,
      eventDiscipline: this.roundDisciplineDraft || null,
      ...(sprintHeat && this.sprintSeriesKeyDraft.trim() ? {
        sprintSeriesKey: this.sprintSeriesKeyDraft.trim(),
        sprintHeatNumber: Number(this.sprintHeatNumberDraft)
      } : {}),
      ...(groupRoutine ? { groupScores } : {}),
      ...(basketball ? { basketballScore: { ...this.roundBasketballScoreDraft } } : {}),
      ...(teamFinal ? { teamScore: { ...this.roundTeamScoreDraft } } : {}),
      ...(cricket ? { cricketDetails: { ...this.roundCricketDraft } } : {}),
      ...(volleyball ? { setScores: this.volleyballSetScores.map(set => ({ ...set })) } : {}),
      ...(racket ? { matchFormat: this.racketMatchFormat,
        setScores: this.racketSetScores.map(set => ({ ...set })) } : {}),
      entries
    })
      .pipe(
        timeout(10_000),
        finalize(() => this.roundSaving = false)
      )
      .subscribe({
        next: () => {
          this.roundName = '';
          this.roundPlayedAt = '';
          this.roundEventTypeDraft = '';
          this.roundDisciplineDraft = '';
          this.sprintSeriesKeyDraft = '';
          this.sprintHeatNumberDraft = 1;
          this.racketMatchFormat = 'SINGLES';
          this.racketSetScores = [{sideA: null,sideB: null},{sideA: null,sideB: null}];
          this.roundBasketballScoreDraft = { sideA: null, sideB: null };
          this.roundTeamScoreDraft = {sideA: null, sideB: null};
          this.roundCricketDraft = {wicketsA: null, legalBallsA: null, wicketsB: null, legalBallsB: null};
          this.resetVolleyballSets();
          this.prepareRoundEntries();
          this.loadCompetition(this.selected as CommunityGroup, this.selectedSeasonId);
        },
        error: error => {
          this.errorMessage = error.status === 409
            ? t('feedback.communities.roundConflict')
            : (error.error?.message || t('feedback.communities.roundSaveError'));
        }
      });
  }

  askDeleteRound(round: CommunityRound): void {
    this.roundDeleteConfirmId = round.id;
  }

  cancelDeleteRound(): void {
    this.roundDeleteConfirmId = undefined;
  }

  deleteRound(round: CommunityRound): void {
    if (!this.selected || !this.canManage() || this.roundSaving) {
      return;
    }

    this.roundSaving = true;
    this.errorMessage = '';

    this.communityService.deleteRound(this.selected.id, round.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.roundSaving = false)
      )
      .subscribe({
        next: () => {
          this.roundDeleteConfirmId = undefined;
          this.loadCompetition(this.selected as CommunityGroup, this.selectedSeasonId);
        },
        error: error => {
          this.errorMessage = error.error?.message
            || t('feedback.communities.roundDeleteError');
        }
      });
  }

  searchInviteUsers(): void {
    const query = this.inviteUsername.trim();
    if (!this.selected || !query || this.inviteSearchLoading) {
      return;
    }

    this.inviteSearchLoading = true;
    this.inviteSearchPerformed = false;
    this.inviteSearchResults = [];
    this.inviteMessage = '';
    this.errorMessage = '';

    this.profileService.findProfiles({ name: query })
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => this.inviteSearchLoading = false)
      )
      .subscribe({
        next: profiles => {
          const existingMembers = new Set(
            this.selected?.members.map(member => member.username.toLowerCase()) || []
          );

          this.inviteSearchResults = profiles
            .filter(profile => !existingMembers.has(profile.username.toLowerCase()))
            .slice(0, 8);
          this.inviteSearchPerformed = true;
        },
        error: () => {
          this.inviteSearchPerformed = true;
          this.errorMessage = t('feedback.communities.inviteSearchError');
        }
      });
  }

  selectInviteUser(profile: CommunityProfile): void {
    this.inviteUsername = profile.username;
    this.inviteSearchResults = [];
    this.inviteSearchPerformed = false;
    this.inviteMessage = '';
  }

  shareWhatsAppGroup(): void {
    const community = this.selected;
    if (!community || !this.canManage()) {
      return;
    }

    const url = buildCommunityGroupInviteUrl(window.location.origin, community.id);
    const message = [
      t('communities.whatsappShareMessage', { name: community.name }),
      t(community.visibility === 'PRIVATE'
        ? 'communities.whatsappSharePrivate'
        : 'communities.whatsappSharePublic'),
      url
    ].join('\n\n');

    window.open(buildWhatsAppGroupShareUrl(message), '_blank', 'noopener,noreferrer');
  }

  async copyWhatsAppGroupLink(): Promise<void> {
    const community = this.selected;
    if (!community || !this.canManage()) {
      return;
    }

    this.groupInviteFeedback = '';
    const url = buildCommunityGroupInviteUrl(window.location.origin, community.id);
    try {
      await navigator.clipboard.writeText(url);
      this.groupInviteFeedback = t('communities.whatsappCopied');
    } catch {
      this.groupInviteFeedback = t('communities.whatsappCopyFailed');
    }
  }

  invite(): void {
    if (!this.selected || !this.inviteUsername.trim() || this.saving) {
      return;
    }

    const username = this.inviteUsername.trim();
    this.saving = true;
    this.errorMessage = '';
    this.inviteMessage = '';

    this.communityService.invite(this.selected.id, username)
      .pipe(
        timeout(10_000),
        finalize(() => this.saving = false)
      )
      .subscribe({
        next: () => {
          this.inviteUsername = '';
          this.inviteSearchResults = [];
          this.inviteSearchPerformed = false;
          this.inviteMessage = t('feedback.communities.inviteSent', { username });
        },
        error: error => {
          this.errorMessage = error.error?.message || t('feedback.communities.inviteError');
        }
      });
  }

  acceptInvite(invite: CommunityInvite): void {
    this.communityService.acceptInvite(invite.id)
      .pipe(timeout(10_000))
      .subscribe({
      next: community => {
        this.invites = this.invites.filter(item => item.id !== invite.id);
        this.communities = [community, ...this.communities.filter(item => item.id !== community.id)];
        // Switching through an invitation must not reuse another community's archives.
        this.communityOpenRequestVersion = (this.communityOpenRequestVersion || 0) + 1;
        this.invalidateArchiveRequests();
        this.competitionRequestVersion = (this.competitionRequestVersion || 0) + 1;
        this.communitySessionsRequestVersion = (this.communitySessionsRequestVersion || 0) + 1;
        this.selected = community;
        this.cancelCloseSeason();
        this.resetSeasonManagementState();
        this.activeTab = 'home';
        this.pendingArchiveDeepLinkCommunityId = null;
        this.selectedSeasonId = null;
        this.competition = undefined;
        this.communitySessions = [];
        this.resetHistoricalLinks();
        this.archiveSummaries = [];
        this.matchArchiveSummaries = [];
        this.archiveOpen = undefined;
        this.matchArchiveOpen = undefined;
        this.archiveConfirmed = undefined;
        this.matchArchiveConfirmed = undefined;
        this.archivesError = '';
        this.matchArchivesError = '';
        this.prepareRoundEntries(community);
        this.loadArchivedStandings(community.id);
        this.loadMatchArchives(community.id);
        this.loadCompetition(community);
        this.loadCommunitySessions(community);
      },
      error: () => this.errorMessage = t('feedback.communities.acceptError')
    });
  }

  rejectInvite(invite: CommunityInvite): void {
    this.communityService.rejectInvite(invite.id)
      .pipe(timeout(10_000))
      .subscribe({
      next: () => this.invites = this.invites.filter(item => item.id !== invite.id),
      error: () => this.errorMessage = t('feedback.communities.rejectError')
    });
  }

  setRole(username: string, role: Exclude<CommunityRole, 'OWNER'>): void {
    if (!this.selected) {
      return;
    }

    this.communityService.updateRole(this.selected.id, username, role)
      .pipe(timeout(10_000))
      .subscribe({
      next: community => {
        this.selected = community;
        this.replaceCommunity(community);
        this.prepareRoundEntries(community);
      },
      error: () => this.errorMessage = t('feedback.communities.roleError')
    });
  }

  removeMember(username: string): void {
    if (!this.selected) {
      return;
    }

    this.communityService.removeMember(this.selected.id, username)
      .pipe(timeout(10_000))
      .subscribe({
      next: () => this.refreshSelected(),
      error: () => this.errorMessage = t('feedback.communities.removeError')
    });
  }

  leave(): void {
    if (!this.selected) {
      return;
    }

    const id = this.selected.id;
    this.communityService.leave(id)
      .pipe(timeout(10_000))
      .subscribe({
      next: () => {
        this.communities = this.communities.filter(item => item.id !== id);
        this.selected = undefined;
        this.cancelCloseSeason();
        this.resetSeasonManagementState();
        this.pendingArchiveDeepLinkCommunityId = null;
        this.resetHistoricalLinks();
        this.competition = undefined;
        this.maxStandingPoints = 0;
        this.topGoalsStanding = undefined;
        this.topAssistsStanding = undefined;
        this.topMvpsStanding = undefined;
        this.topCleanSheetsStanding = undefined;
        this.mostGamesStanding = undefined;
        this.bestWinRateStanding = undefined;
        this.bestWinStreakStanding = undefined;
        this.standingsByComparisonKey.clear();
        this.compareSelectionA = '';
        this.compareSelectionB = '';
        this.activeCommunitySeason = undefined;
        this.communityTrophies = [];
        this.communitySessions = [];
      },
      error: error => this.errorMessage = error.error?.message || t('feedback.communities.leaveError')
    });
  }

  beginCommunityDeletion(): void {
    if (!this.selected || !this.isOwner() || this.communityDeleteLoading) return;
    this.communityDeleteConfirming = true;
    this.communityDeleteName = '';
    this.communityDeleteError = '';
  }

  cancelCommunityDeletion(): void {
    if (this.communityDeleteLoading) return;
    this.communityDeleteConfirming = false;
    this.communityDeleteName = '';
    this.communityDeleteError = '';
  }

  confirmCommunityDeletion(): void {
    const community = this.selected;
    if (!community || !this.isOwner() || !this.communityDeleteConfirming
        || this.communityDeleteLoading || this.communityDeleteName !== community.name) return;

    this.communityDeleteLoading = true;
    this.communityDeleteError = '';
    this.communityService.deleteCommunity(community.id, community.name)
      .pipe(timeout(60_000), finalize(() => this.communityDeleteLoading = false))
      .subscribe({
        next: () => {
          if (this.selected?.id !== community.id) return;
          this.communityDeleteConfirming = false;
          this.communityDeleteName = '';
          this.communities = this.communities.filter(item => item.id !== community.id);
          this.selected = undefined;
          void this.router.navigate(['/menu/communities'], { queryParams: { view: 'mine' } });
        },
        error: (error: HttpErrorResponse) => {
          if (this.selected?.id !== community.id) return;
          this.communityDeleteError = t(error.status === 409
            ? 'communities.deleteBlocked' : 'communities.deleteFailed');
        }
      });
  }

  transferOwnership(): void {
    if (!this.selected || !this.ownershipUsername.trim()) {
      return;
    }

    this.communityService.transferOwnership(
      this.selected.id,
      this.ownershipUsername.trim()
    )
      .pipe(timeout(10_000))
      .subscribe({
      next: community => {
        this.selected = community;
        this.replaceCommunity(community);
        this.ownershipUsername = '';
      },
      error: error => this.errorMessage = error.error?.message || t('feedback.communities.transferError')
    });
  }

  private resetCommunityAvatarCrop(): void {
    if (this.avatarCropUrl && !this.avatarCropExisting) URL.revokeObjectURL(this.avatarCropUrl);
    this.avatarCropFile = null;
    this.avatarCropUrl = '';
    this.avatarCropReady = false;
    this.avatarCropExisting = false;
    this.avatarCropFitMode = 'COVER';
    this.avatarCropFocusX = 50;
    this.avatarCropFocusY = 50;
    this.avatarCropAnimated = false;
    this.avatarCropImage = null;
    this.avatarCropCommunityId = null;
    this.avatarCropDrag = null;
    this.avatarCropMetrics = null;
    this.avatarCropZoom = 1;
    this.avatarCropOffsetX = 0;
    this.avatarCropOffsetY = 0;
    this.avatarCropError = '';
  }

  cancelCommunityAvatarCrop(): void {
    if (!this.photoUpdating) this.resetCommunityAvatarCrop();
  }

  @HostListener('document:keydown.escape')
  closeCommunityAvatarCropOnEscape(): void {
    if ((this.avatarCropFile || this.avatarCropExisting) && !this.photoUpdating)
      this.resetCommunityAvatarCrop();
  }

  onCommunityAvatarZoom(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    if (this.avatarCropExisting || this.avatarCropFitMode === 'SHOW_ALL') {
      this.avatarCropZoom = Math.max(this.avatarCropFitMode === 'SHOW_ALL' ? 0.6 : 1,
        Math.min(3, value));
      return;
    }
    if (!this.avatarCropMetrics || !this.avatarCropImage) return;
    this.avatarCropZoom = Math.max(1, Math.min(3, value));
    this.avatarCropMetrics = communityAvatarCrop(
      this.avatarCropImage.naturalWidth, this.avatarCropImage.naturalHeight, this.avatarCropZoom);
    this.avatarCropOffsetX = clampAvatarOffset(this.avatarCropOffsetX, this.avatarCropMetrics!.maxOffsetX);
    this.avatarCropOffsetY = clampAvatarOffset(this.avatarCropOffsetY, this.avatarCropMetrics.maxOffsetY);
  }

  onCommunityAvatarPointerDown(event: PointerEvent): void {
    if (!this.avatarCropReady || this.photoUpdating
        || (!(this.avatarCropExisting || this.avatarCropFitMode === 'SHOW_ALL')
            && (this.avatarCropAnimated || !this.avatarCropMetrics))) return;
    const stage = event.currentTarget as HTMLElement;
    this.avatarCropDrag = { id: event.pointerId, x: event.clientX, y: event.clientY,
      offsetX: this.avatarCropExisting || this.avatarCropFitMode === 'SHOW_ALL'
        ? this.avatarCropFocusX : this.avatarCropOffsetX,
      offsetY: this.avatarCropExisting || this.avatarCropFitMode === 'SHOW_ALL'
        ? this.avatarCropFocusY : this.avatarCropOffsetY };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  onCommunityAvatarPointerMove(event: PointerEvent): void {
    const start = this.avatarCropDrag;
    if (!start || start.id !== event.pointerId
        || (!(this.avatarCropExisting || this.avatarCropFitMode === 'SHOW_ALL')
            && !this.avatarCropMetrics)) return;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    if (this.avatarCropExisting || this.avatarCropFitMode === 'SHOW_ALL') {
      this.avatarCropFocusX = Math.max(0, Math.min(100,
        start.offsetX - (event.clientX - start.x) / bounds.width * 100));
      this.avatarCropFocusY = Math.max(0, Math.min(100,
        start.offsetY - (event.clientY - start.y) / bounds.height * 100));
      return;
    }
    this.avatarCropOffsetX = clampAvatarOffset(start.offsetX
      + (event.clientX - start.x) / bounds.width * 100, this.avatarCropMetrics!.maxOffsetX);
    this.avatarCropOffsetY = clampAvatarOffset(start.offsetY
      + (event.clientY - start.y) / bounds.height * 100, this.avatarCropMetrics!.maxOffsetY);
  }

  onCommunityAvatarPointerUp(event: PointerEvent): void {
    if (this.avatarCropDrag?.id === event.pointerId) this.avatarCropDrag = null;
    const stage = event.currentTarget as HTMLElement;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  }

  onCommunityAvatarCropKey(event: KeyboardEvent): void {
    if (this.photoUpdating) return;
    if (!(this.avatarCropExisting || this.avatarCropFitMode === 'SHOW_ALL')
        && (this.avatarCropAnimated || !this.avatarCropMetrics)) return;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2]
    };
    const delta = move[event.key];
    if (!delta) return;
    event.preventDefault();
    if (this.avatarCropExisting || this.avatarCropFitMode === 'SHOW_ALL') {
      this.avatarCropFocusX = Math.max(0, Math.min(100, this.avatarCropFocusX - delta[0]));
      this.avatarCropFocusY = Math.max(0, Math.min(100, this.avatarCropFocusY - delta[1]));
      return;
    }
    this.avatarCropOffsetX = clampAvatarOffset(this.avatarCropOffsetX + delta[0],
      this.avatarCropMetrics!.maxOffsetX);
    this.avatarCropOffsetY = clampAvatarOffset(this.avatarCropOffsetY + delta[1],
      this.avatarCropMetrics!.maxOffsetY);
  }

  /** Existing cover editor: no image download, re-encoding or upload required. */
  openExistingCommunityAvatarCrop(): void {
    if (!this.selected?.photoUrl || !this.canManage() || this.photoUpdating) return;
    this.resetCommunityAvatarCrop();
    this.avatarCropExisting = true;
    this.avatarCropUrl = this.selected.photoUrl;
    this.avatarCropCommunityId = this.selected.id;
    this.avatarCropReady = true;
    this.avatarCropFitMode = this.selected.photoFitMode === 'SHOW_ALL' ? 'SHOW_ALL' : 'COVER';
    this.avatarCropZoom = this.selected.photoZoom ?? 1;
    this.avatarCropFocusX = this.selected.photoFocusX ?? 50;
    this.avatarCropFocusY = this.selected.photoFocusY ?? 50;
    this.errorMessage = '';
  }

  setCommunityAvatarFitMode(mode: 'COVER' | 'SHOW_ALL'): void {
    if (this.photoUpdating || !this.avatarCropReady || this.avatarCropFitMode === mode) return;
    this.avatarCropFitMode = mode;
    // Changing the fit recalibrates zoom so "Mostrar tudo" starts fully visible.
    this.avatarCropZoom = 1;
    this.avatarCropFocusX = 50;
    this.avatarCropFocusY = 50;
    this.avatarCropOffsetX = 0;
    this.avatarCropOffsetY = 0;
    if (this.avatarCropImage && this.avatarCropMetrics) {
      this.avatarCropMetrics = communityAvatarCrop(
        this.avatarCropImage.naturalWidth, this.avatarCropImage.naturalHeight, 1);
    }
  }

  communityCoverIsShowAll(community: { photoFitMode?: string | null }): boolean {
    return community.photoFitMode === 'SHOW_ALL';
  }

  communityCoverFit(community: { photoFitMode?: string | null }): string {
    return this.communityCoverIsShowAll(community) ? 'contain' : 'cover';
  }

  /** Shared presentation parameters, also used for animated GIFs. */
  communityCoverPosition(community: { photoFocusX?: number | null; photoFocusY?: number | null }): string {
    return (community.photoFocusX ?? 50) + '% ' + (community.photoFocusY ?? 50) + '%';
  }

  communityCoverZoom(community: { photoZoom?: number | null }): string | null {
    return community.photoZoom == null ? null : 'scale(' + community.photoZoom + ')';
  }

  communityCoverOrigin(community: { photoFocusX?: number | null; photoFocusY?: number | null }): string {
    return this.communityCoverPosition(community);
  }

  async saveCommunityAvatarCrop(): Promise<void> {
    if (this.avatarCropExisting) {
      const id = this.avatarCropCommunityId;
      const url = this.avatarCropUrl;
      if (id == null || !this.selected || this.selected.id !== id
          || this.selected.photoUrl !== url || !this.canManage()
          || !this.avatarCropReady || this.photoUpdating) return;
      this.photoUpdating = true;
      this.avatarCropError = '';
      this.communityService.updatePhotoFraming(
        id, url, this.avatarCropZoom, this.avatarCropFocusX,
        this.avatarCropFocusY, this.avatarCropFitMode)
        .pipe(timeout(15_000), finalize(() => this.photoUpdating = false))
        .subscribe({
          next: updated => {
            if (this.selected?.id !== id || this.avatarCropUrl !== url) return;
            this.selected = updated;
            this.replaceCommunity(updated);
            this.resetCommunityAvatarCrop();
          },
          error: (error: HttpErrorResponse) => {
            if (this.selected?.id !== id) return;
            this.avatarCropError = t(error.status === 409
              ? 'communities.cropStalePhoto' : 'communities.cropUploadError');
          }
        });
      return;
    }
    const file = this.avatarCropFile;
    const id = this.avatarCropCommunityId;
    if (!file || id == null || !this.selected || this.selected.id !== id
      || !this.canManage() || !this.avatarCropReady || this.photoUpdating) return;
    this.avatarCropError = '';
    this.photoUpdating = true;
    let upload: File = file;
    try {
      if (!this.avatarCropAnimated && this.avatarCropFitMode === 'COVER') {
        if (!this.avatarCropImage || !this.avatarCropMetrics) throw new Error('Image not ready');
        const canvas = document.createElement('canvas');
        canvas.width = COMMUNITY_COVER_WIDTH;
        canvas.height = COMMUNITY_COVER_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        const position = avatarCanvasPosition(
          this.avatarCropMetrics, this.avatarCropOffsetX, this.avatarCropOffsetY);
        context.fillStyle = '#0b2332';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(this.avatarCropImage,
          position.x, position.y, position.width, position.height);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(result => result ? resolve(result) : reject(new Error('JPEG export failed')),
            'image/jpeg', 0.9));
        upload = new File([blob], 'community-cover.jpg', { type: 'image/jpeg' });
        if (communityAvatarUploadError(upload)) throw new Error('JPEG exceeds upload limit');
      }
      // Switching groups or closing the page must not send a stale selected image.
      if (!this.selected || this.selected.id !== id || this.avatarCropFile !== file) {
        this.photoUpdating = false;
        return;
      }
      this.communityService.updatePhoto(
        id, upload, this.avatarCropFitMode,
        this.avatarCropFitMode === 'SHOW_ALL' ? this.avatarCropZoom : 1,
        this.avatarCropFitMode === 'SHOW_ALL' ? this.avatarCropFocusX : 50,
        this.avatarCropFitMode === 'SHOW_ALL' ? this.avatarCropFocusY : 50)
        .pipe(timeout(30_000), finalize(() => this.photoUpdating = false))
        .subscribe({
          next: updated => {
            if (this.selected?.id !== id) return;
            this.selected = updated;
            this.replaceCommunity(updated);
            this.resetCommunityAvatarCrop();
          },
          error: () => { if (this.selected?.id === id)
            this.avatarCropError = t('communities.cropUploadError'); }
        });
    } catch {
      this.photoUpdating = false;
      this.avatarCropError = t('communities.cropUploadError');
    }
  }

  onCommunityPhotoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Browsers allow re-selecting the same photo after cancelling an edit.
    input.value = '';
    if (!file || !this.selected || !this.canManage() || this.photoUpdating) return;
    const invalid = communityAvatarUploadError(file);
    if (invalid) {
      this.errorMessage = t(invalid === 'VIDEO'
        ? 'feedback.communities.avatarVideoNotSupported'
        : invalid === 'TOO_LARGE'
          ? 'feedback.communities.avatarTooLarge'
          : 'feedback.communities.avatarInvalidType');
      return;
    }

    this.resetCommunityAvatarCrop();
    this.errorMessage = '';
    this.avatarCropFile = file;
    this.avatarCropCommunityId = this.selected.id;
    const url = URL.createObjectURL(file);
    this.avatarCropUrl = url;
    this.avatarCropAnimated = file.type === 'image/gif';

    // Keep animated GIF bytes unchanged: canvas would flatten the animation.
    if (this.avatarCropAnimated) {
      this.avatarCropReady = true;
      return;
    }

    const image = new Image();
    image.onload = () => {
      if (this.avatarCropUrl !== url) return;
      try {
        this.avatarCropImage = image;
        this.avatarCropMetrics = communityAvatarCrop(image.naturalWidth, image.naturalHeight, 1);
        this.avatarCropReady = true;
      } catch {
        this.resetCommunityAvatarCrop();
        this.errorMessage = t('communities.cropInvalidImage');
      }
    };
    image.onerror = () => {
      if (this.avatarCropUrl !== url) return;
      this.resetCommunityAvatarCrop();
      this.errorMessage = t('communities.cropInvalidImage');
    };
    image.src = url;
  }

  removeCommunityPhoto(): void {
    if (!this.selected || !this.selected.photoUrl || !this.canManage() || this.photoUpdating) {
      return;
    }

    this.photoUpdating = true;
    this.errorMessage = '';

    this.communityService.removePhoto(this.selected.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.photoUpdating = false)
      )
      .subscribe({
        next: community => {
          this.selected = community;
          this.replaceCommunity(community);
        },
        error: () => this.errorMessage = t('feedback.communities.photoRemoveError')
      });
  }

  /** Keep the entire animated logo visible; existing still photos retain cover cropping. */
  isAnimatedCommunityAvatar(photoUrl: string | null | undefined): boolean {
    return typeof photoUrl === 'string' && /\.gif(?:[?#]|$)/i.test(photoUrl);
  }

  communityInitials(community: CommunityGroup): string {
    return community.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('') || '◎';
  }

  seasonOptionLabel(season: CommunitySeason): string {
    const name = (season.sport ? season.sport + ' · ' : '') + season.name;
    return season.active
      ? name + ' · ' + t('communities.activeShort')
      : name;
  }

  formatSessionDate(value: string): string {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return value;
    }

    return this.sessionDateFormatter.format(new Date(parsed));
  }

  formatRoundDate(value: string): string {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return value;
    }

    return this.roundDateFormatter.format(new Date(parsed));
  }

  resultLabel(result: CommunityMatchResult): string {
    switch (result) {
      case 'WIN':
        return t('communities.result.win');
      case 'DRAW':
        return t('communities.result.draw');
      case 'LOSS':
        return t('communities.result.loss');
    }
  }

  /** Accept legacy API payloads with only activeSeasonId, but never let a
   * closed or different sport season become editable when seasons are present. */
  isSelectedActiveSeason(): boolean {
    if (this.selectedSeasonId == null) return false;
    const seasons = this.competition?.seasons;
    if (seasons != null) {
      const selected = seasons.find(season => season.id === this.selectedSeasonId);
      if (!selected) return false;
      return selected.active === true
        || (selected.active == null && this.competition?.activeSeasonId === this.selectedSeasonId);
    }
    return this.competition?.activeSeasonId === this.selectedSeasonId;
  }

  activeSeason(): CommunitySeason | undefined {
    const active = this.competition?.seasons?.filter(season => season.active) ?? [];
    if (this.selectedSeasonId != null) {
      const selected = active.find(season => season.id === this.selectedSeasonId);
      if (selected) return selected;
    }
    return active.length === 1 ? active[0] : undefined;
  }

  trophies(): CommunitySeason[] {
    return this.communityTrophies;
  }

  /** Do not award a community record without a recorded result. */
  mostGames(): CommunityStanding | undefined {
    return this.mostGamesStanding && this.mostGamesStanding.games > 0
      ? this.mostGamesStanding : undefined;
  }

  bestWinRate(): CommunityStanding | undefined {
    return this.bestWinRateStanding && this.bestWinRateStanding.games > 0
      && this.bestWinRateStanding.winRate > 0 ? this.bestWinRateStanding : undefined;
  }

  bestWinStreak(): CommunityStanding | undefined {
    return this.bestWinStreakStanding && this.bestWinStreakStanding.bestWinStreak > 0
      ? this.bestWinStreakStanding : undefined;
  }

  /** Each clear button acts on its own comparison column only.
   * Preserve the other selection, statistics and active tab.
   */
  clearPlayerComparison(side: 'A' | 'B'): void {
    if (side === 'A') this.compareSelectionA = '';
    else this.compareSelectionB = '';
  }

  comparePlayerA(): CommunityStanding | undefined {
    return this.standingsByComparisonKey.get(this.compareSelectionA);
  }

  comparePlayerB(): CommunityStanding | undefined {
    return this.standingsByComparisonKey.get(this.compareSelectionB);
  }

  pointsBarWidth(row: CommunityStanding): number {
    if (this.maxStandingPoints <= 0) {
      return 0;
    }
    return Math.max(
      4,
      Math.round((row.points / this.maxStandingPoints) * 100)
    );
  }

  /** Empty seasons can contain placeholder participants with zero statistics.
   * Keep those players in their tables, but do not name arbitrary leaders. */
  leader(): CommunityStanding | undefined {
    const first = this.competition?.standings[0];
    return first && (first.games > 0 || first.points > 0) ? first : undefined;
  }

  topGoals(): CommunityStanding | undefined {
    return this.topGoalsStanding && this.topGoalsStanding.goals > 0
      ? this.topGoalsStanding : undefined;
  }

  topAssists(): CommunityStanding | undefined {
    return this.topAssistsStanding && this.topAssistsStanding.assists > 0
      ? this.topAssistsStanding : undefined;
  }

  topMvps(): CommunityStanding | undefined {
    return this.topMvpsStanding && this.topMvpsStanding.mvps > 0
      ? this.topMvpsStanding : undefined;
  }

  topCleanSheets(): CommunityStanding | undefined {
    return this.topCleanSheetsStanding && this.topCleanSheetsStanding.cleanSheets > 0
      ? this.topCleanSheetsStanding : undefined;
  }

  canManage(): boolean {
    return this.selected?.myRole === 'OWNER' || this.selected?.myRole === 'ADMIN';
  }

  isOwner(): boolean {
    return this.selected?.myRole === 'OWNER';
  }

  private refreshSelected(): void {
    if (!this.selected) {
      return;
    }

    this.communityService.get(this.selected.id)
      .pipe(
        timeout(10_000),
        retry({ count: 1 })
      )
      .subscribe({
      next: community => {
        this.selected = community;
        this.replaceCommunity(community);
        this.prepareRoundEntries(community);
        this.loadCompetition(community);
        this.loadCommunitySessions(community);
      }
    });
  }

  private replaceCommunity(community: CommunityGroup): void {
    this.communities = this.communities.map(item =>
      item.id === community.id ? community : item
    );
  }
}
