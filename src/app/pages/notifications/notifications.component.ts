import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, map, Observable, retry, timeout } from 'rxjs';

import { AppNotification } from '../model/app-notification';
import { chatMediaPreviewKey } from '../../shared/chat-media-preview';
import { JoinSessionResponse, PendingSessionInvite, SessionService } from '../../services/session.service';
import { NotificationApiService, NotificationPreferences } from '../../services/notification-api.service';
import { AuthenticationService } from '../../services/authethication.service';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.css', './notifications-v3-finish.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class NotificationsComponent implements OnInit {
  private readonly dateTimeFormatter = new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  notifications: AppNotification[] = [];
  pendingInvites: PendingSessionInvite[] = [];
  unreadCount = 0;
  selected?: AppNotification;

  // Optional alerts only. Security-critical profile changes are always sent,
  // while routine profile updates no longer generate inbox notifications.
  readonly preferenceTypes = [
    'COMMUNITY_INVITE', 'COMMUNITY_JOIN_REQUEST', 'COMMUNITY_JOIN_ACCEPTED',
    'COMMUNITY_JOIN_REJECTED', 'SESSION_INVITE', 'WAITLIST_PROMOTED',
    'SESSION_REMOVED', 'SESSION_CANCELLED', 'SESSION_MEETING_POINT_UPDATED',
    'SESSION_POST_GAME_REVIEW',
    'ATTENDANCE_DISPUTE_ACCEPTED', 'ATTENDANCE_DISPUTE_REJECTED',
    'TEAM_MEMBER_INVITE', 'TEAM_ADMIN_TRANSFER', 'TEAM_ADMIN_ASSIGNED',
    'CHAT_MESSAGE', 'VENUE_EDIT_DECISION', 'SOCIAL_POST_LIKED',
    'SOCIAL_POST_COMMENTED', 'SOCIAL_NEW_FOLLOWER', 'FRIEND_REQUEST', 'OTHER'
  ] as const;
  preferencesOpen = false;
  preferencesLoading = false;
  preferencesRefreshFailed = false;
  preferencesSaving = false;
  preferencesError = '';
  preferencesSuccess = '';
  preferences?: NotificationPreferences;

  loading = false;
  actionLoadingId: number | null = null;
  accountBlockConfirming = false;
  clearAllConfirming = false;
  clearAllLoading = false;

  errorMessage = '';
  actionError = '';
  actionSuccess = '';

  constructor(
    private notificationService: NotificationApiService,
    private sessionService: SessionService,
    private authenticationService: AuthenticationService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.load();
  }

  openPreferences(): void {
    this.preferencesOpen = !this.preferencesOpen;
    // Always re-fetch on open: settings may have changed on another device.
    if (this.preferencesOpen) this.loadPreferences();
  }

  loadPreferences(): void {
    // Never replace local settings with a stale GET while a PUT is in flight.
    if (this.preferencesLoading || this.preferencesSaving) return;
    this.preferencesLoading = true;
    this.preferencesRefreshFailed = false;
    this.preferencesError = '';
    this.notificationService.preferences().pipe(
      timeout(10_000), finalize(() => this.preferencesLoading = false)
    ).subscribe({
      next: settings => this.preferences = settings,
      error: () => {
        this.preferencesRefreshFailed = true;
        this.preferencesError = t('notifications.preferences.loadError');
      }
    });
  }

  preferenceEnabled(type: string, channel: 'inApp' | 'email'): boolean {
    const list = channel === 'inApp' ? this.preferences?.disabledInAppTypes
      : this.preferences?.disabledEmailTypes;
    return !list?.includes(type);
  }

  changeGlobal(channel: 'inApp' | 'email', enabled: boolean): void {
    if (!this.preferences || this.preferencesLoading || this.preferencesSaving || this.preferencesRefreshFailed) return;
    const next = { ...this.preferences,
      [channel === 'inApp' ? 'inAppEnabled' : 'emailEnabled']: enabled };
    this.savePreferences(next);
  }

  changeType(type: string, channel: 'inApp' | 'email', enabled: boolean): void {
    if (!this.preferences || this.preferencesLoading || this.preferencesSaving || this.preferencesRefreshFailed) return;
    const key = channel === 'inApp' ? 'disabledInAppTypes' : 'disabledEmailTypes';
    const disabled = new Set(this.preferences[key]);
    if (enabled) disabled.delete(type); else disabled.add(type);
    this.savePreferences({ ...this.preferences, [key]: [...disabled] });
  }

  private savePreferences(next: NotificationPreferences): void {
    if (!this.preferences || this.preferencesSaving) return;
    this.preferencesSaving = true;
    this.preferencesError = '';
    this.preferencesSuccess = '';
    this.notificationService.updatePreferences(next).pipe(
      timeout(10_000), finalize(() => this.preferencesSaving = false)
    ).subscribe({
      next: settings => {
        this.preferences = settings;
        this.preferencesSuccess = t('notifications.preferences.saved');
        // Backend decides visibility and unread counts, including old alerts.
        this.notificationService.mine().pipe(timeout(10_000)).subscribe({
          next: items => {
            this.notifications = [...items].sort(
              (a, b) => this.timestamp(b.createdAt) - this.timestamp(a.createdAt)
            );
            if (this.selected && !this.notifications.some(item => item.id === this.selected?.id)) {
              this.selected = undefined;
            }
            this.updateUnreadCount();
          },
          error: () => this.load()
        });
      },
      error: () => this.preferencesError = t('notifications.preferences.saveError')
    });
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.sessionService.pendingInvites().pipe(timeout(10_000)).subscribe({
      next: invites => this.pendingInvites = invites,
      error: () => this.pendingInvites = []
    });

    this.notificationService.mine()
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: notifications => {
          this.notifications = [...notifications].sort(
            (a, b) => this.timestamp(b.createdAt) - this.timestamp(a.createdAt)
          );
          this.updateUnreadCount();

          const routeId = Number(this.route.snapshot.paramMap.get('id'));
          if (Number.isFinite(routeId) && routeId > 0) {
            const notification = this.notifications.find(item => item.id === routeId);
            if (notification) {
              this.openNotification(notification, false);
            }
          }
        },
        error: () => {
          this.notifications = [];
          // A failure to load optional alert history must not hide a valid,
          // authenticated session invitation already returned by its own API.
          this.updateUnreadCount();
          this.errorMessage = t('feedback.notifications.loadError');
        }
      });
  }

  openNotification(notification: AppNotification, navigate = true): void {
    this.selected = notification;
    this.actionError = '';
    this.actionSuccess = '';
    this.accountBlockConfirming = false;

    if (navigate) {
      this.router.navigate(['/menu/notifications', notification.id]);
    }

    if (!notification.read) {
      notification.read = true;
      this.updateUnreadCount();
      this.notificationService.markRead(notification.id)
        .pipe(timeout(10_000))
        .subscribe({
          error: () => {
            notification.read = false;
            this.updateUnreadCount();
          }
        });
    }
  }

  closeNotification(): void {
    this.selected = undefined;
    this.accountBlockConfirming = false;
    this.router.navigate(['/menu/notifications']);
  }

  requestClearAll(): void {
    this.clearAllConfirming = true;
    this.actionError = '';
    this.actionSuccess = '';
  }

  cancelClearAll(): void {
    this.clearAllConfirming = false;
  }

  clearAllNotifications(): void {
    if (this.clearAllLoading || this.notifications.length === 0) {
      return;
    }

    this.clearAllLoading = true;
    this.actionError = '';
    this.actionSuccess = '';

    this.notificationService.deleteAll()
      .pipe(
        timeout(10_000),
        finalize(() => this.clearAllLoading = false)
      )
      .subscribe({
        next: () => {
          this.notifications = [];
          this.updateUnreadCount();
          this.selected = undefined;
          this.clearAllConfirming = false;
          this.accountBlockConfirming = false;
          this.actionSuccess = t('feedback.notifications.cleared');
          this.router.navigate(['/menu/notifications']);
        },
        error: error => {
          this.actionError = this.errorFrom(
            error,
            t('feedback.notifications.clearAllError')
          );
        }
      });
  }


  pendingInviteFor(notification: AppNotification): PendingSessionInvite | undefined {
    if (notification.type !== 'SESSION_INVITE' || notification.sessionId === null) {
      return undefined;
    }
    return this.pendingInvites.find(invite =>
      invite.sessionId === notification.sessionId &&
      invite.inviterUsername.toLowerCase() === notification.relatedUsername?.toLowerCase() &&
      // Don't present a newer pending invitation as an action on an old notification.
      Math.abs(Date.parse(invite.createdAt) - Date.parse(notification.createdAt)) < 60_000
    );
  }

  /** Work both from a notification detail and from the independent invite inbox.
   *  An invitation remains accessible when optional notification alerts are off. */
  respondToInvite(notification: AppNotification, accept: boolean): void {
    const invite = this.pendingInviteFor(notification);
    if (invite) this.decideInvite(invite, accept, notification.id);
  }

  respondToPendingInvite(invite: PendingSessionInvite, accept: boolean): void {
    if (!this.pendingInvites.some(item => item.id === invite.id)) return;
    this.decideInvite(invite, accept, -invite.id);
  }

  pendingInviteRemaining(invite: PendingSessionInvite): number | null {
    if (typeof invite.maxParticipants !== 'number' || invite.maxParticipants <= 0 ||
        typeof invite.participantCount !== 'number' || invite.participantCount < 0) {
      return null;
    }
    return Math.max(0, invite.maxParticipants - invite.participantCount);
  }

  private decideInvite(invite: PendingSessionInvite, accept: boolean, loadingId: number): void {
    if (this.actionLoadingId !== null) return;
    this.actionLoadingId = loadingId;
    this.actionError = '';
    this.actionSuccess = '';
    const operation: Observable<JoinSessionResponse | null> = accept
      ? this.sessionService.acceptInvite(invite.sessionId, invite.id)
      : this.sessionService.declineInvite(invite.sessionId, invite.id).pipe(map(() => null));
    operation.pipe(timeout(10_000), finalize(() => this.actionLoadingId = null)).subscribe({
      next: result => {
        this.pendingInvites = this.pendingInvites.filter(item => item.id !== invite.id);
        this.actionSuccess = accept
          ? ((result && 'state' in result && result.state === 'WAITLISTED')
              ? t('inviteCenter.waitlisted') : t('inviteCenter.joined'))
          : t('inviteCenter.declined');
      },
      error: (error: HttpErrorResponse) => {
        this.actionError = this.errorFrom(error, t('inviteCenter.error'));
        if (error.status === 404 || error.status === 409) {
          this.sessionService.pendingInvites().pipe(timeout(10_000))
            .subscribe({ next: invites => this.pendingInvites = invites });
        }
      }
    });
  }

  openSocialProfile(notification: AppNotification): void {
    const username = notification.relatedUsername?.trim();
    if (!username || !['SOCIAL_POST_LIKED', 'SOCIAL_POST_COMMENTED', 'SOCIAL_NEW_FOLLOWER']
          .includes(notification.type || '')) return;
    void this.router.navigate(['/menu/perfis', username], { queryParams: { from: 'feed' } });
  }

  openSocialFeed(): void {
    void this.router.navigate(['/menu/feed']);
  }

  openSession(notification: AppNotification): void {
    if (notification.sessionId === null) {
      return;
    }

    if (notification.type === 'WAITLIST_PROMOTED') {
      // Promotion is already handled by the backend. Show the current membership
      // state rather than inviting the user to join a second time.
      this.router.navigate(['/menu/events', notification.sessionId], {
        queryParams: { membership: '1' }
      });
      return;
    }

    if (notification.type === 'SESSION_MEETING_POINT_UPDATED') {
      // A scoped navigation hint, never a private location in the URL.
      // The session API checks current membership again after navigation.
      this.router.navigate(['/menu/events', notification.sessionId], {
        queryParams: { meetingPoint: '1' }
      });
      return;
    }

    this.router.navigate(['/menu/events', notification.sessionId]);
  }

  openCommunityInvite(notification: AppNotification): void {
    if (notification.type !== 'COMMUNITY_INVITE') {
      return;
    }

    this.router.navigate(['/menu/communities']);
  }

  /** Existing notifications can contain the retired brand; keep the source
   * record unchanged while consistently showing Jynlo in the interface. */
  legacyBrand(text: string | null | undefined): string {
    return (text ?? '').replace(/DESPORTO24/gi, 'Jynlo');
  }

  notificationSubject(notification: AppNotification): string {
    if (notification.type === 'CHAT_MESSAGE' && notification.relatedUsername?.trim()) {
      return t('notification.chatSubject', { username: notification.relatedUsername.trim() });
    }
    if (notification.type === 'SESSION_MEETING_POINT_UPDATED') {
      return t('notification.meetingPointChangedSubject');
    }
    if (notification.type === 'VENUE_EDIT_DECISION') {
      return t(notification.subject.includes('aprovada')
        ? 'notification.venueEditApprovedSubject' : 'notification.venueEditRejectedSubject');
    }
    const joinCommunity = this.joinNotificationCommunityName(notification);
    if (joinCommunity) {
      const subjectKeys: Record<string, string> = {
        COMMUNITY_JOIN_REQUEST: 'notification.communityJoinRequestSubject',
        COMMUNITY_JOIN_ACCEPTED: 'notification.communityJoinAcceptedSubject',
        COMMUNITY_JOIN_REJECTED: 'notification.communityJoinRejectedSubject'
      };
      return t(subjectKeys[notification.type!] || '', { community: joinCommunity });
    }
    const community = this.invitedCommunityName(notification);
    return community
      ? t('notification.communityInviteSubject', { community })
      : this.legacyBrand(notification.subject);
  }

  notificationMessage(notification: AppNotification): string {
    // Direct chat stores GIPHY as a typed message; notification cards should
    // show a human-readable summary, including for existing saved alerts.
    // Never render the payload JSON or a third-party URL in the notification.
    const chatMediaKey = chatMediaPreviewKey(notification.message,
      notification.type === 'CHAT_MESSAGE' ? notification.relatedUsername : null);
    if (chatMediaKey) {
      return t(chatMediaKey, { username: notification.relatedUsername?.trim() ?? '' });
    }
    if (notification.type === 'SESSION_MEETING_POINT_UPDATED') {
      // Never render meeting instructions from the alert itself. Always send
      // players to session details where the API re-checks membership.
      return t('notification.meetingPointChangedMessage');
    }
    if (notification.type === 'VENUE_EDIT_DECISION') {
      const parts = notification.message.match(/^A tua proposta para "(.+)" foi (aprovada|rejeitada)\.(?: Justificação: ([\s\S]*))?$/);
      if (parts) {
        const base = t(parts[2] === 'aprovada'
          ? 'notification.venueEditApprovedMessage' : 'notification.venueEditRejectedMessage',
          { venue: parts[1] });
        return parts[3] ? base + ' ' + t('notification.venueEditReason', { reason: parts[3] }) : base;
      }
    }
    const joinCommunity = this.joinNotificationCommunityName(notification);
    if (joinCommunity) {
      if (notification.type === 'COMMUNITY_JOIN_REQUEST' && notification.relatedUsername) {
        return t('notification.communityJoinRequestMessage', {
          community: joinCommunity, username: notification.relatedUsername
        });
      }
      if (notification.type === 'COMMUNITY_JOIN_ACCEPTED') {
        return t('notification.communityJoinAcceptedMessage', { community: joinCommunity });
      }
      if (notification.type === 'COMMUNITY_JOIN_REJECTED') {
        return t('notification.communityJoinRejectedMessage', { community: joinCommunity });
      }
    }
    const community = this.invitedCommunityName(notification);
    return community && notification.relatedUsername
      ? t('notification.communityInviteMessage', {
          username: notification.relatedUsername,
          community
        })
      : this.legacyBrand(notification.message);
  }

  private joinNotificationCommunityName(notification: AppNotification): string | null {
    const prefixes: Record<string, string> = {
      COMMUNITY_JOIN_REQUEST: 'Novo pedido para a comunidade ',
      COMMUNITY_JOIN_ACCEPTED: 'Pedido aceite na comunidade ',
      COMMUNITY_JOIN_REJECTED: 'Pedido recusado na comunidade '
    };
    const prefix = prefixes[notification.type || ''];
    return prefix && notification.subject.startsWith(prefix)
      ? notification.subject.slice(prefix.length).trim() || null
      : null;
  }

  private invitedCommunityName(notification: AppNotification): string | null {
    // The current API includes the community name in the invitation subject.
    const prefix = 'Convite para a comunidade ';
    return notification.type === 'COMMUNITY_INVITE' && notification.subject.startsWith(prefix)
      ? notification.subject.slice(prefix.length).trim() || null
      : null;
  }

  openTeamCompetition(notification: AppNotification): void {
    if (!['TEAM_MEMBER_INVITE', 'TEAM_ADMIN_TRANSFER', 'TEAM_ADMIN_ASSIGNED']
            .includes(notification.type || '')
        || typeof notification.communityId !== 'number'
        || !Number.isSafeInteger(notification.communityId)
        || notification.communityId <= 0) return;
    void this.router.navigate(['/menu/communities', notification.communityId], {
      queryParams: { tab: 'tournaments' }
    });
  }

  openJoinCommunity(notification: AppNotification): void {
    if (!['COMMUNITY_JOIN_REQUEST', 'COMMUNITY_JOIN_ACCEPTED', 'COMMUNITY_JOIN_REJECTED']
            .includes(notification.type || '')
        || typeof notification.communityId !== 'number'
        || !Number.isSafeInteger(notification.communityId)
        || notification.communityId <= 0) {
      return;
    }

    if (notification.type === 'COMMUNITY_JOIN_REQUEST') {
      void this.router.navigate(['/menu/communities', notification.communityId], {
        queryParams: { tab: 'members' }
      });
    } else {
      void this.router.navigate(['/menu/communities', notification.communityId]);
    }
  }

  openVenueDecision(notification: AppNotification): void {
    if (notification.type !== 'VENUE_EDIT_DECISION'
        || typeof notification.venueId !== 'number'
        || !Number.isSafeInteger(notification.venueId)
        || notification.venueId <= 0) return;
    void this.router.navigate(['/menu/venues', notification.venueId]);
  }

  openChat(notification: AppNotification): void {
    if (!notification.relatedUsername) {
      return;
    }

    void this.router.navigate(['/menu/messages'], {
      queryParams: { kind: 'direct', id: notification.relatedUsername }
    });
  }

  canProtectAccount(notification: AppNotification): boolean {
    // Legacy profile-update notices set updateProfile=true even for sports,
    // photos and biographies. Never offer a destructive account lock based on
    // that flag, or on free-text message contents.
    const subject = (notification.subject || '').trim().toLocaleLowerCase();
    return /^(palavra-passe alterada|password changed|alteração de email|email changed|email address changed|autenticação multifator (?:ativada|desativada)|multi-factor authentication (?:enabled|disabled))\b/i.test(subject);
  }

  requestAccountBlock(): void {
    if (!this.selected || !this.canProtectAccount(this.selected)) return;
    this.accountBlockConfirming = true;
    this.actionError = '';
  }

  cancelAccountBlock(): void {
    this.accountBlockConfirming = false;
  }

  blockAccountAccess(): void {
    if (!this.selected || !this.canProtectAccount(this.selected)
        || this.actionLoadingId !== null) {
      return;
    }

    this.actionLoadingId = this.selected.id;
    this.actionError = '';

    this.notificationService.blockOwnAccount()
      .pipe(
        timeout(10_000),
        finalize(() => this.actionLoadingId = null)
      )
      .subscribe({
        next: () => {
          this.authenticationService.logOut();
        },
        error: error => {
          this.actionError = this.errorFrom(
            error,
            t('feedback.notifications.blockAccountError')
          );
        }
      });
  }

  deleteNotification(notification: AppNotification): void {
    if (this.actionLoadingId !== null) {
      return;
    }

    this.actionLoadingId = notification.id;
    this.actionError = '';
    this.actionSuccess = '';

    this.notificationService.delete(notification.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.actionLoadingId = null)
      )
      .subscribe({
        next: () => {
          this.notifications = this.notifications.filter(item => item.id !== notification.id);
          this.updateUnreadCount();
          if (this.selected?.id === notification.id) {
            this.selected = undefined;
            this.router.navigate(['/menu/notifications']);
          }
          this.actionSuccess = t('feedback.notifications.deleted');
        },
        error: error => {
          this.actionError = this.errorFrom(error, t('feedback.notifications.deleteError'));
        }
      });
  }

  acceptFriendRequest(notification: AppNotification): void {
    if (!notification.friendRequest || this.actionLoadingId !== null) {
      return;
    }

    this.actionLoadingId = notification.id;
    this.actionError = '';
    this.actionSuccess = '';

    this.notificationService.acceptFriendRequest(notification.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.actionLoadingId = null)
      )
      .subscribe({
        next: () => {
          this.notifications = this.notifications.filter(item => item.id !== notification.id);
          this.updateUnreadCount();
          this.selected = undefined;
          this.actionSuccess = t('feedback.notifications.friendAccepted');
          this.router.navigate(['/menu/notifications']);
        },
        error: error => {
          this.actionError = this.errorFrom(error, t('feedback.notifications.friendAcceptError'));
        }
      });
  }

  rejectFriendRequest(notification: AppNotification): void {
    if (!notification.friendRequest || this.actionLoadingId !== null) {
      return;
    }

    this.actionLoadingId = notification.id;
    this.actionError = '';
    this.actionSuccess = '';

    this.notificationService.rejectFriendRequest(notification.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.actionLoadingId = null)
      )
      .subscribe({
        next: () => {
          this.notifications = this.notifications.filter(item => item.id !== notification.id);
          this.updateUnreadCount();
          this.selected = undefined;
          this.actionSuccess = t('feedback.notifications.friendRejected');
          this.router.navigate(['/menu/notifications']);
        },
        error: error => {
          this.actionError = this.errorFrom(
            error,
            t('feedback.notifications.friendRejectError')
          );
        }
      });
  }

  formatCreatedAt(value: string): string {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) {
      return value;
    }

    return this.dateTimeFormatter.format(new Date(timestamp));
  }

  typeLabel(notification: AppNotification): string {
    switch (notification.type) {
      case 'WAITLIST_PROMOTED':
        return t('notification.waitlist');
      case 'SESSION_REMOVED':
        return t('notification.session');
      case 'SESSION_CANCELLED':
        return t('notification.sessionCancelled');
      case 'SESSION_MEETING_POINT_UPDATED':
        return t('notification.meetingPointChangedType');
      case 'SESSION_POST_GAME_REVIEW':
        return t('notification.postGameReview');
      case 'SESSION_INVITE':
        return 'Convite para sessão';
      case 'COMMUNITY_INVITE':
        return t('notification.communityInvite');
      case 'COMMUNITY_JOIN_REQUEST':
        return t('notification.communityJoinRequest');
      case 'COMMUNITY_JOIN_ACCEPTED':
        return t('notification.communityJoinAccepted');
      case 'COMMUNITY_JOIN_REJECTED':
        return t('notification.communityJoinRejected');
      case 'CHAT_MESSAGE':
        return t('notification.chatMessage');
      case 'SOCIAL_POST_LIKED':
        return t('notifications.preferences.type.SOCIAL_POST_LIKED');
      case 'SOCIAL_POST_COMMENTED':
        return t('notifications.preferences.type.SOCIAL_POST_COMMENTED');
      case 'SOCIAL_NEW_FOLLOWER':
        return t('notifications.preferences.type.SOCIAL_NEW_FOLLOWER');
      case 'VENUE_EDIT_DECISION':
        return t('notification.venueEditType');
      default:
        return notification.friendRequest ? t('notification.friendRequest') : t('notification.generic');
    }
  }

  private updateUnreadCount(): void {
    this.unreadCount = this.notifications.filter(notification => !notification.read).length;
  }

  private timestamp(value: string): number {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
