import { Component, ElementRef, HostListener, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
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
  private readonly subscriptions = new Subscription();
  private readonly baseTabTitle = 'Jynlo — Join the game.';

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
    private browserTitle: Title,
    public i18n: I18nService
  ) { }

  ngOnInit(): void {
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
      this.subscriptions.add(
        this.realtimeService.messages$.pipe(auditTime(300)).subscribe(message => {
          if (!this.authenticated) return;
          this.loadUnreadNotifications();
          this.maybeShowChatToast(message);
        })
      );

      // Community and session read counts are server-owned. Private group
      // authorization uses its own current-member endpoint.
      this.subscriptions.add(
        this.realtimeService.communityMessages$.pipe(auditTime(300)).subscribe(message =>
          this.maybeShowGroupToast('community', message))
      );
      this.subscriptions.add(
        this.realtimeService.sessionMessages$.pipe(auditTime(300)).subscribe(message =>
          this.maybeShowGroupToast('session', message))
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

    loadUnreadNotifications(): void {
      if (!this.authenticated) return;
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
          this.chatToast = notice;
          if (this.toastTimer) clearTimeout(this.toastTimer);
          this.toastTimer = setTimeout(() => this.dismissChatToast(), 6500);
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
          || this.router.url.startsWith('/menu/groups')) return;
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

    dismissChatToast(): void {
      this.chatToast = undefined;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }

    /** Browser tab displays only the user's unread, in-app notifications. */
    private updateBrowserTabTitle(): void {
      const count = this.authenticated ? this.unreadNotifications : 0;
      const badge = count > 99 ? '99+' : String(count);
      const title = count > 0
        ? `Jynlo (${badge}) — Join the game.`
        : this.baseTabTitle;
      if (this.browserTitle.getTitle() !== title) {
        this.browserTitle.setTitle(title);
      }
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
