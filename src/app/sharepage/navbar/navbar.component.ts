import { ActiveChatService } from '../../services/active-chat.service';
import { appTranslate } from 'src/app/i18n/i18n.service';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { ManagedVenue, VenueBookingService } from 'src/app/services/venue-booking.service';
import { NavigationEnd, Router } from '@angular/router';
import { SeoService } from 'src/app/shared/seo.service';
import { AuthenticationService } from 'src/app/services/authethication.service';
import { MyProfileService } from 'src/app/services/my-profile.service';
import { MyProfile } from 'src/app/pages/model/my-profile';
import { environment } from 'src/environment/environment';
import { AppLanguage, I18nService } from 'src/app/i18n/i18n.service';
import { NotificationApiService } from 'src/app/services/notification-api.service';
import { DirectChatRealtimeService } from 'src/app/services/direct-chat-realtime.service';
import { DirectChatMessage } from 'src/app/pages/model/direct-chat';
import { AppNotification } from 'src/app/pages/model/app-notification';
import { chatMediaPreviewKind, chatMediaPreviewForAttachment, chatMediaPreviewKey } from 'src/app/shared/chat-media-preview';
import { Subscription, auditTime, filter, retry, timeout, forkJoin, map, Observable } from 'rxjs';
import { InboxApiService, InboxSummary } from 'src/app/services/inbox-api.service';
import { PrivateGroupService, PrivateGroup } from 'src/app/services/private-group.service';
import { SessionMessage } from 'src/app/pages/model/session-message';
import { CommunityTimelineEntry } from 'src/app/services/community-timeline.service';
import { PrivateGroupMessage } from 'src/app/services/private-group.service';
import { GroupChatToast, allowsGroupChatToast, confirmsGroupUnread, recentGroupChatEvent } from 'src/app/shared/group-chat-notice';
import { ConversationMuteService, isConversationMuted } from 'src/app/services/conversation-mute.service';

import { NAV_SLOTS, NavTab, PHONE_SLOTS, availableNavTabs, navTab, readNavTabs, resolveNavTabs, setNavSlot, writeNavTabs } from './nav-tabs';
@Component({
    selector: 'app-navbar',
    templateUrl: './navbar.component.html',
    styleUrls: ['./navbar.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class NavbarComponent implements OnInit, OnDestroy {

  dark!:boolean;
  escuro:string = "escuro";
  claro:string = "claro";
  unreadNotifications = 0;
  authenticated = false;
  admin = false;
  loggingOut = false;
  accountProfile: MyProfile | null = null;
  accountImageUnavailable = false;
  markAccountImageUnavailable(): void { this.accountImageUnavailable = true; }
  private profileAccount: string | null = null;
  private accountProfileRequest?: Subscription;
  private notificationTimer?: ReturnType<typeof setInterval>;
  private unreadRequest?: Subscription;
  private toastLookup?: Subscription;
  private groupToastLookup?: Subscription;
  private readonly seenGroupToastKeys = new Set<string>();
  groupToast?: GroupChatToast;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private toastAccount: string | null = null;
  private readonly seenToastIds = new Set<number>();
  chatToast?: AppNotification;
  /** Earlier messages from the same person while the alert is on screen (Instagram-style stack). */
  chatToastHistory: AppNotification[] = [];
  chatToastExpanded = false;
  private readonly subscriptions = new Subscription();
  private readonly venueBookings = inject(VenueBookingService);
  private readonly activeChat = inject(ActiveChatService, { optional: true });
  /** "Os meus recintos" shows only to people who manage a venue. */
  managedVenues: ManagedVenue[] = [];
  /** Some venue takes bookings on Jynlo; until then "As minhas reservas" stays hidden. */
  bookingsOpen = false;
  get managedVenuesLink(): (string | number)[] {
    return this.managedVenues.length === 1 ? ['/menu/venues', this.managedVenues[0].venueId, 'manage'] : ['/menu/venue-bookings'];
  }
  get managedPending(): number { return this.managedVenues.reduce((n, v) => n + (v.pendingRequests || 0), 0); }

  /** The sections each person keeps in the bar (see nav-tabs.ts). */
  private navTabsCache: { user: string; saved: unknown } | null = null;
  private navSaved(): unknown {
    const user = this.activeAccountUsername.toLowerCase();
    if (!this.navTabsCache || this.navTabsCache.user !== user) this.navTabsCache = { user, saved: readNavTabs(user) };
    return this.navTabsCache.saved;
  }
  get navTabs(): NavTab[] {
    return resolveNavTabs(this.navSaved(), this.managedVenues.length > 0, this.bookingsOpen).map(id => navTab(id)!).filter(Boolean);
  }
  /** Sections not in the bar go in the account menu; slots 3 and 4 only show on a computer. */
  get menuNavTabs(): { tab: NavTab; phoneOnly: boolean }[] {
    const ids = resolveNavTabs(this.navSaved(), this.managedVenues.length > 0, this.bookingsOpen);
    return availableNavTabs(this.managedVenues.length > 0, this.bookingsOpen)
      .filter(tab => tab.id !== 'my-venues' && tab.id !== 'my-bookings')
      .filter(tab => ids.indexOf(tab.id) < 0 || ids.indexOf(tab.id) >= PHONE_SLOTS)
      .map(tab => ({ tab, phoneOnly: ids.includes(tab.id) }));
  }
  navRoute(tab: NavTab): string | (string | number)[] {
    return tab.id === 'my-venues' ? this.managedVenuesLink : tab.route;
  }
  readonly navSlots = Array.from({ length: NAV_SLOTS }, (_, i) => i);
  readonly phoneSlots = PHONE_SLOTS;
  navEditing = false;
  /** "Criar" opens a small menu instead of a separate page (like the app's + sheet). */
  createMenuOpen = false;
  createMenuTop: number | null = null;
  createMenuLeft: number | null = null;
  toggleCreateMenu(event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return;
    event.preventDefault();
    this.closeAccountMenu();
    if (this.createMenuOpen) { this.createMenuOpen = false; return; }
    const button = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    const phone = typeof window !== 'undefined' && window.innerWidth <= 900;
    if (button && !phone) {
      const width = 340;
      this.createMenuTop = Math.round(button.bottom + 8);
      this.createMenuLeft = Math.round(Math.max(12, Math.min(window.innerWidth - width - 12, button.left + button.width / 2 - width / 2)));
    } else {
      this.createMenuTop = null;
      this.createMenuLeft = null;
    }
    this.createMenuOpen = true;
  }
  navDraft: string[] = [];
  get navChoices(): NavTab[] { return availableNavTabs(this.managedVenues.length > 0, this.bookingsOpen); }

  openNavEditor(): void {
    this.closeAccountMenu();
    this.navDraft = resolveNavTabs(this.navSaved(), this.managedVenues.length > 0, this.bookingsOpen);
    this.navEditing = true;
  }
  pickNavSlot(slot: number, id: string): void { this.navDraft = setNavSlot(this.navDraft, slot, id); }
  saveNavTabs(ids: string[] | null): void {
    writeNavTabs(this.activeAccountUsername, ids);
    this.navTabsCache = { user: this.activeAccountUsername.toLowerCase(), saved: ids };
    this.navEditing = false;
  }

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private router: Router,
    private authService: AuthenticationService,
    private myProfileService: MyProfileService,
    private notificationService: NotificationApiService,
    private realtimeService: DirectChatRealtimeService,
    private inboxApi: InboxApiService,
    private privateGroups: PrivateGroupService,
    private conversationMutes: ConversationMuteService,
    private seo: SeoService,
    public i18n: I18nService
  ) { }

  ngOnInit(): void {
    let signedIn = false;
    try { signedIn = this.authService.isLoggedIn(); } catch { signedIn = false; }
    if (signedIn) {
      this.subscriptions.add(this.venueBookings.managed().subscribe({
        next: list => { this.managedVenues = list || []; },
        error: () => { this.managedVenues = []; }
      }));
      this.subscriptions.add(this.venueBookings.accepting().subscribe({
        next: ids => { this.bookingsOpen = (ids || []).length > 0; },
        error: () => { this.bookingsOpen = false; }
      }));
    }
    var theme = localStorage.getItem('theme');
    if (theme == 'claro'){
      this.dark = false
    } else {
      this.dark = true
    }
      this.syncAuthenticatedState();

      this.subscriptions.add(
        this.router.events
          .pipe(filter(event => event instanceof NavigationEnd))
          .subscribe(() => this.syncAuthenticatedState())
      );

      // A socket event is not necessarily a visible notification: chat alerts
      // may be disabled, already read, or suppressed by the server.
      // Coalesce bursts and ask the authoritative, preference-filtered endpoint.
      if (this.activeChat) this.subscriptions.add(
        this.activeChat.read$.pipe(auditTime(300)).subscribe(() => {
          if (this.authenticated) this.loadUnreadNotifications();
        }));
      for (const stream of [this.realtimeService.groupMessages$, this.realtimeService.teamContentInvalidated$,
          this.realtimeService.ownReads$] as Array<Observable<unknown> | undefined>) {
        if (stream) this.subscriptions.add(stream.pipe(auditTime(500)).subscribe(() => this.loadUnreadMessages()));
      }
      this.subscriptions.add(
        this.realtimeService.messages$.pipe(auditTime(300)).subscribe(message => {
          if (!this.authenticated) return;
          this.loadUnreadNotifications();
          this.maybeShowChatToast(message);
          const me = this.authService.loggedInPerfilname?.toLowerCase();
          if (me && message?.username2?.toLowerCase() === me && message.username1?.toLowerCase() !== me
              && !message.editedAt && !message.deletedAt) {
            this.maybeShowBrowserNotice('direct', message.username1, message.username1);
          }
        })
      );

      // Community and session read counts are server-owned. Private group
      // authorization uses its own current-member endpoint.
      this.subscriptions.add(
        this.realtimeService.communityMessages$.pipe(auditTime(300)).subscribe(message => {
          this.maybeShowGroupToast('community', message);
          this.loadUnreadMessages();
          if (message?.kind === 'CHAT' && !message.editedAt && !message.deletedAt)
            this.maybeShowBrowserNotice('community', String(message.communityId), message.username);
        })
      );
      this.subscriptions.add(
        this.realtimeService.sessionMessages$.pipe(auditTime(300)).subscribe(message => {
          this.maybeShowGroupToast('session', message);
          this.loadUnreadMessages();
          if (!message?.editedAt && !message?.deletedAt)
            this.maybeShowBrowserNotice('session', String(message?.sessionId), message?.senderUsername);
        })
      );
      this.subscriptions.add(
        this.realtimeService.groupMessages$.pipe(auditTime(300)).subscribe(message =>
          this.maybeShowGroupToast('private', message))
      );

      // A read, delete, friend-request action or saved preference changes the
      // server's unread count without a route change or socket event.
      this.subscriptions.add(
        this.notificationService.changes$.subscribe(() => {
          if (this.authenticated) this.loadUnreadNotifications();
        })
      );
    }

    ngOnDestroy(): void {
      this.subscriptions.unsubscribe();
      this.unreadRequest?.unsubscribe();
      this.toastLookup?.unsubscribe();
      this.groupToastLookup?.unsubscribe();
      this.accountProfileRequest?.unsubscribe();
      this.dismissChatToast();
      this.dismissGroupToast();
      if (this.notificationTimer) {
        clearInterval(this.notificationTimer);
      }
      this.realtimeService.disconnect();
    }

    private syncAuthenticatedState(): void {
      this.authenticated = this.authService.hasSessionCandidate();
      this.admin = this.authenticated
        && this.authService.hasAnyRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');
      const account = this.authenticated
        ? this.authService.loggedInPerfilname?.toLowerCase() ?? null : null;
      // Navbar persists across accounts; never render the previous user's
      // avatar/name, or accept a delayed response from their profile request.
      if (account !== this.profileAccount) {
        this.profileAccount = account;
        this.accountProfileRequest?.unsubscribe();
        this.accountProfile = null;
        this.accountImageUnavailable = false;
        if (account) this.loadAccountProfile(account);
        this.closeAccountMenu();
      }
      if (account !== this.toastAccount) {
        this.toastAccount = account;
        this.seenToastIds.clear();
        this.seenGroupToastKeys.clear();
        this.toastLookup?.unsubscribe();
        this.groupToastLookup?.unsubscribe();
        this.dismissChatToast();
        this.dismissGroupToast();
      }

      if (!this.authenticated) {
        // The navbar persists across SPA logout -> login navigation. A previous
        // pending logout must not disable the button in the next session.
        this.loggingOut = false;
        this.realtimeService.disconnect();
        this.unreadRequest?.unsubscribe();
        this.unreadNotifications = 0;
        this.updateBrowserTabTitle();
        if (this.notificationTimer) {
          clearInterval(this.notificationTimer);
          this.notificationTimer = undefined;
        }
        return;
      }

      this.realtimeService.connect();

      if (!this.notificationTimer) {
        this.notificationTimer = setInterval(
          () => this.loadUnreadNotifications(),
          60000
        );
      }
      // Refresh when navigating back from alerts/settings instead of showing
      // a stale badge for another minute.
      this.loadUnreadNotifications();
    }

    /** Unread chat messages for the "Mensagens" tab badge (like Instagram's messages icon). */
    unreadMessages = 0;
    private unreadMessagesRequest?: Subscription;
    loadUnreadMessages(): void {
      if (!this.authenticated || !this.inboxApi) return;
      this.unreadMessagesRequest?.unsubscribe();
      if (typeof this.inboxApi.unreadTotal !== 'function') return;
      this.unreadMessagesRequest = this.inboxApi.unreadTotal().pipe(timeout(10_000)).subscribe({
        next: result => { if (this.authenticated && Number.isFinite(result?.total)) this.unreadMessages = Math.max(0, result.total); },
        error: () => { /* keep the last known count */ }
      });
    }

    loadUnreadNotifications(): void {
      if (!this.authenticated) return;
      this.loadUnreadMessages();
      // Discard older responses if a new refresh occurs (logout, navigation,
      // incoming chat message). They must not replace the latest server count.
      this.unreadRequest?.unsubscribe();
      this.unreadRequest = this.notificationService.unreadCount()
        .pipe(
          timeout(10_000),
          retry({ count: 1 })
        )
        .subscribe({
          next: count => {
            if (!this.authenticated || !Number.isFinite(count) || count < 0) return;
            // The same authoritative unread count drives both nav badge and tab.
            this.unreadNotifications = Math.floor(count);
            this.updateBrowserTabTitle();
          },
          // A transient request failure is not evidence that all alerts were read.
          error: () => {}
        });
    }
    
    /**
     * System notification while Jynlo is open in a background tab, only if the
     * person enabled it (Notifications page). Never shows message text, and
     * respects per-conversation mutes.
     */
    private maybeShowBrowserNotice(kind: 'direct' | 'community' | 'session', id: string, sender?: string | null): void {
      const me = this.authService.loggedInPerfilname?.toLowerCase();
      if (!this.authenticated || !me || !sender || sender.toLowerCase() === me || !id || id === 'undefined'
          || typeof Notification === 'undefined' || Notification.permission !== 'granted'
          || document.visibilityState !== 'hidden') return;
      this.conversationMutes.list().pipe(timeout(8_000)).subscribe({
        next: mutes => {
          if (isConversationMuted(mutes, kind, kind === 'direct' ? id.toLowerCase() : Number(id))) return;
          try {
            const title = kind === 'direct' ? appTranslate('Nova mensagem de {{username}}', { username: sender })
              : kind === 'session' ? appTranslate('Nova mensagem no chat do jogo')
              : appTranslate('Nova mensagem na comunidade');
            const notice = new Notification(title, {
              body: kind === 'direct' ? appTranslate('Abre a Jynlo para responder.') : sender,
              tag: 'jynlo-chat-' + kind + '-' + id
            });
            notice.onclick = () => {
              window.focus();
              void this.router.navigate(['/menu/messages'], { queryParams: { kind, id } });
              notice.close();
            };
          } catch { /* best effort */ }
        },
        error: () => {}
      });
    }

    /** In-app alert only after the authenticated API confirms an unmuted,
     * unread, newly persisted notification. Never trust raw WebSocket text as
     * proof of notification visibility or expose private media URLs. */
    private maybeShowChatToast(message: DirectChatMessage): void {
      const account = this.authService.loggedInPerfilname?.toLowerCase();
      if (!account || typeof message?.id !== 'number' || !Number.isSafeInteger(message.id) || message.id <= 0
          || message.username2?.toLowerCase() !== account
          || message.username1?.toLowerCase() === account
          || message.editedAt || message.deletedAt
          || document.visibilityState !== 'visible' || !document.hasFocus()
          || this.router.url.startsWith('/menu/messages')
          || this.router.url.startsWith('/menu/notifications')) return;
      const token = localStorage.getItem('t');
      if (!token) return;
      const sender = message.username1.toLowerCase();
      if (this.activeChat?.isOpen('direct:' + sender)) return;
      const attachmentKind = chatMediaPreviewForAttachment(message.attachmentMimeType);
      const messageKind = attachmentKind ?? chatMediaPreviewKind(message.text);
      this.toastLookup?.unsubscribe();
      this.toastLookup = forkJoin({
        notices: this.notificationService.mine(),
        mutes: this.conversationMutes.list()
      }).pipe(timeout(8_000)).subscribe({
        next: ({ notices, mutes }) => {
          if (!this.authenticated || localStorage.getItem('t') !== token
              || this.authService.loggedInPerfilname?.toLowerCase() !== account
              || document.visibilityState !== 'visible' || !document.hasFocus()
              || this.router.url.startsWith('/menu/messages')
              || this.router.url.startsWith('/menu/notifications')) return;
          if (isConversationMuted(mutes, 'direct', sender)) return;
          const now = Date.now();
          const notice = notices.filter(n =>
            n.type === 'CHAT_MESSAGE' && !n.read && n.relatedUsername?.toLowerCase() === sender
            && Number.isSafeInteger(n.id) && !this.seenToastIds.has(n.id)
            && Number.isFinite(Date.parse(n.createdAt))
            && now - Date.parse(n.createdAt) >= -3000
            && now - Date.parse(n.createdAt) < 20_000
            && (messageKind ? chatMediaPreviewKind(n.message) === messageKind
              : n.message === message.text)
          ).sort((a, b) => b.id - a.id)[0];
          if (!notice) return;
          this.seenToastIds.add(notice.id);
          if (this.seenToastIds.size > 100) {
            const first = this.seenToastIds.values().next().value;
            if (first !== undefined) this.seenToastIds.delete(first);
          }
          this.groupToastLookup?.unsubscribe();
          this.dismissGroupToast();
          const previous = this.chatToast;
          if (previous && previous.relatedUsername?.toLowerCase() === sender) {
            this.chatToastHistory = [...this.chatToastHistory, previous].slice(-9);
          } else {
            this.chatToastHistory = [];
            this.chatToastExpanded = false;
          }
          this.chatToast = notice;
          if (this.toastTimer) clearTimeout(this.toastTimer);
          if (!this.chatToastExpanded) this.toastTimer = setTimeout(() => this.dismissChatToast(), 8000);
        },
        error: () => { /* A failed confirmation must never show an unverified alert. */ }
      });
    }

    /** Verify current membership, preferences and unread state before showing
     * an ephemeral group hint. No group messages are saved as notification rows. */
    private maybeShowGroupToast(
      kind: 'community' | 'session' | 'private',
      message: CommunityTimelineEntry | SessionMessage | PrivateGroupMessage
    ): void {
      if (!this.authenticated
          || (kind === 'community' && (message as CommunityTimelineEntry).kind !== 'CHAT')) return;
      const account = this.authService.loggedInPerfilname?.toLowerCase();
      const id = kind === 'community' ? (message as CommunityTimelineEntry).communityId
        : kind === 'session' ? (message as SessionMessage).sessionId
        : (message as PrivateGroupMessage).groupId;
      const sender = kind === 'community' ? (message as CommunityTimelineEntry).username
        : kind === 'session' ? (message as SessionMessage).senderUsername
        : (message as PrivateGroupMessage).sender;
      const body = kind === 'private' ? (message as PrivateGroupMessage).text
        : (message as CommunityTimelineEntry | SessionMessage).body;
      const mimeType = kind === 'private' ? null
        : (message as CommunityTimelineEntry | SessionMessage).attachmentMimeType;
      const messageId = message?.id;
      const editedAt = kind === 'private' ? null
        : (message as CommunityTimelineEntry | SessionMessage).editedAt;
      const deletedAt = kind === 'private' ? null
        : (message as CommunityTimelineEntry | SessionMessage).deletedAt;
      const key = kind + ':' + id + ':' + messageId;
      if (!account || !sender || sender.toLowerCase() === account
          || !Number.isSafeInteger(id) || id <= 0
          || !Number.isSafeInteger(messageId) || messageId <= 0
          || editedAt || deletedAt || this.seenGroupToastKeys.has(key)
          || !recentGroupChatEvent(message?.createdAt)
          || document.visibilityState !== 'visible' || !document.hasFocus()
          || this.router.url.startsWith('/menu/messages')
          || this.router.url.startsWith('/menu/notifications')
          || this.router.url.startsWith('/menu/groups')
          || this.activeChat?.isOpen(kind + ':' + id)) return;
      const token = localStorage.getItem('t');
      if (!token) return;
      this.groupToastLookup?.unsubscribe();
      const check: Observable<{group: PrivateGroup} | {summaries: InboxSummary[]}> =
        kind === 'private'
          ? this.privateGroups.get(id).pipe(map(group => ({ group })))
          : this.inboxApi.summaries([{ kind, id: String(id) }])
              .pipe(map(summaries => ({ summaries })));
      this.groupToastLookup = forkJoin({
        preferences: this.notificationService.preferences(),
        mutes: this.conversationMutes.list(), check
      }).pipe(timeout(8_000)).subscribe({
        next: ({ preferences, mutes, check }) => {
          if (!this.authenticated || localStorage.getItem('t') !== token
              || this.authService.loggedInPerfilname?.toLowerCase() !== account
              || !recentGroupChatEvent(message.createdAt)
              || document.visibilityState !== 'visible' || !document.hasFocus()
              || this.router.url.startsWith('/menu/messages')
              || this.router.url.startsWith('/menu/notifications')
              || this.router.url.startsWith('/menu/groups')
              || !allowsGroupChatToast(preferences)
              || isConversationMuted(mutes, kind, id)) return;
          let title: string | undefined;
          if ('group' in check) {
            // The private group GET rechecks membership after the socket event.
            if (check.group.id !== id || !check.group.members.some(
              member => member.username.toLowerCase() === account)) return;
            title = check.group.title;
          } else if (!confirmsGroupUnread(check.summaries[0],
              kind as 'community' | 'session', id, messageId, sender)) return;
          if (this.seenGroupToastKeys.has(key)) return;
          this.seenGroupToastKeys.add(key);
          if (this.seenGroupToastKeys.size > 100) {
            const oldest = this.seenGroupToastKeys.values().next().value;
            if (oldest) this.seenGroupToastKeys.delete(oldest);
          }
          this.toastLookup?.unsubscribe();
          this.dismissChatToast();
          this.groupToast = { kind, groupId: id, sender, text: body, mimeType, title };
          this.toastTimer = setTimeout(() => this.dismissGroupToast(), 6500);
        },
        error: () => { /* No verified access or opt-in: do not reveal content. */ }
      });
    }

    groupToastTitle(notice: GroupChatToast): string {
      const key = notice.kind === 'community' ? 'chat.groupToast.community'
        : notice.kind === 'session' ? 'chat.groupToast.session' : 'chat.groupToast.private';
      return this.i18n.translate(key, {
        sender: notice.sender, group: notice.title || this.i18n.translate('chat.groupToast.unnamed')
      });
    }

    groupToastMessage(notice: GroupChatToast): string {
      const kind = chatMediaPreviewForAttachment(notice.mimeType) || chatMediaPreviewKind(notice.text);
      return kind ? this.i18n.translate('chat.mediaPreview.' + kind) : notice.text;
    }

    openGroupToast(): void {
      const notice = this.groupToast;
      this.dismissGroupToast();
      if (!notice) return;
      if (notice.kind === 'private') {
        void this.router.navigate(['/menu/groups'], { queryParams: { id: notice.groupId } });
      } else {
        void this.router.navigate(['/menu/messages'], {
          queryParams: { kind: notice.kind, id: String(notice.groupId) }
        });
      }
    }

    dismissGroupToast(): void {
      this.groupToast = undefined;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }

    toastMessage(notice: AppNotification): string {
      const key = chatMediaPreviewKey(notice.message, notice.relatedUsername);
      return key
        ? this.i18n.translate(key, { username: notice.relatedUsername?.trim() ?? '' })
        : notice.message;
    }

    openChatToast(): void {
      const peer = this.chatToast?.relatedUsername;
      this.dismissChatToast();
      if (peer) void this.router.navigate(['/menu/messages'], {
        queryParams: { kind: 'direct', id: peer }
      });
    }

    toggleChatToastDetail(): void {
      this.chatToastExpanded = !this.chatToastExpanded;
      // Reading the list: keep it open until the person closes it.
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = this.chatToastExpanded ? undefined : setTimeout(() => this.dismissChatToast(), 6000);
    }

    dismissChatToast(): void {
      this.chatToast = undefined;
      this.chatToastHistory = [];
      this.chatToastExpanded = false;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }

    /** Browser tab displays only the user's unread, in-app notifications. */
    private updateBrowserTabTitle(): void {
      // SeoService owns the title so route changes never wipe the badge.
      this.seo.setUnreadCount(this.authenticated ? this.unreadNotifications : 0);
    }

    // A user may have read notifications in a different tab.
    @HostListener('window:focus')
    refreshUnreadWhenFocused(): void {
      if (this.authenticated) this.loadUnreadNotifications();
    }

    DarkMode(){
      this.dark = true;
      localStorage.setItem('theme',this.escuro);
      location.reload();
    }
    LightMode(){
      this.dark = false;
      localStorage.setItem('theme',this.claro);
      location.reload();
    }
    setLanguage(language: AppLanguage): void {
      this.i18n.setLanguage(language);
    }

    get activeAccountUsername(): string {
      return this.authService.loggedInPerfilname?.trim()
        || this.accountProfile?.username?.trim()
        || '';
    }

    get accountDisplayName(): string {
      return this.accountProfile?.nickname?.trim()
        || this.accountProfile?.fullName?.trim()
        || this.activeAccountUsername;
    }

    get accountInitials(): string {
      const value = this.accountDisplayName || this.activeAccountUsername || '?';
      return value.split(/\s+/).filter(Boolean).slice(0, 2)
        .map(part => part.charAt(0).toUpperCase()).join('');
    }

    accountImage(): string | null {
      const path = this.accountProfile?.profilePicUrl?.trim();
      if (!path) return null;
      if (path.startsWith('https://') || path.startsWith('http://') || path.startsWith('data:')) {
        return path;
      }
      return environment.apiUrl + (path.startsWith('/') ? path : '/' + path);
    }

    private loadAccountProfile(account: string): void {
      this.accountProfileRequest = this.myProfileService.get().pipe(timeout(8_000)).subscribe({
        next: profile => {
          // Fail closed if a logout/login happens during an in-flight request.
          if (this.authenticated && this.profileAccount === account
            && this.authService.loggedInPerfilname?.toLowerCase() === account
            && profile.username?.toLowerCase() === account) {
            this.accountProfile = profile;
          }
        },
        error: () => {
          // Username still appears, even when profile/image is unavailable.
        }
      });
    }

    @HostListener('document:click', ['$event'])
    closeAccountMenuOnOutsideClick(event: MouseEvent): void {
      if (this.elementRef.nativeElement.contains(event.target as Node)) {
        return;
      }
      this.closeAccountMenu();
    }

    @HostListener('document:keydown.escape')
    closeAccountMenuOnEscape(): void {
      this.navEditing = false;
      this.createMenuOpen = false;
      this.closeAccountMenu();
    }

    closeAccountMenu(): void {
      this.elementRef.nativeElement
        .querySelector<HTMLDetailsElement>('.account-menu')
        ?.removeAttribute('open');
    }


    logout(): void {
      if (this.loggingOut) {
        return;
      }

      this.loggingOut = true;
      this.authService.terminarSessao()
        .pipe(timeout(10_000))
        .subscribe({
        next: () => this.authService.logOut(),
        error: () => this.authService.logOut()
      });
    }

    remover(){
      this.router.navigate(['login']);
      this.authService.logOut2();
    }
}
