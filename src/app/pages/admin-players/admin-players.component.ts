import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { finalize, Subscription, timeout } from 'rxjs';
import { AuthenticationService } from '../../services/authethication.service';
import { AdminPlayer, AdminPlayersService, CommunityQuota, ModerationAction } from '../../services/admin-players.service';

interface PendingModeration {
  id: number;
  username: string;
  action: ModerationAction;
  expectedSuspended: boolean;
}

@Component({
  selector: 'app-admin-players',
  templateUrl: './admin-players.component.html',
  styleUrls: ['./admin-players.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AdminPlayersComponent implements OnInit, OnDestroy {
  name = '';
  searchedName = '';
  players: AdminPlayer[] = [];
  page = 0;
  hasMore = false;
  loading = false;
  searched = false;
  errorKey = '';
  expandedPlayerId: number | null = null;
  messageRecipient: AdminPlayer | null = null;
  adminMessage = '';
  messageSending = false;
  messageError = '';
  messageSuccess = '';
  private messageRequest?: Subscription;

  selectedCommunityLimitPlayer: AdminPlayer | null = null;
  communityLimitQuota: CommunityQuota | null = null;
  communityLimitValue = 5;
  resetCommunityLimit = false;
  communityLimitReason = '';
  communityLimitLoading = false;
  communityLimitError = '';
  communityLimitSuccess = '';
  private communityLimitRequest?: Subscription;

  pendingRole: { id: number; username: string; role: 'ROLE_ADMIN' | 'ROLE_USER'; expectedRole: string } | null = null;
  changingRole = false;
  roleErrorKey = '';
  roleSuccessName = '';
  private roleRequest?: Subscription;

  pendingModeration: PendingModeration | null = null;
  moderationReason = '';
  deleteConfirmation = '';
  moderating = false;
  moderationErrorKey = '';
  moderationSuccessKey = '';
  moderationSuccessName = '';
  private moderationRequest?: Subscription;
  private request?: Subscription;

  constructor(private service: AdminPlayersService, private auth: AuthenticationService) {}

  ngOnInit(): void {
    this.load('', 0);
  }

  get canManageRoles(): boolean {
    return this.auth.hasAnyRole('ROLE_SUPER_ADMIN');
  }

  get canModerate(): boolean {
    return this.auth.hasAnyRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');
  }

  get working(): boolean {
    return this.changingRole || this.moderating || this.communityLimitLoading || this.messageSending;
  }

  canChangeRole(player: AdminPlayer): boolean {
    return this.canManageRoles && (
      player.role === 'ROLE_ADMIN'
      || (player.role === 'ROLE_USER' && player.enabled === true && player.notLocked === true
        && !player.moderationSuspendedAt)
    );
  }

  canSuspend(player: AdminPlayer): boolean {
    return this.canModerate && player.role === 'ROLE_USER'
      && player.enabled === true && player.notLocked === true && !player.moderationSuspendedAt;
  }

  canReinstate(player: AdminPlayer): boolean {
    return this.canModerate && player.role === 'ROLE_USER'
      && player.enabled === true && !!player.moderationSuspendedAt;
  }

  canDelete(player: AdminPlayer): boolean {
    return this.canManageRoles && player.role === 'ROLE_USER';
  }

  canManagePlayer(player: AdminPlayer): boolean {
    return this.canChangeRole(player) || this.canSuspend(player)
      || this.canReinstate(player) || this.canDelete(player) || this.canManageRoles;
  }

  toggleActions(player: AdminPlayer): void {
    if (this.working || !this.canManagePlayer(player)) return;
    this.expandedPlayerId = this.expandedPlayerId === player.id ? null : player.id;
  }

  beginAdminMessage(player: AdminPlayer): void {
    if (this.working || this.loading || !this.canModerate) return;
    if (player.enabled !== true || player.notLocked !== true || player.moderationSuspendedAt) return;
    this.messageRecipient = player;
    this.adminMessage = '';
    this.messageError = '';
    this.messageSuccess = '';
    this.expandedPlayerId = null;
  }

  cancelAdminMessage(): void {
    if (this.messageSending) return;
    this.messageRecipient = null;
    this.adminMessage = '';
    this.messageError = '';
  }

  sendAdminMessage(): void {
    const player = this.messageRecipient;
    const text = this.adminMessage.trim();
    if (!player || !this.canModerate || this.working
        || player.enabled !== true || player.notLocked !== true
        || !!player.moderationSuspendedAt || !text || text.length > 1000
        || /[\u0000-\u001F\u007F]/.test(text)) return;
    this.messageSending = true;
    this.messageError = '';
    this.messageSuccess = '';
    this.messageRequest = this.service.sendAdminMessage(player.id, text)
      .pipe(timeout(10_000), finalize(() => this.messageSending = false))
      .subscribe({
        next: () => {
          this.messageSuccess = player.username;
          this.messageRecipient = null;
          this.adminMessage = '';
        },
        error: () => {
          this.messageError = 'adminPlayers.messageError';
        }
      });
  }

  beginCommunityLimit(player: AdminPlayer): void {
    if (!this.canManageRoles || this.working) return;
    this.communityLimitRequest?.unsubscribe();
    this.selectedCommunityLimitPlayer = player;
    this.communityLimitQuota = null;
    this.communityLimitError = '';
    this.communityLimitSuccess = '';
    this.communityLimitReason = '';
    this.resetCommunityLimit = false;
    this.communityLimitLoading = true;
    this.communityLimitRequest = this.service.communityLimit(player.id)
      .pipe(timeout(10_000), finalize(() => this.communityLimitLoading = false))
      .subscribe({
        next: quota => {
          this.communityLimitQuota = quota;
          this.communityLimitValue = quota.limit;
        },
        error: () => this.communityLimitError = 'adminPlayers.communityLimitError'
      });
  }

  cancelCommunityLimit(): void {
    if (this.communityLimitLoading) return;
    this.selectedCommunityLimitPlayer = null;
    this.communityLimitQuota = null;
    this.communityLimitError = '';
  }

  saveCommunityLimit(): void {
    const selected = this.selectedCommunityLimitPlayer;
    if (!selected || !this.canManageRoles || this.working ||
        !this.communityLimitReason.trim() ||
        (!this.resetCommunityLimit && (
          !Number.isInteger(Number(this.communityLimitValue))
          || Number(this.communityLimitValue) < 1
          || Number(this.communityLimitValue) > 100))) return;
    this.communityLimitLoading = true;
    this.communityLimitError = '';
    this.communityLimitSuccess = '';
    this.communityLimitRequest = this.service.updateCommunityLimit(selected.id,
      this.resetCommunityLimit ? null : Number(this.communityLimitValue),
      this.communityLimitReason.trim())
      .pipe(timeout(10_000), finalize(() => this.communityLimitLoading = false))
      .subscribe({
        next: quota => {
          this.communityLimitQuota = quota;
          this.communityLimitSuccess = selected.username;
          this.selectedCommunityLimitPlayer = null;
        },
        error: () => this.communityLimitError = 'adminPlayers.communityLimitError'
      });
  }

  beginRoleChange(player: AdminPlayer): void {
    if (this.working || this.loading || !this.canChangeRole(player)) return;
    this.pendingModeration = null;
    this.roleErrorKey = '';
    this.roleSuccessName = '';
    this.pendingRole = {
      id: player.id, username: player.username,
      role: player.role === 'ROLE_ADMIN' ? 'ROLE_USER' : 'ROLE_ADMIN',
      expectedRole: player.role!
    };
  }

  cancelRoleChange(): void {
    if (!this.changingRole) this.pendingRole = null;
  }

  confirmRoleChange(): void {
    const pending = this.pendingRole;
    if (!pending || this.working || !this.canManageRoles) return;
    this.changingRole = true;
    this.roleErrorKey = '';
    this.roleRequest = this.service.changeRole(pending.id, pending.role, pending.expectedRole)
      .pipe(timeout(10_000), finalize(() => this.changingRole = false))
      .subscribe({
        next: result => {
          this.players = this.players.map(player => player.id === result.id
            ? { ...player, role: result.role } : player);
          this.expandedPlayerId = null;
          this.roleSuccessName = pending.username;
          this.pendingRole = null;
        },
        error: error => {
          this.pendingRole = null;
          this.roleErrorKey = error.status === 409 ? 'adminPlayers.roleConflict'
            : error.status === 403 ? 'adminPlayers.roleForbidden' : 'adminPlayers.roleError';
        }
      });
  }

  beginModeration(player: AdminPlayer, action: ModerationAction): void {
    if (this.working || this.loading) return;
    if ((action === 'SUSPEND' && !this.canSuspend(player))
        || (action === 'REINSTATE' && !this.canReinstate(player))
        || (action === 'DELETE' && !this.canDelete(player))) return;
    this.pendingRole = null;
    this.pendingModeration = {
      id: player.id, username: player.username, action,
      expectedSuspended: !!player.moderationSuspendedAt
    };
    this.moderationReason = '';
    this.deleteConfirmation = '';
    this.moderationErrorKey = '';
    this.moderationSuccessKey = '';
  }

  cancelModeration(): void {
    if (!this.moderating) this.pendingModeration = null;
  }

  get canConfirmModeration(): boolean {
    const pending = this.pendingModeration;
    if (!pending || this.working || this.moderationReason.trim().length < 10
        || this.moderationReason.trim().length > 500) return false;
    return pending.action !== 'DELETE' || this.deleteConfirmation === pending.username;
  }

  confirmModeration(): void {
    const pending = this.pendingModeration;
    if (!pending || !this.canConfirmModeration) return;
    const player = this.players.find(item => item.id === pending.id);
    if (!player
      || (pending.action === 'SUSPEND' && !this.canSuspend(player))
      || (pending.action === 'REINSTATE' && !this.canReinstate(player))
      || (pending.action === 'DELETE' && !this.canDelete(player))) return;

    this.moderating = true;
    this.moderationErrorKey = '';
    this.moderationRequest = this.service.moderate(
      pending.id, pending.action, pending.username, pending.expectedSuspended, this.moderationReason.trim())
      .pipe(timeout(15_000), finalize(() => this.moderating = false))
      .subscribe({
        next: result => {
          this.players = result.action === 'DELETE'
            ? this.players.filter(item => item.id !== result.id)
            : this.players.map(item => item.id === result.id
              ? { ...item, notLocked: result.notLocked,
                  moderationSuspendedAt: result.moderationSuspendedAt } : item);
          this.moderationSuccessKey = 'adminPlayers.success.' + result.action;
          this.moderationSuccessName = pending.username;
          this.pendingModeration = null;
          this.expandedPlayerId = null;
          this.moderationReason = '';
          this.deleteConfirmation = '';
        },
        error: error => {
          this.pendingModeration = null;
          this.moderationErrorKey = error.status === 409
            ? (error.error?.code === 'COMMUNITY_OWNERSHIP_BLOCKS_DELETION'
              ? 'adminPlayers.deletionBlocked' : 'adminPlayers.moderationConflict')
            : error.status === 403 ? 'adminPlayers.moderationForbidden'
            : 'adminPlayers.moderationError';
        }
      });
  }

  search(): void {
    if (this.working) return;
    const name = this.name.trim();
    this.load(name, 0);
  }

  changePage(direction: number): void {
    if (this.loading || this.working || (direction > 0 && !this.hasMore)) return;
    const page = this.page + direction;
    if (page >= 0) this.load(this.searchedName, page);
  }

  clear(): void {
    if (this.working) return;
    this.pendingRole = null;
    this.pendingModeration = null;
    this.selectedCommunityLimitPlayer = null;
    this.messageRecipient = null;
    this.adminMessage = '';
    this.messageError = '';
    this.messageSuccess = '';
    this.messageRequest?.unsubscribe();
    this.communityLimitRequest?.unsubscribe();
    this.roleErrorKey = '';
    this.roleSuccessName = '';
    this.moderationErrorKey = '';
    this.moderationSuccessKey = '';
    this.expandedPlayerId = null;
    this.request?.unsubscribe();
    this.name = '';
    this.searchedName = '';
    this.players = [];
    this.page = 0;
    this.hasMore = false;
    this.loading = false;
    this.searched = false;
    this.errorKey = '';
    this.load('', 0);
  }

  ngOnDestroy(): void {
    this.messageRequest?.unsubscribe();
    this.roleRequest?.unsubscribe();
    this.communityLimitRequest?.unsubscribe();
    this.moderationRequest?.unsubscribe();
    this.request?.unsubscribe();
  }

  statusKey(player: AdminPlayer): string {
    if (player.moderationSuspendedAt) return 'adminPlayers.suspended';
    if (player.enabled === false) return 'adminPlayers.inactive';
    if (player.notLocked === false) return 'adminPlayers.locked';
    if (player.enabled === true && player.notLocked === true) return 'adminPlayers.active';
    return 'common.notProvided';
  }

  roleKey(player: AdminPlayer): string {
    return ['ROLE_USER', 'ROLE_HR', 'ROLE_MANAGER', 'ROLE_ADMIN', 'ROLE_SUPER_ADMIN'].includes(player.role || '')
      ? 'adminPlayers.role.' + player.role : 'common.notProvided';
  }

  private load(name: string, page: number): void {
    this.messageRecipient = null;
    this.adminMessage = '';
    this.messageError = '';
    this.pendingRole = null;
    this.pendingModeration = null;
    this.expandedPlayerId = null;
    this.roleErrorKey = '';
    this.roleSuccessName = '';
    this.moderationErrorKey = '';
    this.moderationSuccessKey = '';
    this.request?.unsubscribe();
    this.loading = true;
    this.errorKey = '';
    this.request = this.service.search(name, page)
      .pipe(timeout(10_000), finalize(() => this.loading = false))
      .subscribe({
        next: result => {
          this.players = result.players;
          this.page = result.page;
          this.hasMore = result.hasMore;
          this.searchedName = name;
          this.searched = true;
        },
        error: () => {
          this.players = [];
          this.hasMore = false;
          this.errorKey = 'adminPlayers.loadError';
        }
      });
  }
}
