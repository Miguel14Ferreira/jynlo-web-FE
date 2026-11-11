import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { NotificationsComponent } from './notifications.component';
import { NotificationApiService } from '../../services/notification-api.service';
import { SessionService } from '../../services/session.service';
import { AuthenticationService } from '../../services/authethication.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('NotificationsComponent', () => {
  let component: NotificationsComponent;
  let fixture: ComponentFixture<NotificationsComponent>;
  let service: jasmine.SpyObj<NotificationApiService>;
  let router: Router;
  let authenticationService: jasmine.SpyObj<AuthenticationService>;

  const notificationFixture = () => ({
    id: 4,
    subject: 'Vaga disponível',
    message: 'Foste promovido para participante.',
    greeting: '',
    signature: '',
    createdAt: '2026-09-25T20:00:00Z',
    friendRequest: false,
    updateProfile: false,
    sessionInvite: false,
    normalMessage: false,
    token: null,
    type: 'WAITLIST_PROMOTED',
    sessionId: 12,
    relatedUsername: null,
    read: false,
    username: 'fixture-user'
  });

  const friendRequestFixture = () => ({
    id: 8,
    subject: 'Novo pedido de amizade',
    message: 'ana enviou-te um pedido de amizade.',
    greeting: '',
    signature: '',
    createdAt: '2026-09-25T21:00:00Z',
    friendRequest: true,
    updateProfile: false,
    sessionInvite: false,
    normalMessage: false,
    token: null,
    type: null,
    sessionId: null,
    relatedUsername: null,
    read: false,
    username: 'fixture-user'
  });

  const securityNotificationFixture = () => ({
    id: 12,
    subject: 'Autenticação multifator desativada',
    message: 'A autenticação multifator foi desativada na tua conta DESPORTO24. Se não foste tu, protege imediatamente a tua conta.',
    greeting: 'Cumprimentos,',
    signature: 'DESPORTO24 MANAGEMENT TEAM',
    createdAt: '2026-09-28T19:12:00Z',
    friendRequest: false,
    updateProfile: false,
    sessionInvite: false,
    normalMessage: false,
    token: null,
    type: null,
    sessionId: null,
    relatedUsername: null,
    read: true,
    username: 'fixture-user'
  });

  beforeEach(async () => {
    service = jasmine.createSpyObj<NotificationApiService>(
      'NotificationApiService',
      ['mine', 'markRead', 'delete', 'deleteAll', 'acceptFriendRequest', 'rejectFriendRequest', 'blockOwnAccount', 'preferences', 'updatePreferences']
    );
    service.mine.and.returnValue(of([notificationFixture()]));
    service.preferences.and.returnValue(of({
      inAppEnabled: true, emailEnabled: true,
      disabledInAppTypes: [], disabledEmailTypes: []
    }));
    service.updatePreferences.and.callFake(prefs => of(prefs));
    service.markRead.and.returnValue(of(void 0));
    service.delete.and.returnValue(of(void 0));
    service.deleteAll.and.returnValue(of(void 0));
    service.acceptFriendRequest.and.returnValue(of({}));
    service.rejectFriendRequest.and.returnValue(of(void 0));
    service.blockOwnAccount.and.returnValue(of(void 0));
    authenticationService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      ['logOut']
    );

    await TestBed.configureTestingModule({
      declarations: [NotificationsComponent],
      imports: TEST_IMPORTS,
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({})
            }
          }
        },
        { provide: NotificationApiService, useValue: service },
        { provide: AuthenticationService, useValue: authenticationService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    fixture.detectChanges();
  });

  it('preserves notification selection and the preferences control in Premium layout', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.notifications-page.jynlo-c1.jynlo-secondary')).not.toBeNull();
    expect(root.querySelector('.notifications-grid .notification-card')).not.toBeNull();
    expect(root.querySelector('.notifications-grid .notification-detail')).not.toBeNull();
    const preferences = root.querySelector<HTMLButtonElement>('.header-actions button[aria-expanded]');
    expect(preferences?.getAttribute('aria-expanded')).toBe('false');
    preferences!.click();
    fixture.detectChanges();
    expect(preferences?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('.notification-preferences__table input[type="checkbox"]')).not.toBeNull();
    expect(service.delete).not.toHaveBeenCalled();
  });

  it('labels a post-game reminder and links to its session', () => {
    const reminder = {
      ...notificationFixture(),
      type: 'SESSION_POST_GAME_REVIEW',
      subject: 'Como correu o teu jogo?'
    };
    component.selected = reminder;
    fixture.detectChanges();

    expect(component.typeLabel(reminder)).toBe('Pós-jogo');
    const action = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((element: any) => element.textContent.includes('Ver pós-jogo')) as HTMLButtonElement;
    expect(action).toBeDefined();
    action.click();
    expect(router.navigate).toHaveBeenCalledWith(['/menu/events', 12]);
  });

  it('opens team invitations in their own community competitions and rejects invalid references', () => {
    const invitation = {
      ...notificationFixture(),
      type: 'TEAM_MEMBER_INVITE',
      communityId: 7,
      sessionId: null,
      relatedUsername: 'owner'
    };
    component.selected = invitation;
    fixture.detectChanges();

    const open = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((button: any) => button.textContent.includes('Abrir competições da comunidade')) as HTMLButtonElement;
    expect(open).toBeTruthy();
    open.click();
    expect(router.navigate).toHaveBeenCalledWith(['/menu/communities', 7], {
      queryParams: { tab: 'tournaments' }
    });

    (router.navigate as jasmine.Spy).calls.reset();
    component.openTeamCompetition({ ...invitation, communityId: -1 });
    component.openTeamCompetition({ ...invitation, type: 'CHAT_MESSAGE' });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('should show the community invitation action and open pending invitations', () => {
    const invitation = {
      ...notificationFixture(),
      type: 'COMMUNITY_INVITE',
      subject: 'Convite para a comunidade CNG',
      message: 'Mensagem do servidor',
      relatedUsername: 'TMF14',
      sessionId: null
    };
    component.notifications = [invitation];
    component.selected = invitation;
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((element: any) => element.textContent.includes('Ver convite')) as HTMLButtonElement;
    expect(button).toBeDefined();
    button.click();
    expect(router.navigate).toHaveBeenCalledWith(['/menu/communities']);
  });

  it('should translate invitation content while preserving community and inviter names', () => {
    const previousLanguage = localStorage.getItem('d24-language');
    const invitation = {
      ...notificationFixture(),
      type: 'COMMUNITY_INVITE',
      subject: 'Convite para a comunidade CNG',
      relatedUsername: 'TMF14',
      sessionId: null
    };
    try {
      localStorage.setItem('d24-language', 'pt');
      expect(component.typeLabel(invitation)).toBe('Convite de comunidade');
      expect(component.notificationSubject(invitation)).toBe('Convite para a comunidade CNG');
      expect(component.notificationMessage(invitation)).toBe(
        '@TMF14 convidou-te para a comunidade CNG. Abre o convite para aceitar ou rejeitar.');
      localStorage.setItem('d24-language', 'en');
      expect(component.typeLabel(invitation)).toBe('Community invitation');
      expect(component.notificationSubject(invitation)).toBe('Invitation to the CNG community');
      expect(component.notificationMessage(invitation)).toBe(
        '@TMF14 invited you to the CNG community. Open the invitation to accept or reject.');
      expect(component.notificationMessage(notificationFixture())).toBe('Foste promovido para participante.');
      component.openCommunityInvite(notificationFixture());
      expect(router.navigate).not.toHaveBeenCalled();
    } finally {
      if (previousLanguage === null) {
        localStorage.removeItem('d24-language');
      } else {
        localStorage.setItem('d24-language', previousLanguage);
      }
    }
  });

  it('shows a friendly GIF preview for existing raw GIPHY alerts in PT/EN and keeps chat navigation', () => {
    const previous = localStorage.getItem('d24-language');
    const payload='[JYNLO:GIPHY:1]'+JSON.stringify({
      id:'XdUMQuuiaAEkOUtezd',
      p:'https://giphy.com/gifs/animated-thumbs-up-joeyahlbum-XdUMQuuiaAEkOUtezd',
      a:'joeyahlbum',c:''
    });
    const notice={...notificationFixture(),type:'CHAT_MESSAGE',
      subject:'Nova mensagem de TMF14',relatedUsername:'TMF14',message:payload};
    try {
      localStorage.setItem('d24-language','pt');
      component.notifications=[notice];
      component.selected=notice;
      fixture.detectChanges();
      const page=fixture.nativeElement as HTMLElement;
      expect(component.notificationMessage(notice)).toBe('TMF14 enviou-te um GIF 🎞️');
      expect(component.notificationSubject(notice)).toBe('Nova mensagem de TMF14');
      expect(page.textContent).toContain('TMF14 enviou-te um GIF');
      expect(page.textContent).not.toContain('JYNLO:GIPHY:1');
      expect(page.textContent).not.toContain('XdUMQuuiaAEkOUtezd');
      expect(page.textContent).not.toContain('giphy.com');
      component.openChat(notice);
      expect(router.navigate).toHaveBeenCalledWith(['/menu/messages'],{
        queryParams:{kind:'direct',id:'TMF14'}
      });
      localStorage.setItem('d24-language','en');
      expect(component.notificationMessage(notice)).toBe('TMF14 sent you a GIF 🎞️');
      expect(component.notificationSubject(notice)).toBe('New message from TMF14');
      expect(component.notificationMessage({...notice,message:'🎞️ GIF'}))
        .toBe('TMF14 sent you a GIF 🎞️');
      expect(component.notificationMessage({...notice,relatedUsername:null,message:'🎞️ GIF'}))
        .toBe('Sent you a GIF 🎞️');
      // Ordinary chat text is not modified or confused with GIF envelopes.
      expect(component.notificationMessage({...notice,message:'Vamos jogar amanhã?'}))
        .toBe('Vamos jogar amanhã?');
    } finally {
      if(previous===null)localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language',previous);
    }
  });

  it('localizes photo, voice, PDF and file alerts without exposing names', () => {
    const previous = localStorage.getItem('d24-language');
    const base = {...notificationFixture(), type: 'CHAT_MESSAGE', relatedUsername: 'TMF14'};
    try {
      localStorage.setItem('d24-language', 'pt');
      expect(component.notificationMessage({...base, message:'🖼️ Fotografia'}))
        .toBe('TMF14 enviou-te uma fotografia 🖼️');
      expect(component.notificationMessage({...base, message:'🎤 Mensagem de voz'}))
        .toBe('TMF14 enviou-te uma mensagem de voz 🎤');
      expect(component.notificationMessage({...base, message:'📄 Documento'}))
        .toBe('TMF14 enviou-te um documento 📄');
      expect(component.notificationMessage({...base, message:'📎 Anexo'}))
        .toBe('TMF14 enviou-te um ficheiro 📎');
      localStorage.setItem('d24-language', 'en');
      expect(component.notificationMessage({...base, message:'🖼️ Fotografia'}))
        .toBe('TMF14 sent you a photo 🖼️');
      expect(component.notificationMessage({...base, message:'🎤 Mensagem de voz'}))
        .toBe('TMF14 sent you a voice message 🎤');
      expect(component.notificationMessage({...base, message:'📄 Documento'}))
        .toBe('TMF14 sent you a document 📄');
      expect(component.notificationMessage({...base, message:'📎 Anexo'}))
        .toBe('TMF14 sent you a file 📎');
      expect(component.notificationMessage({...base, message:'Olá! 😀'})).toBe('Olá! 😀');
    } finally {
      if (previous === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previous);
    }
  });

  it('never shows malformed GIF envelope payloads in saved notifications', () => {
    const notice={...notificationFixture(),type:'CHAT_MESSAGE',
      relatedUsername:'TMF14',message:'[JYNLO:GIPHY:1]{broken-json}'};
    expect(component.notificationMessage(notice)).not.toContain('{broken-json}');
    expect(component.notificationMessage({...notice,type:'OTHER'}))
      .not.toContain('[JYNLO:GIPHY:1]');
  });

  it('opens chat notifications directly in the unified inbox', () => {
    const notice = { ...notificationFixture(), type: 'CHAT_MESSAGE', relatedUsername: 'ana' };
    component.openChat(notice);
    expect(router.navigate).toHaveBeenCalledWith(['/menu/messages'],
      { queryParams: { kind: 'direct', id: 'ana' } });
    (router.navigate as jasmine.Spy).calls.reset();
    component.openChat({ ...notice, relatedUsername: null });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('opens a new join request notification directly in member management', () => {
    const joinRequest = {
      ...notificationFixture(), id: 91, type: 'COMMUNITY_JOIN_REQUEST', communityId: 42,
      subject: 'Novo pedido para a comunidade Futsal', relatedUsername: 'ana', sessionId: null
    };
    component.selected = joinRequest;
    fixture.detectChanges();
    const button = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((element: any) => element.textContent.includes('Gerir pedidos de adesão')) as HTMLButtonElement;
    expect(button).toBeDefined();
    expect(component.typeLabel(joinRequest)).toBe('Pedido de adesão');
    expect(component.notificationMessage(joinRequest)).toContain('@ana');
    button.click();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/menu/communities', 42], { queryParams: { tab: 'members' } }
    );
  });

  it('opens an accepted community without giving additional permissions', () => {
    const approved = {
      ...notificationFixture(), id: 92, type: 'COMMUNITY_JOIN_ACCEPTED', communityId: 42,
      subject: 'Pedido aceite na comunidade Futsal', sessionId: null
    };
    component.selected = approved;
    fixture.detectChanges();
    expect(component.typeLabel(approved)).toBe('Adesão aprovada');
    const button = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((element: any) => element.textContent.includes('Ver comunidade')) as HTMLButtonElement;
    expect(button).toBeDefined();
    button.click();
    expect(router.navigate).toHaveBeenCalledWith(['/menu/communities', 42]);
  });

  it('handles refused requests without granting access', () => {
    const refused = {
      ...notificationFixture(), id: 93, type: 'COMMUNITY_JOIN_REJECTED', communityId: 42,
      subject: 'Pedido recusado na comunidade Futsal', sessionId: null
    };
    component.selected = refused;
    fixture.detectChanges();
    expect(component.typeLabel(refused)).toBe('Adesão recusada');
    component.openJoinCommunity(refused);
    expect(router.navigate).toHaveBeenCalledWith(['/menu/communities', 42]);
  });

  it('ignores join notifications without safe community IDs', () => {
    for (const communityId of [null, undefined, 0, -2, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      component.openJoinCommunity({
        ...notificationFixture(), type: 'COMMUNITY_JOIN_REQUEST', communityId
      });
    }
    component.openJoinCommunity({ ...notificationFixture(), type: 'CHAT_MESSAGE', communityId: 42 });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('shows new membership notification content in both languages', () => {
    const previousLanguage = localStorage.getItem('d24-language');
    const pending = { ...notificationFixture(), type: 'COMMUNITY_JOIN_REQUEST',
      subject: 'Novo pedido para a comunidade Futsal', relatedUsername: 'ana' };
    const accepted = { ...notificationFixture(), type: 'COMMUNITY_JOIN_ACCEPTED',
      subject: 'Pedido aceite na comunidade Futsal' };
    try {
      localStorage.setItem('d24-language', 'pt');
      expect(component.notificationSubject(pending)).toBe('Novo pedido: Futsal');
      expect(component.notificationSubject(accepted)).toBe('Pedido aprovado: Futsal');
      localStorage.setItem('d24-language', 'en');
      expect(component.typeLabel(pending)).toBe('Membership request');
      expect(component.notificationSubject(pending)).toBe('New request: Futsal');
      expect(component.notificationMessage(accepted)).toContain('was approved');
    } finally {
      if (previousLanguage === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previousLanguage);
    }
  });

  it('should create and load notifications', () => {
    expect(component).toBeTruthy();
    expect(component.notifications.length).toBe(1);
    expect(component.unreadCount).toBe(1);
  });

  it('should mark an unread notification as read when opened', () => {
    component.openNotification(component.notifications[0]);

    expect(service.markRead).toHaveBeenCalledWith(4);
    expect(component.notifications[0].read).toBeTrue();
  });

  it('should delete a notification by id', () => {
    component.deleteNotification(component.notifications[0]);

    expect(service.delete).toHaveBeenCalledWith(4);
    expect(component.notifications.length).toBe(0);
  });

  it('should clear all notifications after confirmation', () => {
    component.notifications = [notificationFixture(), friendRequestFixture()];
    component.selected = component.notifications[0];

    component.requestClearAll();
    expect(component.clearAllConfirming).toBeTrue();

    component.clearAllNotifications();

    expect(service.deleteAll).toHaveBeenCalled();
    expect(component.notifications).toEqual([]);
    expect(component.selected).toBeUndefined();
    expect(component.clearAllConfirming).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/menu/notifications']);
  });

  it('opens a promoted waitlist notification at the current membership status', () => {
    const promoted = component.notifications[0];
    component.selected = promoted;
    fixture.detectChanges();

    const action = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((element: any) => element.textContent.includes('Ver estado da inscrição')) as HTMLButtonElement;
    expect(action).toBeDefined();
    action.click();

    expect(router.navigate).toHaveBeenCalledWith(['/menu/events', 12], {
      queryParams: { membership: '1' }
    });
  });

  it('shows a private meeting-point change alert in both languages without disclosing its text', () => {
    const previousLanguage = localStorage.getItem('d24-language');
    const notice = {
      ...notificationFixture(), id: 321, sessionId: 12,
      type: 'SESSION_MEETING_POINT_UPDATED',
      subject: 'Ponto de encontro atualizado',
      message: 'O organizador alterou as indicações de chegada. Abre a sessão para consultares a informação atual.'
    };
    try {
      component.notifications = [notice];
      component.selected = notice;
      localStorage.setItem('d24-language', 'pt');
      fixture.detectChanges();
      expect(component.typeLabel(notice)).toBe('Ponto de encontro');
      expect(component.notificationSubject(notice)).toBe('Ponto de encontro atualizado');
      expect(component.notificationMessage(notice)).toContain('Abre a sessão');
      const detail = fixture.nativeElement as HTMLElement;
      expect(detail.textContent).not.toContain('Portão secreto');
      const button = Array.from(detail.querySelectorAll('button'))
        .find(el => el.textContent?.includes('Ver ponto de encontro')) as HTMLButtonElement;
      expect(button).toBeDefined();
      button.click();
      expect(router.navigate).toHaveBeenCalledWith(['/menu/events', 12], {
        queryParams: { meetingPoint: '1' }
      });

      localStorage.setItem('d24-language', 'en');
      expect(component.typeLabel(notice)).toBe('Meeting point');
      expect(component.notificationSubject(notice)).toBe('Meeting point updated');
      expect(component.notificationMessage(notice)).toContain('Open the session');
    } finally {
      if (previousLanguage === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previousLanguage);
    }
  });

  it('keeps ordinary session notifications pointing to session details', () => {
    component.openSession({ ...notificationFixture(), type: 'SESSION_CANCELLED' });
    expect(router.navigate).toHaveBeenCalledWith(['/menu/events', 12]);
  });

  it('does not navigate from a promotion notification with no session ID', () => {
    (router.navigate as jasmine.Spy).calls.reset();
    component.openSession({ ...notificationFixture(), sessionId: null });
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('should accept a friend request without exposing its token', () => {
    const friendRequest = friendRequestFixture();
    component.notifications = [friendRequest];
    component.selected = friendRequest;

    component.acceptFriendRequest(friendRequest);

    expect(service.acceptFriendRequest).toHaveBeenCalledWith(8);
    expect(component.notifications.length).toBe(0);
    expect(component.actionSuccess).toContain('aceite');
  });

  it('does not offer a misleading preference switch for retired profile-update alerts', () => {
    expect(component.preferenceTypes).not.toContain('PROFILE_UPDATE' as any);
  });

  it('should offer account protection for suspicious security notifications', () => {
    const securityNotification = securityNotificationFixture();

    expect(component.canProtectAccount(securityNotification)).toBeTrue();
  });

  it('never offers account blocking on old routine profile notices', () => {
    for (const subject of ['Perfil atualizado', 'Profile updated']) {
      const profileUpdate = {
        ...securityNotificationFixture(),
        subject,
        message: 'Foram atualizados os seguintes dados do teu perfil: Desportos favoritos.',
        updateProfile: true
      };
      expect(component.canProtectAccount(profileUpdate)).toBeFalse();
      component.selected = profileUpdate;
      component.requestAccountBlock();
      expect(component.accountBlockConfirming).toBeFalse();
      component.blockAccountAccess();
      expect(service.blockOwnAccount).not.toHaveBeenCalled();
    }
  });

  it('should offer account protection on password change notifications', () => {
    const passwordChange = {
      ...securityNotificationFixture(),
      subject: 'Palavra-passe alterada',
      message: 'A tua palavra-passe foi alterada.',
      updateProfile: true
    };

    expect(component.canProtectAccount(passwordChange)).toBeTrue();
  });

  it('offers account protection for email changes even in legacy profile notices', () => {
    const emailChange = {
      ...securityNotificationFixture(),
      subject: 'Alteração de email',
      message: 'O endereço de email associado à tua conta foi alterado.',
      updateProfile: true
    };
    expect(component.canProtectAccount(emailChange)).toBeTrue();
  });

  it('does not treat a security keyword buried in an ordinary message as proof', () => {
    const ordinary = {
      ...securityNotificationFixture(),
      subject: 'Perfil atualizado',
      message: 'Para ajuda, procura a secção de alteração de email.',
      updateProfile: true
    };
    expect(component.canProtectAccount(ordinary)).toBeFalse();
  });

  it('should not expose account blocking for unrelated notifications', () => {
    expect(component.canProtectAccount(notificationFixture())).toBeFalse();
  });

  it('should block the account and clear the local session after confirmation', () => {
    const securityNotification = securityNotificationFixture();
    component.selected = securityNotification;

    component.blockAccountAccess();

    expect(service.blockOwnAccount).toHaveBeenCalled();
    expect(authenticationService.logOut).toHaveBeenCalled();
  });

  it('should reject a friend request through the authenticated endpoint', () => {
    const friendRequest = friendRequestFixture();
    component.notifications = [friendRequest];
    component.selected = friendRequest;

    component.rejectFriendRequest(friendRequest);

    expect(service.rejectFriendRequest).toHaveBeenCalledWith(8);
    expect(component.notifications.length).toBe(0);
    expect(component.actionSuccess).toContain('rejeitado');
  });
  it('shows venue edit decisions in both languages and links to the exact venue', () => {
    const previousLanguage = localStorage.getItem('d24-language');
    const decision = {
      ...notificationFixture(), id: 125, sessionId: null, venueId: 75,
      type: 'VENUE_EDIT_DECISION',
      subject: 'Sugestão de recinto rejeitada',
      message: 'A tua proposta para "Pavilhão Municipal" foi rejeitada. Justificação: Informação não confirmada.'
    };
    try {
      component.notifications = [decision];
      component.selected = decision;
      localStorage.setItem('d24-language', 'pt');
      fixture.detectChanges();
      expect(component.typeLabel(decision)).toBe('Alteração a recinto');
      expect(component.notificationSubject(decision)).toBe('Alteração rejeitada');
      expect(component.notificationMessage(decision)).toContain('Pavilhão Municipal');
      expect(component.notificationMessage(decision)).toContain('Informação não confirmada.');
      const button = Array.from(fixture.nativeElement.querySelectorAll('button'))
        .find((element: any) => element.textContent.includes('Ver recinto')) as HTMLButtonElement;
      expect(button).toBeDefined();
      button.click();
      expect(router.navigate).toHaveBeenCalledWith(['/menu/venues', 75]);

      localStorage.setItem('d24-language', 'en');
      expect(component.typeLabel(decision)).toBe('Venue edit');
      expect(component.notificationSubject(decision)).toBe('Edit rejected');
      expect(component.notificationMessage(decision)).toContain('Your suggested change to Pavilhão Municipal was rejected.');
      expect(component.notificationMessage(decision)).toContain('Admin response: Informação não confirmada.');
      (router.navigate as jasmine.Spy).calls.reset();
      component.openVenueDecision({ ...decision, venueId: -1 });
      expect(router.navigate).not.toHaveBeenCalled();
      component.openVenueDecision({ ...decision, venueId: Number.MAX_SAFE_INTEGER + 1 });
      expect(router.navigate).not.toHaveBeenCalled();
    } finally {
      if (previousLanguage === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previousLanguage);
    }
  });

  it('supports independent opt-out of venue edit decision in-app and email alerts', () => {
    component.openPreferences();
    expect(component.preferenceTypes).toContain('VENUE_EDIT_DECISION');
    component.changeType('VENUE_EDIT_DECISION', 'inApp', false);
    expect(component.preferenceEnabled('VENUE_EDIT_DECISION', 'inApp')).toBeFalse();
    expect(component.preferenceEnabled('VENUE_EDIT_DECISION', 'email')).toBeTrue();
    component.changeType('VENUE_EDIT_DECISION', 'email', false);
    expect(component.preferenceEnabled('VENUE_EDIT_DECISION', 'email')).toBeFalse();
    expect(service.updatePreferences).toHaveBeenCalledWith(jasmine.objectContaining({
      disabledInAppTypes: ['VENUE_EDIT_DECISION'],
      disabledEmailTypes: ['VENUE_EDIT_DECISION']
    }));
  });

  it('shows all in-app and email alert types with per-type persistent switches', () => {
    component.openPreferences();
    expect(service.preferences).toHaveBeenCalled();
    expect(component.preferenceTypes).toContain('FRIEND_REQUEST');
    expect(component.preferenceTypes).toContain('CHAT_MESSAGE');
    expect(component.preferenceTypes).toContain('COMMUNITY_JOIN_REQUEST');
    component.changeType('COMMUNITY_JOIN_REQUEST', 'inApp', false);
    expect(service.updatePreferences).toHaveBeenCalledWith(jasmine.objectContaining({
      inAppEnabled: true, emailEnabled: true,
      disabledInAppTypes: ['COMMUNITY_JOIN_REQUEST']
    }));
    expect(component.preferenceEnabled('COMMUNITY_JOIN_REQUEST', 'inApp')).toBeFalse();
    expect(component.preferenceEnabled('COMMUNITY_JOIN_REQUEST', 'email')).toBeTrue();
    component.changeGlobal('email', false);
    expect(service.updatePreferences).toHaveBeenCalledWith(jasmine.objectContaining({
      emailEnabled: false
    }));
    expect(component.preferences?.emailEnabled).toBeFalse();
  });


  it('fetches preferences again when reopened, including changes from another device', () => {
    service.preferences.and.returnValues(
      of({ inAppEnabled: true, emailEnabled: true,
        disabledInAppTypes: [], disabledEmailTypes: [] }),
      of({ inAppEnabled: false, emailEnabled: false,
        disabledInAppTypes: ['CHAT_MESSAGE'], disabledEmailTypes: ['COMMUNITY_INVITE'] })
    );

    component.openPreferences();
    expect(component.preferences?.inAppEnabled).toBeTrue();
    component.openPreferences();
    component.openPreferences();

    expect(service.preferences).toHaveBeenCalledTimes(2);
    expect(component.preferences?.inAppEnabled).toBeFalse();
    expect(component.preferences?.emailEnabled).toBeFalse();
    expect(component.preferences?.disabledInAppTypes).toContain('CHAT_MESSAGE');
    expect(component.preferences?.disabledEmailTypes).toContain('COMMUNITY_INVITE');
  });

  it('disables preference switches and ignores stale edits while reloading', () => {
    component.openPreferences();
    component.openPreferences();

    const refresh = new Subject<{
      inAppEnabled: boolean;
      emailEnabled: boolean;
      disabledInAppTypes: string[];
      disabledEmailTypes: string[];
    }>();
    service.preferences.and.returnValue(refresh.asObservable());
    component.openPreferences();
    expect(component.preferencesLoading).toBeTrue();

    fixture.detectChanges();
    const toggles = Array.from(
      fixture.nativeElement.querySelectorAll('.notification-preferences input[type="checkbox"]')
    ) as HTMLInputElement[];
    expect(toggles.length).toBeGreaterThan(2);
    expect(toggles.every(input => input.disabled)).toBeTrue();

    const writes = service.updatePreferences.calls.count();
    component.changeGlobal('email', false);
    component.changeType('CHAT_MESSAGE', 'inApp', false);
    expect(service.updatePreferences.calls.count()).toBe(writes);

    refresh.next({ inAppEnabled: true, emailEnabled: false,
      disabledInAppTypes: ['CHAT_MESSAGE'], disabledEmailTypes: [] });
    refresh.complete();
    expect(component.preferencesLoading).toBeFalse();
    expect(component.preferences?.emailEnabled).toBeFalse();
    expect(component.preferenceEnabled('CHAT_MESSAGE', 'inApp')).toBeFalse();
  });

  it('does not allow overwriting newer settings after a failed refresh and offers retry', () => {
    component.openPreferences();
    component.openPreferences();
    service.preferences.and.returnValue(throwError(() => new Error('Offline')));
    component.openPreferences();

    expect(component.preferencesRefreshFailed).toBeTrue();
    expect(component.preferencesError).toBeTruthy();
    fixture.detectChanges();
    const toggles = Array.from(
      fixture.nativeElement.querySelectorAll('.notification-preferences input[type="checkbox"]')
    ) as HTMLInputElement[];
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles.every(input => input.disabled)).toBeTrue();
    const retry = fixture.nativeElement.querySelector('.preferences-error button') as HTMLButtonElement;
    expect(retry).toBeTruthy();

    component.changeGlobal('inApp', false);
    component.changeType('CHAT_MESSAGE', 'email', false);
    expect(service.updatePreferences).not.toHaveBeenCalled();

    service.preferences.and.returnValue(of({
      inAppEnabled: false, emailEnabled: true,
      disabledInAppTypes: ['CHAT_MESSAGE'], disabledEmailTypes: []
    }));
    retry.click();
    expect(component.preferencesRefreshFailed).toBeFalse();
    expect(component.preferences?.inAppEnabled).toBeFalse();
    expect(component.preferences?.disabledInAppTypes).toContain('CHAT_MESSAGE');
  });

  it('does not discard current preferences if server update fails', () => {
    component.openPreferences();
    const current = component.preferences;
    service.updatePreferences.and.returnValue(
      throwError(() => new Error('Offline')));
    component.changeType('CHAT_MESSAGE', 'email', false);
    expect(component.preferences).toEqual(current);
    expect(component.preferencesError).toBeTruthy();
  });


  it('shows complete game invitations even when the notification list has no matching alert', () => {
    component.notifications=[];
    component.pendingInvites=[{
      id:86,sessionId:42,inviterUsername:'rui',
      createdAt:new Date().toISOString(),
      sport:'Futebol',city:'Lisboa',gameDate:'2026-12-05T18:00:00Z',
      maxParticipants:10,participantCount:8,status:'OPEN'
    }];
    fixture.detectChanges();
    const page=fixture.nativeElement as HTMLElement;
    const invitation=page.querySelector('.session-invite-card');
    expect(invitation?.textContent).toContain('Futebol');
    expect(invitation?.textContent).toContain('Lisboa');
    expect(invitation?.textContent).toContain('2 vagas');
    expect(page.querySelectorAll('.session-invite-actions button').length).toBe(2);
    expect(page.querySelector('.notifications.emptyTitle')).toBeNull();
  });

  it('accepts an app invite through existing enrollment without impersonating a historical player', () => {
    const sessions=TestBed.inject(SessionService);
    const accept=spyOn(sessions,'acceptInvite').and.returnValue(of({
      state:'PARTICIPANT',waitlistPosition:null
    }));
    const invitation={id:90,sessionId:42,inviterUsername:'rui',
      createdAt:new Date().toISOString(),sport:'Futebol'};
    component.pendingInvites=[invitation];
    fixture.detectChanges();
    const acceptButton=fixture.nativeElement.querySelector(
      '.session-invite-actions .primary-action') as HTMLButtonElement;
    expect(acceptButton).toBeTruthy();
    acceptButton.click();
    expect(accept).toHaveBeenCalledOnceWith(42,90);
    expect(component.pendingInvites).toEqual([]);
    expect(component.actionSuccess).toContain('inscrito');
  });

});
