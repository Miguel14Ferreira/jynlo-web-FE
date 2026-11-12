import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { NavbarComponent } from './navbar.component';
import { AuthenticationService } from '../../services/authethication.service';
import { MyProfileService } from '../../services/my-profile.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { NotificationApiService } from '../../services/notification-api.service';
import { InboxApiService } from '../../services/inbox-api.service';
import { PrivateGroupService } from '../../services/private-group.service';
import { ConversationMuteService } from '../../services/conversation-mute.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let authService: jasmine.SpyObj<AuthenticationService>;
  let myProfileService: jasmine.SpyObj<MyProfileService>;
  let realtimeService: jasmine.SpyObj<DirectChatRealtimeService>;
  let notificationService: jasmine.SpyObj<NotificationApiService>;
  let inboxApi: jasmine.SpyObj<InboxApiService>;
  let privateGroups: jasmine.SpyObj<PrivateGroupService>;
  let conversationMutes: jasmine.SpyObj<ConversationMuteService>;
  let communityEvents: Subject<any>;
  let sessionEvents: Subject<any>;
  let groupEvents: Subject<any>;
  let incomingMessages: Subject<any>;
  let notificationChanges: Subject<void>;
  let originalTabTitle: string;

  beforeEach(async () => {
    originalTabTitle = document.title;
    authService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      ['hasSessionCandidate', 'hasAnyRole', 'terminarSessao', 'logOut']
    );
    authService.hasSessionCandidate.and.returnValue(false);
    authService.terminarSessao.and.returnValue(of(undefined));
    myProfileService = jasmine.createSpyObj<MyProfileService>('MyProfileService', ['get']);
    myProfileService.get.and.returnValue(of({username:'bea',nickname:'Bea',fullName:'Beatriz',profilePicUrl:null} as any));

    incomingMessages = new Subject<any>();
    communityEvents = new Subject<any>();
    sessionEvents = new Subject<any>();
    groupEvents = new Subject<any>();
    realtimeService = jasmine.createSpyObj<DirectChatRealtimeService>(
      'DirectChatRealtimeService',
      ['connect', 'disconnect'],
      { messages$: incomingMessages.asObservable(),
        communityMessages$: communityEvents.asObservable(),
        sessionMessages$: sessionEvents.asObservable(),
        groupMessages$: groupEvents.asObservable() }
    );

    notificationChanges = new Subject<void>();
    notificationService = jasmine.createSpyObj<NotificationApiService>(
      'NotificationApiService', ['unreadCount', 'mine', 'preferences'], { changes$: notificationChanges.asObservable() }
    );
    notificationService.unreadCount.and.returnValue(of(0));
    notificationService.mine.and.returnValue(of([]));
    notificationService.preferences.and.returnValue(of({
      inAppEnabled: true, emailEnabled: true, disabledInAppTypes: [], disabledEmailTypes: []
    }));
    inboxApi = jasmine.createSpyObj<InboxApiService>('InboxApiService', ['summaries']);
    inboxApi.summaries.and.returnValue(of([]));
    conversationMutes = jasmine.createSpyObj<ConversationMuteService>('ConversationMuteService', ['list', 'set']);
    conversationMutes.list.and.returnValue(of([]));
    privateGroups = jasmine.createSpyObj<PrivateGroupService>('PrivateGroupService', ['get']);
    privateGroups.get.and.returnValue(of({ id: 2, title: 'Grupo QA',
      members: [{ username: 'bea', displayName: 'Bea', profilePicUrl: null, admin: false }],
      creatorUsername: 'ana', createdAt: new Date().toISOString() }));

    await TestBed.configureTestingModule({
      declarations: [NavbarComponent],
      imports: TEST_IMPORTS,
      providers: [
        ...TEST_PROVIDERS,
        { provide: AuthenticationService, useValue: authService },
        { provide: MyProfileService, useValue: myProfileService },
        { provide: DirectChatRealtimeService, useValue: realtimeService },
        { provide: NotificationApiService, useValue: notificationService },
        { provide: InboxApiService, useValue: inboxApi },
        { provide: PrivateGroupService, useValue: privateGroups },
        { provide: ConversationMuteService, useValue: conversationMutes }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    document.title = originalTabTitle;
  });
  
  it('uses the approved Jynlo artwork in the navbar, not the old SVG reconstruction', () => {
    const root = fixture.nativeElement as HTMLElement;
    const logo = root.querySelector('.brand__mark') as HTMLImageElement;
    expect(logo).not.toBeNull();
    expect(logo.getAttribute('src')).toBe('/assets/jynlo-icon-approved.webp');
    expect(root.querySelector('.brand__wordmark')?.textContent?.trim()).toBe('JYNLO');
  });




  it('does not show private or group toasts for the individually muted conversation', fakeAsync(() => {
    const previous = localStorage.getItem('t');
    localStorage.setItem('t','mute-test-token');
    try {
      spyOn(document,'hasFocus').and.returnValue(true);
      spyOnProperty(document,'visibilityState','get').and.returnValue('visible');
      (authService as any).loggedInPerfilname = 'bea';
      authService.hasSessionCandidate.and.returnValue(true);
      (component as any).syncAuthenticatedState();
      conversationMutes.list.and.returnValue(of([{kind:'community',id:'35'},{kind:'private',id:'2'},
        {kind:'direct',id:'ana'}]));
      inboxApi.summaries.and.returnValue(of([{
        kind:'community', id:'35', latestMessageId:4, latestText:'Olá',
        latestSender:'ana', latestAt:new Date().toISOString(), unreadCount:1
      }]));
      communityEvents.next({id:4, communityId:35, username:'ana',kind:'CHAT',
        body:'Olá', createdAt:new Date().toISOString()});
      groupEvents.next({id:2,groupId:2,sender:'ana',text:'Olá',
        createdAt:new Date().toISOString()});
      tick(300);
      expect(component.groupToast).toBeUndefined();
      notificationService.mine.and.returnValue(of([{
        id:99,type:'CHAT_MESSAGE',read:false,relatedUsername:'ana',
        message:'Olá',createdAt:new Date().toISOString()
      } as any]));
      incomingMessages.next({id:99,username1:'ana',username2:'bea',text:'Olá'});
      tick(300);
      expect(component.chatToast).toBeUndefined();
    } finally {
      component.ngOnDestroy();
      if(previous===null)localStorage.removeItem('t');
      else localStorage.setItem('t',previous);
    }
  }));

  it('shows authorized community messages in PT and opens the correct conversation', fakeAsync(() => {
    const previous = localStorage.getItem('t');
    localStorage.setItem('t', 'group-test-token');
    try {
      spyOn(document, 'hasFocus').and.returnValue(true);
      spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
      (authService as any).loggedInPerfilname = 'bea';
      authService.hasSessionCandidate.and.returnValue(true);
      (component as any).syncAuthenticatedState();
      inboxApi.summaries.and.returnValue(of([{
        kind: 'community', id: '35', latestMessageId: 102, latestText: 'Olá',
        latestSender: 'ana', latestAt: new Date().toISOString(), unreadCount: 1
      }]));
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      communityEvents.next({
        id: 102, communityId: 35, username: 'ana',
        kind: 'CHAT', body: 'Olá', createdAt: new Date().toISOString()
      });
      tick(300);
      fixture.detectChanges();
      const toast: HTMLElement = fixture.nativeElement.querySelector('.jynlo-chat-toast');
      expect(toast?.textContent).toContain('Comunidade · mensagem de ana');
      expect(toast?.textContent).toContain('Olá');
      component.openGroupToast();
      expect(navigate).toHaveBeenCalledWith(['/menu/messages'], {
        queryParams: { kind: 'community', id: '35' }
      });
      communityEvents.next({ id: 102, communityId: 35, username: 'ana',
        kind: 'CHAT', body: 'Olá', createdAt: new Date().toISOString() });
      tick(300);
      expect(component.groupToast).toBeUndefined();
      expect(inboxApi.summaries).toHaveBeenCalledTimes(1);
    } finally {
      component.ngOnDestroy();
      if (previous === null) localStorage.removeItem('t');
      else localStorage.setItem('t', previous);
    }
  }));

  it('requires unread membership and notification opt-in for session alerts', fakeAsync(() => {
    const previous = localStorage.getItem('t');
    localStorage.setItem('t', 'group-test-token');
    try {
      spyOn(document, 'hasFocus').and.returnValue(true);
      spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
      (authService as any).loggedInPerfilname = 'bea';
      authService.hasSessionCandidate.and.returnValue(true);
      (component as any).syncAuthenticatedState();
      const event = {id: 73, sessionId: 18, senderUsername: 'ana',
        body: 'O jogo começa às 18h', createdAt: new Date().toISOString()};
      inboxApi.summaries.and.returnValue(of([{
        kind: 'session', id: '18', latestMessageId: 73, latestText: event.body,
        latestSender: 'ana', latestAt: new Date().toISOString(), unreadCount: 0
      }]));
      sessionEvents.next(event); tick(300);
      expect(component.groupToast).toBeUndefined();
      inboxApi.summaries.and.returnValue(of([{
        kind: 'session', id: '18', latestMessageId: 73, latestText: event.body,
        latestSender: 'ana', latestAt: new Date().toISOString(), unreadCount: 1
      }]));
      notificationService.preferences.and.returnValue(of({
        inAppEnabled: true, emailEnabled: true,
        disabledInAppTypes: ['CHAT_MESSAGE'], disabledEmailTypes: []
      }));
      sessionEvents.next(event); tick(300);
      expect(component.groupToast).toBeUndefined();
      notificationService.preferences.and.returnValue(of({
        inAppEnabled: true, emailEnabled: true,
        disabledInAppTypes: [], disabledEmailTypes: []
      }));
      sessionEvents.next(event); tick(300);
      expect(component.groupToast?.kind).toBe('session');
      expect(component.groupToastMessage(component.groupToast!)).toContain('O jogo');
    } finally {
      component.ngOnDestroy();
      if (previous === null) localStorage.removeItem('t');
      else localStorage.setItem('t', previous);
    }
  }));

  it('revalidates private group membership and links to the group conversation', fakeAsync(() => {
    const previous = localStorage.getItem('t');
    localStorage.setItem('t', 'group-test-token');
    try {
      spyOn(document, 'hasFocus').and.returnValue(true);
      spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
      (authService as any).loggedInPerfilname = 'bea';
      authService.hasSessionCandidate.and.returnValue(true);
      (component as any).syncAuthenticatedState();
      privateGroups.get.and.returnValue(of({ id: 2, title: 'Equipa Futsal',
        members: [], creatorUsername: 'ana', createdAt: new Date().toISOString() }));
      groupEvents.next({id: 77, groupId: 2, sender: 'ana', text: 'Bora!',
        createdAt: new Date().toISOString()});
      tick(300);
      expect(component.groupToast).toBeUndefined();
      privateGroups.get.and.returnValue(of({id: 2, title: 'Equipa Futsal',
        members: [{username:'bea', displayName:'Bea', profilePicUrl:null,admin:false}],
        creatorUsername:'ana', createdAt:new Date().toISOString()}));
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      groupEvents.next({id: 77, groupId: 2, sender: 'ana', text: 'Bora!',
        createdAt: new Date().toISOString()});
      tick(300);
      expect(component.groupToast?.title).toBe('Equipa Futsal');
      component.openGroupToast();
      expect(navigate).toHaveBeenCalledWith(['/menu/groups'], {queryParams:{id:2}});
    } finally {
      component.ngOnDestroy();
      if (previous === null) localStorage.removeItem('t');
      else localStorage.setItem('t', previous);
    }
  }));

  it('shows only confirmed, eligible incoming media alerts and opens the right chat', fakeAsync(() => {
    const oldToken = localStorage.getItem('t');
    localStorage.setItem('t', 'qa-notification-token');
    try {
      spyOn(document, 'hasFocus').and.returnValue(true);
      spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
      (authService as any).loggedInPerfilname = 'bea';
      authService.hasSessionCandidate.and.returnValue(true);
      (component as any).syncAuthenticatedState();
      const incoming = { id: 82, username1: 'ana', username2: 'bea',
        text: '📎 private-filename.jpg', attachmentMimeType: 'image/jpeg' };
      const alert = { id: 404, type: 'CHAT_MESSAGE', read: false,
        relatedUsername: 'ana', message: '🖼️ Fotografia',
        createdAt: new Date().toISOString() };
      notificationService.mine.and.returnValue(of([alert as any]));
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      incomingMessages.next(incoming);
      tick(300);
      fixture.detectChanges();
      const toast = fixture.nativeElement.querySelector('.jynlo-chat-toast') as HTMLElement;
      expect(toast?.textContent).toContain('Nova mensagem de ana');
      expect(toast?.textContent).toContain('ana enviou-te uma fotografia');
      expect(toast?.textContent).not.toContain('private-filename');
      expect(toast?.querySelector('.jynlo-chat-toast__open')).toBeTruthy();
      component.openChatToast();
      expect(navigate).toHaveBeenCalledWith(['/menu/messages'], {
        queryParams: { kind: 'direct', id: 'ana' }
      });
      expect(component.chatToast).toBeUndefined();
      incomingMessages.next(incoming);
      tick(300);
      expect(component.chatToast).toBeUndefined();
      expect(notificationService.mine).toHaveBeenCalledTimes(2);
    } finally {
      component.ngOnDestroy();
      if (oldToken === null) localStorage.removeItem('t');
      else localStorage.setItem('t', oldToken);
    }
  }));

  it('does not show muted or unconfirmed notices and rejects edits, echoes and stale accounts', fakeAsync(() => {
    const oldToken = localStorage.getItem('t');
    localStorage.setItem('t', 'qa-notification-token');
    try {
      spyOn(document, 'hasFocus').and.returnValue(true);
      spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
      (authService as any).loggedInPerfilname = 'bea';
      authService.hasSessionCandidate.and.returnValue(true);
      (component as any).syncAuthenticatedState();
      const msg = { id: 90, username1: 'ana', username2: 'bea', text: 'Olá!' };
      notificationService.mine.and.returnValue(of([]));
      incomingMessages.next(msg); tick(300);
      expect(component.chatToast).toBeUndefined();
      incomingMessages.next({...msg, editedAt: new Date().toISOString()}); tick(300);
      incomingMessages.next({...msg, username1: 'bea', username2: 'ana'}); tick(300);
      expect(notificationService.mine).toHaveBeenCalledTimes(1);
      const incomingAlert = {id: 90, type: 'CHAT_MESSAGE', relatedUsername: 'ana',
        message: 'Olá!', read: false, createdAt: new Date().toISOString()};
      notificationService.mine.and.returnValue(of([incomingAlert as any]));
      (authService as any).loggedInPerfilname = 'outro';
      incomingMessages.next(msg); tick(300);
      expect(component.chatToast).toBeUndefined();
      expect(notificationService.mine).toHaveBeenCalledTimes(1);
    } finally {
      component.ngOnDestroy();
      if (oldToken === null) localStorage.removeItem('t');
      else localStorage.setItem('t', oldToken);
    }
  }));

  it('keeps the essential actions in the main nav and secondary actions in the menu', () => {
    component.authenticated = true;
    fixture.detectChanges();

    const nav: HTMLElement = fixture.nativeElement.querySelector('.site-nav__links');
    const primaryLinks = Array.from(nav.querySelectorAll<HTMLAnchorElement>(
      ':scope > a.desktop-primary-link'
    )).map(anchor => anchor.getAttribute('href'));
    expect(primaryLinks).toEqual(['/menu/feed', '/menu/createEvent']);
    expect(nav.querySelector('a[href="/menu/discover"]')).toBeTruthy();
    expect(nav.querySelector(':scope > a.nav-activities-link[href="/menu/events"]')).toBeTruthy();
    expect(nav.querySelector('.feed-v3-top-search')).toBeNull();
    expect(nav.querySelector(':scope > a.nav-communities-link[href="/menu/communities"]')).toBeTruthy();
    expect(nav.querySelector('a[href="/menu/notifications"]')).toBeTruthy();

    const menu = nav.querySelector('details.account-menu');
    expect(menu?.querySelector('a[href="/menu/my-sessions"]')).toBeTruthy();
    expect(menu?.querySelector('a[href="/menu/communities"]')).toBeFalsy();
    expect(menu?.querySelector('a[href="/menu/messages"]')).toBeTruthy();
    expect(menu?.querySelector('a[href="/menu/dadosPerfil"]')).toBeTruthy();
    expect(menu?.querySelector('.language-switch')).toBeTruthy();
    expect(menu?.querySelector('.logout-action')).toBeTruthy();
  });

  it('keeps a single direct Communities link when authenticated', () => {
    component.authenticated = true;
    fixture.detectChanges();

    const nav: HTMLElement = fixture.nativeElement.querySelector('.site-nav__links');
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href="/menu/communities"]'));
    expect(links.length).toBe(1);
    expect(links[0].classList.contains('nav-communities-link')).toBeTrue();
    expect(links[0].closest('.account-menu')).toBeNull();
  });

  it('uses the shared pill shape for the account menu without losing toggle behaviour', () => {
    component.authenticated = true;
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('details.account-menu') as HTMLDetailsElement;
    const trigger = menu.querySelector('summary') as HTMLElement;

    expect(trigger.classList.contains('jynlo-action')).toBeTrue();
    expect(trigger.classList.contains('jynlo-action--neutral')).toBeTrue();
    expect(menu.open).toBeFalse();

    trigger.click();
    fixture.detectChanges();
    expect(menu.open).toBeTrue();

    trigger.click();
    fixture.detectChanges();
    expect(menu.open).toBeFalse();
  });

  it('closes the account menu when Escape is pressed', () => {
    component.authenticated = true;
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('details.account-menu') as HTMLDetailsElement;
    expect(menu).toBeTruthy();
    menu.open = true;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true
    }));
    fixture.detectChanges();

    expect(menu.open).toBeFalse();
  });

  it('keeps the main CTA and logout aligned without styling language toggles as pills', () => {
    component.authenticated = true;
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const createAction = root.querySelector('a.nav-create-action');
    const logoutAction = root.querySelector('button.logout-action');
    const languageToggles = root.querySelectorAll('.language-switch button');

    expect(createAction?.classList.contains('jynlo-action')).toBeTrue();
    expect(createAction?.classList.contains('jynlo-action--accent')).toBeTrue();
    expect(logoutAction?.classList.contains('jynlo-action')).toBeTrue();
    expect(logoutAction?.classList.contains('jynlo-action--danger')).toBeTrue();
    expect(languageToggles.length).toBe(2);
    languageToggles.forEach(button => expect(button.classList.contains('jynlo-action')).toBeFalse());
  });

  it('uses matching pill geometry for register and login without changing language toggles', () => {
    const root: HTMLElement = fixture.nativeElement;
    const register = root.querySelector('a.register-link') as HTMLAnchorElement;
    const login = root.querySelector('a.login-link') as HTMLAnchorElement;

    expect(register.getAttribute('href')).toBe('/login/registerNewUser');
    expect(login.getAttribute('href')).toBe('/login');
    expect(register.classList.contains('jynlo-action')).toBeTrue();
    expect(login.classList.contains('jynlo-action')).toBeTrue();
    expect(register.classList.contains('jynlo-action--accent')).toBeTrue();
    expect(login.classList.contains('jynlo-action--neutral')).toBeTrue();

    const languageToggles = root.querySelectorAll('.language-switch button');
    expect(languageToggles.length).toBe(2);
    languageToggles.forEach(button => expect(button.classList.contains('jynlo-action')).toBeFalse());
  });

  it('enables logout again after logging out and signing in without refreshing the SPA', () => {
    const logoutResponse = new Subject<void>();
    authService.terminarSessao.and.returnValue(logoutResponse.asObservable());

    // The app keeps the same NavbarComponent mounted across route changes.
    component.authenticated = true;
    fixture.detectChanges();

    let button = fixture.nativeElement.querySelector('.logout-action') as HTMLButtonElement;
    expect(button.disabled).toBeFalse();

    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBeTrue();
    expect(component.loggingOut).toBeTrue();
    expect(authService.terminarSessao).toHaveBeenCalledTimes(1);

    logoutResponse.next();
    logoutResponse.complete();
    expect(authService.logOut).toHaveBeenCalledTimes(1);

    // The router reaches /login after AuthenticationService has cleared the JWT.
    authService.hasSessionCandidate.and.returnValue(false);
    (component as any).syncAuthenticatedState();
    expect(component.loggingOut).toBeFalse();

    // A new login arrives without refreshing or replacing the navbar instance.
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    fixture.detectChanges();

    button = fixture.nativeElement.querySelector('.logout-action') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.disabled).toBeFalse();
    expect(component.loggingOut).toBeFalse();
  });

  it('shows an unread notification count in the browser tab and clears it after reading', () => {
    notificationService.unreadCount.and.returnValues(of(7), of(6), of(0));
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    expect(component.unreadNotifications).toBe(7);
    expect(document.title).toBe('Jynlo (7) — Join the game.');

    notificationChanges.next();
    expect(document.title).toBe('Jynlo (6) — Join the game.');

    notificationChanges.next();
    expect(component.unreadNotifications).toBe(0);
    expect(document.title).toBe('Jynlo — Join the game.');
  });

  it('uses the same 99+ cap for the browser tab as the navigation badge', () => {
    notificationService.unreadCount.and.returnValue(of(158));
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    fixture.detectChanges();
    expect(component.unreadNotifications).toBe(158);
    expect(document.title).toBe('Jynlo (99+) — Join the game.');
    expect(fixture.nativeElement.querySelector('.notification-badge')?.textContent).toContain('99+');
  });

  it('clears the tab count on logout and ignores later notification changes', () => {
    notificationService.unreadCount.and.returnValue(of(4));
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    expect(document.title).toBe('Jynlo (4) — Join the game.');

    authService.hasSessionCandidate.and.returnValue(false);
    (component as any).syncAuthenticatedState();
    expect(document.title).toBe('Jynlo — Join the game.');
    notificationChanges.next();
    expect(document.title).toBe('Jynlo — Join the game.');
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(1);
  });

  it('keeps the confirmed tab count after a network error or old response', () => {
    const pending = new Subject<number>();
    notificationService.unreadCount.and.returnValues(
      of(3), pending.asObservable(), throwError(() => new Error('Offline'))
    );
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    expect(document.title).toBe('Jynlo (3) — Join the game.');

    component.loadUnreadNotifications();
    component.loadUnreadNotifications();
    pending.next(99);
    pending.complete();
    expect(component.unreadNotifications).toBe(3);
    expect(document.title).toBe('Jynlo (3) — Join the game.');
  });

  it('refreshes the tab count when returning from another browser tab', () => {
    notificationService.unreadCount.and.returnValues(of(5), of(1));
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    expect(document.title).toBe('Jynlo (5) — Join the game.');
    window.dispatchEvent(new Event('focus'));
    expect(document.title).toBe('Jynlo (1) — Join the game.');
  });

  it('updates the badge immediately on confirmed changes without navigating', () => {
    notificationService.unreadCount.and.returnValues(of(4), of(3), of(0));
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    expect(component.unreadNotifications).toBe(4);

    notificationChanges.next();
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(2);
    expect(component.unreadNotifications).toBe(3);

    notificationChanges.next();
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(3);
    expect(component.unreadNotifications).toBe(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notification-badge')).toBeNull();
    component.ngOnDestroy();
  });

  it('ignores notification-change events after logout', () => {
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(1);

    authService.hasSessionCandidate.and.returnValue(false);
    (component as any).syncAuthenticatedState();
    notificationChanges.next();

    expect(component.unreadNotifications).toBe(0);
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it('keeps the badge hidden for muted chat even when realtime messages arrive', fakeAsync(() => {
    authService.hasSessionCandidate.and.returnValue(true);
    // Server respects CHAT_MESSAGE opt-out and says there are no visible alerts.
    notificationService.unreadCount.and.returnValue(of(0));
    (component as any).syncAuthenticatedState();
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(1);

    incomingMessages.next({ id: 10 });
    incomingMessages.next({ id: 11 });
    incomingMessages.next({ id: 12 });
    expect(component.unreadNotifications).toBe(0);
    tick(299);
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(1);
    tick(1);

    // One coalesced refresh, never an optimistic +3.
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(2);
    expect(component.unreadNotifications).toBe(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notification-badge')).toBeNull();
    component.ngOnDestroy();
  }));

  it('reflects actual server counts and discards obsolete in-flight responses', fakeAsync(() => {
    const pendingOldResponse = new Subject<number>();
    notificationService.unreadCount.and.returnValues(
      pendingOldResponse.asObservable(), of(2), of(3)
    );
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    incomingMessages.next({ id: 20 });
    tick(300);
    expect(component.unreadNotifications).toBe(2);

    // Late results from the earlier HTTP request must not replace fresh data.
    pendingOldResponse.next(99);
    pendingOldResponse.complete();
    expect(component.unreadNotifications).toBe(2);

    incomingMessages.next({ id: 21 });
    tick(300);
    expect(component.unreadNotifications).toBe(3);
    expect(notificationService.unreadCount).toHaveBeenCalledTimes(3);
    component.ngOnDestroy();
  }));

  it('keeps the last confirmed badge on a temporary unread endpoint failure', () => {
    authService.hasSessionCandidate.and.returnValue(true);
    notificationService.unreadCount.and.returnValues(
      of(4), throwError(() => new Error('Network offline'))
    );
    (component as any).syncAuthenticatedState();
    expect(component.unreadNotifications).toBe(4);
    component.loadUnreadNotifications();
    expect(component.unreadNotifications).toBe(4);
    component.ngOnDestroy();
  });

  it('should create without opening a chat connection when unauthenticated', () => {
    expect(component).toBeTruthy();
    expect(authService.hasSessionCandidate).toHaveBeenCalled();
    expect(component.authenticated).toBeFalse();
    expect(realtimeService.connect).not.toHaveBeenCalled();
    expect(realtimeService.disconnect).toHaveBeenCalled();
  });
  it('shows the active account username in the navigation and full identity in the dropdown', () => {
    (authService as any).loggedInPerfilname = 'bea';
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    fixture.detectChanges();
    const trigger: HTMLElement = fixture.nativeElement.querySelector('.account-identity-trigger');
    expect(trigger).not.toBeNull();
    expect(trigger.textContent).not.toContain('Conta ativa');
    expect(trigger.textContent).toContain('Bea');
    expect(trigger.getAttribute('aria-label')).toContain('Bea');
    expect(fixture.nativeElement.querySelector('.account-identity-avatar')?.textContent?.trim()).toBe('B');
    expect(fixture.nativeElement.querySelector('.account-menu__identity')?.textContent).toContain('Bea');
    expect(myProfileService.get).toHaveBeenCalledTimes(1);

    const details: HTMLDetailsElement = fixture.nativeElement.querySelector('.account-menu');
    details.open = true;
    fixture.detectChanges();
    expect(details.textContent).not.toContain('Trocar de conta');
    expect(details.querySelectorAll('.logout-action').length).toBe(1);
    expect(details.querySelector('a[href="/menu/dadosPerfil"]')?.textContent).toContain('Ver o meu perfil');
    expect(details.querySelector('.language-switch')).not.toBeNull();
  });

  it('shows a real profile photo when available, otherwise the username initials', () => {
    myProfileService.get.and.returnValue(of({
      username:'bea',nickname:'Beatriz Martins',
      fullName:'Beatriz Martins',profilePicUrl:'/media/profiles/bea.png'
    } as any));
    (authService as any).loggedInPerfilname = 'bea';
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('.account-identity-trigger img') as HTMLImageElement;
    expect(image).not.toBeNull();
    expect(image.getAttribute('src')).toContain('/media/profiles/bea.png');
    expect(image.alt).toBe('');
    expect(fixture.nativeElement.querySelector('.account-menu__identity-copy')?.textContent)
      .toContain('Beatriz Martins');
  });

  it('clears the previous account immediately and rejects stale profile responses', () => {
    const old = new Subject<any>();
    myProfileService.get.and.returnValues(old.asObservable(), of({
      username:'miguel_alt',nickname:'Outro perfil',fullName:null,
      profilePicUrl:'/media/profiles/alternate.png'
    } as any));
    (authService as any).loggedInPerfilname = 'bea';
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    fixture.detectChanges();
    // While the profile request is pending, show the authenticated username,
    // not a guessed/capitalized nickname from an earlier account.
    expect(fixture.nativeElement.querySelector('.account-identity-copy')?.textContent?.trim()).toBe('bea');

    (authService as any).loggedInPerfilname = 'miguel_alt';
    (component as any).syncAuthenticatedState();
    old.next({username:'bea',nickname:'Conta antiga',profilePicUrl:'/media/profiles/old.png'});
    fixture.detectChanges();
    const trigger: HTMLElement = fixture.nativeElement.querySelector('.account-identity-trigger');
    expect(trigger.textContent).toContain('Outro perfil');
    expect(trigger.textContent).not.toContain('Bea');
    expect(fixture.nativeElement.querySelector('.account-menu__identity-copy')?.textContent).toContain('Outro perfil');
    expect(fixture.nativeElement.querySelector('.account-menu__identity-copy')?.textContent).not.toContain('Conta antiga');
    expect(myProfileService.get).toHaveBeenCalledTimes(2);

    authService.hasSessionCandidate.and.returnValue(false);
    (component as any).syncAuthenticatedState();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-menu')).toBeNull();
    expect(component.accountProfile).toBeNull();
  });

  it('keeps the identity visible when profile retrieval fails, without leaking previous data', () => {
    myProfileService.get.and.returnValue(throwError(() => new Error('Offline')));
    (authService as any).loggedInPerfilname = 'alternate';
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-identity-trigger')?.textContent).toContain('alternate');
    expect(fixture.nativeElement.querySelector('.account-identity-avatar')?.textContent?.trim()).toBe('A');
    expect(component.accountProfile).toBeNull();
  });

  it('offers a single logout action instead of two identical account switching controls', () => {
    (authService as any).loggedInPerfilname = 'bea';
    authService.hasSessionCandidate.and.returnValue(true);
    (component as any).syncAuthenticatedState();
    fixture.detectChanges();
    const details: HTMLDetailsElement = fixture.nativeElement.querySelector('.account-menu');
    details.open = true;
    expect(details.querySelectorAll('.logout-action').length).toBe(1);
    expect(details.querySelector('.account-menu__switch')).toBeNull();
    expect(details.textContent).not.toContain('Trocar de conta');
    const button: HTMLButtonElement = details.querySelector('.logout-action')!;
    button.click();
    expect(authService.terminarSessao).toHaveBeenCalledTimes(1);
    expect(authService.logOut).toHaveBeenCalledTimes(1);
    expect(component.loggingOut).toBeTrue();
  });


});
