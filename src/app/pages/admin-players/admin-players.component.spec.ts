import { of, Subject, throwError } from 'rxjs';
import { AdminPlayersComponent } from './admin-players.component';
import { AdminPlayer, AdminPlayersService } from '../../services/admin-players.service';
import { AuthenticationService } from '../../services/authethication.service';

describe('AdminPlayersComponent role changes', () => {
  let component: AdminPlayersComponent;
  let service: jasmine.SpyObj<AdminPlayersService>;
  let auth: jasmine.SpyObj<AuthenticationService>;
  const player = (): AdminPlayer => ({
    id: 2, username: 'ana', fullName: null, nickname: null,
    role: 'ROLE_USER', enabled: true, notLocked: true
  });

  beforeEach(() => {
    service = jasmine.createSpyObj('AdminPlayersService', ['search', 'changeRole', 'moderate', 'sendAdminMessage']);
    auth = jasmine.createSpyObj('AuthenticationService', ['hasAnyRole']);
    auth.hasAnyRole.and.returnValue(true);
    component = new AdminPlayersComponent(service, auth);
    component.players = [player()];
  });

  it('sends an administrative notification to an active player only once', () => {
    const pending = new Subject<{ notificationId: number }>();
    service.sendAdminMessage.and.returnValue(pending.asObservable());
    component.beginAdminMessage(player());
    component.adminMessage = ' Aviso da administração ';
    component.sendAdminMessage();
    component.sendAdminMessage();

    expect(service.sendAdminMessage).toHaveBeenCalledOnceWith(2, 'Aviso da administração');
    expect(component.messageSending).toBeTrue();
    pending.next({ notificationId: 17 });
    pending.complete();
    expect(component.messageSending).toBeFalse();
    expect(component.messageRecipient).toBeNull();
    expect(component.messageSuccess).toBe('ana');
  });

  it('does not allow a message when the user lacks admin privileges', () => {
    auth.hasAnyRole.and.returnValue(false);
    component.beginAdminMessage(player());
    component.adminMessage = 'Aviso';
    component.sendAdminMessage();
    expect(component.messageRecipient).toBeNull();
    expect(service.sendAdminMessage).not.toHaveBeenCalled();
  });

  it('does not send an empty or invalid administrative notice', () => {
    component.beginAdminMessage(player());
    component.adminMessage = '   ';
    component.sendAdminMessage();
    component.adminMessage = 'Linha 1\\nLinha 2'.replace('\\n', '\n');
    component.sendAdminMessage();
    expect(service.sendAdminMessage).not.toHaveBeenCalled();
  });

  it('waits for confirmation and cancellation leaves the role unchanged', () => {
    component.beginRoleChange(component.players[0]);
    expect(component.pendingRole?.role).toBe('ROLE_ADMIN');
    expect(service.changeRole).not.toHaveBeenCalled();
    component.cancelRoleChange();
    component.confirmRoleChange();
    expect(service.changeRole).not.toHaveBeenCalled();
    expect(component.players[0].role).toBe('ROLE_USER');
  });

  it('protects superadministrators and hides actions from ordinary admins', () => {
    component.beginRoleChange({ ...player(), role: 'ROLE_SUPER_ADMIN' });
    expect(component.pendingRole).toBeNull();
    auth.hasAnyRole.and.returnValue(false);
    component.beginRoleChange(player());
    expect(component.pendingRole).toBeNull();
    expect(service.changeRole).not.toHaveBeenCalled();
  });

  it('sends the expected role once and updates the player after success', () => {
    const response = new Subject<{ id: number; role: string }>();
    service.changeRole.and.returnValue(response);
    component.beginRoleChange(component.players[0]);
    component.confirmRoleChange();
    component.confirmRoleChange();
    expect(service.changeRole).toHaveBeenCalledOnceWith(2, 'ROLE_ADMIN', 'ROLE_USER');
    expect(component.players[0].role).toBe('ROLE_USER');
    response.next({ id: 2, role: 'ROLE_ADMIN' });
    response.complete();
    expect(component.players[0].role).toBe('ROLE_ADMIN');
    expect(component.changingRole).toBeFalse();
    expect(component.pendingRole).toBeNull();
    component.ngOnDestroy();
  });

  it('keeps the role unchanged when a concurrent change is reported', () => {
    service.changeRole.and.returnValue(throwError(() => ({ status: 409 })));
    component.beginRoleChange(component.players[0]);
    component.confirmRoleChange();
    expect(component.players[0].role).toBe('ROLE_USER');
    expect(component.roleErrorKey).toBe('adminPlayers.roleConflict');
    expect(component.changingRole).toBeFalse();
    component.ngOnDestroy();
  });

  it('allows removal of admin permissions but prevents promotion of inactive players', () => {
    expect(component.canChangeRole({ ...player(), enabled: false })).toBeFalse();
    service.changeRole.and.returnValue(of({ id: 2, role: 'ROLE_USER' }));
    component.players = [{ ...player(), role: 'ROLE_ADMIN' }];
    component.beginRoleChange(component.players[0]);
    component.confirmRoleChange();
    expect(service.changeRole).toHaveBeenCalledOnceWith(2, 'ROLE_USER', 'ROLE_ADMIN');
    expect(component.players[0].role).toBe('ROLE_USER');
    component.ngOnDestroy();
  });
});

describe('AdminPlayersComponent account moderation', () => {
  let component: AdminPlayersComponent;
  let service: jasmine.SpyObj<AdminPlayersService>;
  let auth: jasmine.SpyObj<AuthenticationService>;
  const player = (): AdminPlayer => ({
    id: 2, username: 'ana', fullName: null, nickname: null,
    role: 'ROLE_USER', enabled: true, notLocked: true, moderationSuspendedAt: null
  });
  beforeEach(() => {
    service = jasmine.createSpyObj('AdminPlayersService', ['search', 'changeRole', 'moderate']);
    auth = jasmine.createSpyObj('AuthenticationService', ['hasAnyRole']);
    auth.hasAnyRole.and.returnValue(true);
    component = new AdminPlayersComponent(service, auth);
    component.players = [player()];
  });
  it('requires a reason and explicit confirmation before suspension', () => {
    component.beginModeration(component.players[0], 'SUSPEND');
    expect(component.canConfirmModeration).toBeFalse();
    component.moderationReason = 'Inappropriate messages';
    expect(component.canConfirmModeration).toBeTrue();
    const response = new Subject<{id:number; action:'SUSPEND'; moderationSuspendedAt:string; notLocked:boolean}>();
    service.moderate.and.returnValue(response);
    component.confirmModeration();
    expect(service.moderate).toHaveBeenCalledOnceWith(2, 'SUSPEND', 'ana', false, 'Inappropriate messages');
    response.next({ id: 2, action: 'SUSPEND', moderationSuspendedAt: '2026-10-19T10:00:00Z', notLocked: false });
    response.complete();
    expect(component.statusKey(component.players[0])).toBe('adminPlayers.suspended');
    component.ngOnDestroy();
  });
  it('requires typing the username before deleting', () => {
    component.beginModeration(component.players[0], 'DELETE');
    component.moderationReason = 'Repeated harmful behaviour';
    expect(component.canConfirmModeration).toBeFalse();
    component.deleteConfirmation = 'ana';
    expect(component.canConfirmModeration).toBeTrue();
    service.moderate.and.returnValue(of({ id: 2, action: 'DELETE', moderationSuspendedAt: null, notLocked: false }));
    component.confirmModeration();
    expect(component.players.length).toBe(0);
    component.ngOnDestroy();
  });
  it('protects administrative roles and prevents deletion by regular admins', () => {
    const otherAdmin = { ...player(), role: 'ROLE_ADMIN' };
    expect(component.canSuspend(otherAdmin)).toBeFalse();
    expect(component.canDelete(otherAdmin)).toBeFalse();
    auth.hasAnyRole.and.callFake((...roles) => roles.includes('ROLE_ADMIN'));
    expect(component.canSuspend(player())).toBeTrue();
    expect(component.canDelete(player())).toBeFalse();
    component.ngOnDestroy();
  });
});
