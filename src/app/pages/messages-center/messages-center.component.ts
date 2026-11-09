import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, OnInit, AfterViewChecked, ViewChild, ChangeDetectionStrategy, Optional, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { catchError, finalize, forkJoin, map, Observable, of, Subscription, TimeoutError, timeout } from 'rxjs';
import { appTranslate as t } from '../../i18n/i18n.service';
import { SessionDetail } from '../model/session-detail';
import { InboxApiService, InboxSummary } from '../../services/inbox-api.service';
import { ConversationMuteService, MutedConversation, isConversationMuted } from '../../services/conversation-mute.service';

import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommunityService } from '../../services/community.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { SessionService } from '../../services/session.service';
import { DirectChatService } from '../../services/direct-chat.service';
import { CommunityTimelineService } from '../../services/community-timeline.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { DirectCallClientService } from '../../services/direct-call-client.service';
import { ProfileQuickViewService } from '../../services/profile-quick-view.service';
import { ChatTypingTracker } from '../../services/chat-typing-tracker';
import { chatContinuesGroup, chatDaySeparator } from '../../shared/chat-thread-presentation';
import { chatMediaPreviewKind } from '../../shared/chat-media-preview';
import { readPastedChatImage } from '../../shared/chat-clipboard-image';
import { ChatImageInViewDirective } from '../../shared/chat-image-in-view.directive';
import { ChatReactionsComponent } from '../../shared/chat-reactions/chat-reactions.component';
import { DirectChatMessage } from '../model/direct-chat';
import { SessionMessage } from '../model/session-message';
import { CommunityTimelineEntry } from '../../services/community-timeline.service';
import {
  InboxConversation, InboxFilter, InboxKind, InboxMessage,
  inboxKey, matchesInboxSearch, mergeInboxMessages, orderInbox
} from './inbox.model';
import { RecoverableSend, restorePendingSends, savePendingSends } from './pending-send-session';
import { GifChoice, encodeGiphyText, findGiphy, readGifProviderKey, readGiphyText } from './gif-picker.client';
import { ShareChoice, ShareKind, encodeShareMessage, readSharedMessage } from './share-message';
import { GiphyEmbedComponent } from './giphy-embed.component';
import { InboxEmojiGifPickerComponent } from './inbox-emoji-gif-picker.component';
import { InboxShareMenuComponent } from './inbox-share-menu.component';
import { InboxSharePickerComponent } from './inbox-share-picker.component';
import { InboxHistorySearchComponent } from './inbox-history-search.component';
import { InboxConversationListComponent, InboxListFormatters } from './inbox-conversation-list.component';
import { findCuratedGifs } from './curated-gifs';

export const VOICE_NOTE_MAX_DURATION_MS = 5 * 60_000;
const VOICE_NOTE_AUDIO_BITRATE = 48_000;

@Component({
  selector: 'app-messages-center',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, ChatReactionsComponent, GiphyEmbedComponent, InboxConversationListComponent, InboxEmojiGifPickerComponent, InboxShareMenuComponent, InboxSharePickerComponent, InboxHistorySearchComponent, ChatImageInViewDirective],
  templateUrl: './messages-center.component.html',
  styleUrls: ['./messages-center.component.css', './messages-center-premium.component.css', './messages-center-v3-finish.css'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class MessagesCenterComponent implements OnInit, OnDestroy, AfterViewChecked {
  /** Stable wrappers preserve the existing date, preview and unread formatting rules. */
  readonly conversationListFormatters: InboxListFormatters = {
    date: value => this.formatDate(value),
    time: value => this.formatInboxListTime(value),
    kind: kind => this.kindLabel(kind),
    preview: value => this.displayMessagePreview(value),
    unread: conversation => this.unreadBadgeText(conversation)
  };
  @ViewChild('previewLog') previewLog?: ElementRef<HTMLElement>;
  @ViewChild('composerTextarea') composerTextarea?: ElementRef<HTMLTextAreaElement>;

  conversations: InboxConversation[] = [];
  selectedKey: string | null = null;
  mutedConversations: MutedConversation[] = [];
  muteLoading = false;
  muteError = '';
  contactPreviewOpen = false;
  messages: InboxMessage[] = [];
  filter: InboxFilter = 'all';
  search = '';
  loading = false;
  previewLoading = false;
  previewError = false;
  failedSources: InboxKind[] = [];
  serverSummariesAvailable = true;
  private summaryVersion = 0;
  private readVersion = 0;
  /** Only a confirmed response about the currently selected private peer applies. */
  private peerReadCursor: number | null = null;
  private peerReceiptVersion = 0;
  private readonly ownReadSyncVersions = new Map<string, number>();
  private peerReceiptCheckedAt = 0;
  /** Token active when this inbox mounted; a different login must not inherit receipts. */
  private receiptSessionToken: string | null = null;
  private summaryTimer?: ReturnType<typeof setInterval>;
  private receiptTimer?: ReturnType<typeof setInterval>;
  // A precise selected-session timer closes live previews at kickoff rather
  // than waiting for the 45-second inbox summary refresh.
  private sessionCutoffTimer?: ReturnType<typeof setTimeout>;
  private attachmentRetryTimer?: ReturnType<typeof setTimeout>;
  /** Only a foreground inbox can acknowledge messages as actually viewed. */
  private isPageActive(): boolean {
    return document.visibilityState === 'visible' && document.hasFocus();
  }
  /** Focus loss can happen without a visibilitychange (e.g. another window). */
  private readonly onWindowBlur = (): void => {
    if (this.voiceRecording || this.voiceFinalizing) this.cancelVoiceRecording();
  };
  private readonly onAuthStorageChange = (event: StorageEvent): void => {
    // localStorage changes in *other* tabs on the same origin.
    if ((event.key === 't' || event.key === null) && !this.isAttachmentIdentityCurrent()) {
      this.clearMediaOnAccountChange();
    }
  };
  private accountSessionRevoked = false;
  private clearMediaOnAccountChange(): void {
    if (this.accountSessionRevoked) return;
    this.accountSessionRevoked = true;
    // A previous account must not remain visible in a mounted inbox.
    // Keep tab-scoped uncertain-send storage partitioned by its ORIGINAL
    // login so it cannot be inherited or silently resent by the new login.
    ++this.inboxVersion;
    ++this.selectionVersion;
    ++this.composerVersion;
    ++this.historyLocateVersion;
    ++this.messageSearchVersion;
    ++this.summaryVersion;
    ++this.peerReceiptVersion;
    this.conversations = [];
    this.selectedKey = null;
    this.messages = [];
    this.draft = '';
    this.replyingTo = null;
    this.drafts.clear();
    this.replyDrafts.clear();
    this.pendingByConversation.clear();
    this.inFlightByConversation.clear();
    this.confirmedWhileSending.clear();
    this.sendingKeys.clear();
    this.verifyingKeys.clear();
    this.verifyingPendingByConversation.clear();
    this.sendErrorsByConversation.clear();
    this.seenRealtimeIds.clear();
    this.realtimeDuringLoad.clear();
    this.sessionKickoffs.clear();
    this.ownReadSyncVersions.clear();
    this.currentUsername = '';
    this.pendingDeepLinkKey = null;
    this.observedDeepLinkKey = null;
    this.composerAllowed = false;
    this.composerAccessLoading = false;
    this.composerError = '';
    this.deliveryUncertain = false;
    this.deliveryChecking = false;
    this.sending = false;
    this.loading = false;
    this.previewLoading = false;
    this.previewError = false;
    this.newMessagesPending = 0;
    this.resetMessageSearch();
    this.typing.stop();
    if (this.sessionCutoffTimer) clearTimeout(this.sessionCutoffTimer);
    this.sessionCutoffTimer = undefined;
    this.recentThreadCache.clear();
    this.clearAttachmentRetry();
    ++this.attachmentViewVersion;
    this.attachmentReady = false;
    this.setSelectedAttachment(null);
    this.selectedGif = null;
    this.selectedShare = null;
    this.closeSharePicker();
    this.closeAttachmentMenu();
    ++this.mutationVersion;
    this.cancelMessageMutation();
    this.closeEmojiPicker();
    this.cancelVoiceRecording();
    this.clearAttachmentPreviews();
  }
  private readonly onPageActive = (): void => {
    // Browser timers can be suspended during sleep/backgrounding. Re-evaluate
    // the session's real kickoff before showing a previously loaded Blob.
    this.scheduleSelectedSessionCutoff();
    // Never keep capturing microphone audio while another tab is foregrounded.
    if (!this.isPageActive()) {
      if (this.voiceRecording || this.voiceFinalizing) this.cancelVoiceRecording();
      return;
    }
    if (!this.isAttachmentIdentityCurrent()) {
      this.clearMediaOnAccountChange();
      return;
    }
    if (this.selectedKey) this.markRenderedRead(this.selectedKey);
    this.refreshPeerReadReceipt(true);
    // A laptop may have resumed without a socket reconnect notification.
    // Only GET server history; never retry an ambiguous message POST.
    this.reconcilePendingDeliveries(false);
  };
  realtimeConnected = false;
  everConnected = false;
  draft = '';
  /** The upload composer stays hidden until the authenticated backend confirms private storage readiness. */
  attachmentReady = false;
  // Invalidate in-flight private media responses on chat navigation or teardown.
  private attachmentViewVersion = 0;
  get attachmentControlsReady(): boolean {
    return this.attachmentReady && this.isAttachmentIdentityCurrent() && this.isSelectedSessionOpen();
  }
  selectedAttachment: File | null = null;
  selectedAttachmentPreviewUrl: string | null = null;
  // GIPHY media is NOT copied to R2: only validated CDN URLs travel as chat text.
  selectedGif: GifChoice | null = null;
  selectedShare: ShareChoice | null = null;
  attachmentMenuOpen = false;
  sharePickerOpen = false;
  sharePickerLoading = false;
  sharePickerError = false;
  sharePickerTab: ShareKind = 'profile';
  sharePickerSearch = '';
  shareChoices: ShareChoice[] = [];
  private sharePickerVersion = 0;
  get visibleShareChoices(): ShareChoice[] {
    const q = this.sharePickerSearch.trim().toLocaleLowerCase();
    return this.shareChoices.filter(i => i.kind === this.sharePickerTab
      && (!q || (i.title + ' ' + i.subtitle).toLocaleLowerCase().includes(q)));
  }
  voiceRecording = false;
  voiceFinalizing = false;
  voiceElapsedSeconds = 0;
  readonly voiceMaxSeconds = VOICE_NOTE_MAX_DURATION_MS / 1000;
  get voiceElapsedLabel(): string {
    const seconds = this.voiceElapsedSeconds;
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  voicePreviewUrl: string | null = null;
  voicePreviewPlaying = false;
  voicePreviewMuted = false;
  voicePreviewDuration = 0;
  voicePreviewPosition = 0;
  private voicePreviewPlayer: HTMLAudioElement | null = null;

  voicePreviewProgress(): number {
    return this.voicePreviewDuration > 0
      ? Math.min(100, Math.max(0, Math.round(this.voicePreviewPosition / this.voicePreviewDuration * 100)))
      : 0;
  }

  voicePreviewTimeLabel(): string {
    const format = (seconds: number) => {
      const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
      return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
    };
    return format(this.voicePreviewPosition) + ' / ' + format(this.voicePreviewDuration);
  }

  toggleVoicePreview(player: HTMLAudioElement): void {
    if (!this.voicePreviewUrl || !this.selectedAttachment || this.sending || this.deliveryUncertain) return;
    if (player.paused) {
      for (const other of this.voicePlayers.values()) {
        if (!other.paused) other.pause();
      }
      void player.play().catch(() => { /* Browser remains authoritative. */ });
    } else {
      player.pause();
    }
  }

  onVoicePreviewTimeUpdate(player: HTMLAudioElement): void {
    if (!this.voicePreviewUrl) return;
    this.voicePreviewPlayer = player;
    if (Number.isFinite(player.duration) && player.duration > 0)
      this.voicePreviewDuration = player.duration;
    if (Number.isFinite(player.currentTime) && player.currentTime >= 0)
      this.voicePreviewPosition = player.currentTime;
  }

  onVoicePreviewPlaybackEvent(player: HTMLAudioElement): void {
    if (!this.voicePreviewUrl) {
      if (!player.paused) player.pause();
      this.voicePreviewPlaying = false;
      return;
    }
    this.onVoicePreviewTimeUpdate(player);
    this.voicePreviewPlaying = !player.paused && !player.ended;
    if (this.voicePreviewPlaying) {
      for (const other of this.voicePlayers.values()) {
        if (!other.paused) other.pause();
      }
    }
  }

  seekVoicePreview(player: HTMLAudioElement, event: Event): void {
    if (!Number.isFinite(player.duration) || player.duration <= 0) return;
    const percent = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(percent)) return;
    player.currentTime = Math.max(0, Math.min(player.duration, percent * player.duration / 100));
    this.onVoicePreviewTimeUpdate(player);
  }

  toggleVoicePreviewMute(player: HTMLAudioElement): void {
    player.muted = !player.muted;
    this.voicePreviewMuted = player.muted;
  }
  private voiceRecorder: MediaRecorder | null = null;
  private voiceStream: MediaStream | null = null;
  private voiceTimer?: ReturnType<typeof setTimeout>;
  private voiceElapsedTimer?: ReturnType<typeof setInterval>;
  private voiceGeneration = 0;
  readonly attachmentPreviews = new Map<number, string>();
  readonly attachmentLoading = new Set<number>();
  readonly inlineImageFailures = new Set<number>();
  expandedImageId: number | null = null;
  // Only transient playback state is retained. URLs remain private and are
  // revoked whenever the chat, account or active session changes.
  readonly voicePlaying = new Set<number>();
  readonly voiceMuted = new Set<number>();
  private readonly voicePlayers = new Map<number, HTMLAudioElement>();
  private readonly voiceDurations = new Map<number, number>();
  private readonly voicePositions = new Map<number, number>();
  private readonly voiceAutoplayRequested = new Set<number>();
  emojiPickerOpen = false;
  pickerTab: 'emoji' | 'gif' = 'emoji';
  gifQuery = '';
  gifResults: GifChoice[] = [];
  gifLoading = false;
  gifError = '';
  gifAvailable: boolean | null = null;
  gifHasMore = false;
  gifSelectingId: string | null = null;
  private gifApiKey = '';
  private gifRequestVersion = 0;
  private gifTimer?: ReturnType<typeof setTimeout>;
  private gifSearchAbort?: AbortController;
  private gifDownloadAbort?: AbortController;
  private gifConfigAbort?: AbortController;
  readonly gifCategories = [
    { icon: '😂', phrase: 'funny' }, { icon: '❤️', phrase: 'love' },
    { icon: '⚽', phrase: 'football' }, { icon: '👍', phrase: 'yes' },
    { icon: '🎉', phrase: 'celebration' }, { icon: '🏆', phrase: 'victory' }
  ];
  readonly composerEmojis = [
    '😀', '😃', '😄', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘',
    '😎', '🥳', '😢', '😭', '😮', '😅', '😉', '🤔', '🙏', '👏',
    '👍', '👎', '💪', '🙌', '❤️', '🔥', '💯', '✨', '🎉', '✅',
    '⚽', '🏀', '🏐', '🎾', '🏓', '🚴', '🏃', '🏆', '🥇', '🎯',
    '😇', '😜', '🤩', '🥹', '🤗', '🤝', '💚', '💕', '🚀', '🎊',
    '💬', '👀', '🤷', '😴', '😤', '🥲', '🫶', '💥', '🎮', '🎵'
  ];
  replyingTo: InboxMessage | null = null;
  editingMessageId: number | null = null;
  editDraft = '';
  confirmingDeleteMessageId: number | null = null;
  mutationPending = false;
  mutationError = '';
  private mutationVersion = 0;
  sending = false;
  deliveryUncertain = false;
  deliveryChecking = false;
  composerAccessLoading = false;
  composerAccessError = false;
  composerAllowed = false;
  composerError = '';
  private composerVersion = 0;
  private readonly drafts = new Map<string, string>();
  // A short-lived in-memory view avoids reloading an already-visited thread
  // just to switch back. Never persist private content or object URLs.
  private readonly recentThreadCache = new Map<string, {
    messages: InboxMessage[]; expiresAt: number
  }>();
  // Text and reply target form one draft. Switching chat must never turn
  // a quoted reply into a plain message, or leak the quote to another chat.
  private readonly replyDrafts = new Map<string, InboxMessage>();
  private readonly pendingByConversation = new Map<string, RecoverableSend>();
  private restorePendingAfterInitialInbox = false;
  // Send and delivery checks belong to conversations, not the entire inbox.
  // A delayed response must not lock or mutate a different selected thread.
  private readonly sendingKeys = new Set<string>();
  /** Match an AFTER_COMMIT socket event that beats the POST timeout/error. */
  private readonly inFlightByConversation = new Map<string, RecoverableSend>();
  private readonly confirmedWhileSending = new Map<string, InboxMessage>();
  private readonly verifyingKeys = new Set<string>();
  /** Identifies the exact send being verified; stale GET cleanup cannot unlock a newer send. */
  private readonly verifyingPendingByConversation = new Map<string, RecoverableSend>();
  private lastPendingRecheckAt = 0;
  private readonly sendErrorsByConversation = new Map<string, string>();
  private readonly subscriptions = new Subscription();
  private readonly jwt = new JwtHelperService();
  private currentUsername = '';
  private selectionVersion = 0;
  private inboxVersion = 0;
  private scrollRequested = false;
  newMessagesPending = 0;
  messageSearchOpen = false;
  messageSearchTerm = '';
  messageSearchResults: InboxMessage[] = [];
  selectedSearchResultId: number | null = null;
  searchResultNotInPreview = false;
  messageSearchLoading = false;
  messageSearchError = false;
  messageSearchSearched = false;
  messageSearchHasMore = false;
  messageSearchPage = 0;
  private messageSearchVersion = 0;
  historicalPreview = false;
  historyLocateLoading = false;
  historyLocateError = false;
  private historyLocateVersion = 0;
  private pendingScrollToMessageId: number | null = null;
  private readonly seenRealtimeIds = new Set<string>();
  private readonly realtimeDuringLoad = new Map<number, InboxMessage>();
  private pendingDeepLinkKey: string | null = null;
  private observedDeepLinkKey: string | null = null;
  private readonly sessionKickoffs = new Map<number, number>();
  readonly typing: ChatTypingTracker;

  constructor(
    private readonly contacts: CommunityService,
    private readonly groups: CommunityGroupsService,
    private readonly sessions: SessionService,
    private readonly direct: DirectChatService,
    private readonly timeline: CommunityTimelineService,
    private readonly realtime: DirectChatRealtimeService,
    private readonly inboxApi: InboxApiService,
    @Optional() private readonly route: ActivatedRoute | null = null,
    @Optional() public readonly calls: DirectCallClientService | null = null,
    @Optional() private readonly profilePeek: ProfileQuickViewService | null = null,
    @Optional() private readonly conversationMutes: ConversationMuteService | null = null
  ) {
    this.typing = new ChatTypingTracker(realtime);
  }

  isMuted(conversation: InboxConversation): boolean {
    return isConversationMuted(this.mutedConversations, conversation.kind, conversation.id);
  }

  toggleConversationMute(conversation: InboxConversation): void {
    if (!this.conversationMutes || this.muteLoading) return;
    this.muteLoading = true;
    this.muteError = '';
    const next = !this.isMuted(conversation);
    this.conversationMutes.set(conversation.kind, conversation.id, next).subscribe({
      next: () => {
        this.muteLoading = false;
        const others = this.mutedConversations.filter(item =>
          !(item.kind === conversation.kind && item.id.toLowerCase() === String(conversation.id).toLowerCase()));
        this.mutedConversations = next
          ? [...others, {kind: conversation.kind, id: String(conversation.id).toLowerCase()}] : others;
      },
      error: () => {
        this.muteLoading = false;
        this.muteError = t('chat.muteFailed');
      }
    });
  }

  private loadConversationMutes(): void {
    if (!this.conversationMutes) return;
    this.conversationMutes.list().subscribe({
      next: items => this.mutedConversations = items,
      error: () => { this.muteError = t('chat.muteFailed'); }
    });
  }

  openContact(username: string | null | undefined): void {
    if(!username?.trim())return;
    this.contactPreviewOpen=true;
    this.profilePeek?.open(username);
  }

  get callsEnabled(): boolean {
    return this.calls?.available$.value === true;
  }

  recheckCalls(): void {
    this.calls?.refreshAvailability();
  }

  startCall(conversation: InboxConversation, media: 'voice' | 'video'): void {
    if (conversation.kind !== 'direct' || !this.composerAllowed || !this.callsEnabled) return;
    void this.calls?.start(String(conversation.id), media);
  }

  ngOnInit(): void {
    this.loadConversationMutes();
    // Angular reuses the component when only the query changes.
    if (this.route?.queryParamMap) {
      this.subscriptions.add(this.route.queryParamMap.subscribe(params =>
        this.queueDeepLink(params.get('kind'), params.get('id'))));
    } else {
      this.queueDeepLink(
        this.route?.snapshot?.queryParamMap?.get('kind') ?? null,
        this.route?.snapshot?.queryParamMap?.get('id') ?? null);
    }
    try {
      const token = localStorage.getItem('t');
      this.receiptSessionToken = token;
      this.currentUsername = (token ? this.jwt.decodeToken(token)?.sub : '') || '';
    } catch { this.currentUsername = ''; this.receiptSessionToken = null; }
    // Provider settings can change while the user stays logged in.
    if (this.currentUsername) this.recheckCalls();
    // sessionStorage is scoped to this browser tab and exact login token.
    // Restore the original text ONLY as a blocked, uncertain draft. Never
    // submit it again without an explicit user action.
    if (this.receiptSessionToken && this.currentUsername) {
      const restored = restorePendingSends(this.currentUsername, this.receiptSessionToken);
      for (const pending of restored) {
        this.pendingByConversation.set(pending.key, pending);
        this.drafts.set(pending.key, pending.text);
      }
      this.restorePendingAfterInitialInbox = restored.length > 0;
    }

    this.subscriptions.add(this.realtime.messages$.subscribe(message => {
      const from = message.username1.toLowerCase();
      const to = message.username2.toLowerCase();
      const self = this.currentUsername.toLowerCase();
      if (!self || (from !== self && to !== self)) return;
      const peer = from === self ? message.username2 : message.username1;
      this.acceptRealtime(inboxKey('direct', peer), this.fromDirect(message, peer));
    }));
    // These events are pushed only AFTER_COMMIT by the server and address
    // the original sender. Unknown peers/sessions must never affect the UI.
    this.subscriptions.add(this.realtime.readReceipts$.subscribe(receipt => {
      this.acceptPersistedPeerReadReceipt(receipt);
    }));
    this.subscriptions.add(this.realtime.ownReads$.subscribe(read => {
      this.refreshOwnPersistedRead(read);
    }));
    this.subscriptions.add(this.realtime.communityMessages$.subscribe(message => {
      if (message.kind !== 'CHAT') return;
      this.acceptRealtime(inboxKey('community', message.communityId), this.fromCommunity(message));
    }));
    this.subscriptions.add(this.realtime.sessionMessages$.subscribe(message => {
      this.acceptRealtime(inboxKey('session', message.sessionId), this.fromSession(message));
    }));
    let connectedOnce = false;
    let disconnectedAfterAuth = false;
    let sawConnectionSignal = false;
    let failedBeforeFirstAuth = false;
    this.subscriptions.add(this.realtime.connected$.subscribe(connected => {
      this.realtimeConnected = connected;
      if (!connected) {
        if (connectedOnce) disconnectedAfterAuth = true;
        else if (sawConnectionSignal) {
          // The first false is the initial BehaviorSubject state, not a
          // transport failure. Another false before AUTH means the socket
          // failed and messages may have arrived after the initial REST GET.
          failedBeforeFirstAuth = true;
        }
        sawConnectionSignal = true;
        return;
      }
      this.everConnected = true;
      // Reconcile only after a genuine socket outage. This includes a failure
      // before the first successful AUTH: the initial history GET may be stale.
      // Repeated AUTH without a disconnect must never cause another GET.
      if (((connectedOnce && disconnectedAfterAuth)
          || (!connectedOnce && failedBeforeFirstAuth))
          && this.isReceiptSessionCurrent()) {
        this.loadInbox(true);
        this.refreshPeerReadReceipt(true);
      }
      connectedOnce = true;
      sawConnectionSignal = true;
      disconnectedAfterAuth = false;
      failedBeforeFirstAuth = false;
    }));

    this.realtime.connect();
    this.loadInbox();
    window.addEventListener('focus', this.onPageActive);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('storage', this.onAuthStorageChange);
    document.addEventListener('visibilitychange', this.onPageActive);
    this.summaryTimer = setInterval(() => {
      if (this.loading || !this.isReceiptSessionCurrent()) return;
      // Retry a failed membership lookup only after the normal 45s interval.
      // Otherwise keep the existing cheap, batched summary refresh.
      if (this.failedSources.length) this.loadInbox(true);
      else if (this.serverSummariesAvailable) this.refreshSummaries();
    }, 45_000);
    // Only an actively viewed private chat polls its receipt, at most once
    // every 15 seconds. Background tabs do not add API traffic.
    this.receiptTimer = setInterval(() => this.refreshPeerReadReceipt(), 15_000);
  }

  ngOnDestroy(): void {
    this.recentThreadCache.clear();
    ++this.mutationVersion;
    this.typing.destroy();
    ++this.peerReceiptVersion;
    this.subscriptions.unsubscribe();
    window.removeEventListener('focus', this.onPageActive);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('storage', this.onAuthStorageChange);
    document.removeEventListener('visibilitychange', this.onPageActive);
    if (this.summaryTimer) clearInterval(this.summaryTimer);
    if (this.receiptTimer) clearInterval(this.receiptTimer);
    if (this.sessionCutoffTimer) clearTimeout(this.sessionCutoffTimer);
    this.sessionCutoffTimer = undefined;
    this.clearAttachmentRetry();
    this.closeEmojiPicker();
    this.closeSharePicker();
    this.closeAttachmentMenu();
    this.cancelVoiceRecording();
    ++this.attachmentViewVersion;
    this.clearAttachmentPreviews();
    this.setSelectedAttachment(null);
    // The navbar owns the shared socket lifecycle. Never disconnect it here.
  }

  dayLabelAt(index: number): string {
    const current = this.messages[index];
    return current ? chatDaySeparator(current.createdAt,
      index > 0 ? this.messages[index - 1].createdAt : null) : '';
  }

  continuesGroupAt(index: number): boolean {
    if (index <= 0) return false;
    const current = this.messages[index], previous = this.messages[index - 1];
    return chatContinuesGroup(current.sender, current.createdAt,
      previous.sender, previous.createdAt);
  }

  private isNearPreviewBottom(): boolean {
    const log = this.previewLog?.nativeElement;
    return !log || log.scrollHeight - log.scrollTop - log.clientHeight < 120;
  }

  onPreviewLogScroll(): void {
    if (this.isNearPreviewBottom()) {
      this.newMessagesPending = 0;
      if (this.selectedKey) this.markRenderedRead(this.selectedKey);
    }
  }

  jumpToLatestMessages(): void {
    if (this.historicalPreview || !this.previewLog?.nativeElement) return;
    const log = this.previewLog.nativeElement;
    log.scrollTop = log.scrollHeight;
    this.newMessagesPending = 0;
    if (this.selectedKey) this.markRenderedRead(this.selectedKey);
  }

  ngAfterViewChecked(): void {
    const log = this.previewLog?.nativeElement;
    if (!log) return;
    if (this.pendingScrollToMessageId !== null) {
      const target = log.querySelector<HTMLElement>(
        '[data-message-id="' + this.pendingScrollToMessageId + '"]');
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.focus({ preventScroll: true });
        this.pendingScrollToMessageId = null;
      }
      return;
    }
    if (this.scrollRequested) {
      log.scrollTop = log.scrollHeight;
      this.scrollRequested = false;
      this.newMessagesPending = 0;
      if (this.selectedKey) this.markRenderedRead(this.selectedKey);
    }
  }

  get selected(): InboxConversation | undefined {
    return this.conversations.find(conversation => conversation.key === this.selectedKey);
  }

  get filteredConversations(): InboxConversation[] {
    return this.conversations.filter(conversation =>
      (this.filter === 'all' || (this.filter === 'recent'
        ? this.unreadCountFor(conversation) > 0 : conversation.kind === this.filter))
      && matchesInboxSearch(conversation, this.search));
  }

  /** One source of truth for both persistent unread badges and the filter. */
  unreadCountFor(conversation: InboxConversation): number {
    return conversation.unreadCount ?? conversation.newThisVisit;
  }

  unreadBadgeText(conversation: InboxConversation): string {
    const count = this.unreadCountFor(conversation);
    return count > 99 ? '99+' : String(count);
  }

  get recentCount(): number {
    return this.conversations.reduce((total, conversation) =>
      total + this.unreadCountFor(conversation), 0);
  }

  get sourceError(): boolean {
    return this.failedSources.length > 0;
  }

  setFilter(filter: InboxFilter): void {
    this.filter = filter;
  }

  loadInbox(recoverAfterReconnect = false): void {
    if (this.accountSessionRevoked
        || (this.receiptSessionToken && !this.isAttachmentIdentityCurrent())) return;
    // Support snapshot-only navigation contexts as well as live route streams.
    if (this.observedDeepLinkKey === null && this.route?.snapshot?.queryParamMap) {
      this.queueDeepLink(this.route.snapshot.queryParamMap.get('kind'),
        this.route.snapshot.queryParamMap.get('id'));
    }
    const request = ++this.inboxVersion;
    this.loading = true;
    this.failedSources = [];
    const failedKinds = new Set<InboxKind>();
    // Outdated requests must never corrupt another request's error state.
    const failed = (kind: InboxKind) => {
      failedKinds.add(kind);
    };
    forkJoin({
      friends: this.contacts.friends().pipe(timeout(10000), catchError(() => {
        failed('direct');
        return of([]);
      })),
      communities: this.groups.mine().pipe(timeout(10000), catchError(() => {
        failed('community');
        return of([]);
      })),
      sessions: this.sessions.mine().pipe(timeout(10000), catchError(() => {
        failed('session');
        return of({ created: [], joined: [], waitlisted: [] });
      }))
    }).pipe(finalize(() => {
      if (request === this.inboxVersion) this.loading = false;
    })).subscribe(({ friends, communities, sessions }) => {
      if (request !== this.inboxVersion || this.accountSessionRevoked
          || (this.receiptSessionToken && !this.isAttachmentIdentityCurrent())
          || (recoverAfterReconnect && !this.isReceiptSessionCurrent())) return;
      this.failedSources = [...failedKinds];
      const existing = new Map(this.conversations.map(item => [item.key, item]));
      const entries: InboxConversation[] = [];

      for (const friend of friends) {
        entries.push({
          key: inboxKey('direct', friend.username),
          kind: 'direct',
          id: friend.username,
          title: friend.nickname || friend.fullName || friend.username,
          subtitle: '@' + friend.username,
          newThisVisit: 0
        });
      }

      for (const community of communities) {
        entries.push({
          key: inboxKey('community', community.id),
          kind: 'community',
          id: community.id,
          title: community.name,
          subtitle: community.sport || '',
          newThisVisit: 0
        });
      }

      // 'waitlisted' users have not yet been admitted to session chat.
      this.sessionKickoffs.clear();
      const included = new Set<number>();
      for (const session of [...sessions.created, ...sessions.joined]) {
        // The only available session conversations are games yet to happen.
        const kickoff = Date.parse(session.gameDate || '');
        if (!Number.isFinite(kickoff) || kickoff <= Date.now()
            || session.status === 'CANCELLED' || session.status === 'COMPLETED'
            || session.status === 'NOT_OCCURRED' || included.has(session.id)) continue;
        included.add(session.id);
        this.sessionKickoffs.set(session.id, kickoff);
        entries.push({
          key: inboxKey('session', session.id),
          kind: 'session',
          id: session.id,
          title: session.sport + ' · ' + session.city,
          subtitle: this.formatDate(session.gameDate),
          newThisVisit: 0
        });
      }

      // A failed membership source is not proof that membership was revoked:
      // keep its already-authorized rows while the retry is pending. A
      // successful source may remove genuinely revoked/deleted conversations.
      for (const previous of existing.values()) {
        if (failedKinds.has(previous.kind) && !entries.some(item => item.key === previous.key)) {
          entries.push(previous);
        }
      }
      // A successful membership lookup may prove the conversation was
      // revoked. Its old pending draft must not stay in sessionStorage.
      // A failing lookup is inconclusive and must retain recovery state.
      let discarded = false;
      for (const key of this.pendingByConversation.keys()) {
        const kind = key.split(':', 1)[0] as InboxKind;
        if (!failedKinds.has(kind) && !entries.some(item => item.key === key)) {
          this.pendingByConversation.delete(key);
          this.drafts.delete(key);
          this.replyDrafts.delete(key);
          this.recentThreadCache.delete(key);
          discarded = true;
        }
      }
      if (discarded) this.persistPendingSends();
      // Revoke cached content when a successful membership lookup removes a chat.
      for (const key of this.recentThreadCache.keys()) {
        const kind = key.split(':', 1)[0] as InboxKind;
        if (!failedKinds.has(kind) && !entries.some(item => item.key === key)) {
          this.recentThreadCache.delete(key);
        }
      }
      // Still using the previous selected row here: close any expired or
      // revoked session and revoke its Blob URLs before replacing the list.
      this.scheduleSelectedSessionCutoff();
      this.conversations = orderInbox(entries.map(item => ({
        ...item,
        latestText: existing.get(item.key)?.latestText,
        latestAt: existing.get(item.key)?.latestAt,
        newThisVisit: existing.get(item.key)?.newThisVisit || 0,
        unreadCount: existing.get(item.key)?.unreadCount,
        latestMessageId: existing.get(item.key)?.latestMessageId
      })));
      // The server may have moved the kickoff since this chat was opened.
      // Also revoke any open private previews if a session disappeared.
      this.scheduleSelectedSessionCutoff();
      this.refreshSummaries(request);
      // Consume a link only once; a refresh must not override manual selection.
      this.openPendingDeepLink();
      // Leave the initial choice to the user: no N+1 history requests at page load.
      if (this.selectedKey && !this.conversations.some(item => item.key === this.selectedKey)) {
        this.selectedKey = null;
        this.messages = [];
        ++this.selectionVersion;
      }
      // A delayed history refresh must never run for a removed conversation,
      // a failed membership source, or a detached historical search window.
      const active = this.selected;
      if (recoverAfterReconnect && active && !this.historicalPreview
          && !failedKinds.has(active.kind)) this.loadHistory(active);
      // Check uncertain POSTs for ALL still-authorized conversations. The
      // selected recent history above already performs its own confirmation.
      const recovery = recoverAfterReconnect || this.restorePendingAfterInitialInbox;
      this.restorePendingAfterInitialInbox = false;
      if (recovery) this.reconcilePendingDeliveries(
        true, active && !this.historicalPreview && !failedKinds.has(active.kind)
          ? active.key : null, failedKinds
      );
    });
  }

  private queueDeepLink(kind: string | null, id: string | null): void {
    const supported = kind === 'direct' || kind === 'community' || kind === 'session';
    const value = id?.trim() || '';
    const numericId = /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value));
    const next = supported && value && value.length <= 128
      && (kind === 'direct' || numericId) ? inboxKey(kind, value) : null;
    if (next === this.observedDeepLinkKey) return;
    this.observedDeepLinkKey = next;
    this.pendingDeepLinkKey = next;
    this.openPendingDeepLink();
  }

  private openPendingDeepLink(): void {
    if (!this.pendingDeepLinkKey) return;
    const target = this.conversations.find(item => item.key === this.pendingDeepLinkKey);
    if (!target) return; // Never add a forged or expired conversation.
    this.pendingDeepLinkKey = null;
    if (target.key !== this.selectedKey) this.selectConversation(target);
  }

  isSelectedSessionOpen(): boolean {
    const target = this.selected;
    return !target || target.kind !== 'session'
      || Date.now() < (this.sessionKickoffs.get(Number(target.id)) ?? 0);
  }

  /**
   * Enforce the server's pre-kickoff rule locally as well. The date is supplied
   * by the authenticated sessions list; the backend remains authoritative.
   */
  private scheduleSelectedSessionCutoff(): void {
    if (this.sessionCutoffTimer) clearTimeout(this.sessionCutoffTimer);
    this.sessionCutoffTimer = undefined;
    const conversation = this.selected;
    if (!conversation || conversation.kind !== 'session') return;
    const kickoff = this.sessionKickoffs.get(Number(conversation.id));
    if (!Number.isFinite(kickoff) || (kickoff as number) <= Date.now()) {
      this.closeSelectedSessionChat();
      return;
    }
    const delay = (kickoff as number) - Date.now();
    const key = conversation.key;
    // JavaScript clamps very large timeouts; reschedule if clock changed.
    this.sessionCutoffTimer = setTimeout(() => {
      this.sessionCutoffTimer = undefined;
      if (this.selectedKey === key) this.scheduleSelectedSessionCutoff();
    }, Math.min(delay, 2_147_483_647));
  }

  private closeSelectedSessionChat(): void {
    const conversation = this.selected;
    if (!conversation || conversation.kind !== 'session') return;
    this.typing.stop();
    this.cancelVoiceRecording();
    this.clearAttachmentRetry();
    ++this.attachmentViewVersion; // Reject any authenticated Blob still in flight.
    this.setSelectedAttachment(null);
    this.selectedGif = null;
    this.selectedShare = null;
    this.closeSharePicker();
    this.closeAttachmentMenu();
    this.attachmentReady = false;
    this.clearAttachmentPreviews(); // Revoke images and stop audio playback.
    this.drafts.delete(conversation.key);
    this.replyDrafts.delete(conversation.key);
    this.draft = '';
    this.replyingTo = null;
    this.closeEmojiPicker();
    ++this.selectionVersion;
    ++this.composerVersion;
    ++this.historyLocateVersion;
    ++this.peerReceiptVersion;
    this.resetMessageSearch();
    this.messages = [];
    this.recentThreadCache.delete(conversation.key);
    this.previewLoading = false;
    this.historicalPreview = false;
    this.composerAllowed = false;
    this.composerAccessLoading = false;
    this.selectedKey = null;
    this.conversations = this.conversations.filter(item => item.key !== conversation.key);
    this.sessionKickoffs.delete(Number(conversation.id));
  }

  selectConversation(conversation: InboxConversation): void {
    this.contactPreviewOpen = false;
    this.profilePeek?.close();
    if (conversation.key === this.selectedKey && !this.previewError) return;
    if (this.selectedKey) {
      this.drafts.set(this.selectedKey, this.draft);
      if (this.replyingTo?.key === this.selectedKey && this.replyingTo.id > 0)
        this.replyDrafts.set(this.selectedKey, this.replyingTo);
      else this.replyDrafts.delete(this.selectedKey);
    }
    ++this.mutationVersion;
    this.cancelMessageMutation();
    this.typing.stop();
    this.cancelVoiceRecording();
    this.closeEmojiPicker();
    this.closeSharePicker();
    this.closeAttachmentMenu();
    this.setSelectedAttachment(null);
    this.selectedGif = null;
    this.selectedShare = null;
    this.clearAttachmentRetry();
    this.attachmentReady = false;
    ++this.attachmentViewVersion;
    this.clearAttachmentPreviews();
    this.selectedKey = conversation.key;
    this.scheduleSelectedSessionCutoff();
    // The session may have expired between clicking its row and selecting it.
    if (this.selectedKey !== conversation.key) return;
    ++this.peerReceiptVersion;
    this.peerReadCursor = null;
    this.peerReceiptCheckedAt = 0;
    this.newMessagesPending = 0;
    this.scrollRequested = false;
    ++this.historyLocateVersion;
    this.historicalPreview = false;
    this.historyLocateLoading = false;
    this.historyLocateError = false;
    this.pendingScrollToMessageId = null;
    this.resetMessageSearch();
    const savedReply = this.replyDrafts.get(conversation.key);
    this.replyingTo = savedReply?.key === conversation.key && savedReply.id > 0
      ? savedReply : null;
    this.draft = this.drafts.get(conversation.key) || '';
    this.deliveryUncertain = this.pendingByConversation.has(conversation.key);
    this.sending = this.sendingKeys.has(conversation.key);
    this.deliveryChecking = this.verifyingKeys.has(conversation.key);
    this.composerError = this.deliveryUncertain
      ? t('chat.sendUnconfirmed') : this.sendErrorsByConversation.get(conversation.key) || '';
    this.composerAllowed = false;
    this.composerAccessError = false;
    this.composerAccessLoading = true;
    const cached = this.recentThreadCache.get(conversation.key);
    this.messages = cached && cached.expiresAt > Date.now()
        && this.isAttachmentIdentityCurrent()
      ? cached.messages.map(message => ({...message})) : [];
    this.previewError = false;
    // Revalidate authorization on every visit; the cache is never the source of truth.
    // Opening a conversation is not proof the messages were displayed.
    this.loadComposerAccess(conversation);
    this.loadAttachmentAvailability(conversation);
    this.loadHistory(conversation);
    this.refreshPeerReadReceipt(true);
  }

  toggleMessageSearch(): void {
    if (this.messageSearchOpen) {
      this.resetMessageSearch();
    } else {
      this.messageSearchOpen = true;
    }
  }

  private resetMessageSearch(): void {
    ++this.messageSearchVersion;
    this.messageSearchOpen = false;
    this.messageSearchTerm = '';
    this.messageSearchResults = [];
    this.selectedSearchResultId = null;
    this.searchResultNotInPreview = false;
    this.messageSearchLoading = false;
    this.messageSearchError = false;
    this.messageSearchSearched = false;
    this.messageSearchHasMore = false;
    this.messageSearchPage = 0;
  }

  viewMessageSearchResult(result: InboxMessage): void {
    const conversation = this.selected;
    if (!conversation || result.key !== conversation.key
        || !this.messageSearchResults.some(item => item.id === result.id)) return;
    this.selectedSearchResultId = result.id;
    this.historyLocateError = false;
    if (this.messages.some(item => item.id === result.id)) {
      this.searchResultNotInPreview = false;
      const target = this.previewLog?.nativeElement?.querySelector<HTMLElement>(
        '[data-message-id="' + result.id + '"]');
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        target.focus({ preventScroll: true });
      } else {
        this.pendingScrollToMessageId = result.id;
      }
      return;
    }

    // Never append a detached old hit to the newest messages. Fetch an
    // authorized, bounded chronological window around it instead.
    const version = ++this.historyLocateVersion;
    this.searchResultNotInPreview = true;
    this.historyLocateLoading = true;
    const key = conversation.key;
    this.inboxApi.messageContext({ kind: conversation.kind, id: String(conversation.id) }, result.id)
      .pipe(timeout(10_000), finalize(() => {
        if (version === this.historyLocateVersion) this.historyLocateLoading = false;
      })).subscribe({
        next: hits => {
          if (version !== this.historyLocateVersion || this.selectedKey !== key
              || this.selectedSearchResultId !== result.id) return;
          if (!hits.some(hit => hit.id === result.id)) {
            this.historyLocateError = true;
            return;
          }
          // Discard any unfinished recent-history HTTP response without
          // affecting the search results or the user's current draft.
          ++this.selectionVersion;
          this.previewLoading = false;
          this.previewError = false;
          this.historicalPreview = true;
          this.newMessagesPending = 0;
          if (conversation.kind === 'community') {
            this.composerAllowed = true;
            this.composerAccessLoading = false;
          }
          this.messages = mergeInboxMessages(hits.map(hit => ({
            key, id: hit.id, sender: hit.sender, text: hit.text,
            createdAt: hit.createdAt || '',
            replyToMessageId: hit.replyToMessageId,
            replyToSender: hit.replyToSender, replyToText: hit.replyToText
          })));
          this.searchResultNotInPreview = false;
          this.scrollRequested = false;
          this.pendingScrollToMessageId = result.id;
        },
        error: () => {
          if (version === this.historyLocateVersion && this.selectedKey === key)
            this.historyLocateError = true;
        }
      });
  }

  returnToRecent(): void {
    this.newMessagesPending = 0;
    ++this.historyLocateVersion;
    this.historicalPreview = false;
    this.historyLocateLoading = false;
    this.historyLocateError = false;
    this.pendingScrollToMessageId = null;
    this.selectedSearchResultId = null;
    this.searchResultNotInPreview = false;
    if (this.selected) this.loadHistory(this.selected);
  }

  onMessageSearchTermChange(): void {
    // Invalidate any earlier HTTP result if the user types another query.
    ++this.messageSearchVersion;
    this.messageSearchResults = [];
    this.selectedSearchResultId = null;
    this.searchResultNotInPreview = false;
    ++this.historyLocateVersion;
    this.historyLocateLoading = false;
    this.historyLocateError = false;
    this.pendingScrollToMessageId = null;
    this.messageSearchLoading = false;
    this.messageSearchError = false;
    this.messageSearchSearched = false;
    this.messageSearchHasMore = false;
    this.messageSearchPage = 0;
  }

  submitMessageSearch(page = 0): void {
    const conversation = this.selected;
    const term = this.messageSearchTerm.trim();
    if (!conversation || !this.messageSearchOpen || this.messageSearchLoading
        || term.length < 2 || term.length > 80
        || page < 0 || page > 50 || page > 0 && !this.messageSearchHasMore) return;

    const version = ++this.messageSearchVersion;
    const key = conversation.key;
    this.messageSearchLoading = true;
    this.messageSearchError = false;
    this.messageSearchSearched = true;
    this.inboxApi.searchMessages({ kind: conversation.kind, id: String(conversation.id) }, term, page)
      .pipe(timeout(10_000), finalize(() => {
        if (version === this.messageSearchVersion) this.messageSearchLoading = false;
      }))
      .subscribe({
        next: response => {
          if (version !== this.messageSearchVersion || this.selectedKey !== key
              || !this.messageSearchOpen || this.messageSearchTerm.trim() !== term) return;
          const results = response.results.map(hit => ({
            key, id: hit.id, sender: hit.sender, text: hit.text,
            createdAt: hit.createdAt || '',
            replyToMessageId: hit.replyToMessageId,
            replyToSender: hit.replyToSender, replyToText: hit.replyToText
          }));
          if (page === 0) {
            this.messageSearchResults = results;
          } else {
            // Server sorts hits newest-first; keep that ordering across pages.
            const known = new Set(this.messageSearchResults.map(item => item.id));
            this.messageSearchResults = [...this.messageSearchResults,
              ...results.filter(item => !known.has(item.id))];
          }
          this.messageSearchPage = page;
          this.messageSearchHasMore = response.hasMore && page < 50;
        },
        error: () => {
          if (version !== this.messageSearchVersion || this.selectedKey !== key) return;
          this.messageSearchError = true;
        }
      });
  }

  reloadPreview(): void {
    this.returnToRecent();
  }

  private loadHistory(conversation: InboxConversation): void {
    const version = ++this.selectionVersion;
    this.previewLoading = this.messages.length === 0;
    this.previewError = false;
    this.realtimeDuringLoad.clear();

    let result: Observable<InboxMessage[]>;
    if (conversation.kind === 'direct') {
      result = this.direct.recentHistory(String(conversation.id)).pipe(
        map(page => page.content.map(message => this.fromDirect(message, String(conversation.id)))));
    } else if (conversation.kind === 'community') {
      result = this.timeline.list(Number(conversation.id), 'CHAT').pipe(
        map(entries => entries.map(entry => this.fromCommunity(entry))));
    } else {
      result = this.sessions.messages(Number(conversation.id)).pipe(
        map(entries => entries.map(entry => this.fromSession(entry))));
    }

    result.pipe(timeout(10000), finalize(() => {
      if (version === this.selectionVersion) this.previewLoading = false;
    })).subscribe({
      next: entries => {
        if (version !== this.selectionVersion || conversation.key !== this.selectedKey) return;
        // Keep a user's scroll position when refreshing an already opened history.
        const follow = this.messages.length === 0 || this.isNearPreviewBottom();
        // Merge live events received after the HTTP request started; never
        // overwrite them with an older response or duplicate their IDs.
        const before = new Set(this.messages.map(item => item.id));
        const latestServerId = entries.reduce((max, item) => Math.max(max, item.id), 0);
        // When the user is reading above the bottom, never discard their
        // earlier loaded window. When following the tail, retain only local
        // messages newer than the HTTP snapshot to avoid losing socket events.
        const preserved = follow
          ? this.messages.filter(item => item.id > latestServerId)
          : this.messages;
        this.messages = mergeInboxMessages([
          ...preserved, ...entries, ...this.realtimeDuringLoad.values()
        ]);
        if (!this.historicalPreview) this.recentThreadCache.set(conversation.key, {
          messages: this.messages.map(message => ({...message})),
          expiresAt: Date.now() + 60_000
        });
        if (!follow && before.size > 0 && !this.historicalPreview) {
          this.newMessagesPending += this.messages.filter(item =>
            !before.has(item.id) && item.sender.toLowerCase() !== this.currentUsername.toLowerCase()).length;
        }
        if (follow) this.newMessagesPending = 0;
        this.realtimeDuringLoad.clear();
        if (conversation.kind === 'community') {
          this.composerAllowed = true;
          this.composerAccessLoading = false;
        }
        this.confirmFromHistoryIfPresent(conversation.key, this.messages);
        this.updatePreviewFromHistory(conversation.key, this.messages);
        // The HTTP callback runs before Angular renders the new bubbles.
        // Acknowledge only after the bottom bubble is in the live DOM.
        this.scrollRequested = follow;
      },
      error: () => {
        if (version !== this.selectionVersion || conversation.key !== this.selectedKey) return;
        this.previewError = true;
        this.recentThreadCache.delete(conversation.key);
        this.messages = [];
        this.composerAllowed = false;
        this.composerAccessLoading = false;
      }
    });
  }

  private fromDirect(message: DirectChatMessage, peer: string): InboxMessage {
    return {
      key: inboxKey('direct', peer),
      id: message.id || 0,
      sender: message.username1,
      text: message.text,
      createdAt: message.date || message.dataDisplay || '',
      editedAt: message.editedAt, deletedAt: message.deletedAt,
      replyToMessageId: message.replyToMessageId,
      replyToSender: message.replyToSender,
      replyToText: message.replyToText,
      attachmentName: message.attachmentName,
      attachmentMimeType: message.attachmentMimeType,
      attachmentSize: message.attachmentSize
    };
  }

  private fromCommunity(entry: CommunityTimelineEntry): InboxMessage {
    return { key: inboxKey('community', entry.communityId), id: entry.id,
      sender: entry.username, text: entry.body, createdAt: entry.createdAt,
      editedAt: entry.editedAt, deletedAt: entry.deletedAt,
      replyToMessageId: entry.replyToMessageId, replyToSender: entry.replyToSender,
      replyToText: entry.replyToText,
      attachmentName: entry.attachmentName,
      attachmentMimeType: entry.attachmentMimeType,
      attachmentSize: entry.attachmentSize };
  }

  private fromSession(entry: SessionMessage): InboxMessage {
    return { key: inboxKey('session', entry.sessionId), id: entry.id,
      sender: entry.senderUsername, text: entry.body, createdAt: entry.createdAt,
      editedAt: entry.editedAt, deletedAt: entry.deletedAt,
      replyToMessageId: entry.replyToMessageId, replyToSender: entry.replyToSender,
      replyToText: entry.replyToText,
      attachmentName: entry.attachmentName,
      attachmentMimeType: entry.attachmentMimeType,
      attachmentSize: entry.attachmentSize };
  }

  private acceptRealtime(key: string, message: InboxMessage): void {
    // Messages received by an older authenticated inbox must not mutate the
    // visible history, unread counts, or pending sends after account change.
    if (this.receiptSessionToken && !this.isReceiptSessionCurrent()) return;
    if (!this.conversations.some(item => item.key === key) || message.id <= 0) return;
    // Mutations reuse the original message ID. They must never count as new
    // arrivals or acknowledge unread messages, even if a socket sends them twice.
    if (message.editedAt || message.deletedAt) {
      this.applyMessageMutation(key, message);
      return;
    }
    const eventId = key + ':' + message.id;
    if (this.seenRealtimeIds.has(eventId)) return;
    this.seenRealtimeIds.add(eventId);
    if (this.seenRealtimeIds.size > 1000) this.seenRealtimeIds.clear();

    const sending = this.inFlightByConversation.get(key);
    if (sending && this.matchesPending(message, sending)) {
      // The server committed the POST, but its HTTP response could still
      // timeout. Remember this exact server message until the POST settles.
      this.confirmedWhileSending.set(key, message);
      this.persistPendingSends();
    }
    // A delivery already marked uncertain is confirmed even if the
    // recipient is NOT the conversation currently shown on this device.
    this.confirmFromHistoryIfPresent(key, [message]);

    const isSelected = key === this.selectedKey;
    const isMine = !!this.currentUsername
      && message.sender.toLowerCase() === this.currentUsername.toLowerCase();
    // An open conversation is not necessarily being read: the window may be
    // unfocused, its history still loading, or the reader scrolled up.
    // Preserve its unread badge until the server confirms a visible read.
    const unreadArrival = !isMine && (!isSelected || this.historicalPreview
      || !this.isPageActive() || this.previewLoading || !this.isNearPreviewBottom());
    this.conversations = orderInbox(this.conversations.map(conversation =>
      conversation.key === key
        ? { ...conversation, latestText: message.text, latestAt: message.createdAt,
            latestMessageId: message.id,
            unreadCount: conversation.unreadCount === undefined ? undefined :
              conversation.unreadCount + (unreadArrival ? 1 : 0),
            newThisVisit: conversation.newThisVisit + (unreadArrival ? 1 : 0) }
        : conversation));

    if (isSelected) {
      // The historical window is not the live end of the chat. Never mix
      // fresh socket events into it or acknowledge them as rendered/read.
      if (this.historicalPreview) return;
      const follow = isMine || this.isNearPreviewBottom();
      if (!follow) this.newMessagesPending++;
      else this.newMessagesPending = 0;
      this.messages = mergeInboxMessages([...this.messages, message]);
      if (this.previewLoading) this.realtimeDuringLoad.set(message.id, message);
      // A WebSocket event arrives before its bubble exists in the DOM.
      // The post-render scroll path handles any read acknowledgement.
      this.scrollRequested = follow;
    }
  }

  private applyMessageMutation(key: string, updated: InboxMessage): void {
    const mutate = (messages: InboxMessage[]): InboxMessage[] => messages.map(message => {
      if (message.id === updated.id) return updated;
      if (updated.deletedAt && message.replyToMessageId === updated.id) {
        return {...message, replyToText: '[message deleted]'};
      }
      return message;
    });
    if (key === this.selectedKey) {
      this.messages = mutate(this.messages);
      this.messageSearchResults = mutate(this.messageSearchResults);
      if (updated.deletedAt) {
        const previewUrl = this.attachmentPreviews.get(updated.id);
        if (previewUrl) {
          this.releaseVoicePlayer(updated.id);
          URL.revokeObjectURL(previewUrl);
          this.attachmentPreviews.delete(updated.id);
        }
        this.attachmentLoading.delete(updated.id);
      }
    }
    const cache = this.recentThreadCache.get(key);
    if (cache) this.recentThreadCache.set(key, {
      ...cache, messages: mutate(cache.messages)
    });
    this.conversations = this.conversations.map(conversation =>
      conversation.key === key && conversation.latestMessageId === updated.id
        ? {...conversation, latestText: updated.deletedAt ? t('chat.messageDeleted') : updated.text}
        : conversation);
  }

  canEditSentMessage(message: InboxMessage): boolean {
    const date = Date.parse(message.createdAt);
    return this.canDeleteSentMessage(message) && !message.attachmentName
      && !message.text.startsWith('[JYNLO:GIPHY:1]') && !readSharedMessage(message.text)
      && Number.isFinite(date) && Date.now() >= date
      && Date.now() - date <= 15 * 60_000;
  }

  canDeleteSentMessage(message: InboxMessage): boolean {
    return this.isMine(message) && message.id > 0 && !message.deletedAt
      && message.key === this.selectedKey && !!this.selected && this.composerAllowed
      && !this.composerAccessLoading && !this.previewLoading && !this.previewError
      && !this.historicalPreview && !this.sending && !this.deliveryUncertain
      && !this.deliveryChecking && !this.mutationPending && this.isSelectedSessionOpen();
  }

  beginEditMessage(message: InboxMessage): void {
    if (!this.canEditSentMessage(message)) return;
    this.confirmingDeleteMessageId = null;
    this.editingMessageId = message.id;
    this.editDraft = message.text;
    this.mutationError = '';
  }

  cancelMessageMutation(): void {
    this.editingMessageId = null;
    this.confirmingDeleteMessageId = null;
    this.editDraft = '';
    this.mutationError = '';
  }

  promptDeleteMessage(message: InboxMessage): void {
    if (!this.canDeleteSentMessage(message)) return;
    this.editingMessageId = null;
    this.confirmingDeleteMessageId = message.id;
    this.mutationError = '';
  }

  private mutationRequest(conversation: InboxConversation, id: number,
                          text: string | null): Observable<InboxMessage> {
    if (conversation.kind === 'direct') {
      const peer = String(conversation.id);
      return (text === null ? this.direct.deleteMessage(peer, id)
        : this.direct.editMessage(peer, id, text))
        .pipe(map(entry => this.fromDirect(entry, peer)));
    }
    if (conversation.kind === 'community') {
      const communityId = Number(conversation.id);
      return (text === null ? this.timeline.deleteChatForEveryone(communityId, id)
        : this.timeline.editChatMessage(communityId, id, text))
        .pipe(map(entry => this.fromCommunity(entry)));
    }
    const sessionId = Number(conversation.id);
    return (text === null ? this.sessions.deleteMessage(sessionId, id)
      : this.sessions.editMessage(sessionId, id, text))
      .pipe(map(entry => this.fromSession(entry)));
  }

  private commitMessageMutation(message: InboxMessage, text: string | null): void {
    const conversation = this.selected;
    if (!conversation || message.key !== conversation.key || this.mutationPending) return;
    if (text === null ? !this.canDeleteSentMessage(message) : !this.canEditSentMessage(message)) return;
    const version = ++this.mutationVersion;
    const key = conversation.key;
    this.mutationPending = true;
    this.mutationError = '';
    this.mutationRequest(conversation, message.id, text).pipe(timeout(10_000),
      finalize(() => {
        if (version === this.mutationVersion) this.mutationPending = false;
      })).subscribe({
      next: updated => {
        if (version !== this.mutationVersion || key !== this.selectedKey) return;
        this.applyMessageMutation(key, updated);
        this.cancelMessageMutation();
      },
      error: () => {
        if (version === this.mutationVersion && key === this.selectedKey) {
          this.mutationError = t('chat.mutationFailed');
        }
      }
    });
  }

  saveEditedMessage(message: InboxMessage): void {
    const text = this.editDraft.trim();
    if (!text || text.length > 2000 || text === message.text) return;
    this.commitMessageMutation(message, text);
  }

  confirmDeleteMessage(message: InboxMessage): void {
    if (this.confirmingDeleteMessageId !== message.id) return;
    this.commitMessageMutation(message, null);
  }

  private updatePreviewFromHistory(key: string, messages: InboxMessage[]): void {
    const last = messages[messages.length - 1];
    if (!last) return;
    this.conversations = orderInbox(this.conversations.map(conversation =>
      conversation.key === key
        ? { ...conversation, latestText: last.text, latestAt: last.createdAt,
            latestMessageId: last.id }
        : conversation));
  }

  private loadComposerAccess(conversation: InboxConversation): void {
    const version = ++this.composerVersion;
    this.composerAccessError = false;
    if (conversation.kind === 'community') {
      // Community history independently confirms membership before enabling writes.
      return;
    }
    const access: Observable<boolean> = conversation.kind === 'direct'
      ? this.direct.info(String(conversation.id)).pipe(map(info => !info.chatBlocked))
      : this.sessions.detail(Number(conversation.id)).pipe(map(detail => this.sessionIsWritable(detail)));
    access.pipe(timeout(10000)).subscribe({
      next: allowed => {
        if (version !== this.composerVersion || conversation.key !== this.selectedKey) return;
        this.composerAllowed = allowed;
        this.composerAccessLoading = false;
      },
      error: () => {
        if (version !== this.composerVersion || conversation.key !== this.selectedKey) return;
        this.composerAllowed = false;
        this.composerAccessError = true;
        this.composerAccessLoading = false;
      }
    });
  }

  retryComposerAccess(): void {
    const conversation = this.selected;
    if (!conversation || !this.isAttachmentIdentityCurrent() || !this.isSelectedSessionOpen()) return;
    this.composerAllowed = false;
    this.composerAccessLoading = true;
    this.loadComposerAccess(conversation);
  }

  private sessionIsWritable(session: SessionDetail): boolean {
    const kickoff = Date.parse(session.gameDate || '');
    return (session.joined === true || Boolean(this.currentUsername
        && session.creatorUsername?.toLowerCase() === this.currentUsername.toLowerCase()))
      && session.status !== 'CANCELLED' && session.status !== 'COMPLETED'
      && session.problemType !== 'NOT_OCCURRED'
      && Number.isFinite(kickoff) && Date.now() < kickoff;
  }

  canSendMessage(): boolean {
    return Boolean(this.selected && this.isSelectedSessionOpen()
      && this.composerAllowed && !this.composerAccessLoading
      && !this.previewLoading && !this.previewError && !this.sending && !this.deliveryUncertain
      && !this.deliveryChecking && !this.voiceRecording && !this.voiceFinalizing
      && (this.draft.trim().length > 0 || !!this.selectedShare
          || (this.attachmentControlsReady && (!!this.selectedAttachment || !!this.selectedGif)))
      && this.draft.trim().length <= 2000
      && (!this.selectedGif || !!encodeGiphyText(this.selectedGif, this.draft.trim()))
      && (!this.selectedShare || !!encodeShareMessage(this.selectedShare, this.draft.trim())));
  }

  replyToMessage(message: InboxMessage): void {
    if (message.id <= 0 || message.key !== this.selectedKey
        || !this.composerAllowed || this.sending || this.deliveryUncertain) return;
    this.replyingTo = message;
    this.replyDrafts.set(message.key, message);
    this.composerTextarea?.nativeElement.focus({ preventScroll: true });
  }

  cancelReply(): void {
    if (this.sending || this.deliveryUncertain) return;
    if (this.selectedKey) this.replyDrafts.delete(this.selectedKey);
    this.replyingTo = null;
  }

  onTypingInput(): void {
    const conversation = this.selected;
    if (!conversation) return;
    this.typing.input(conversation.kind, conversation.id, this.draft, this.canSendMessage());
  }

  private clearAttachmentRetry(): void {
    if (this.attachmentRetryTimer) clearTimeout(this.attachmentRetryTimer);
    this.attachmentRetryTimer = undefined;
  }

  private loadAttachmentAvailability(conversation: InboxConversation, attempt = 0): void {
    this.attachmentReady = false;
    if (!this.isAttachmentIdentityCurrent() || !this.isSelectedSessionOpen()) return;
    const available = conversation.kind === 'direct'
      ? (typeof this.direct.attachmentsAvailable === 'function'
          ? this.direct.attachmentsAvailable(String(conversation.id)) : of({available: false}))
      : conversation.kind === 'community'
      ? (typeof this.timeline.chatAttachmentsAvailable === 'function'
          ? this.timeline.chatAttachmentsAvailable(Number(conversation.id)) : of({available: false}))
      : (typeof this.sessions.attachmentsAvailable === 'function'
          ? this.sessions.attachmentsAvailable(Number(conversation.id)) : of({available: false}));
    const viewVersion = this.attachmentViewVersion;
    available.pipe(timeout(10000), catchError(() => of({available: false})))
      .subscribe(result => {
        if (viewVersion !== this.attachmentViewVersion || this.selectedKey !== conversation.key
            || !this.isAttachmentIdentityCurrent() || !this.isSelectedSessionOpen()) return;
        this.attachmentReady = result.available === true;
        // One read-only retry covers an initial R2 probe or access-token refresh.
        // Never repeat a file/message POST or retry across chat/account changes.
        if (!this.attachmentReady && attempt === 0 && this.receiptSessionToken) {
          this.clearAttachmentRetry();
          this.attachmentRetryTimer = setTimeout(() => {
            this.attachmentRetryTimer = undefined;
            if (viewVersion === this.attachmentViewVersion
                && this.selectedKey === conversation.key
                && this.isAttachmentIdentityCurrent() && this.isSelectedSessionOpen()) {
              this.loadAttachmentAvailability(conversation, 1);
            }
          }, 6000);
        }
      });
  }

  /**
   * Only a real copied image is intercepted; ordinary text and links retain
   * their browser paste behaviour. No message is sent until Send is pressed.
   */
  onComposerPaste(event: ClipboardEvent): void {
    const file = readPastedChatImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    if (!this.attachmentControlsReady || !this.canEditDraft()) {
      this.composerError = t('chat.pasteUnavailable');
      return;
    }
    this.stageAttachment(file);
  }

  private setSelectedAttachment(file: File | null): void {
    if (this.selectedAttachmentPreviewUrl) {
      URL.revokeObjectURL(this.selectedAttachmentPreviewUrl);
      this.selectedAttachmentPreviewUrl = null;
    }
    this.selectedAttachment = file;
    if (file?.type.startsWith('image/')) {
      try { this.selectedAttachmentPreviewUrl = URL.createObjectURL(file); }
      catch { /* The filename remains available when previews are unsupported. */ }
    }
  }

  private stageAttachment(file: File): void {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf'].includes(file.type);
    if (!allowed || file.size === 0 || file.size > 5 * 1024 * 1024) {
      this.composerError = t('chat.attachmentInvalid');
      return;
    }
    this.clearVoicePreview();
    this.setSelectedAttachment(file);
    this.selectedGif = null;
    this.selectedShare = null;
    this.closeAttachmentMenu();
    this.composerError = '';
    this.closeEmojiPicker();
  }

  onAttachmentPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file || !this.attachmentControlsReady || !this.canEditDraft()) return;
    this.stageAttachment(file);
  }

  removeAttachment(): void {
    if (this.sending || this.deliveryUncertain) return;
    this.setSelectedAttachment(null);
    this.clearVoicePreview();
  }

  removeSelectedGif(): void {
    if (this.sending || this.deliveryUncertain) return;
    this.selectedGif = null;
  }

  readGiphyMessage(text: string) {
    return readGiphyText(text);
  }

  private resetVoiceClock(): void {
    if (this.voiceElapsedTimer) clearInterval(this.voiceElapsedTimer);
    this.voiceElapsedTimer = undefined;
    this.voiceElapsedSeconds = 0;
  }

  private clearVoicePreview(): void {
    if (this.voicePreviewPlayer) {
      this.voicePreviewPlayer.pause();
      this.voicePreviewPlayer.removeAttribute('src');
      this.voicePreviewPlayer.load();
    }
    this.voicePreviewPlayer = null;
    this.voicePreviewPlaying = false;
    this.voicePreviewMuted = false;
    this.voicePreviewDuration = 0;
    this.voicePreviewPosition = 0;
    if (this.voicePreviewUrl) URL.revokeObjectURL(this.voicePreviewUrl);
    this.voicePreviewUrl = null;
  }

  get voiceSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
      && typeof MediaRecorder !== 'undefined';
  }

  private voiceFormat(): { mime: string; extension: string } | null {
    if (!this.voiceSupported) return null;
    if (typeof MediaRecorder.isTypeSupported !== 'function') return null;
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return { mime: 'audio/webm;codecs=opus', extension: 'webm' };
    }
    if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
      return { mime: 'audio/ogg;codecs=opus', extension: 'ogg' };
    }
    return null;
  }

  async startVoiceRecording(): Promise<void> {
    if (!this.attachmentControlsReady
        || !this.canEditDraft() || this.selectedAttachment || this.voiceRecording) return;
    const format = this.voiceFormat();
    if (!format) {
      this.composerError = t('chat.voiceUnsupported');
      return;
    }
    const key = this.selectedKey;
    const generation = ++this.voiceGeneration;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (generation === this.voiceGeneration) this.composerError = t('chat.voicePermission');
      return;
    }
    if (generation !== this.voiceGeneration || this.selectedKey !== key
        || !this.isPageActive() || !this.attachmentControlsReady) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    try {
      // Target ~1.8 MB for five minutes of speech, within the 5 MB server cap.
      const recorder = new MediaRecorder(stream, {
        mimeType: format.mime, audioBitsPerSecond: VOICE_NOTE_AUDIO_BITRATE
      });
      const chunks: Blob[] = [];
      this.voiceRecorder = recorder;
      this.voiceStream = stream;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (generation === this.voiceGeneration) {
          this.composerError = t('chat.voiceRecordFailed');
          this.cancelVoiceRecording();
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        if (this.voiceTimer) clearTimeout(this.voiceTimer);
        this.voiceTimer = undefined;
        this.resetVoiceClock();
        this.voiceRecording = false;
        this.voiceFinalizing = false;
        if (this.voiceRecorder === recorder) this.voiceRecorder = null;
        if (this.voiceStream === stream) this.voiceStream = null;
        if (generation !== this.voiceGeneration || this.selectedKey !== key
            || !this.attachmentControlsReady) return;
        const type = format.extension === 'webm' ? 'audio/webm' : 'audio/ogg';
        const recorded = new Blob(chunks, { type });
        if (recorded.size === 0) {
          this.composerError = t('chat.voiceRecordFailed');
          return;
        }
        if (recorded.size > 5 * 1024 * 1024) {
          this.composerError = t('chat.voiceTooLarge');
          return;
        }
        this.clearVoicePreview();
        this.setSelectedAttachment(new File([recorded],
          'voz-' + Date.now() + '.' + format.extension, { type }));
        this.voicePreviewUrl = URL.createObjectURL(recorded);
        this.composerError = '';
      };
      recorder.start(1000);
      this.voiceRecording = true;
      this.voiceFinalizing = false;
      this.composerError = '';
      // Allow a five-minute voice message, stopping safely at the limit.
      this.voiceElapsedSeconds = 0;
      const startedAt = Date.now();
      this.voiceElapsedTimer = setInterval(() => {
        this.voiceElapsedSeconds = Math.min(this.voiceMaxSeconds,
          Math.floor((Date.now() - startedAt) / 1000));
      }, 1000);
      this.voiceTimer = setTimeout(() => this.stopVoiceRecording(),
        VOICE_NOTE_MAX_DURATION_MS);
    } catch {
      stream.getTracks().forEach(track => track.stop());
      this.voiceRecorder = null;
      this.voiceStream = null;
      this.resetVoiceClock();
      this.voiceRecording = false;
      this.voiceFinalizing = false;
      this.composerError = t('chat.voiceRecordFailed');
    }
  }

  stopVoiceRecording(): void {
    if (!this.voiceRecording || !this.voiceRecorder) return;
    this.voiceFinalizing = true;
    if (this.voiceTimer) clearTimeout(this.voiceTimer);
    this.voiceTimer = undefined;
    this.resetVoiceClock();
    if (this.voiceRecorder.state !== 'inactive') this.voiceRecorder.stop();
    this.voiceRecording = false;
  }

  cancelVoiceRecording(): void {
    ++this.voiceGeneration;
    if (this.voiceTimer) clearTimeout(this.voiceTimer);
    this.voiceTimer = undefined;
    this.resetVoiceClock();
    const recorder = this.voiceRecorder;
    this.voiceRecorder = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    this.voiceStream?.getTracks().forEach(track => track.stop());
    this.voiceStream = null;
    this.voiceRecording = false;
    this.voiceFinalizing = false;
    this.clearVoicePreview();
  }

  private clearAttachmentPreviews(): void {
    for (const player of this.voicePlayers.values()) {
      player.pause();
      player.removeAttribute('src');
      player.load();
    }
    this.voicePlayers.clear();
    this.voicePlaying.clear();
    this.voiceMuted.clear();
    this.voiceDurations.clear();
    this.voicePositions.clear();
    this.voiceAutoplayRequested.clear();
    for (const url of this.attachmentPreviews.values()) URL.revokeObjectURL(url);
    this.attachmentPreviews.clear();
    this.attachmentLoading.clear();
    this.inlineImageFailures.clear();
    this.expandedImageId = null;
  }

  private releaseVoicePlayer(id: number): void {
    const player = this.voicePlayers.get(id);
    if (player) {
      player.pause();
      player.removeAttribute('src');
      player.load();
    }
    this.voicePlayers.delete(id);
    this.voicePlaying.delete(id);
    this.voiceMuted.delete(id);
    this.voiceAutoplayRequested.delete(id);
    this.voiceDurations.delete(id);
    this.voicePositions.delete(id);
  }

  openVoiceNote(message: InboxMessage): void {
    if (!this.isVoiceNote(message) || this.attachmentLoading.has(message.id)) return;
    if (!this.selected || this.selectedKey !== message.key
        || !this.isAttachmentIdentityCurrent() || !this.isSelectedSessionOpen()) return;
    // A click may start playback once its authorized download has completed.
    // Browsers that block deferred playback still show a normal play control.
    this.voiceAutoplayRequested.add(message.id);
    this.openAttachment(message);
  }

  onVoiceReady(message: InboxMessage, player: HTMLAudioElement): void {
    if (this.selectedKey !== message.key || !this.isAttachmentIdentityCurrent()
        || !this.isSelectedSessionOpen()) return;
    this.voicePlayers.set(message.id, player);
    if (Number.isFinite(player.duration) && player.duration > 0)
      this.voiceDurations.set(message.id, player.duration);
  }

  onVoiceCanPlay(message: InboxMessage, player: HTMLAudioElement): void {
    this.onVoiceReady(message, player);
    if (!this.voiceAutoplayRequested.delete(message.id)) return;
    if (this.selectedKey !== message.key || !this.isAttachmentIdentityCurrent()
        || !this.isSelectedSessionOpen()) return;
    // Do not claim playing until the actual media event fires.
    void player.play().catch(() => { /* User can press Play again. */ });
  }

  toggleVoicePlayback(message: InboxMessage, player: HTMLAudioElement): void {
    if (this.selectedKey !== message.key || !this.isAttachmentIdentityCurrent()
        || !this.isSelectedSessionOpen()) return;
    if (player.paused) {
      void player.play().catch(() => { /* Browser media permissions remain authoritative. */ });
    } else {
      player.pause();
    }
  }

  onVoicePlaybackEvent(id: number, player: HTMLAudioElement): void {
    // A media event can arrive after the user leaves the chat and its private
    // object URLs have already been revoked. Never restore a stale player.
    if (!this.attachmentPreviews.has(id) || !this.isAttachmentIdentityCurrent()
        || !this.isSelectedSessionOpen()) {
      if (!player.paused) player.pause();
      this.voicePlaying.delete(id);
      return;
    }
    this.voicePlayers.set(id, player);
    if (player.paused || player.ended) {
      this.voicePlaying.delete(id);
    } else {
      if (this.voicePreviewPlayer && !this.voicePreviewPlayer.paused) {
        this.voicePreviewPlayer.pause();
        this.voicePreviewPlaying = false;
      }
      // Only one voice note can be audible at a time. Pause on the actual
      // "playing" event, not on click: a browser may reject play() outright.
      for (const [otherId, otherPlayer] of this.voicePlayers) {
        if (otherId === id) continue;
        if (!otherPlayer.paused) otherPlayer.pause();
        this.voicePlaying.delete(otherId);
      }
      this.voicePlaying.add(id);
    }
    this.onVoiceTimeUpdate(id, player);
  }

  onVoiceTimeUpdate(id: number, player: HTMLAudioElement): void {
    if (Number.isFinite(player.duration) && player.duration > 0)
      this.voiceDurations.set(id, player.duration);
    if (Number.isFinite(player.currentTime) && player.currentTime >= 0)
      this.voicePositions.set(id, player.currentTime);
  }

  voiceProgress(id: number): number {
    const duration = this.voiceDurations.get(id) || 0;
    const position = this.voicePositions.get(id) || 0;
    return duration > 0 ? Math.min(100, Math.max(0, Math.round(position / duration * 100))) : 0;
  }

  seekVoice(id: number, player: HTMLAudioElement, event: Event): void {
    const duration = player.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    player.currentTime = Math.min(duration, Math.max(0, value / 100 * duration));
    this.onVoiceTimeUpdate(id, player);
  }

  voiceTimeLabel(id: number): string {
    const elapsed = this.voicePositions.get(id) || 0;
    const duration = this.voiceDurations.get(id) || 0;
    const format = (seconds: number) => {
      const rounded = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
      return Math.floor(rounded / 60) + ':' + String(rounded % 60).padStart(2, '0');
    };
    return format(elapsed) + ' / ' + format(duration);
  }

  toggleVoiceMute(id: number, player: HTMLAudioElement): void {
    player.muted = !player.muted;
    if (player.muted) this.voiceMuted.add(id);
    else this.voiceMuted.delete(id);
  }

  isVoiceNote(message: InboxMessage): boolean {
    return message.attachmentMimeType === 'audio/webm'
      || message.attachmentMimeType === 'audio/ogg';
  }

  showMessageBody(message: InboxMessage): boolean {
    const body = (message.text || '').trim();
    if (readGiphyText(body)) return false;
    if (!body) return false;
    // The server supplies an automatic filename caption for file-only sends.
    // Do not repeat raw .webm/.ogg names above their playable voice bubble.
    return !message.attachmentName || (body !== '📎 ' + message.attachmentName
      && (!this.isVoiceNote(message) || body !== message.attachmentName));
  }

  isInlineImage(message: InboxMessage): boolean {
    return !!message.attachmentName && message.id > 0
      && ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        .includes((message.attachmentMimeType || '').toLowerCase());
  }

  loadInlineImage(message: InboxMessage): void {
    if (!this.isInlineImage(message) || this.inlineImageFailures.has(message.id)
        || this.attachmentLoading.has(message.id) || this.attachmentPreviews.has(message.id)) return;
    this.openAttachment(message, true);
  }

  retryInlineImage(message: InboxMessage): void {
    if (!this.isInlineImage(message)) return;
    this.inlineImageFailures.delete(message.id);
    this.loadInlineImage(message);
  }

  expandInlineImage(message: InboxMessage): void {
    if (this.isInlineImage(message) && this.selectedKey === message.key
        && this.isAttachmentIdentityCurrent() && this.isSelectedSessionOpen()
        && this.attachmentPreviews.has(message.id)) {
      this.expandedImageId = message.id;
    }
  }

  @HostListener('document:keydown.escape')
  closeImageViewer(): void {
    this.expandedImageId = null;
  }

  openAttachment(message: InboxMessage, inline = false): void {
    const conversation = this.selected;
    if (!conversation || message.key !== conversation.key
        || !this.isAttachmentIdentityCurrent() || !this.isSelectedSessionOpen()
        || !message.attachmentName || !message.attachmentMimeType || message.id <= 0
        || this.attachmentLoading.has(message.id)) return;
    const existing = this.attachmentPreviews.get(message.id);
    if (existing) {
      if (inline) return; // viewport never hides a loaded image
      this.releaseVoicePlayer(message.id);
      URL.revokeObjectURL(existing);
      this.attachmentPreviews.delete(message.id);
      if (this.expandedImageId === message.id) this.expandedImageId = null;
      return;
    }
    const viewVersion = this.attachmentViewVersion;
    this.attachmentLoading.add(message.id);
    const download = conversation.kind === 'direct'
      ? this.direct.downloadAttachment(String(conversation.id), message.id)
      : conversation.kind === 'community'
      ? this.timeline.downloadChatAttachment(Number(conversation.id), message.id)
      : this.sessions.downloadAttachment(Number(conversation.id), message.id);
    download.pipe(timeout(30000), finalize(() => {
        if (viewVersion === this.attachmentViewVersion) this.attachmentLoading.delete(message.id);
      }))
      .subscribe({
        next: blob => {
          // Never expose a previous login's file, or a download from a chat
          // that was left and reopened while the GET was pending.
          if (viewVersion !== this.attachmentViewVersion || this.selectedKey !== conversation.key
              || !this.isAttachmentIdentityCurrent() || !this.isSelectedSessionOpen()) return;
          const url = URL.createObjectURL(blob);
          if (message.attachmentMimeType?.startsWith('image/')
              || message.attachmentMimeType?.startsWith('audio/')) {
            this.inlineImageFailures.delete(message.id);
            this.attachmentPreviews.set(message.id, url);
          } else {
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = message.attachmentName || 'anexo.pdf';
            anchor.rel = 'noopener';
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }
        },
        error: () => {
          this.voiceAutoplayRequested.delete(message.id);
          if (viewVersion === this.attachmentViewVersion && this.selectedKey === conversation.key
              && this.isAttachmentIdentityCurrent()) {
            if (inline) this.inlineImageFailures.add(message.id);
            else this.composerError = t('chat.attachmentDownloadFailed');
          }
        }
      });
  }

  toggleAttachmentMenu(): void {
    if (!this.canEditDraft() || !this.isAttachmentIdentityCurrent()) return;
    this.closeEmojiPicker();
    this.closeSharePicker();
    this.attachmentMenuOpen = !this.attachmentMenuOpen;
  }
  closeAttachmentMenu(): void { this.attachmentMenuOpen = false; }
  closeSharePicker(): void {
    ++this.sharePickerVersion;
    this.sharePickerOpen = false;
    this.sharePickerLoading = false;
    this.sharePickerSearch = '';
    this.shareChoices = [];
  }
  openSharePicker(): void {
    if (!this.canEditDraft() || !this.isAttachmentIdentityCurrent()) return;
    this.closeAttachmentMenu();
    this.closeEmojiPicker();
    this.sharePickerOpen = true;
    this.sharePickerTab = 'profile';
    this.sharePickerSearch = '';
    this.sharePickerError = false;
    this.sharePickerLoading = true;
    const version = ++this.sharePickerVersion;
    const selectedKey = this.selectedKey;
    forkJoin({
      people: this.contacts.friends().pipe(timeout(10000), catchError(() => of([]))),
      communities: this.groups.mine().pipe(timeout(10000), catchError(() => of([]))),
      sessions: this.sessions.mine().pipe(timeout(10000), catchError(() =>
        of({created:[],joined:[],waitlisted:[]})))
    }).subscribe({
      next: ({people, communities, sessions}) => {
        if (!this.sharePickerOpen || version !== this.sharePickerVersion
            || selectedKey !== this.selectedKey || !this.isAttachmentIdentityCurrent()) return;
        const friends: ShareChoice[] = people
          .filter(person => !person.chatBlocked && !person.blockedByMe
            && person.username.toLowerCase() !== this.currentUsername.toLowerCase())
          .map(person => ({kind:'profile' as const,id:person.username,
            title:person.nickname || person.fullName || person.username, subtitle:'@'+person.username}));
        // Let members share their own public profile even with no friends yet.
        if (this.currentUsername) friends.unshift({
          kind:'profile', id:this.currentUsername, title:'@'+this.currentUsername,
          subtitle:t('chat.shareMyProfile')
        });
        const included = new Set<number>();
        const events: ShareChoice[] = [...sessions.created,...sessions.joined]
          .filter(session => {
            if (included.has(session.id) || session.privateGame || session.audience === 'COMMUNITY_ONLY'
                || !Number.isFinite(Date.parse(session.gameDate))
                || Date.parse(session.gameDate) <= Date.now()
                || ['CANCELLED','COMPLETED','NOT_OCCURRED'].includes(session.status)) return false;
            included.add(session.id);
            return true;
          }).map(session => ({kind:'session' as const,id:String(session.id),
            title:session.sport+' · '+session.city,
            subtitle:new Date(session.gameDate).toLocaleDateString('pt-PT')}));
        const groups: ShareChoice[] = communities
          .filter(group => group.visibility === 'PUBLIC')
          .map(group => ({kind:'community' as const,id:String(group.id),
            title:group.name,subtitle:group.sport||''}));
        this.shareChoices = [...friends,...events,...groups];
        this.sharePickerLoading = false;
      },
      error: () => { if(version===this.sharePickerVersion){
        this.sharePickerLoading=false;this.sharePickerError=true;
      }}
    });
  }
  selectShareChoice(choice: ShareChoice): void {
    if (!this.sharePickerOpen || !this.isAttachmentIdentityCurrent() || !this.canEditDraft()
        || !this.shareChoices.some(item => item.kind === choice.kind && item.id === choice.id)
        || !encodeShareMessage(choice,this.draft.trim())) return;
    this.selectedShare = choice;
    this.setSelectedAttachment(null);
    this.selectedGif = null;
    this.clearVoicePreview();
    this.composerError = '';
    this.closeSharePicker();
  }
  removeSelectedShare(): void {
    if (!this.sending && !this.deliveryUncertain) this.selectedShare = null;
  }
  readSharedMessage(text: string) { return readSharedMessage(text); }
  displayMessagePreview(value: string | null | undefined): string {
    if (!value) return '';
    const shared = readSharedMessage(value);
    if (shared) return t('chat.shareType.' + shared.kind) + ': ' + shared.title;
    // Reserved GIPHY envelopes must never appear as raw JSON in previews,
    // including historic malformed envelopes that cannot be rendered as media.
    const media = chatMediaPreviewKind(value);
    if (media) return t('chat.mediaPreview.' + media);
    return value;
  }

  toggleEmojiPicker(): void {
    if (!this.canEditDraft()) return;
    this.closeSharePicker();
    this.closeAttachmentMenu();
    if (this.emojiPickerOpen && this.pickerTab === 'emoji') {
      this.closeEmojiPicker();
    } else {
      this.emojiPickerOpen = true;
      this.pickerTab = 'emoji';
      this.stopGifRequests();
    }
  }

  openGifPicker(): void {
    if (!this.canEditDraft() || !this.attachmentControlsReady) return;
    if (this.emojiPickerOpen && this.pickerTab === 'gif') {
      this.closeEmojiPicker();
      return;
    }
    this.emojiPickerOpen = true;
    this.pickerTab = 'gif';
    if (this.gifAvailable === null) void this.configureGifPicker();
    else if (this.gifAvailable && this.gifResults.length === 0) void this.searchGifResults(0);
    else if (this.gifAvailable === false) this.gifResults = findCuratedGifs(this.gifQuery);
  }

  selectPickerTab(tab: 'emoji' | 'gif'): void {
    if (tab === 'gif') {
      if (!this.attachmentControlsReady) return;
      this.emojiPickerOpen = true;
      this.pickerTab = 'gif';
      if (this.gifAvailable === null) void this.configureGifPicker();
      else if (this.gifAvailable === false) this.gifResults = findCuratedGifs(this.gifQuery);
      else if (!this.gifLoading && this.gifResults.length === 0)
        void this.searchGifResults(0);
    } else {
      this.emojiPickerOpen = true;
      this.pickerTab = 'emoji';
      this.stopGifRequests();
    }
  }

  private stopGifRequests(): void {
    if (this.gifTimer) clearTimeout(this.gifTimer);
    this.gifTimer = undefined;
    this.gifSearchAbort?.abort();
    this.gifSearchAbort = undefined;
    this.gifDownloadAbort?.abort();
    this.gifDownloadAbort = undefined;
    this.gifConfigAbort?.abort();
    this.gifConfigAbort = undefined;
    ++this.gifRequestVersion;
    this.gifLoading = false;
    this.gifSelectingId = null;
  }

  closeEmojiPicker(): void {
    this.emojiPickerOpen = false;
    this.stopGifRequests();
    this.pickerTab = 'emoji';
    this.gifQuery = '';
    this.gifResults = [];
    this.gifError = '';
    this.gifHasMore = false;
  }

  private async configureGifPicker(): Promise<void> {
    if (!this.emojiPickerOpen || this.pickerTab !== 'gif') return;
    const generation = ++this.gifRequestVersion;
    const controller = new AbortController();
    this.gifConfigAbort = controller;
    this.gifLoading = true;
    try {
      const key = await readGifProviderKey(controller.signal);
      if (generation !== this.gifRequestVersion || !this.emojiPickerOpen
          || this.pickerTab !== 'gif') return;
      this.gifApiKey = key;
      this.gifAvailable = !!key;
      if (key) await this.searchGifResults(0);
      else this.gifResults = findCuratedGifs(this.gifQuery);
    } catch {
      if (generation === this.gifRequestVersion && !controller.signal.aborted) {
        this.gifAvailable = false;
        this.gifResults = findCuratedGifs(this.gifQuery);
      }
    } finally {
      if (generation === this.gifRequestVersion) this.gifLoading = false;
      if (this.gifConfigAbort === controller) this.gifConfigAbort = undefined;
    }
  }

  onGifSearchInput(term: string): void {
    this.gifQuery = term.slice(0, 50);
    this.gifResults = [];
    this.gifHasMore = false;
    this.gifError = '';
    this.stopGifRequests();
    if (!this.emojiPickerOpen || this.pickerTab !== 'gif') return;
    if (this.gifAvailable === false) {
      // Show locally filtered public GIFs immediately. No network request.
      this.gifResults = findCuratedGifs(this.gifQuery);
      return;
    }
    if (!this.gifAvailable) return;
    this.gifLoading = true;
    this.gifTimer = setTimeout(() => {
      this.gifTimer = undefined;
      void this.searchGifResults(0);
    }, 350);
  }

  searchGifCategory(phrase: string): void {
    if (!this.gifCategories.some(category => category.phrase === phrase)
        || this.gifAvailable === null || !this.emojiPickerOpen || this.pickerTab !== 'gif') return;
    this.onGifSearchInput(phrase);
  }

  async searchGifResults(offset: number): Promise<void> {
    if (!this.gifApiKey || !this.emojiPickerOpen || this.pickerTab !== 'gif'
        || !this.attachmentControlsReady || !this.canEditDraft()) return;
    this.gifSearchAbort?.abort();
    const version = ++this.gifRequestVersion;
    const key = this.selectedKey;
    const controller = new AbortController();
    this.gifSearchAbort = controller;
    this.gifLoading = true;
    this.gifError = '';
    try {
      const language = localStorage.getItem('d24-language') === 'en' ? 'en' : 'pt';
      const found = await findGiphy(this.gifApiKey, this.gifQuery, offset,
        controller.signal, language);
      if (version !== this.gifRequestVersion || key !== this.selectedKey
          || !this.emojiPickerOpen || this.pickerTab !== 'gif'
          || !this.attachmentControlsReady) return;
      this.gifResults = offset ? [...this.gifResults, ...found.results] : found.results;
      this.gifHasMore = found.hasMore;
    } catch {
      if (version === this.gifRequestVersion && !controller.signal.aborted)
        this.gifError = t('chat.gifLoadFailed');
    } finally {
      if (version === this.gifRequestVersion) this.gifLoading = false;
      if (this.gifSearchAbort === controller) this.gifSearchAbort = undefined;
    }
  }

  chooseGif(choice: GifChoice): void {
    if (!this.canEditDraft() || !this.attachmentControlsReady
        || !this.emojiPickerOpen || this.pickerTab !== 'gif') return;
    // GIPHY forbids rehosting its API media by default. Never download and
    // reupload this file to Jynlo's R2: send metadata/link as text instead.
    if (!encodeGiphyText(choice, this.draft.trim())) {
      this.gifError = t('chat.gifCaptionTooLong');
      return;
    }
    this.selectedGif = choice;
    this.selectedShare = null;
    this.setSelectedAttachment(null);
    this.clearVoicePreview();
    this.composerError = '';
    this.closeEmojiPicker();
  }

  /** Insert at the caret, preserving selected text, pending drafts and focus. */
  insertEmoji(emoji: string): void {
    if (!this.canEditDraft() || !this.composerEmojis.includes(emoji)) return;
    const textarea = this.composerTextarea?.nativeElement;
    const start = textarea?.selectionStart ?? this.draft.length;
    const end = textarea?.selectionEnd ?? start;
    const next = this.draft.slice(0, start) + emoji + this.draft.slice(end);
    // HTML textarea.maxLength counts UTF-16 units, including surrogate pairs.
    if (next.length > 2000) return;
    this.draft = next;
    this.closeEmojiPicker();
    this.onTypingInput();
    textarea?.focus({ preventScroll: true });
    textarea?.setSelectionRange(start + emoji.length, start + emoji.length);
  }

  private canEditDraft(): boolean {
    return Boolean(this.selected && this.composerAllowed && !this.composerAccessLoading
      && this.isSelectedSessionOpen() && !this.previewLoading && !this.previewError
      && !this.sending && !this.deliveryUncertain && !this.deliveryChecking
      && !this.voiceRecording && !this.voiceFinalizing);
  }

  onComposerEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey || keyboard.isComposing || keyboard.keyCode === 229) return;
    keyboard.preventDefault();
    this.sendMessage();
  }

  private recentHistory(conversation: InboxConversation): Observable<InboxMessage[]> {
    if (conversation.kind === 'direct') return this.direct.recentHistory(String(conversation.id))
      .pipe(map(page => page.content.map(item => this.fromDirect(item, String(conversation.id)))));
    if (conversation.kind === 'community') return this.timeline.list(Number(conversation.id), 'CHAT')
      .pipe(map(entries => entries.map(item => this.fromCommunity(item))));
    return this.sessions.messages(Number(conversation.id))
      .pipe(map(entries => entries.map(item => this.fromSession(item))));
  }

  sendMessage(): void {
    this.closeEmojiPicker();
    this.closeSharePicker();
    this.closeAttachmentMenu();
    this.typing.stop();
    const conversation = this.selected;
    if (!conversation || !this.canSendMessage()) return;
    const key = conversation.key;
    // A file chosen under a prior login must never be submitted by this tab.
    if (this.selectedAttachment && !this.attachmentControlsReady) return;
    const file = this.selectedAttachment;
    const draftAtSend = this.draft;
    const caption = this.draft.trim();
    // Server sends the same synthesized text for an attachment without a caption.
    const name = file?.name.replace(/\\/g, '/').split('/').pop()?.replace(/[\\x00-\\x1f\\x7f]/g, '').trim().slice(-160);
    const text = this.selectedShare ? encodeShareMessage(this.selectedShare, caption)
      : this.selectedGif ? encodeGiphyText(this.selectedGif, caption)
      : file && !caption ? '📎 ' + (name || 'anexo') : caption;
    const replyId = this.replyingTo?.key === key ? this.replyingTo.id : null;
    const pending: RecoverableSend = { key, text, replyToMessageId: replyId,
      knownIds: new Set(this.messages.map(item => item.id)),
      startedAt: Date.now(), draftAtSend };


    let send: Observable<InboxMessage>;
    if (conversation.kind === 'direct') {
      const request = file
        ? this.direct.sendAttachment(String(conversation.id), file, caption, replyId || undefined)
        : replyId
        ? this.direct.send(String(conversation.id), text, replyId)
        : this.direct.send(String(conversation.id), text);
      send = request.pipe(map(message => this.fromDirect(message, String(conversation.id))));
    } else if (conversation.kind === 'community') {
      const request = file
        ? this.timeline.sendChatAttachment(Number(conversation.id), file, caption, replyId || undefined)
        : replyId
        ? this.timeline.send(Number(conversation.id), 'CHAT', text, replyId)
        : this.timeline.send(Number(conversation.id), 'CHAT', text);
      send = request.pipe(map(message => this.fromCommunity(message)));
    } else {
      const request = file
        ? this.sessions.sendAttachment(Number(conversation.id), file, caption, replyId || undefined)
        : replyId
        ? this.sessions.postMessage(Number(conversation.id), text, replyId)
        : this.sessions.postMessage(Number(conversation.id), text);
      send = request.pipe(map(message => this.fromSession(message)));
    }

    this.sendingKeys.add(key);
    this.inFlightByConversation.set(key, pending);
    this.confirmedWhileSending.delete(key);
    // Save BEFORE subscribing to the POST. Reload/crash at any point after
    // clicking Send must remain uncertain, not silently lose that send.
    this.persistPendingSends();
    this.sending = true;
    this.sendErrorsByConversation.delete(key);
    this.composerError = '';
    // A disabled textarea loses focus while the POST is pending. Keep it
    // enabled/read-only and restore focus immediately after button submits.
    // Never steal focus later when the HTTP response arrives.
    this.composerTextarea?.nativeElement.focus({ preventScroll: true });
    // Unlike HTTP GETs, ambiguous POSTs are NEVER automatically retried.
    send.pipe(timeout(10000), finalize(() => {
      this.sendingKeys.delete(key);
      this.inFlightByConversation.delete(key);
      this.confirmedWhileSending.delete(key);
      if (this.selectedKey === key
          && (!this.receiptSessionToken || this.isReceiptSessionCurrent()))
        this.sending = false;
    })).subscribe({
      next: message => {
        // The HTTP POST belongs to the login that initiated it, even if
        // another account has since replaced the token in this browser.
        if (this.receiptSessionToken && !this.isReceiptSessionCurrent()) return;
        // The server's confirmed response belongs to the original thread,
        // even if the user navigated elsewhere while the POST was pending.
        this.acceptRealtime(key, message);
        // A late POST confirmation must not erase a newer draft in this thread.
        const currentDraft = key === this.selectedKey ? this.draft : this.drafts.get(key);
        const currentReply = key === this.selectedKey
          ? this.replyingTo?.id ?? null : this.replyDrafts.get(key)?.id ?? null;
        const unchangedComposition = currentDraft === draftAtSend
          && currentReply === replyId;
        if (unchangedComposition) {
          this.drafts.delete(key);
          this.replyDrafts.delete(key);
        }
        this.pendingByConversation.delete(key);
        this.inFlightByConversation.delete(key);
        this.persistPendingSends();
        this.sendErrorsByConversation.delete(key);
        if (key !== this.selectedKey) return;
        if (this.historicalPreview) this.returnToRecent();
        this.setSelectedAttachment(null);
        this.selectedGif = null;
        this.selectedShare = null;
        this.clearVoicePreview();
        if (unchangedComposition) {
          this.draft = '';
          this.replyingTo = null;
        }
        this.deliveryUncertain = false;
        this.composerError = '';
      },
      error: error => {
        if (this.receiptSessionToken && !this.isReceiptSessionCurrent()) return;
        if (this.isUncertainError(error)) {
          // WebSocket can prove AFTER_COMMIT delivery before HTTP times out.
          // Resolve that race before marking a send uncertain or issuing
          // another GET. Never retry the original POST automatically.
          this.inFlightByConversation.delete(key);
          this.pendingByConversation.set(key, pending);
          this.persistPendingSends();
          const confirmed = this.confirmedWhileSending.get(key)
            || (key === this.selectedKey
              ? this.messages.find(item => this.matchesPending(item, pending))
              : undefined);
          if (confirmed && this.matchesPending(confirmed, pending)) {
            this.confirmFromHistoryIfPresent(key, [confirmed]);
            return;
          }
          if (key === this.selectedKey) {
            this.deliveryUncertain = true;
            this.composerError = t('chat.sendUncertain');
            this.verifyDelivery();
          }
        } else {
          this.inFlightByConversation.delete(key);
          this.persistPendingSends();
          const errorText = t('feedback.chat.sendError');
          this.sendErrorsByConversation.set(key, errorText);
          if (key === this.selectedKey) {
            this.composerError = errorText;
            // Permissions may have changed while this POST was pending.
            if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
              this.composerAllowed = false;
            }
          }
        }
      }
    });
  }

  private isUncertainError(error: unknown): boolean {
    return error instanceof TimeoutError
      || !(error instanceof HttpErrorResponse)
      || error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
  }

  private matchesPending(message: InboxMessage, pending: {
    key: string; text: string; replyToMessageId: number | null; knownIds: Set<number>; startedAt: number;
  }): boolean {
    if (message.key !== pending.key || pending.knownIds.has(message.id) || message.text !== pending.text
      || !this.currentUsername || message.sender.toLowerCase() !== this.currentUsername.toLowerCase()) return false;
    const sentAt = Date.parse(message.createdAt);
    return Number.isFinite(sentAt) && sentAt >= pending.startedAt - 60_000
      && (message.replyToMessageId ?? null) === pending.replyToMessageId;
  }

  /** Persist in-flight and ambiguous sends, excluding proven server commits. */
  private persistPendingSends(): void {
    if (!this.currentUsername || !this.isReceiptSessionCurrent()
        || !this.receiptSessionToken) return;
    const pending = new Map<string, RecoverableSend>(this.pendingByConversation);
    for (const [key, value] of this.inFlightByConversation) {
      if (!this.confirmedWhileSending.has(key)) pending.set(key, value);
    }
    savePendingSends(this.currentUsername, this.receiptSessionToken, pending.values());
  }

  private confirmFromHistoryIfPresent(key: string, messages: InboxMessage[]): void {
    if (this.receiptSessionToken && !this.isReceiptSessionCurrent()) return;
    const pending = this.pendingByConversation.get(key);
    if (pending && messages.some(message => this.matchesPending(message, pending))) {
      this.pendingByConversation.delete(key);
      // A socket/history confirmation releases this exact verification early;
      // its old HTTP callback/finalizer must not affect any later send.
      if (this.verifyingPendingByConversation.get(key) === pending) {
        this.verifyingPendingByConversation.delete(key);
        this.verifyingKeys.delete(key);
      }
      this.persistPendingSends();
      // Read-only verification can complete after the user returned and
      // edited the same conversation. Never erase newer text or a new quote.
      const currentDraft = this.selectedKey === key ? this.draft : this.drafts.get(key);
      const currentReply = this.selectedKey === key
        ? this.replyingTo?.id ?? null : this.replyDrafts.get(key)?.id ?? null;
      const sameDraft = currentDraft !== undefined && (
        pending.draftAtSend !== undefined
          ? currentDraft === pending.draftAtSend
          : currentDraft.trim() === pending.text);
      const sameReply = currentReply === pending.replyToMessageId;
      // A newly chosen reply target makes this a different composition even
      // when the visible text happens to be identical.
      const unchangedComposition = sameDraft && sameReply;
      if (unchangedComposition) {
        this.drafts.delete(key);
        this.replyDrafts.delete(key);
      }
      this.sendErrorsByConversation.delete(key);
      if (this.selectedKey === key) {
        // The server has proved delivery. Do not keep the composer blocked by
        // an older read-only verification request still awaiting its response.
        this.deliveryUncertain = false;
        this.deliveryChecking = false;
        if (unchangedComposition) {
          this.setSelectedAttachment(null);
          this.selectedGif = null;
          this.clearVoicePreview();
          this.draft = '';
        }
        if (unchangedComposition) this.replyingTo = null;
        this.composerError = '';
      }
    }
  }

  /** Read-only reconciliation for uncertain sends on reconnect or foreground. */
  private reconcilePendingDeliveries(
    force: boolean,
    skipKey: string | null = null,
    failedKinds: ReadonlySet<InboxKind> = new Set<InboxKind>()
  ): void {
    if (!this.pendingByConversation.size || !this.isReceiptSessionCurrent()) return;
    const now = Date.now();
    // Focus/visibility events can fire in bursts. Reconnect itself bypasses
    // the interval; per-thread in-flight requests cannot overlap.
    if (!force && now - this.lastPendingRecheckAt < 15_000) return;
    this.lastPendingRecheckAt = now;
    for (const [key, pending] of this.pendingByConversation) {
      if (key === skipKey || this.verifyingKeys.has(key)) continue;
      const conversation = this.conversations.find(item => item.key === key);
      if (!conversation || failedKinds.has(conversation.kind)) continue;
      this.checkPendingDelivery(conversation, pending);
    }
  }

  private checkPendingDelivery(
    conversation: InboxConversation,
    pending: { key: string; text: string; replyToMessageId: number | null;
      knownIds: Set<number>; startedAt: number }
  ): void {
    const key = conversation.key;
    // A reconnect/foreground check can be queued just before the user
    // explicitly resolves the uncertainty, changes account, or loses chat
    // membership. Never start a stale history request or lock the composer.
    if (this.pendingByConversation.get(key) !== pending
        || !this.conversations.some(item => item.key === key)
        || (this.receiptSessionToken && !this.isReceiptSessionCurrent())
        || this.verifyingKeys.has(key)) return;
    if (this.selectedKey === key && this.messages.some(item => this.matchesPending(item, pending))) {
      this.confirmFromHistoryIfPresent(key, this.messages);
      return;
    }
    this.verifyingKeys.add(key);
    this.verifyingPendingByConversation.set(key, pending);
    if (this.selectedKey === key) this.deliveryChecking = true;
    this.recentHistory(conversation).pipe(timeout(10000), finalize(() => {
      if (this.verifyingPendingByConversation.get(key) !== pending) return;
      this.verifyingPendingByConversation.delete(key);
      this.verifyingKeys.delete(key);
      if (this.selectedKey === key
          && (!this.receiptSessionToken || this.isReceiptSessionCurrent()))
        this.deliveryChecking = false;
    })).subscribe({
      next: entries => {
        // An account change, revoked conversation, cancelled retry, or
        // newer confirmation makes this old GET irrelevant.
        if ((this.receiptSessionToken && !this.isReceiptSessionCurrent())
            || !this.conversations.some(item => item.key === key)
            || this.pendingByConversation.get(key) !== pending) return;
        const delivered = entries.find(item => this.matchesPending(item, pending));
        if (delivered) {
          this.acceptRealtime(key, delivered);
          if (key === this.selectedKey && !this.historicalPreview) {
            this.messages = mergeInboxMessages([...this.messages, delivered]);
            this.updatePreviewFromHistory(key, this.messages);
            this.scrollRequested = true;
          }
          this.confirmFromHistoryIfPresent(key, [delivered]);
        } else if (key === this.selectedKey) {
          // A limited history window is NOT proof the original POST failed.
          this.composerError = t('chat.sendUnconfirmed');
        }
      },
      error: () => {
        // A failed GET is never interpreted as evidence to send again.
        if (key === this.selectedKey && this.isReceiptSessionCurrent()
            && this.pendingByConversation.get(key) === pending) {
          this.composerError = t('chat.verifyUnavailable');
        }
      }
    });
  }

  verifyDelivery(): void {
    const conversation = this.selected;
    const pending = conversation && this.pendingByConversation.get(conversation.key);
    if (!conversation || !pending || !this.deliveryUncertain
        || this.verifyingKeys.has(conversation.key)) return;
    this.checkPendingDelivery(conversation, pending);
  }

  resumeAfterUncertainSend(): void {
    if (this.sendingKeys.has(this.selectedKey || '')
        || this.verifyingKeys.has(this.selectedKey || '')
        || !this.selectedKey || !this.deliveryUncertain) return;
    this.pendingByConversation.delete(this.selectedKey);
    this.persistPendingSends();
    this.deliveryUncertain = false;
    this.composerError = t('chat.sendRetryWarning');
    // The draft remains intact. Any further POST requires a deliberate action.
  }

  /** Read markers live on the server, not in localStorage or notification badges. */
  refreshSummaries(inboxVersion = this.inboxVersion): void {
    if (!this.serverSummariesAvailable || this.conversations.length === 0) return;
    const requestVersion = ++this.summaryVersion;
    const batches = [];
    for (let offset = 0; offset < this.conversations.length; offset += 150) {
      const chunk = this.conversations.slice(offset, offset + 150);
      batches.push(this.inboxApi.summaries(chunk.map(item => ({
        kind: item.kind, id: String(item.id)
      }))).pipe(timeout(15_000)));
    }
    forkJoin(batches).subscribe({
      next: batchesResult => {
        if (inboxVersion !== this.inboxVersion || requestVersion !== this.summaryVersion) return;
        const summaries = new Map<string, InboxSummary>();
        for (const batch of batchesResult) {
          for (const snapshot of batch) summaries.set(inboxKey(snapshot.kind, snapshot.id), snapshot);
        }
        this.conversations = orderInbox(this.conversations.map(item => {
          const snapshot = summaries.get(item.key);
          if (!snapshot) return item;
          // Do not regress after a newer WebSocket message reached this tab
          // while the HTTP snapshot was still in transit.
          const socketNewer = !!item.latestAt && (!snapshot.latestAt
            || Date.parse(item.latestAt) > Date.parse(snapshot.latestAt));
          if (socketNewer) {
            return { ...item, unreadCount: Math.max(item.unreadCount ?? 0, snapshot.unreadCount) };
          }
          return { ...item,
            latestText: snapshot.latestText ?? undefined,
            latestAt: snapshot.latestAt ?? undefined,
            latestMessageId: snapshot.latestMessageId,
            unreadCount: snapshot.unreadCount,
            newThisVisit: 0
          };
        }));
      },
      error: () => {
        if (requestVersion !== this.summaryVersion) return;
        // The earlier frontend still works with its local, visit-scoped
        // counters if this new endpoint is temporarily unavailable.
        this.serverSummariesAvailable = false;
      }
    });
  }

  private isLatestMessageVisible(messageId: number): boolean {
    const log = this.previewLog?.nativeElement;
    const lastBubble = log?.querySelector<HTMLElement>('[data-message-id="' + messageId + '"]');
    if (!log || !lastBubble) return false; // Data received but not yet rendered.
    const container = log.getBoundingClientRect();
    const bubble = lastBubble.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    // A scroll container below the page fold, or a bubble outside the
    // scrolled log, must not mark an unread conversation as viewed.
    return container.width > 0 && container.height > 0
      && bubble.width > 0 && bubble.height > 0
      && container.top < viewportHeight && container.bottom > 0
      && bubble.top < Math.min(container.bottom, viewportHeight)
      && bubble.bottom > Math.max(container.top, 0);
  }

  private markRenderedRead(key: string): void {
    // A background/unfocused browser must not make a message look read.
    if (!this.isPageActive() || key !== this.selectedKey || this.historicalPreview
        || this.previewLoading || this.previewError || this.messages.length === 0) return;
    if (!this.isNearPreviewBottom()) return;
    const lastSeen = Math.max(...this.messages.map(message => message.id));
    if (!Number.isSafeInteger(lastSeen) || lastSeen <= 0
        || !this.isLatestMessageVisible(lastSeen)) return;
    // Without server summaries there is no authoritative cursor, so do not
    // clear the unread badge on an unconfirmed read.
    if (!this.serverSummariesAvailable) return;
    const conversation = this.selected;
    if (!conversation) return;
    const readVersion = ++this.readVersion;
    this.inboxApi.markRead({ kind: conversation.kind, id: String(conversation.id) }, lastSeen)
      .pipe(timeout(10_000)).subscribe({
        next: snapshot => {
          if (readVersion !== this.readVersion || this.selectedKey !== key) return;
          ++this.summaryVersion; // invalidate snapshots taken before this read acknowledgement
          this.conversations = this.conversations.map(item => item.key === key
            ? { ...item, unreadCount: snapshot.unreadCount, newThisVisit: 0 }
            : item);
        },
        error: () => {
          // Never pretend that a failed read receipt has synchronized.
          // A later refresh can reconcile it with the server.
        }
      });
  }

  /**
   * For private chats only, a read check is shown solely after the recipient's
   * authorized persisted cursor includes the message's positive server ID.
   */
  private isAttachmentIdentityCurrent(): boolean {
    // The mounted app decodes currentUsername at initialization. A removed or
    // replaced token cannot unlock media in the original authenticated inbox.
    if (!this.currentUsername) return false;
    if (this.receiptSessionToken === null || this.isReceiptSessionCurrent()) return true;
    try {
      const current = localStorage.getItem('t');
      if (!current || !this.receiptSessionToken) return false;
      const original = this.jwt.decodeToken(this.receiptSessionToken);
      const renewed = this.jwt.decodeToken(current);
      const username = this.currentUsername.toLowerCase();
      return original?.sub?.toLowerCase() === username
        && renewed?.sub?.toLowerCase() === username
        && typeof renewed.exp === 'number' && renewed.exp * 1000 > Date.now();
    } catch { return false; }
  }

  private isReceiptSessionCurrent(): boolean {
    // Different logins in tabs on the same origin share localStorage. Fail
    // closed until Angular creates a new inbox for the active account.
    try {
      return !!this.receiptSessionToken && localStorage.getItem('t') === this.receiptSessionToken;
    } catch { return false; }
  }

  isDirectMessageRead(message: InboxMessage): boolean {
    return this.isReceiptSessionCurrent() && this.selected?.kind === 'direct'
      && message.key === this.selectedKey && this.isMine(message)
      && Number.isSafeInteger(message.id) && message.id > 0
      && this.peerReadCursor !== null && this.peerReadCursor >= message.id;
  }

  /**
   * A different browser of THIS identity read a conversation. Never set
   * unread=0 from an event alone: a newer message might have arrived while
   * the read transaction committed. Fetch the authoritative count for just
   * that one conversation; ordinary 45-second summaries recover socket loss.
   */
  private refreshOwnPersistedRead(
    read: { kind: InboxKind; conversationId: string; lastReadMessageId: number } | null
  ): void {
    if (!this.isReceiptSessionCurrent() || !read
        || !['direct', 'community', 'session'].includes(read.kind)
        || typeof read.conversationId !== 'string'
        || read.conversationId.length === 0 || read.conversationId.length > 128
        || !Number.isSafeInteger(read.lastReadMessageId) || read.lastReadMessageId <= 0
        || !this.serverSummariesAvailable || this.loading) return;
    const key = inboxKey(read.kind, read.conversationId);
    const conversation = this.conversations.find(item => item.key === key);
    if (!conversation) return; // No forged or stale membership may be added.
    const version = (this.ownReadSyncVersions.get(key) ?? 0) + 1;
    this.ownReadSyncVersions.set(key, version);
    const inboxVersion = this.inboxVersion;
    ++this.summaryVersion; // Discard a global snapshot sampled before this commit.
    this.inboxApi.summaries([{ kind: conversation.kind, id: String(conversation.id) }])
      .pipe(timeout(10_000)).subscribe({
        next: values => {
          if (!this.isReceiptSessionCurrent() || inboxVersion !== this.inboxVersion
              || this.ownReadSyncVersions.get(key) !== version) return;
          const snapshot = values.find(item => inboxKey(item.kind, item.id) === key);
          if (!snapshot) return;
          this.conversations = orderInbox(this.conversations.map(item => {
            if (item.key !== key) return item;
            // A newer socket message arriving during the HTTP GET wins over
            // this snapshot; the periodic refresh will reconcile any gap.
            const newer = !!item.latestAt && (!snapshot.latestAt
              || Date.parse(item.latestAt) > Date.parse(snapshot.latestAt));
            if (newer || (item.latestMessageId !== undefined
              && item.latestMessageId !== null
              && (snapshot.latestMessageId === null
                || item.latestMessageId > snapshot.latestMessageId))) return item;
            return { ...item,
              latestText: snapshot.latestText ?? undefined,
              latestAt: snapshot.latestAt ?? undefined,
              latestMessageId: snapshot.latestMessageId,
              unreadCount: snapshot.unreadCount, newThisVisit: 0
            };
          }));
        },
        error: () => {
          // A transient GET failure must never clear unread badges locally.
        }
      });
  }

  private acceptPersistedPeerReadReceipt(
    receipt: { peerUsername: string; lastReadMessageId: number } | null
  ): void {
    const selected = this.selected;
    if (!this.isReceiptSessionCurrent() || !selected || selected.kind !== 'direct'
        || !receipt || typeof receipt.peerUsername !== 'string'
        || receipt.peerUsername.toLowerCase() !== String(selected.id).toLowerCase()
        || !Number.isSafeInteger(receipt.lastReadMessageId)
        || receipt.lastReadMessageId <= 0) return;
    // A server-sent receipt is not delivery, presence, or a local read guess:
    // it follows a committed durable cursor. Never decrease the known state.
    this.peerReadCursor = Math.max(this.peerReadCursor ?? 0, receipt.lastReadMessageId);
  }

  private refreshPeerReadReceipt(force = false): void {
    if (!this.isReceiptSessionCurrent()) {
      // A different account may have replaced the shared browser token.
      ++this.peerReceiptVersion;
      this.peerReadCursor = null;
      this.peerReceiptCheckedAt = 0;
      return;
    }
    const conversation = this.selected;
    if (!conversation || conversation.kind !== 'direct' || !this.isPageActive()) return;
    // One scoped lightweight GET at most every 15 seconds for the active peer.
    // Never request a receipt for every message or for community/session chats.
    if (!force && Date.now() - this.peerReceiptCheckedAt < 15_000) return;
    this.peerReceiptCheckedAt = Date.now();
    const version = ++this.peerReceiptVersion;
    const key = conversation.key;
    this.inboxApi.directReadReceipt(String(conversation.id)).pipe(timeout(10_000))
      .subscribe({
        next: receipt => {
          if (version !== this.peerReceiptVersion || this.selectedKey !== key
              || !this.isReceiptSessionCurrent()) return;
          if (receipt?.peerUsername?.toLowerCase() !== String(conversation.id).toLowerCase()
              || !Number.isSafeInteger(receipt.lastReadMessageId)
              || receipt.lastReadMessageId < 0) return;
          // Network responses can complete out of order. A read cursor is monotonic.
          this.peerReadCursor = Math.max(this.peerReadCursor ?? 0, receipt.lastReadMessageId);
        },
        error: () => {
          // Unknown remains unknown; no fake read/delivery receipt on HTTP error.
        }
      });
  }

  isMine(message: InboxMessage): boolean {
    return !!this.currentUsername
      && message.sender.toLowerCase() === this.currentUsername.toLowerCase();
  }

  kindLabel(kind: InboxKind): string {
    return kind === 'direct' ? 'inbox.private' : kind === 'community' ? 'inbox.community' : 'inbox.session';
  }

  /** Compact inbox timestamp; keep full date/time in the title attribute. */
  formatInboxListTime(value: string): string {
    const millis = Date.parse(value || '');
    if (!Number.isFinite(millis)) return '';
    const date = new Date(millis);
    const now = new Date();
    const locale = localStorage.getItem('d24-language') === 'en' ? 'en-GB' : 'pt-PT';
    const day = (dateValue: Date): number =>
      new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate()).getTime();
    const difference = (day(now) - day(date)) / 86400000;
    if (difference === 0) {
      return new Intl.DateTimeFormat(locale, {hour:'2-digit',minute:'2-digit'}).format(date);
    }
    if (difference === 1) return locale === 'en-GB' ? 'Yesterday' : 'Ontem';
    if (difference > 1 && difference < 7) {
      return new Intl.DateTimeFormat(locale, {weekday:'short'}).format(date);
    }
    return new Intl.DateTimeFormat(locale, {day:'2-digit',month:'2-digit'}).format(date);
  }

  formatDate(value: string): string {
    const millis = Date.parse(value || '');
    return Number.isFinite(millis)
      ? new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(millis))
      : '';
  }
}
