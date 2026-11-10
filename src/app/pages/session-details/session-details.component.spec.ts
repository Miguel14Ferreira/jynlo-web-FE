import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { SessionDetailsComponent } from './session-details.component';
import { CommunityService } from '../../services/community.service';
import { DirectChatService } from '../../services/direct-chat.service';
import { SessionService } from '../../services/session.service';
import { ReliabilityService } from '../../services/reliability.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { ChatReadSyncService } from '../../services/chat-read-sync.service';
import { SessionMessage } from '../model/session-message';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';
import { ChatReactionsStubComponent } from '../../testing/chat-reactions-stub.component';
import { I18nService } from '../../i18n/i18n.service';

describe('SessionDetailsComponent', () => {
  let component: SessionDetailsComponent;
  let fixture: ComponentFixture<SessionDetailsComponent>;
  let sessionService: jasmine.SpyObj<SessionService>;
  let communityService: jasmine.SpyObj<CommunityService>;
  let directChatService: jasmine.SpyObj<DirectChatService>;
  let reliabilityService: jasmine.SpyObj<ReliabilityService>;
  let realtimeService: jasmine.SpyObj<DirectChatRealtimeService>;
  let realtimeSessionMessages: Subject<SessionMessage>;
  let realtimeConnected: BehaviorSubject<boolean>;
  let readSync: jasmine.SpyObj<ChatReadSyncService>;

  const session = {
    id: 7,
    sport: 'Padel',
    city: 'Lisboa',
    gameDate: '2026-10-01T18:00:00Z',
    distanceKm: null,
    participantCount: 2,
    maxParticipants: 4,
    priceAmount: 5,
    privateGame: false,
    status: 'OPEN',
    creatorUsername: 'creator-user',
    address: null,
    canSeeExactAddress: false,
    joined: false,
    waitlisted: false,
    waitlistPosition: null,
    gamePhoto: null
  };

  /** Private rating controls are available only to confirmed session attendees. */
  function confirmRatingAttendance(username?: string): void {
    const identity = username ?? (component as any).currentUsername ?? 'player-one';
    (component as any).currentUsername = identity;
    component.sessionParticipants = [{
      id: 15,
      username: identity,
      attendanceStatus: 'ATTENDED',
      joinedAt: '2026-09-20T18:00:00Z'
    }];
  }

  beforeEach(async () => {
    readSync = jasmine.createSpyObj<ChatReadSyncService>('ChatReadSyncService', ['markVisible']);
    communityService = jasmine.createSpyObj<CommunityService>('CommunityService', ['friends']);
    communityService.friends.and.returnValue(of([{username:'player-two', fullName: 'Player Two', nickname: null, profilePicUrl: null, chatBlocked: false, blockedByMe: false}]));
    directChatService = jasmine.createSpyObj<DirectChatService>('DirectChatService', ['send']);
    directChatService.send.and.returnValue(of({} as any));
    sessionService = jasmine.createSpyObj<SessionService>(
      'SessionService',
      ['detail', 'context', 'postGameCommunities', 'joinCommunityAfterGame', 'updateMeetingPoint', 'updateCapacity', 'updateDetails', 'join', 'leave', 'cancel', 'complete', 'reportDidNotOccur', 'reportProblem', 'messages', 'postMessage', 'participants', 'removeParticipant', 'teamSuggestion', 'confirmTeams', 'futureExclusionStatus', 'excludeFromFutureSessions', 'allowFutureSessions', 'myOverallRating', 'rateOverall', 'myVenueRating', 'rateVenue', 'sentCompliments', 'receivedCompliments', 'giveCompliment', 'issueGuestLink', 'guestRequests', 'confirmedGuests', 'reviewGuestRequest', 'cancelGuestRequest']
    );
    sessionService.detail.and.returnValue(of(session));
    sessionService.context.and.returnValue(of({communities:[],seasonGame:false,seasonName:null}));
    sessionService.postGameCommunities.and.returnValue(of([]));
    sessionService.joinCommunityAfterGame.and.returnValue(of({communityId:22,state:'REQUESTED'}));
    sessionService.guestRequests.and.returnValue(of([]));
    sessionService.confirmedGuests.and.returnValue(of([]));
    sessionService.issueGuestLink.and.returnValue(of({token:'T'.repeat(43)}));
    sessionService.cancelGuestRequest.and.returnValue(of({id:30,name:'Convidado',status:'CANCELLED',note:'',teamCode:null}));
    sessionService.join.and.returnValue(of({
      state: 'PARTICIPANT',
      waitlistPosition: null
    }));
    sessionService.leave.and.returnValue(of(void 0));
    sessionService.cancel.and.returnValue(of(void 0));
    sessionService.updateMeetingPoint.and.returnValue(of({
      ...session, canSeeExactAddress: true, meetingPointInstructions: 'Novo portão'
    }));
    sessionService.updateCapacity.and.returnValue(of({ ...session, maxParticipants: 6 }));
    sessionService.updateDetails.and.returnValue(of({ ...session, maxParticipants: 6 }));
    sessionService.complete.and.returnValue(of(void 0));
    sessionService.reportDidNotOccur.and.returnValue(of(void 0));
    sessionService.reportProblem.and.returnValue(of(void 0));
    sessionService.removeParticipant.and.returnValue(of(void 0));
    sessionService.futureExclusionStatus.and.returnValue(of({ excluded: false }));
    sessionService.excludeFromFutureSessions.and.returnValue(of({ excluded: true }));
    sessionService.allowFutureSessions.and.returnValue(of({ excluded: false }));
    sessionService.myOverallRating.and.returnValue(of(null));
    sessionService.myVenueRating.and.returnValue(of(null));
    sessionService.rateVenue.and.returnValue(of({
      venueId: 100, score: 4, updatedAt: '2026-10-22T10:00:00Z'
    }));
    sessionService.rateOverall.and.returnValue(of({
      overallScore: 5, updatedAt: '2026-10-13T10:00:00Z'
    }));
    sessionService.sentCompliments.and.returnValue(of([]));
    sessionService.receivedCompliments.and.returnValue(of([]));
    sessionService.giveCompliment.and.returnValue(of({
      senderUsername: 'player-one',
      recipientUsername: 'player-two',
      type: 'FAIR_PLAY',
      updatedAt: '2026-10-22T10:00:00Z'
    }));
    sessionService.messages.and.returnValue(of([]));
    sessionService.participants.and.returnValue(of([
      {
        id: 15,
        username: 'player-one',
        attendanceStatus: 'PENDING',
        joinedAt: '2026-09-20T18:00:00Z'
      }
    ]));
    sessionService.teamSuggestion.and.returnValue(of({
      teamA: [
        { username: 'creator-user', strengthScore: 2.8, statsAvailable: true, games: 8, wins: 5, goals: 6, assists: 2 }
      ],
      teamB: [
        { username: 'player-one', strengthScore: 2.7, statsAvailable: true, games: 8, wins: 4, goals: 7, assists: 1 }
      ],
      teamAScore: 2.8,
      teamBScore: 2.7,
      playersWithStats: 2,
      totalPlayers: 2
    }));
    sessionService.confirmTeams.and.returnValue(of({
      teamA: [
        { username: 'creator-user', strengthScore: 2.8, statsAvailable: true, games: 8, wins: 5, goals: 6, assists: 2 }
      ],
      teamB: [
        { username: 'player-one', strengthScore: 2.7, statsAvailable: true, games: 8, wins: 4, goals: 7, assists: 1 }
      ],
      teamAScore: 2.8,
      teamBScore: 2.7,
      playersWithStats: 2,
      totalPlayers: 2
    }));
    sessionService.postMessage.and.returnValue(of({
      id: 1,
      sessionId: 7,
      senderUsername: 'fixture-user',
      body: 'Bora jogar!',
      createdAt: '2026-10-01T16:00:00Z'
    }));

    reliabilityService = jasmine.createSpyObj<ReliabilityService>(
      'ReliabilityService',
      ['summary', 'recordAttendance']
    );
    reliabilityService.summary.and.returnValue(of({
      attendanceRate: 90,
      completedSessions: 10,
      noShows: 1,
      lateCancellations: 0,
      penaltyScore: 1,
      warning: false,
      reducedPriority: false,
      joinRestricted: false
    }));
    reliabilityService.recordAttendance.and.returnValue(of(void 0));

    realtimeSessionMessages = new Subject<SessionMessage>();
    realtimeConnected = new BehaviorSubject<boolean>(false);
    realtimeService = jasmine.createSpyObj<DirectChatRealtimeService>(
      'DirectChatRealtimeService',
      ['connect', 'disconnect'],
      {
        sessionMessages$: realtimeSessionMessages.asObservable(),
        connected$: realtimeConnected.asObservable()
      }
    );

    await TestBed.configureTestingModule({
      declarations: [SessionDetailsComponent],
      imports: [...TEST_IMPORTS, ChatReactionsStubComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: ChatReadSyncService, useValue: readSync },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: '7' }),
              queryParamMap: convertToParamMap({})
            }
          }
        },
        {
          provide: SessionService,
          useValue: sessionService
        },
        { provide: CommunityService, useValue: communityService },
        { provide: DirectChatService, useValue: directChatService },
        {
          provide: ReliabilityService,
          useValue: reliabilityService
        },
        {
          provide: DirectChatRealtimeService,
          useValue: realtimeService
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SessionDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not display an unknown Airsoft format from the API', () => {
    component.session = {
      ...session, sport: 'Airsoft',
      airsoftGameType: 'UNRECOGNIZED' as any,
      canSeeExactAddress: false
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#session-airsoft-game-type')).toBeNull();
    expect(fixture.nativeElement.querySelector('#session-meeting-point')).toBeNull();
  });

  it('shows a public Airsoft game type without exposing private meeting instructions', () => {
    component.session = {
      ...session, sport: 'Airsoft', airsoftGameType: 'MILSIM',
      canSeeExactAddress: false, meetingPointInstructions: null
    };
    fixture.detectChanges();
    const gameType = fixture.nativeElement.querySelector('#session-airsoft-game-type') as HTMLElement;
    expect(gameType).not.toBeNull();
    expect(gameType.textContent).toContain('MilSim');
    expect(fixture.nativeElement.querySelector('#session-meeting-point')).toBeNull();
  });

  it('shows the Airsoft game type to viewers allowed to see session instructions', () => {
    component.session = {
      ...session, sport: 'Airsoft', canSeeExactAddress: true,
      address: 'Campo autorizado', meetingPointInstructions: 'Airsoft: MilSim · Entrada principal'
    };
    fixture.detectChanges();
    const note = fixture.nativeElement.querySelector('#session-meeting-point') as HTMLElement;
    expect(note).not.toBeNull();
    expect(note.textContent).toContain('Airsoft: MilSim');
    expect(note.textContent).toContain('Entrada principal');

    component.session = { ...component.session, canSeeExactAddress: false };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#session-meeting-point')).toBeNull();
  });

  it('offers optional community membership only after completed, verified attendance', () => {
    (component as any).currentUsername='player-one';
    component.session={...session,status:'COMPLETED',joined:true};
    sessionService.postGameCommunities.and.returnValue(of([
      {id:22,name:'Futsal da Parede',requiresApproval:true},
      {id:23,name:'Amigos do futebol',requiresApproval:false}
    ]));
    (component as any).loadPostGameCommunities(session.id);
    fixture.detectChanges();
    const card=fixture.nativeElement.querySelector('.session-post-game-community') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Futsal da Parede');
    expect(card.textContent).toContain('Amigos do futebol');
    expect(card.querySelectorAll('.session-post-game-community-option').length).toBe(2);
    expect(card.textContent).toContain('Pedir para aderir');
    expect(card.textContent).toContain('Juntar-me à comunidade');
  });

  it('uses the backend action and closes only the selected community offer', () => {
    (component as any).currentUsername='player-one';
    component.session={...session,status:'COMPLETED',joined:true};
    component.postGameCommunities=[
      {id:22,name:'Futsal da Parede',requiresApproval:true},
      {id:23,name:'Amigos do futebol',requiresApproval:false}
    ];
    sessionService.joinCommunityAfterGame.and.returnValue(of({communityId:22,state:'REQUESTED'}));
    fixture.detectChanges();
    const first=fixture.nativeElement.querySelector('.session-post-game-community-option button') as HTMLButtonElement;
    first.click();
    fixture.detectChanges();
    expect(sessionService.joinCommunityAfterGame).toHaveBeenCalledOnceWith(session.id,22);
    expect(component.postGameCommunities.map(x=>x.id)).toEqual([23]);
    expect(component.postGameCommunityFeedback).toContain('Pedido enviado');
  });

  it('dismisses post-game community suggestion without making any membership request', () => {
    (component as any).currentUsername='player-one';
    component.session={...session,status:'COMPLETED',joined:true};
    component.postGameCommunities=[{id:122,name:'Jogos semanais',requiresApproval:true}];
    fixture.detectChanges();
    const noThanks=fixture.nativeElement.querySelectorAll('.session-post-game-community-option button')[1] as HTMLButtonElement;
    noThanks.click();
    fixture.detectChanges();
    expect(component.postGameCommunities).toEqual([]);
    expect(sessionService.joinCommunityAfterGame).not.toHaveBeenCalled();
    try { localStorage.removeItem('jynlo:postgame-community-dismiss:player-one:'+session.id+':122'); }
    catch { /* Browser blocks storage in some test runners. */ }
  });

  it('returns to Discover with original filters without forwarding join action', () => {
    const route = TestBed.inject(ActivatedRoute);
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({
        from: 'discover', sport: 'Ténis', city: 'Sintra', player: 'Ana', join: '1'
      })
    });
    fixture.detectChanges();

    const back = fixture.nativeElement.querySelector('.back-link') as HTMLAnchorElement;
    const url = new URL(back.getAttribute('href')!, 'https://jynlo.test');
    expect(url.pathname).toBe('/menu/discover');
    expect(url.searchParams.get('sport')).toBe('Ténis');
    expect(url.searchParams.get('city')).toBe('Sintra');
    expect(url.searchParams.get('player')).toBe('Ana');
    expect(url.searchParams.has('join')).toBeFalse();
    expect(back.textContent).toContain('Voltar ao Descobrir');
    expect(sessionService.join).not.toHaveBeenCalled();
  });

  it('ignores untrusted return origins and keeps the default sessions destination', () => {
    const route = TestBed.inject(ActivatedRoute);
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({
        from: 'https://untrusted.example/', sport: 'Ténis', join: '1'
      })
    });
    fixture.detectChanges();
    const back = fixture.nativeElement.querySelector('.back-link') as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/menu/events');
    expect(back.textContent).toContain('Voltar às sessões');
    expect(sessionService.join).not.toHaveBeenCalled();
  });

  it('preserves the detail card, summary facts and action toolbar under the Neon layout', () => {
    const page = fixture.nativeElement as HTMLElement;
    const shell = page.querySelector('.jynlo-session-detail-premium');
    expect(shell).not.toBeNull();
    expect(shell!.querySelector('.detail-card .detail-content')).not.toBeNull();
    expect(shell!.querySelector('.detail-card .title-row h1')?.textContent).toContain('Lisboa');
    const summary = shell!.querySelector('.detail-card .detail-grid')!;
    expect(summary).not.toBeNull();
    expect(summary.children.length).toBeGreaterThanOrEqual(4);
    expect(shell!.querySelector('.session-top-actions')).not.toBeNull();
    expect(shell!.querySelector('a.back-link[href="/menu/events"]')).not.toBeNull();
  });

  it('keeps session detail navigation and participation information inside the Premium shell', () => {
    const shell: HTMLElement = fixture.nativeElement.querySelector('.detail-page');
    expect(shell.classList.contains('jynlo-session-detail-premium')).toBeTrue();
    expect(shell.classList.contains('jynlo-games')).toBeTrue();
    expect(shell.querySelector('a.back-link[href="/menu/events"]')).toBeTruthy();
    expect(shell.querySelector('.detail-card .title-row h1')?.textContent).toContain('Lisboa');
    expect(shell.querySelector('.detail-card .detail-grid')).toBeTruthy();
    expect(shell.querySelector('.session-top-actions')).toBeTruthy();
    expect(shell.querySelector('.detail-grid')?.textContent).toContain('2/4');
  });

  it('gives back navigation and membership blocks consistent Premium breathing room', () => {
    component.session = { ...session, joined: true };
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const back = root.querySelector<HTMLElement>('.jynlo-session-detail-premium .detail-shell > .back-link');
    const membership = root.querySelector<HTMLElement>('.detail-content > .membership-status');
    const actions = root.querySelector<HTMLElement>('.detail-content > .session-top-actions');
    expect(back).not.toBeNull();
    expect(membership).not.toBeNull();
    expect(actions).not.toBeNull();
    const expected = matchMedia('(max-width: 760px)').matches ? '20px' : '24px';
    expect(getComputedStyle(back!).marginBottom).toBe(expected);
    expect(getComputedStyle(membership!).marginTop).toBe(expected);
    expect(getComputedStyle(actions!).marginTop).toBe(expected);
  });

  it('retains confirmed and waitlisted membership badges with Premium styling', () => {
    component.session = { ...session, joined: true, waitlisted: false };
    fixture.detectChanges();
    let membership: HTMLElement = fixture.nativeElement.querySelector('.jynlo-session-detail-premium .membership-status');
    expect(membership).toBeTruthy();
    expect(membership.classList.contains('waitlisted')).toBeFalse();
    expect(membership.querySelector('.participants-shortcut')).toBeTruthy();

    component.session = { ...session, joined: false, waitlisted: true, waitlistPosition: 3 };
    fixture.detectChanges();
    membership = fixture.nativeElement.querySelector('.jynlo-session-detail-premium .membership-status');
    expect(membership.classList.contains('waitlisted')).toBeTrue();
    expect(membership.textContent).toContain('3');
    expect(membership.querySelector('.participants-shortcut')).toBeNull();
  });

  it('offers a jump to new session messages without moving the scroll until chosen', () => {
    component.session = { ...session, joined: true };
    const log = { scrollHeight: 900, scrollTop: 60, clientHeight: 260 };
    component.chatMessageList = { nativeElement: log } as any;
    realtimeSessionMessages.next({ id: 91, sessionId: 7, senderUsername: 'player-two',
      body: 'Vamos!', createdAt: '2026-10-23T09:00:00Z' });
    expect(component.newMessagesPending).toBe(1);
    expect(log.scrollTop).toBe(60);
    component.jumpToLatestMessages();
    expect(log.scrollTop).toBe(900);
    expect(component.newMessagesPending).toBe(0);
  });

  it('only synchronizes session chat reads after access is granted and messages have loaded', () => {
    component.messages = [{
      id: 29, sessionId: 7, senderUsername: 'creator-user',
      body: 'Olá', createdAt: '2026-10-23T09:00:00Z'
    }];
    component.onSessionChatScroll();
    expect(readSync.markVisible).not.toHaveBeenCalled();

    component.session = { ...session, joined: true };
    fixture.detectChanges();
    readSync.markVisible.calls.reset();
    component.onSessionChatScroll();
    expect(readSync.markVisible).not.toHaveBeenCalled(); // No chat log on session details.

    readSync.markVisible.calls.reset();
    component.chatError = 'Sem autorização';
    component.onSessionChatScroll();
    expect(readSync.markVisible).not.toHaveBeenCalled();
  });

  it('keeps a confirmed membership visible if the details refresh fails after POST', () => {
    component.session = { ...session, gameDate: new Date(Date.now() + 3600_000).toISOString() };
    sessionService.detail.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    expect(component.canJoinSession()).toBeTrue();

    component.joinSession();
    fixture.detectChanges();

    expect(sessionService.join).toHaveBeenCalledTimes(1);
    expect(component.session?.joined).toBeTrue();
    expect(component.canJoinSession()).toBeFalse();
    expect(component.actionSuccess).toBeTruthy();
    expect(component.errorMessage).toBe('');
    expect(component.detailRefreshWarning).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(component.detailRefreshWarning);
  });

  it('blocks duplicate POST after a network failure until GET confirms membership', () => {
    component.session = { ...session, gameDate: new Date(Date.now() + 3600_000).toISOString() };
    sessionService.join.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    sessionService.detail.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));

    component.joinSession();
    fixture.detectChanges();

    expect(component.joinOutcomeUnknown).toBeTrue();
    expect(component.canJoinSession()).toBeFalse();
    expect(component.joinStatusMessage).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).querySelector('.participation-panel button')).not.toBeNull();
    component.joinSession();
    expect(sessionService.join).toHaveBeenCalledTimes(1);

    sessionService.detail.and.returnValue(of({ ...session, joined: true }));
    component.verifyJoinOutcome();
    fixture.detectChanges();

    expect(component.joinOutcomeUnknown).toBeFalse();
    expect(component.session?.joined).toBeTrue();
    expect(component.actionSuccess).toBeTruthy();
    expect(sessionService.join).toHaveBeenCalledTimes(1);
  });

  it('treats an explicit invalid request as rejected without showing uncertain state', () => {
    component.session = { ...session, gameDate: new Date(Date.now() + 3600_000).toISOString() };
    sessionService.join.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 403, error: { message: 'Não autorizado' }
    })));
    component.joinSession();
    expect(component.joinOutcomeUnknown).toBeFalse();
    expect(component.actionError).toContain('Não autorizado');
    expect(sessionService.detail).toHaveBeenCalledTimes(1); // ngOnInit only
  });

  it('opens a shared session when the lazy route keeps its id on the parent snapshot', () => {
    const route = TestBed.inject(ActivatedRoute) as any;
    route.snapshot.paramMap = convertToParamMap({});
    route.parent = { snapshot: { paramMap: convertToParamMap({ id: '53' }) } };
    sessionService.detail.calls.reset();

    component.ngOnInit();

    expect(sessionService.detail).toHaveBeenCalledWith(53);
    expect(component.errorMessage).toBe('');
  });

  it('does not expose meeting-point editing to organisers or guests, preserving existing directions', () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, gameDate: future, canSeeExactAddress: true,
      meetingPointInstructions: 'Entrada antiga'
    };
    fixture.detectChanges();
    const location = fixture.nativeElement.querySelector('.address-panel') as HTMLElement;
    expect(location.querySelector('.session-meeting-edit-button')).toBeNull();
    expect(location.querySelector('#session-meeting-point-input')).toBeNull();
    expect(location.querySelector('.session-meeting-edit')).toBeNull();
    expect(location.querySelector('.session-meeting-point')?.textContent).toContain('Entrada antiga');
    expect(sessionService.updateMeetingPoint).not.toHaveBeenCalled();

    (component as any).currentUsername = 'guest-user';
    fixture.detectChanges();
    expect(location.querySelector('.session-meeting-edit-button')).toBeNull();
    expect(location.querySelector('#session-meeting-point-input')).toBeNull();
    expect(sessionService.updateMeetingPoint).not.toHaveBeenCalled();
  });

  it('can clear a point without changing the mapped venue', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, gameDate: new Date(Date.now() + 3600000).toISOString(),
      canSeeExactAddress: true, meetingPointInstructions: 'Porta A',
      address: 'Rua do Pavilhão'
    };
    sessionService.updateMeetingPoint.and.returnValue(of({
      ...component.session, meetingPointInstructions: null
    }));
    component.beginMeetingPointEdit();
    component.meetingPointDraft = '   ';
    component.saveMeetingPoint();
    expect(sessionService.updateMeetingPoint).toHaveBeenCalledWith(7, null);
    expect(component.session?.address).toBe('Rua do Pavilhão');
    expect(component.session?.meetingPointInstructions).toBeNull();
  });

  it('keeps editing closed after kickoff, cancellation or completion', () => {
    (component as any).currentUsername = 'creator-user';
    for (const status of ['CANCELLED', 'COMPLETED', 'OPEN'] as const) {
      component.session = {
        ...session, status, meetingPointInstructions: 'Entrada antiga',
        canSeeExactAddress: true, gameDate: new Date(Date.now() - 3600000).toISOString()
      };
      expect(component.canEditMeetingPoint()).toBeFalse();
      component.beginMeetingPointEdit();
      expect(component.meetingPointEditing).toBeFalse();
    }
    expect(sessionService.updateMeetingPoint).not.toHaveBeenCalled();
  });

  it('blocks invalid or duplicate point updates and preserves input on failure', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, gameDate: new Date(Date.now() + 3600000).toISOString(),
      canSeeExactAddress: true, meetingPointInstructions: 'Porta A'
    };
    component.beginMeetingPointEdit();
    component.meetingPointDraft = 'x'.repeat(241);
    component.saveMeetingPoint();
    expect(component.meetingPointError).toBeTruthy();
    component.meetingPointDraft = 'Porta A';
    component.saveMeetingPoint();
    expect(sessionService.updateMeetingPoint).not.toHaveBeenCalled();

    component.beginMeetingPointEdit();
    component.meetingPointDraft = 'Porta B';
    sessionService.updateMeetingPoint.and.returnValue(
      throwError(() => new HttpErrorResponse({status: 503})));
    component.saveMeetingPoint();
    expect(component.meetingPointEditing).toBeTrue();
    expect(component.meetingPointDraft).toBe('Porta B');
    expect(component.meetingPointError).toBeTruthy();
    expect(component.session?.meetingPointInstructions).toBe('Porta A');
  });

  it('focuses an authorised meeting point from a notification deep-link', () => {
    const route = TestBed.inject(ActivatedRoute);
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true, value: convertToParamMap({ meetingPoint: '1' })
    });
    (component as any).currentUsername = 'player-one';
    const note = 'Junto à entrada norte';
    component.session = { ...session, canSeeExactAddress: true, meetingPointInstructions: note };
    (component as any).pendingMeetingPointScroll = true;
    fixture.detectChanges();
    const anchor = fixture.nativeElement.querySelector('#session-meeting-point') as HTMLElement;
    expect(anchor).not.toBeNull();
    expect(anchor.getAttribute('tabindex')).toBe('-1');
    expect((component as any).pendingMeetingPointScroll).toBeFalse();
    expect(document.activeElement).toBe(anchor);
    fixture.detectChanges();
    expect(document.activeElement).toBe(anchor);
  });

  it('does not reveal or focus private meeting points for expired permissions', () => {
    (component as any).pendingMeetingPointScroll = true;
    component.session = {
      ...session, canSeeExactAddress: false, meetingPointInstructions: 'Porta privada'
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#session-meeting-point')).toBeNull();
    expect((component as any).pendingMeetingPointScroll).toBeFalse();

    component.session = {
      ...session, canSeeExactAddress: true, meetingPointInstructions: null
    };
    (component as any).pendingMeetingPointScroll = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#session-meeting-point')).toBeNull();
    expect((component as any).pendingMeetingPointScroll).toBeFalse();
  });

  it('renders meeting instructions only for session viewers with exact-location access', () => {
    component.session = {
      ...session, canSeeExactAddress: true,
      meetingPointInstructions: 'Portão lateral, junto ao campo'
    };
    fixture.detectChanges();
    const info = fixture.nativeElement.querySelector('.session-meeting-point') as HTMLElement;
    expect(info).not.toBeNull();
    expect(info.textContent).toContain('Portão lateral, junto ao campo');

    component.session = {
      ...session, canSeeExactAddress: false,
      meetingPointInstructions: 'Portão lateral, junto ao campo'
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-meeting-point')).toBeNull();
    expect(fixture.nativeElement.querySelector('.address-panel').textContent)
      .not.toContain('Portão lateral');
  });

  it('opens only an authorised exact address in Google Maps', () => {
    component.session = {
      ...session, address: 'Rua Machado dos Santos, Parede',
      canSeeExactAddress: true,
      venue: { latitude: 38.7, longitude: -9.36 } as any
    };
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.session-location-map') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(new URL(link.href).hostname).toBe('www.google.com');
    expect(new URL(link.href).searchParams.get('query')).toBe('38.7,-9.36');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');

    component.session = { ...session, address: 'Rua Machado dos Santos, Parede', canSeeExactAddress: false };
    fixture.detectChanges();
    expect(component.exactGoogleMapsUrl()).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-location-map')).toBeNull();
    expect(fixture.nativeElement.querySelector('.address-panel').textContent)
      .not.toContain('Rua Machado dos Santos');
  });

  it('lets an authorised player navigate to a GPS-only venue with no postal address', () => {
    component.session = {
      ...session,
      canSeeExactAddress: true,
      address: null,
      venue: { id: 447, latitude: 40.6668823, longitude: -8.7391574,
        locationStatus: 'GPS_ONLY_ADDRESS_UNKNOWN', address: '' } as any
    };
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.session-location-map') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(new URL(link.href).searchParams.get('query')).toBe('40.6668823,-8.7391574');
    expect(link.textContent?.trim()).toBeTruthy();
    expect(link.textContent).not.toContain('null');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('offers driving, walking and transit only to viewers authorised to see venue GPS', () => {
    component.session = {
      ...session, canSeeExactAddress: true, address: null,
      venue: { id: 447, latitude: 40.6668823, longitude: -8.7391574,
        locationStatus: 'GPS_ONLY_ADDRESS_UNKNOWN', address: '' } as any
    };
    fixture.detectChanges();
    const links = Array.from(fixture.nativeElement.querySelectorAll(
      '.session-route-mode')) as HTMLAnchorElement[];
    expect(links.length).toBe(3);
    expect(links.map(a => new URL(a.href).searchParams.get('travelmode')))
      .toEqual(['driving', 'walking', 'transit']);
    links.forEach(a => {
      const url = new URL(a.href);
      expect(url.searchParams.get('destination')).toBe('40.6668823,-8.7391574');
      expect(url.searchParams.has('origin')).toBeFalse();
      expect(a.rel).toContain('noopener');
      expect(a.target).toBe('_blank');
    });

    component.session = { ...component.session, canSeeExactAddress: false };
    fixture.detectChanges();
    expect(component.exactDirectionsUrl('driving')).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-route-planner')).toBeNull();
  });

  it('does not show false turn-by-turn directions for unknown or invalid GPS', () => {
    component.session = {
      ...session, canSeeExactAddress: true, address: 'Rua do Campo 10',
      venue: { id: 447, latitude: 0, longitude: 0 } as any
    };
    fixture.detectChanges();
    expect(component.exactDirectionsUrl('walking')).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-route-mode')).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-location-map')).not.toBeNull();
  });

  it('does not leak GPS-only coordinates to an unauthorised session viewer', () => {
    component.session = {
      ...session,
      canSeeExactAddress: false,
      address: null,
      venue: { id: 447, latitude: 40.6668823, longitude: -8.7391574,
        locationStatus: 'GPS_ONLY_ADDRESS_UNKNOWN', address: '' } as any
    };
    fixture.detectChanges();
    expect(component.exactGoogleMapsUrl()).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-location-map')).toBeNull();
    expect(fixture.nativeElement.querySelector('.address-panel').textContent)
      .not.toContain('-8.7391574');
  });

  it('does not turn an OSM coordinate placeholder into a confirmed postal address', () => {
    component.session = {
      ...session,
      canSeeExactAddress: true,
      address: 'Coordenadas (morada por confirmar)',
      venue: { id: 447, latitude: 40.6668823, longitude: -8.7391574,
        locationStatus: 'GPS_ONLY_ADDRESS_UNKNOWN', address: '' } as any
    };
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.session-location-map') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(new URL(link.href).searchParams.get('query')).toBe('40.6668823,-8.7391574');
    expect(link.textContent).not.toContain('Coordenadas (morada por confirmar)');
  });

  it('preserves address-based Maps search when there is no venue GPS', () => {
    component.session = { ...session, canSeeExactAddress: true,
      address: 'Rua do Campo, 12', city: 'Lisboa', venue: null };
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.session-location-map') as HTMLAnchorElement;
    expect(new URL(link.href).searchParams.get('query')).toBe('Rua do Campo, 12, Lisboa');

    component.session = { ...session, canSeeExactAddress: true, address: null, venue: null };
    fixture.detectChanges();
    expect(component.exactGoogleMapsUrl()).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-location-map')).toBeNull();
  });

  it('rejects (0,0) GPS pins and distinguishes missing from locked locations', () => {
    component.session = {
      ...session, canSeeExactAddress: true, address: null,
      venue: { id: 447, latitude: 0, longitude: 0 } as any
    };
    fixture.detectChanges();
    expect(component.exactGoogleMapsUrl()).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-location-map')).toBeNull();
    expect(fixture.nativeElement.querySelector('.address-panel').textContent)
      .toContain('Localização exata ainda não disponível');
  });

  it('shows a reference GPS point for authorised island session players', () => {
    component.session = {
      ...session, canSeeExactAddress: true, address: null,
      venue: { id: 447, name: 'Pavilhão da Ilha', city: 'Ponta Delgada',
        latitude: 37.741, longitude: -25.675,
        locationStatus: 'GPS_ONLY_ADDRESS_UNKNOWN' } as any
    };
    fixture.detectChanges();
    const url = component.exactGoogleMapsUrl();
    expect(new URL(url!).searchParams.get('query')).toBe('37.741,-25.675');
    expect(new URL(component.googleCalendarUrl()!).searchParams.get('location'))
      .toBe('37.741,-25.675');
    expect(fixture.nativeElement.querySelector('.address-panel').textContent)
      .toContain('não é necessariamente a entrada');
  });

  it('does not search Maps using old placeholder coordinates as street text', () => {
    component.session = {
      ...session, canSeeExactAddress: true,
      address: 'Coordenadas (morada por confirmar)',
      venue: { id: 447, latitude: 0, longitude: 0 } as any
    };
    fixture.detectChanges();
    expect(component.exactGoogleMapsUrl()).toBeNull();
    expect(component.exactLocationLabel()).not.toContain('morada por confirmar');
    expect(component.calendarIcsContent()).toContain('LOCATION:Lisboa');
  });

  it('does not expose Madeira venue coordinates in private session calendar links', () => {
    component.session = {
      ...session, canSeeExactAddress: false, address: 'Rua Privada 9',
      venue: { id: 447, latitude: 32.648, longitude: -16.908 } as any
    };
    fixture.detectChanges();
    expect(component.hasVenueMapCoordinates()).toBeFalse();
    expect(component.exactGoogleMapsUrl()).toBeNull();
    expect(fixture.nativeElement.querySelector('.address-panel').textContent).not.toContain('-16.908');
    expect(new URL(component.googleCalendarUrl()!).searchParams.get('location')).toBe('Lisboa');
  });

  it('shares only concise game details and a public URL, without generic promotion', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, status: 'OPEN', canSharePublicly: true,
      gameDate: '2099-10-01T18:00:00Z'
    };
    const link = component.whatsappShareUrl()!;
    expect(link).not.toBeNull();
    const text = new URL(link).searchParams.get('text')!;
    expect(text).toContain('Padel');
    expect(text).toContain('Local: Lisboa');
    expect(text).toContain('Vagas: 2 disponíveis');
    expect(text).toContain('/sessions/7');
    expect(text).not.toContain('Vem jogar connosco na Jynlo!');
  });

  it('sends a public session link to a selected friend only on explicit action', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {...session, gameDate:'2099-10-01T18:00:00Z', canSharePublicly: true};
    fixture.detectChanges();
    const open = fixture.nativeElement.querySelector('.session-player-search button') as HTMLButtonElement;
    expect(open).not.toBeNull();
    open.click();
    fixture.detectChanges();
    expect(directChatService.send).not.toHaveBeenCalled();
    const send = fixture.nativeElement.querySelector('.session-friend-invites button') as HTMLButtonElement;
    send.click();
    expect(directChatService.send).toHaveBeenCalledOnceWith('player-two',
      'Queres juntar-te ao nosso jogo de Padel? ' + new URL('/sessions/7', window.location.origin).href);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-friend-invites [role="status"]').textContent).toContain('player-two');
  });

  it('does not expose invitations on full or private sessions', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {...session, gameDate:'2099-10-01T18:00:00Z', privateGame:true, canSharePublicly: true};
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-friend-invites')).toBeNull();
    component.sendSessionInvite('player-two');
    expect(directChatService.send).not.toHaveBeenCalled();
  });

  it('offers optional post-game actions only to the organiser after two hours', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() - 3 * 3600_000).toISOString()
    };
    fixture.detectChanges();
    expect(component.canReviewPostGame()).toBeTrue();
    expect(fixture.nativeElement.querySelector('#post-game-review')?.textContent)
      .toContain('Depois do jogo');
    expect(fixture.nativeElement.querySelector('#post-game-review')?.textContent)
      .toContain('Registar presenças');
    expect(fixture.nativeElement.querySelector('#post-game-review')?.textContent)
      .not.toContain('Sim, aconteceu');

    component.session = { ...component.session, status: 'COMPLETED' };
    fixture.detectChanges();
    expect(component.canReviewPostGame()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#post-game-review')).toBeNull();

    component.session = { ...session, joined: true, gameDate: new Date().toISOString() };
    expect(component.canReviewPostGame()).toBeFalse();
    (component as any).currentUsername = 'another-user';
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    expect(component.canReviewPostGame()).toBeFalse();
  });

  it('only completes the session when the organiser chooses to register attendance', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    sessionService.detail.and.returnValue(of({ ...component.session, status: 'COMPLETED' as const }));

    expect(sessionService.complete).not.toHaveBeenCalled();
    component.openPostGameAttendance();

    expect(sessionService.complete).toHaveBeenCalledWith(7);
    expect(component.showAttendanceManager).toBeTrue();
    expect(sessionService.participants).toHaveBeenCalledWith(7);
    expect(component.session?.status).toBe('COMPLETED');
  });

  it('marks a game as not played without assigning absences', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    sessionService.detail.and.returnValue(of({ ...component.session, status: 'CANCELLED' as const }));

    component.confirmGameDidNotHappen();

    expect(sessionService.reportDidNotOccur).toHaveBeenCalledWith(7);
    expect(component.session?.status).toBe('CANCELLED');
    expect(reliabilityService.recordAttendance).not.toHaveBeenCalled();
  });

  it('offers positive peer compliments only when both players attended', () => {
    (component as any).currentUsername = 'player-one';
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() - 3 * 3600_000).toISOString()
    };
    confirmRatingAttendance('player-one');
    component.sessionParticipants.push({
      id: 16, username: 'player-two', attendanceStatus: 'PENDING', joinedAt: '2026-09-20T18:00:00Z'
    });
    fixture.detectChanges();
    expect(component.canOfferCompliments()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.player-compliments-panel')).toBeNull();

    component.sessionParticipants[1].attendanceStatus = 'ATTENDED';
    fixture.detectChanges();
    expect(component.canOfferCompliments()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.player-compliments-panel')).not.toBeNull();
    expect(sessionService.sentCompliments).not.toHaveBeenCalled();

    (fixture.nativeElement.querySelector('.compliments-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(sessionService.sentCompliments).toHaveBeenCalledOnceWith(7);
    expect(sessionService.receivedCompliments).toHaveBeenCalledOnceWith(7);
    expect(fixture.nativeElement.querySelectorAll('.player-compliment-choice').length).toBe(3);
  });

  it('submits username-based compliments without confusing participation IDs with profile IDs', () => {
    (component as any).currentUsername = 'player-one';
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() - 3 * 3600_000).toISOString()
    };
    confirmRatingAttendance('player-one');
    component.sessionParticipants.push({
      id: 9999, username: 'player-two', attendanceStatus: 'ATTENDED', joinedAt: '2026-09-20T18:00:00Z'
    });
    sessionService.giveCompliment.and.returnValue(of({
      senderUsername: 'player-one', recipientUsername: 'player-two',
      type: 'GREAT_TEAMMATE', updatedAt: '2026-10-22T10:00:00Z'
    }));
    component.toggleCompliments();
    fixture.detectChanges();
    const choices = fixture.nativeElement.querySelectorAll('.player-compliment-choice') as NodeListOf<HTMLButtonElement>;
    choices[1].click();
    fixture.detectChanges();
    expect(sessionService.giveCompliment).toHaveBeenCalledOnceWith(7, 'player-two', 'GREAT_TEAMMATE');
    expect(component.myCompliment('player-two')?.type).toBe('GREAT_TEAMMATE');
    expect(fixture.nativeElement.querySelector('.player-compliment-choice.is-sent')).not.toBeNull();

    choices[1].click();
    expect(sessionService.giveCompliment).toHaveBeenCalledTimes(1);
  });

  it('shows only compliments received by the logged-in player', () => {
    (component as any).currentUsername = 'player-one';
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() - 3 * 3600_000).toISOString()
    };
    confirmRatingAttendance('player-one');
    component.sessionParticipants.push({
      id: 16, username: 'player-two', attendanceStatus: 'ATTENDED', joinedAt: '2026-09-20T18:00:00Z'
    });
    sessionService.receivedCompliments.and.returnValue(of([{
      senderUsername: 'player-two', recipientUsername: 'player-one', type: 'FAIR_PLAY',
      updatedAt: '2026-10-22T10:00:00Z'
    }]));
    component.toggleCompliments();
    fixture.detectChanges();
    const received = fixture.nativeElement.querySelector('.compliments-received') as HTMLElement;
    expect(received).not.toBeNull();
    expect(received.textContent).toContain('player-two');
    expect(received.textContent).toContain('Fair play');
    expect(sessionService.receivedCompliments).toHaveBeenCalledOnceWith(7);
  });

  it('handles unavailable compliments API without submitting any feedback', () => {
    (component as any).currentUsername = 'player-one';
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() - 3 * 3600_000).toISOString()
    };
    confirmRatingAttendance('player-one');
    component.sessionParticipants.push({
      id: 16, username: 'player-two', attendanceStatus: 'ATTENDED', joinedAt: '2026-09-20T18:00:00Z'
    });
    sessionService.sentCompliments.and.returnValue(throwError(() => new Error('offline')));
    component.toggleCompliments();
    fixture.detectChanges();
    expect(component.complimentsLoadedSessionId).toBeNull();
    expect(fixture.nativeElement.querySelector('.player-compliments-panel [role="alert"]')).not.toBeNull();
    expect(sessionService.giveCompliment).not.toHaveBeenCalled();
    sessionService.sentCompliments.and.returnValue(of([]));
    component.loadCompliments();
    fixture.detectChanges();
    expect(component.complimentsLoadedSessionId).toBe(7);
  });

  it('offers venue stars only after confirmed attendance at a registered venue', () => {
    (component as any).currentUsername = 'player-one';
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() - 3 * 3600_000).toISOString(),
      venue: { id: 100, name: 'Recinto Jynlo', city: 'Lisboa' } as any
    };
    component.sessionParticipants = [{
      id: 15, username: 'player-one', attendanceStatus: 'PENDING',
      joinedAt: '2026-09-20T18:00:00Z'
    }];
    fixture.detectChanges();
    expect(component.canRateVenuePostGame()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.venue-rating-panel')).toBeNull();

    confirmRatingAttendance('player-one');
    component.loadMyVenueRating();
    fixture.detectChanges();
    expect(component.canRateVenuePostGame()).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('.venue-rating-star').length).toBe(5);
    expect(sessionService.myVenueRating).toHaveBeenCalledWith(7);
  });

  it('submits a venue score separately from the game experience rating', () => {
    (component as any).currentUsername = 'player-one';
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() - 3 * 3600_000).toISOString(),
      venue: { id: 100, name: 'Recinto Jynlo', city: 'Lisboa' } as any
    };
    confirmRatingAttendance('player-one');
    component.loadMyVenueRating();
    fixture.detectChanges();
    const stars = fixture.nativeElement.querySelectorAll('.venue-rating-star') as NodeListOf<HTMLButtonElement>;
    stars[3].click();
    fixture.detectChanges();
    expect(component.canSaveVenueRating()).toBeTrue();
    (fixture.nativeElement.querySelector('.venue-rating-panel .primary-action') as HTMLButtonElement).click();
    expect(sessionService.rateVenue).toHaveBeenCalledOnceWith(7, 4);
    expect(sessionService.rateOverall).not.toHaveBeenCalled();
    expect(component.myVenueScore).toBe(4);
    expect(component.venueRatingSuccess).toContain('guardada');
  });

  it('never renders venue ratings for a game without a registered venue', () => {
    (component as any).currentUsername = 'player-one';
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() - 3 * 3600_000).toISOString(),
      venue: null
    };
    confirmRatingAttendance('player-one');
    fixture.detectChanges();
    expect(component.canRateVenuePostGame()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.venue-rating-panel')).toBeNull();
    expect(sessionService.myVenueRating).not.toHaveBeenCalled();
  });

  it('offers one optional overall rating only to registered participants after the game', () => {
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
    component.loadMyOverallRating();
    fixture.detectChanges();

    expect(component.canRatePostGame()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.overall-rating-panel')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.overall-rating-star').length).toBe(5);
    expect(fixture.nativeElement.querySelector('.overall-rating-panel').textContent)
      .toContain('Como foi o teu jogo?');
    expect(sessionService.myOverallRating).toHaveBeenCalledWith(7);
    expect(sessionService.rateOverall).not.toHaveBeenCalled();
    expect(reliabilityService.recordAttendance).not.toHaveBeenCalled();
  });

  it('saves a selected star rating and permits editing a stored rating', () => {
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
    sessionService.myOverallRating.and.returnValue(of({
      overallScore: 3, updatedAt: '2026-10-13T10:00:00Z'
    }));
    component.loadMyOverallRating();
    fixture.detectChanges();

    expect(component.myOverallScore).toBe(3);
    expect(component.selectedOverallScore).toBe(3);
    expect(component.canSaveOverallRating()).toBeFalse();
    expect(component.ratingCollapsedByExisting).toBeTrue();
    expect(fixture.nativeElement.querySelector('.overall-rating-panel')).toBeNull();

    const edit = fixture.nativeElement.querySelector('.rating-reopen-action') as HTMLButtonElement;
    expect(edit.textContent).toContain('Editar avaliação');
    edit.click();
    fixture.detectChanges();
    expect(component.ratingCollapsedByExisting).toBeFalse();

    const stars = fixture.nativeElement.querySelectorAll('.overall-rating-star') as NodeListOf<HTMLButtonElement>;
    stars.item(4).click();
    fixture.detectChanges();
    expect(component.selectedOverallScore).toBe(5);
    (fixture.nativeElement.querySelector('.overall-rating-actions .primary-action') as HTMLButtonElement).click();

    expect(sessionService.rateOverall).toHaveBeenCalledOnceWith(7, 5);
    expect(component.myOverallScore).toBe(5);
    expect(component.ratingSuccess).toContain('atualizada');
    expect(component.canSaveOverallRating()).toBeFalse();
  });

  it('does not keep prompting after a previously saved rating', () => {
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
    sessionService.myOverallRating.and.returnValue(of({
      overallScore: 4, updatedAt: '2026-10-13T10:00:00Z'
    }));

    component.loadMyOverallRating();
    fixture.detectChanges();
    expect(component.myOverallScore).toBe(4);
    expect(component.ratingCollapsedByExisting).toBeTrue();
    expect(fixture.nativeElement.querySelector('.overall-rating-panel')).toBeNull();
    expect((fixture.nativeElement.querySelector('.rating-reopen-action') as HTMLButtonElement).textContent)
      .toContain('Editar avaliação');
    expect(sessionService.rateOverall).not.toHaveBeenCalled();

    // Refreshing the same joined session doesn't turn the saved rating into a new prompt.
    sessionService.detail.and.returnValue(of({ ...component.session, joined: true }));
    (component as any).loadSession(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.overall-rating-panel')).toBeNull();
    expect(sessionService.myOverallRating).toHaveBeenCalledTimes(1);
  });

  it('keeps first-time rating success visible on the visit where it was saved', () => {
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
    component.loadMyOverallRating();
    fixture.detectChanges();
    expect(component.myOverallScore).toBeNull();

    (fixture.nativeElement.querySelectorAll('.overall-rating-star')[4] as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.overall-rating-actions .primary-action') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.myOverallScore).toBe(5);
    expect(component.ratingSuccess).toContain('guardada');
    expect(component.ratingCollapsedByExisting).toBeFalse();
    expect(fixture.nativeElement.querySelector('.overall-rating-panel')).not.toBeNull();
    expect(sessionService.rateOverall).toHaveBeenCalledOnceWith(7, 5);
  });

  it('remembers not now for one user and session and allows manual re-opening', () => {
    const dismissedKey = 'jynlo.session-rating-dismissed:rating-dismiss-test-user:7';
    localStorage.removeItem(dismissedKey);
    try {
      (component as any).currentUsername = 'rating-dismiss-test-user';
      component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
      component.loadMyOverallRating();
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('.overall-rating-skip') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(localStorage.getItem(dismissedKey)).toBe('1');
      expect(fixture.nativeElement.querySelector('.overall-rating-panel')).toBeNull();
      expect(fixture.nativeElement.querySelector('.rating-reopen-action')).not.toBeNull();
      expect(sessionService.rateOverall).not.toHaveBeenCalled();

      // Mimic a new visit: the previously saved choice is respected.
      component.ratingDismissed = false;
      (component as any).restoreRatingDismissal();
      expect(component.ratingDismissed).toBeTrue();

      (fixture.nativeElement.querySelector('.rating-reopen-action') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(localStorage.getItem(dismissedKey)).toBeNull();
      expect(component.ratingDismissed).toBeFalse();
      expect(fixture.nativeElement.querySelector('.overall-rating-panel')).not.toBeNull();
      expect(sessionService.rateOverall).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem(dismissedKey);
    }
  });

  it('reopens a saved rating after not now was remembered on an earlier visit', () => {
    const key = 'jynlo.session-rating-dismissed:rating-return-test-user:7';
    localStorage.setItem(key, '1');
    try {
      (component as any).currentUsername = 'rating-return-test-user';
      component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
      sessionService.myOverallRating.and.returnValue(of({
        overallScore: 4, updatedAt: '2026-10-13T10:00:00Z'
      }));
      (component as any).restoreRatingDismissal();
      fixture.detectChanges();

      expect(component.ratingDismissed).toBeTrue();
      expect(fixture.nativeElement.querySelector('.overall-rating-panel')).toBeNull();
      expect(sessionService.myOverallRating).not.toHaveBeenCalled();

      // The explicit reopen must stay open even when GET finds a prior rating.
      (fixture.nativeElement.querySelector('.rating-reopen-action') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(sessionService.myOverallRating).toHaveBeenCalledOnceWith(7);
      expect(component.myOverallScore).toBe(4);
      expect(component.selectedOverallScore).toBe(4);
      expect(component.ratingCollapsedByExisting).toBeFalse();
      expect(fixture.nativeElement.querySelector('.overall-rating-panel')).not.toBeNull();
      expect((fixture.nativeElement.querySelector('.overall-rating-actions .primary-action') as HTMLButtonElement).disabled)
        .toBeTrue();
      expect(localStorage.getItem(key)).toBeNull();
      expect(sessionService.rateOverall).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem(key);
    }
  });

  it('keeps a deliberately reopened editor visible while rating fetch is pending', () => {
    const key = 'jynlo.session-rating-dismissed:rating-pending-test-user:7';
    localStorage.setItem(key, '1');
    try {
      (component as any).currentUsername = 'rating-pending-test-user';
      component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
      const pending = new Subject<{ overallScore: number; updatedAt: string } | null>();
      sessionService.myOverallRating.and.returnValue(pending.asObservable());
      (component as any).restoreRatingDismissal();
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('.rating-reopen-action') as HTMLButtonElement).click();
      expect(component.ratingLoading).toBeTrue();
      pending.next({ overallScore: 3, updatedAt: '2026-10-13T10:00:00Z' });
      pending.complete();
      fixture.detectChanges();

      expect(component.ratingLoading).toBeFalse();
      expect(component.myOverallScore).toBe(3);
      expect(component.ratingCollapsedByExisting).toBeFalse();
      expect(fixture.nativeElement.querySelector('.overall-rating-panel')).not.toBeNull();
      expect(sessionService.rateOverall).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem(key);
    }
  });

  it('keeps dismissals separate for other users and other sessions', () => {
    const firstKey = 'jynlo.session-rating-dismissed:rating-dismiss-test-user:7';
    localStorage.removeItem(firstKey);
    try {
      (component as any).currentUsername = 'rating-dismiss-test-user';
      component.dismissOverallRating();
      expect(localStorage.getItem(firstKey)).toBe('1');

      (component as any).currentUsername = 'another-rating-user';
      (component as any).restoreRatingDismissal();
      expect(component.ratingDismissed).toBeFalse();

      (component as any).currentUsername = 'rating-dismiss-test-user';
      (component as any).sessionId = 8;
      (component as any).restoreRatingDismissal();
      expect(component.ratingDismissed).toBeFalse();
    } finally {
      localStorage.removeItem(firstKey);
    }
  });

  it('can skip the rating without sending it or changing attendance', () => {
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
    component.loadMyOverallRating();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.overall-rating-skip') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.ratingDismissed).toBeTrue();
    expect(fixture.nativeElement.querySelector('.overall-rating-panel')).toBeNull();
    expect(sessionService.rateOverall).not.toHaveBeenCalled();
    expect(reliabilityService.recordAttendance).not.toHaveBeenCalled();
    expect(sessionService.complete).not.toHaveBeenCalled();
  });

  it('never offers ratings to outsiders or for a cancelled or not-occurred game', () => {
    component.session = { ...session, joined: false, gameDate: '2020-10-01T18:00:00Z' };
    expect(component.canRatePostGame()).toBeFalse();
    component.session = { ...session, joined: true, gameDate: new Date().toISOString() };
    expect(component.canRatePostGame()).toBeFalse();
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z', status: 'CANCELLED' };
    expect(component.canRatePostGame()).toBeFalse();
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z', problemType: 'NOT_OCCURRED' };
    expect(component.canRatePostGame()).toBeFalse();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.overall-rating-panel')).toBeNull();
    expect(sessionService.rateOverall).not.toHaveBeenCalled();
  });

  it('does not save an invalid or missing rating', () => {
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
    component.loadMyOverallRating();
    component.selectedOverallScore = null;
    component.saveOverallRating();
    component.selectOverallScore(0);
    component.selectOverallScore(6);
    component.selectOverallScore(2.5);
    expect(component.selectedOverallScore).toBeNull();
    expect(sessionService.rateOverall).not.toHaveBeenCalled();
  });

  it('can retry retrieving an existing rating without submitting a new one', () => {
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    confirmRatingAttendance();
    sessionService.myOverallRating.and.returnValue(throwError(() => new Error('offline')));
    component.loadMyOverallRating();
    fixture.detectChanges();

    expect(component.ratingError).toContain('Não foi possível carregar');
    expect(fixture.nativeElement.querySelector('.overall-rating-retry')).not.toBeNull();
    sessionService.myOverallRating.and.returnValue(of(null));
    (fixture.nativeElement.querySelector('.overall-rating-retry') as HTMLButtonElement).click();
    expect(component.ratingError).toBe('');
    expect(sessionService.myOverallRating).toHaveBeenCalledTimes(2);
    expect(sessionService.rateOverall).not.toHaveBeenCalled();
  });

  it('hides star ratings while attendance is pending or marked no-show', () => {
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    (component as any).currentUsername = 'player-one';
    component.sessionParticipants = [{
      id: 15, username: 'player-one', attendanceStatus: 'PENDING',
      joinedAt: '2026-09-20T18:00:00Z'
    }];
    component.loadMyOverallRating();
    fixture.detectChanges();
    expect(component.canRatePostGame()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.overall-rating-panel')).toBeNull();
    expect(sessionService.myOverallRating).not.toHaveBeenCalled();

    component.sessionParticipants[0].attendanceStatus = 'NO_SHOW';
    expect(component.canRatePostGame()).toBeFalse();

    component.sessionParticipants[0].attendanceStatus = 'LATE_CANCELLED';
    expect(component.canRatePostGame()).toBeFalse();

    component.sessionParticipants[0].attendanceStatus = 'ATTENDED';
    expect(component.canRatePostGame()).toBeTrue();
  });

  it('loads an attendee rating only after the participation roster confirms presence', () => {
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    (component as any).currentUsername = 'player-one';
    sessionService.participants.and.returnValue(of([{
      id: 15, username: 'player-one', attendanceStatus: 'ATTENDED',
      joinedAt: '2026-09-20T18:00:00Z'
    }]));
    expect(sessionService.myOverallRating).not.toHaveBeenCalled();

    component.loadSessionParticipants();
    fixture.detectChanges();

    expect(component.canRatePostGame()).toBeTrue();
    expect(sessionService.myOverallRating).toHaveBeenCalledOnceWith(7);
    expect(fixture.nativeElement.querySelector('.overall-rating-panel')).not.toBeNull();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load the session from the route id', () => {
    expect(component.session?.id).toBe(7);
  });

  it('should load creator reliability with the session', () => {
    expect(reliabilityService.summary).toHaveBeenCalledWith('creator-user');
    expect(component.creatorReliability?.attendanceRate).toBe(90);
  });

  it('should build calendar links with the session start and safe location', () => {
    const googleUrl = component.googleCalendarUrl();
    const outlookUrl = component.outlookCalendarUrl();

    expect(googleUrl).toContain('calendar.google.com/calendar/render');
    expect(googleUrl).toContain('dates=20261001T180000Z');
    expect(decodeURIComponent(googleUrl ?? '')).toContain('location=Lisboa');

    expect(outlookUrl).toContain('outlook.live.com/calendar');
    expect(decodeURIComponent(outlookUrl ?? '')).toContain('startdt=2026-10-01T18:00:00.000Z');
    expect(decodeURIComponent(outlookUrl ?? '')).toContain('location=Lisboa');
  });

  it('should prefer the exact address in calendar exports when it is visible', () => {
    component.session = {
      ...session,
      canSeeExactAddress: true,
      address: 'Rua do Campo, 10'
    };

    const ics = component.calendarIcsContent();

    expect(ics).toContain('DTSTART:20261001T180000Z');
    expect(ics).toContain('SUMMARY:Desporto24 — Padel');
    expect(ics).toContain('LOCATION:Rua do Campo\\, 10');
  });

  it('saves authorised GPS-only venue coordinates in all calendar providers', () => {
    component.session = {
      ...session, canSeeExactAddress: true, address: null,
      venue: { id: 447, name: 'Pavilhão Marítimo', city: 'Aveiro',
        address: '', latitude: 40.6668823, longitude: -8.7391574,
        locationStatus: 'GPS_ONLY_ADDRESS_UNKNOWN' } as any
    };
    expect(new URL(component.googleCalendarUrl()!).searchParams.get('location'))
      .toBe('40.6668823,-8.7391574');
    expect(new URL(component.outlookCalendarUrl()!).searchParams.get('location'))
      .toBe('40.6668823,-8.7391574');
    expect(component.calendarIcsContent()).toContain(
      'LOCATION:40.6668823\\,-8.7391574');
  });

  it('never exports venue coordinates or a private address to the calendar when locked', () => {
    component.session = {
      ...session, canSeeExactAddress: false,
      address: 'Rua Secreta, 21',
      venue: { id: 447, name: 'Recinto Privado', city: 'Lisboa',
        latitude: 38.7223, longitude: -9.1393 } as any
    };
    expect(new URL(component.googleCalendarUrl()!).searchParams.get('location')).toBe('Lisboa');
    expect(new URL(component.outlookCalendarUrl()!).searchParams.get('location')).toBe('Lisboa');
    expect(component.calendarIcsContent()).toContain('LOCATION:Lisboa');
    expect(component.calendarIcsContent()).not.toContain('Rua Secreta');
    expect(component.calendarIcsContent()).not.toContain('38.7223');
  });

  it('does not export a legacy GPS placeholder as a postal address', () => {
    component.session = {
      ...session, canSeeExactAddress: true,
      address: 'Coordenadas (morada por confirmar)',
      venue: { id: 447, latitude: 40.6668823, longitude: -8.7391574 } as any
    };
    expect(new URL(component.googleCalendarUrl()!).searchParams.get('location'))
      .toBe('40.6668823,-8.7391574');
    expect(component.calendarIcsContent()).not.toContain('morada por confirmar');
  });

  it('falls back to municipality for implausible GPS without a usable street address', () => {
    component.session = {
      ...session, canSeeExactAddress: true, address: null,
      venue: { id: 447, latitude: 0, longitude: 0 } as any
    };
    expect(new URL(component.googleCalendarUrl()!).searchParams.get('location')).toBe('Lisboa');
    expect(component.calendarIcsContent()).toContain('LOCATION:Lisboa');
  });

  it('links a registered venue only after the session authorises exact location', () => {
    component.session = {
      ...session, canSeeExactAddress: true,
      venue: { id: 447, name: 'Pavilhão Central', city: 'Lisboa' } as any
    };
    fixture.detectChanges();
    const venueLink = fixture.nativeElement.querySelector('.session-venue-link') as HTMLAnchorElement;
    const detailsAction = fixture.nativeElement.querySelector('.session-venue-details-action') as HTMLAnchorElement;
    expect(venueLink).not.toBeNull();
    expect(detailsAction).not.toBeNull();
    expect(venueLink.getAttribute('href')).toBe('/menu/venues/447');
    expect(detailsAction.getAttribute('href')).toBe('/menu/venues/447');
    expect(detailsAction.textContent).toContain('Ver recinto');

    component.session = { ...session, canSeeExactAddress: false,
      venue: { id: 447, name: 'Pavilhão Central', city: 'Lisboa' } as any };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-venue-link')).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-venue-details-action')).toBeNull();
    expect(fixture.nativeElement.querySelector('.venue-detail-panel h2').textContent)
      .toContain('Pavilhão Central');
  });

  it('scrolls to the participant list without navigating away from the session', () => {
    component.session = {
      ...session,
      joined: true,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    };
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.membership-status') as HTMLElement;
    const participantSection = fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    const button = banner.querySelector('.participants-shortcut') as HTMLButtonElement;
    const scroll = spyOn(participantSection, 'scrollIntoView');
    const urlBefore = window.location.href;

    expect(banner.textContent).toContain('Já estás dentro');
    expect(button.type).toBe('button');
    expect(banner.querySelector('a[href="#session-participants"]')).toBeNull();

    button.click();

    expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'start' });
    expect(window.location.href).toBe(urlBefore);
  });

  it('does not show participant navigation to someone who has not joined', () => {
    component.session = { ...session, joined: false };
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.participants-shortcut')).toBeNull();
    component.scrollToParticipants();
    expect(fixture.nativeElement.querySelector('#session-participants')).toBeNull();
  });

  it('should show the waitlist position in the membership status', () => {
    component.session = {
      ...session,
      waitlisted: true,
      waitlistPosition: 3,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    };
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.membership-status.waitlisted') as HTMLElement;
    expect(banner.textContent).toContain('Lista de espera');
    expect(banner.textContent).toContain('na posição 3');
    expect(banner.querySelector('a')).toBeNull();
  });

  it('should not show a membership status to someone who has not joined', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.membership-status')).toBeNull();
  });

  it('allows only the creator to cancel from details with a confirmation', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, gameDate: '2099-10-01T18:00:00Z', canSharePublicly: true };
    fixture.detectChanges();
    const cancel = fixture.nativeElement.querySelector('.session-cancel-button') as HTMLButtonElement;
    expect(cancel).not.toBeNull();
    cancel.click();
    fixture.detectChanges();
    expect(sessionService.cancel).not.toHaveBeenCalled();
    const confirmation = fixture.nativeElement.querySelector('.session-cancel-confirm');
    expect(confirmation).not.toBeNull();
    (confirmation.querySelector('.jynlo-action--danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(sessionService.cancel).toHaveBeenCalledOnceWith(7);
    expect(component.session?.status).toBe('CANCELLED');
    expect(fixture.nativeElement.querySelector('.session-cancel-confirm')).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-cancel-button')).toBeNull();

    (component as any).currentUsername = 'someone-else';
    component.session = { ...session, gameDate: '2099-10-01T18:00:00Z' };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-cancel-button')).toBeNull();
  });

  it('retains the confirmation and shows an error if cancel fails', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, gameDate: '2099-10-01T18:00:00Z' };
    sessionService.cancel.and.returnValue(throwError(() => new HttpErrorResponse({status: 503})));
    component.requestCancelOwnSession();
    component.confirmCancelOwnSession();
    fixture.detectChanges();
    expect(component.session?.status).toBe('OPEN');
    expect(component.cancelSessionConfirmOpen).toBeTrue();
    expect(component.actionError).toBeTruthy();
  });

  it('shows confirmed guest names and counts them in Who is going without inventing accounts', () => {
    (component as any).currentUsername='creator-user';
    component.session={...session,joined:true};
    component.sessionParticipants=[{id:11,username:'creator-user',attendanceStatus:'PENDING',
      joinedAt:'2026-10-28T15:00:00Z'}];
    component.guestRequests=[
      {id:40,name:'Ferreirinha',status:'APPROVED',note:'',teamCode:null},
      {id:41,name:'Pedido Antigo',status:'PENDING',note:'',teamCode:null},
      {id:42,name:'Conta criada',status:'LINKED',note:'',teamCode:null}
    ];
    fixture.detectChanges();
    const region=fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region.textContent).toContain('Ferreirinha');
    expect(region.textContent).toContain('2 jogadores visíveis');
    expect(region.textContent).not.toContain('Pedido Antigo');
    expect(region.textContent).not.toContain('Conta criada');
    expect(region.querySelectorAll('a.session-player-card__profile').length).toBe(1);
  });

  it('shows confirmed guests to a joined non-organizer without organizer access', () => {
    (component as any).currentUsername='monicagomes';
    sessionService.detail.and.returnValue(of({...session,joined:true,participantCount:3}));
    component.session={...session,creatorUsername:'creator-user',joined:true,participantCount:3};
    component.sessionParticipants=[
      {id:1,username:'creator-user',attendanceStatus:'PENDING',joinedAt:'2026-10-28T15:00:00Z'},
      {id:2,username:'monicagomes',attendanceStatus:'PENDING',joinedAt:'2026-10-28T15:01:00Z'}
    ];
    sessionService.participants.and.returnValue(of(component.sessionParticipants));
    sessionService.confirmedGuests.and.returnValue(of([
      {id:40,name:'oal',teamCode:null}
    ]));
    component.refreshVisiblePlayers();
    fixture.detectChanges();
    const section=fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    expect(section.textContent).toContain('3 jogadores visíveis');
    expect(section.textContent).toContain('@monicagomes');
    expect(section.textContent).toContain('oal');
    expect(section.querySelectorAll('.session-player-card--guest').length).toBe(1);
    expect(section.querySelectorAll('a.session-player-card__profile').length).toBe(2);
    expect(sessionService.confirmedGuests).toHaveBeenCalledWith(7);
    expect(sessionService.guestRequests).not.toHaveBeenCalled();
    expect(component.isCreator()).toBeFalse();
  });

  it('does not show guests to non-participants and preserves error visibility', () => {
    (component as any).currentUsername='outsider';
    sessionService.detail.and.returnValue(of({...session,joined:true}));
    component.session={...session,creatorUsername:'creator-user',joined:false};
    component.memberConfirmedGuests=[{id:20,name:'Private guest',teamCode:null}];
    expect(component.confirmedGuestParticipants()).toEqual([]);
    component.session={...session,creatorUsername:'creator-user',joined:true};
    sessionService.confirmedGuests.and.returnValue(
      throwError(()=>new HttpErrorResponse({status:403})));
    component.refreshVisiblePlayers();
    fixture.detectChanges();
    const section=fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    expect(section.textContent).toContain('Não foi possível atualizar os convidados confirmados');
    expect(section.textContent).not.toContain('Private guest');
  });

  it('renders ten registered and confirmed guest players as matching profile cards', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, creatorUsername: 'creator-user', joined: true };
    component.sessionParticipants = Array.from({length: 5}, (_, index) => ({
      id: index + 1, username: index === 0 ? 'creator-user' : 'jynlo-player-' + index,
      attendanceStatus: 'PENDING' as const, joinedAt: '2026-10-28T15:00:00Z'
    }));
    component.guestRequests = Array.from({length: 5}, (_, index) => ({
      id: index + 100, name: 'Convidado ' + (index + 1),
      status: 'APPROVED' as const, note: '', teamCode: null
    }));
    fixture.detectChanges();
    const region = fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    const chips = region.querySelectorAll('.session-participant-list > .session-player-card');
    expect(chips.length).toBe(10);
    expect(region.textContent).toContain('10 jogadores visíveis');
    expect(region.querySelectorAll('a.session-player-card__profile').length).toBe(5);
    expect(region.querySelectorAll('.session-player-card--guest').length).toBe(5);
    expect(region.textContent).toContain('COM CONTA');
    expect(region.textContent).toContain('SEM CONTA');
    const links = region.querySelectorAll('a.session-player-card__profile');
    expect(links[0].getAttribute('href')).toContain('/menu/perfis/creator-user');
  });

  it('preserves the same identity cards in two confirmed teams of five', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, creatorUsername: 'creator-user', joined: true };
    const registered = Array.from({length: 6}, (_, index) => ({
      id: index + 1, username: index === 0 ? 'creator-user' : 'jynlo-player-' + index,
      attendanceStatus: 'PENDING' as const, joinedAt: '2026-10-28T15:00:00Z',
      teamCode: (index < 3 ? 'A' : 'B') as 'A' | 'B'
    }));
    component.sessionParticipants = registered;
    component.teamAParticipants = registered.slice(0, 3);
    component.teamBParticipants = registered.slice(3);
    component.guestRequests = Array.from({length: 4}, (_, index) => ({
      id: index + 100, name: 'Convidado ' + (index + 1),
      status: 'APPROVED' as const, note: '',
      teamCode: (index < 2 ? 'A' : 'B') as 'A' | 'B'
    }));
    component.confirmedTeams = true;
    fixture.detectChanges();
    const region = fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    const teams = region.querySelectorAll('.confirmed-teams > div');
    expect(teams.length).toBe(2);
    expect(teams[0].querySelectorAll('.session-player-card').length).toBe(5);
    expect(teams[1].querySelectorAll('.session-player-card').length).toBe(5);
    expect(region.querySelectorAll('a.session-player-card__profile').length).toBe(6);
    expect(region.querySelectorAll('.session-player-card--guest').length).toBe(4);
  });

  it('starts with guest-first invitations after creating a community game', () => {
    const route=TestBed.inject(ActivatedRoute);
    spyOn(route.snapshot.queryParamMap,'get').and.callFake(key=>key==='created'?'1':null);
    (component as any).currentUsername='creator-user';
    component.session={...session,gameDate:'2099-10-01T18:00:00Z',
      audience:'COMMUNITY_ONLY',communityId:12,canSharePublicly:false};
    fixture.detectChanges();
    expect(component.showInvitePanel()).toBeTrue();
    const panel=fixture.nativeElement.querySelector('.guest-organizer-panel') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Convidar jogadores');
    expect(panel.textContent).toContain('SEM CONTA');
    expect(panel.textContent).toContain('COM CONTA JYNLO');
    expect(fixture.nativeElement.querySelector('.session-created-share')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Divulgar jogo');
    expect(component.publicShareUrl()).toBeNull();
    const toggle=fixture.nativeElement.querySelector('.session-invite-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.guest-organizer-panel')).toBeNull();
    (fixture.nativeElement.querySelector('.session-invite-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.guest-organizer-panel')).not.toBeNull();
  });

  it('generates signed WhatsApp and copy invitations for crossposted games', async () => {
    (component as any).currentUsername='creator-user';
    component.session={...session,gameDate:'2099-10-01T18:00:00Z',
      audience:'COMMUNITY_ONLY',communityId:null,canSharePublicly:false};
    component.invitePanelOpen=true;
    fixture.detectChanges();
    expect(component.canShareGuestInvites()).toBeTrue();
    expect(component.publicShareUrl()).toBeNull();
    component.createGuestLink();
    fixture.detectChanges();
    expect(sessionService.issueGuestLink).toHaveBeenCalledWith(7);
    const url=component.guestLinkUrl;
    expect(url).toContain('/sessions/7?guest=');
    expect(decodeURIComponent(component.guestLinkWhatsAppUrl)).toContain(url);
    const clipboard=spyOn(navigator.clipboard,'writeText').and.returnValue(Promise.resolve());
    await component.copyGuestLink();
    expect(clipboard).toHaveBeenCalledWith(url);
  });

  it('renders actual shared community names and season competition state', () => {
    component.session={...session,audience:'COMMUNITY_ONLY',communityId:null};
    component.sessionContext={
      communities:[{id:12,name:'Colégio Pio'},{id:14,name:'ACM'}],
      seasonGame:true,seasonName:'Época 2026/27'};
    fixture.detectChanges();
    const panel=fixture.nativeElement.querySelector('.session-community-context') as HTMLElement;
    expect(panel.textContent).toContain('Colégio Pio');
    expect(panel.textContent).toContain('ACM');
    expect(panel.textContent).toContain('Jogo de época');
    expect(panel.textContent).toContain('Conta para a época');
    expect(panel.textContent).toContain('após validação');
    expect(panel.textContent).toContain('Época 2026/27');
    expect(panel.querySelectorAll('.session-community-links a').length).toBe(2);
    component.sessionContext={communities:[{id:12,name:'Colégio Pio'}],
      seasonGame:false,seasonName:null};
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-community-context').textContent)
      .toContain('Não conta para a época');
  });

  it('explains optional rankings without claiming the session is a season game', () => {
    component.session = { ...session, audience: 'COMMUNITY_ONLY', communityId: null };
    component.sessionContext = {
      communities: [{ id: 12, name: 'Colégio Pio' }],
      seasonGame: false, seasonName: null
    };
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const help = root.querySelector<HTMLButtonElement>('.session-ranking-learn-more');
    expect(help).not.toBeNull();
    expect(help?.getAttribute('aria-expanded')).toBe('false');
    help!.click();
    fixture.detectChanges();
    expect(help?.getAttribute('aria-expanded')).toBe('true');
    const benefits = root.querySelector('.session-ranking-benefits');
    expect(benefits?.textContent).toContain('equipas mais equilibradas');
    expect(benefits?.textContent).toContain('resultados');
    expect(benefits?.textContent).not.toContain('Nesta sessão não está ativa');
    help!.click();
    fixture.detectChanges();
    expect(root.querySelector('.session-ranking-benefits')).toBeNull();
    component.sessionContext = {
      communities: [{ id: 12, name: 'Colégio Pio' }],
      seasonGame: true, seasonName: 'Época 2026/27'
    };
    fixture.detectChanges();
    expect(root.querySelector('.session-ranking-learn-more')).not.toBeNull();
    expect(root.textContent).toContain('Classificações e estatísticas');
  });

  it('does not expose guest invitations to non-creators or closed/private games', () => {
    (component as any).currentUsername='creator-user';
    for(const detail of [
      {gameDate:'2020-10-01T18:00:00Z',status:'OPEN' as const,privateGame:false},
      {gameDate:'2099-10-01T18:00:00Z',status:'CANCELLED' as const,privateGame:false},
      {gameDate:'2099-10-01T18:00:00Z',status:'OPEN' as const,privateGame:true}
    ]){
      component.session={...session,audience:'COMMUNITY_ONLY',...detail};
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.session-invite-toggle')).toBeNull();
    }
    (component as any).currentUsername='someone-else';
    component.session={...session,audience:'COMMUNITY_ONLY',gameDate:'2099-10-01T18:00:00Z'};
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-invite-toggle')).toBeNull();
  });

  it('only offers a restricted internal share for private games', () => {
    const route=TestBed.inject(ActivatedRoute);
    spyOn(route.snapshot.queryParamMap,'get').and.callFake(key=>key==='created'?'1':null);
    (component as any).currentUsername='creator-user';
    component.session={...session,gameDate:'2099-10-01T18:00:00Z',
      audience:'PUBLIC',privateGame:true,canSharePublicly:false};
    fixture.detectChanges();
    const panel=fixture.nativeElement.querySelector('.session-created-share') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Convidar jogadores');
    expect(panel.querySelector('a[href^="/menu/feed"]')).toBeNull();
    expect(component.organizerShareUrl()).toContain('/menu/events/7');
  });

  it('shows the organiser confirmed players and remaining slots before a future game', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, joined: true, status: 'OPEN',
      gameDate: new Date(Date.now() + 86_400_000).toISOString()
    };
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.organizer-preparation') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Preparação do jogo');
    expect(panel.textContent).toContain('2/4');
    expect(panel.textContent).toContain('Faltam 2 jogadores');
    expect(panel.querySelectorAll('button').length).toBe(2);
    expect(fixture.nativeElement.querySelector('#session-player-search')).not.toBeNull();

    const scroll = spyOn(fixture.nativeElement.querySelector('#session-player-search'), 'scrollIntoView');
    const findButton = Array.from(panel.querySelectorAll('button'))
      .find((button: any) => button.textContent.includes('Encontrar jogadores')) as HTMLButtonElement;
    findButton.click();
    expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'start' });
    expect(sessionService.join).not.toHaveBeenCalled();
  });

  it('respects a FULL backend status even if its count has not refreshed', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, status: 'FULL', participantCount: 3, maxParticipants: 4,
      gameDate: new Date(Date.now() + 86_400_000).toISOString()
    };
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.organizer-preparation') as HTMLElement;
    expect(panel.textContent).toContain('3/4');
    expect(panel.textContent).toContain('marcada como cheia');
    expect(panel.textContent).not.toContain('Faltam 1 jogadores');
    // A full game must not invite more players, but its creator can inspect the roster.
    expect(panel.querySelector('button')?.textContent).toContain('Quem vai');
    expect(panel.textContent).not.toContain('Encontrar jogadores');
    expect(component.canFindPlayers()).toBeFalse();
    expect(fixture.nativeElement.querySelector('#session-player-search')).toBeNull();
  });

  it('does not expose public player-search actions for private or community-only sessions', () => {
    (component as any).currentUsername = 'creator-user';
    const future = new Date(Date.now() + 86_400_000).toISOString();
    for (const partial of [
      { privateGame: true },
      { audience: 'COMMUNITY_ONLY' as const }
    ]) {
      component.session = { ...session, gameDate: future, ...partial };
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.organizer-preparation')).not.toBeNull();
      expect(component.canFindPlayers()).toBeFalse();
      expect(fixture.nativeElement.querySelector('#session-player-search')).toBeNull();
    }
  });

  it('does not invent organiser readiness for another user or invalid and ended games', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    (component as any).currentUsername = 'other-user';
    component.session = { ...session, gameDate: future };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.organizer-preparation')).toBeNull();

    (component as any).currentUsername = 'creator-user';
    for (const state of [
      { status: 'CANCELLED' },
      { status: 'COMPLETED' },
      { gameDate: new Date(Date.now() - 60000).toISOString() },
      { gameDate: 'invalid' },
      { participantCount: Number.NaN },
      { participantCount: -1 },
      { participantCount: 5 },
      { maxParticipants: 0 },
      { maxParticipants: Number.NaN }
    ]) {
      component.session = { ...session, gameDate: future, ...state };
      expect(component.organizerPreparation()).withContext(JSON.stringify(state)).toBeNull();
      expect(component.canFindPlayers()).withContext(JSON.stringify(state)).toBeFalse();
    }
    component.session = { ...session, gameDate: future, participantCount: 4 };
    expect(component.organizerPreparation()?.full).toBeTrue();
    expect(component.canFindPlayers()).toBeFalse();
  });

  it('offers a filtered player search to the creator of a future public session with vacancies', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, gameDate: '2099-10-01T18:00:00Z' };
    fixture.detectChanges();

    expect(component.missingPlayers()).toBe(2);
    expect(component.canFindPlayers()).toBeTrue();
    const action = fixture.nativeElement.querySelector('.session-player-search a') as HTMLAnchorElement;
    expect(action.textContent).toContain('Procurar jogadores');
    expect(action.getAttribute('href')).toBe('/menu/perfis?from=people&sport=Padel&city=Lisboa');
  });

  it('does not suggest finding players for private, full, past or other peoples sessions', () => {
    (component as any).currentUsername = 'creator-user';
    const future = '2099-10-01T18:00:00Z';
    component.session = { ...session, gameDate: future, privateGame: true };
    expect(component.canFindPlayers()).toBeFalse();
    component.session = { ...session, gameDate: future, participantCount: 4 };
    expect(component.canFindPlayers()).toBeFalse();
    component.session = { ...session, gameDate: '2020-10-01T18:00:00Z' };
    expect(component.canFindPlayers()).toBeFalse();
    component.session = { ...session, gameDate: future };
    (component as any).currentUsername = 'other-user';
    expect(component.canFindPlayers()).toBeFalse();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-player-search')).toBeNull();
  });

  it('offers post-game sharing to a participant of a completed public session', () => {
    component.session = {
      ...session, status: 'COMPLETED', joined: true, canSharePublicly: true
    };
    fixture.detectChanges();

    expect(component.canSharePostGameMoment()).toBeTrue();
    const link = fixture.nativeElement.querySelector('.postgame-action') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toContain('/menu/feed?momentSession=7');
    expect(link.textContent).toContain('Partilhar momento');
  });

  it('translates the post-game sharing action in English and Portuguese', () => {
    const i18n = TestBed.inject(I18nService);
    component.session = {
      ...session, status: 'COMPLETED', joined: true, canSharePublicly: true
    };

    try {
      i18n.setLanguage('en');
      fixture.detectChanges();
      const link = fixture.nativeElement.querySelector('.postgame-action') as HTMLAnchorElement;
      expect(link.textContent.trim()).toBe('Share a game moment');

      i18n.setLanguage('pt');
      fixture.detectChanges();
      expect(link.textContent.trim()).toBe('Partilhar momento');
    } finally {
      i18n.setLanguage('pt');
    }
  });

  it('does not offer post-game sharing for unrelated, private or unfinished sessions', () => {
    const cases = [
      { status: 'OPEN', joined: true, canSharePublicly: true },
      { status: 'CANCELLED', joined: true, canSharePublicly: true },
      { status: 'COMPLETED', joined: false, canSharePublicly: true },
      { status: 'COMPLETED', joined: true, canSharePublicly: false },
      { status: 'COMPLETED', joined: true, canSharePublicly: undefined }
    ];
    for (const scenario of cases) {
      component.session = { ...session, ...scenario };
      fixture.detectChanges();
      expect(component.canSharePostGameMoment()).withContext(JSON.stringify(scenario)).toBeFalse();
      expect(fixture.nativeElement.querySelector('.postgame-action')).toBeNull();
    }
  });

  it('shows a selectable public link if sharing and clipboard access both fail', async () => {
    component.session = { ...session, canSharePublicly: true };
    if (typeof navigator.share === 'function') {
      spyOn(navigator, 'share').and.returnValue(Promise.reject(new Error('Not available')));
    }
    spyOn<any>(component, 'copyShareUrl').and.returnValue(Promise.reject(new Error('Clipboard denied')));

    await component.shareSession();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#session-share-url') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.readOnly).toBeTrue();
    expect(input.value).toBe(new URL('/sessions/7', window.location.origin).href);
    expect(component.shareFeedback).toContain('Seleciona a ligação');

    const selectSpy = spyOn(input, 'select').and.callThrough();
    const selectButton = fixture.nativeElement.querySelector('.manual-share-controls button') as HTMLButtonElement;
    selectButton.click();
    expect(selectSpy).toHaveBeenCalled();
  });

  it('confirms a successful copy without displaying the manual fallback', async () => {
    component.session = { ...session, canSharePublicly: true };
    if (typeof navigator.share === 'function') {
      spyOn(navigator, 'share').and.returnValue(Promise.reject(new Error('Not available')));
    }
    spyOn<any>(component, 'copyShareUrl').and.returnValue(Promise.resolve());

    await component.shareSession();
    fixture.detectChanges();

    expect(component.shareFeedback).toBe('Ligação copiada');
    expect(component.manualShareUrl).toBe('');
    expect(fixture.nativeElement.querySelector('.manual-share-link')).toBeNull();
  });

  it('scrolls to the join action without navigating away from the session', () => {
    component.session = {
      ...session,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    };
    fixture.detectChanges();

    const shortcut = fixture.nativeElement.querySelector('.join-shortcut') as HTMLButtonElement;
    const participation = fixture.nativeElement.querySelector('#session-participation') as HTMLElement;
    const scroll = spyOn(participation, 'scrollIntoView');
    const urlBefore = window.location.href;

    expect(shortcut).not.toBeNull();
    expect(shortcut.type).toBe('button');
    expect(shortcut.getAttribute('href')).toBeNull();
    expect(shortcut.textContent).toContain('Ver inscrição');
    expect(participation.querySelector('.join-controls .primary-action')).not.toBeNull();

    shortcut.click();

    expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'start' });
    expect(window.location.href).toBe(urlBefore);
    expect(sessionService.join).not.toHaveBeenCalled();
  });

  it('should point to the waitlist for a full session', () => {
    component.session = {
      ...session,
      status: 'FULL',
      participantCount: 4,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    };
    fixture.detectChanges();

    const shortcut = fixture.nativeElement.querySelector('.join-shortcut') as HTMLButtonElement;
    const participation = fixture.nativeElement.querySelector('#session-participation') as HTMLElement;
    const scroll = spyOn(participation, 'scrollIntoView');
    const urlBefore = window.location.href;
    expect(shortcut.textContent).toContain('lista de espera');

    shortcut.click();

    expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'start' });
    expect(window.location.href).toBe(urlBefore);
  });

  it('should not show a join shortcut when a session is closed or already joined', () => {
    const gameDate = new Date(Date.now() + 3600_000).toISOString();
    for (const state of [
      { status: 'CANCELLED', joined: false },
      { status: 'COMPLETED', joined: false },
      { status: 'OPEN', joined: true }
    ]) {
      component.session = { ...session, ...state, gameDate };
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.join-shortcut')).toBeNull();
    }
  });

  it('scrolls to participation after loading a future session from Discover', () => {
    fixture.destroy();
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).queryParamMap = convertToParamMap({ join: '1' });
    const futureSession = {
      ...session, gameDate: new Date(Date.now() + 3600_000).toISOString()
    };
    const delayedDetail = new Subject<typeof futureSession>();
    sessionService.detail.and.returnValue(delayedDetail.asObservable());
    const scroll = jasmine.createSpy('scrollIntoView');
    const originalGetById = document.getElementById.bind(document);
    spyOn(document, 'getElementById').and.callFake((id: string) => {
      if (id === 'session-participation') {
        return { scrollIntoView: scroll } as unknown as HTMLElement;
      }
      return originalGetById(id);
    });

    const page = TestBed.createComponent(SessionDetailsComponent);
    page.detectChanges();
    expect(scroll).not.toHaveBeenCalled();

    delayedDetail.next(futureSession);
    delayedDetail.complete();
    page.detectChanges();

    expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'start' });
    expect(sessionService.join).not.toHaveBeenCalled();
    page.detectChanges();
    expect(scroll).toHaveBeenCalledTimes(1);
    page.destroy();
  });

  it('focuses current membership once after a promoted waitlist notification loads', () => {
    fixture.destroy();
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).queryParamMap = convertToParamMap({ membership: '1' });
    const promoted = {
      ...session, joined: true, waitlisted: false,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    };
    const delayedDetail = new Subject<typeof promoted>();
    sessionService.detail.and.returnValue(delayedDetail.asObservable());

    const scroll = jasmine.createSpy('scrollIntoView');
    const originalGetById = document.getElementById.bind(document);
    spyOn(document, 'getElementById').and.callFake((id: string) => {
      if (id === 'session-membership') {
        return { scrollIntoView: scroll } as unknown as HTMLElement;
      }
      return originalGetById(id);
    });

    const page = TestBed.createComponent(SessionDetailsComponent);
    page.detectChanges();
    expect(scroll).not.toHaveBeenCalled();
    delayedDetail.next(promoted);
    delayedDetail.complete();
    page.detectChanges();

    expect(page.nativeElement.querySelector('#session-membership')).not.toBeNull();
    expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'start' });
    expect(sessionService.join).not.toHaveBeenCalled();
    page.detectChanges();
    expect(scroll).toHaveBeenCalledTimes(1);
    page.destroy();
  });

  it('shows the current waitlist position when a historical promotion no longer applies', () => {
    fixture.destroy();
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).queryParamMap = convertToParamMap({ membership: '1' });
    sessionService.detail.and.returnValue(of({
      ...session, joined: false, waitlisted: true, waitlistPosition: 2,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    }));
    const scroll = jasmine.createSpy('scrollIntoView');
    const originalGetById = document.getElementById.bind(document);
    spyOn(document, 'getElementById').and.callFake((id: string) => {
      if (id === 'session-membership') {
        return { scrollIntoView: scroll } as unknown as HTMLElement;
      }
      return originalGetById(id);
    });

    const page = TestBed.createComponent(SessionDetailsComponent);
    page.detectChanges();

    const status = page.nativeElement.querySelector('#session-membership') as HTMLElement;
    expect(status.classList.contains('waitlisted')).toBeTrue();
    expect(status.textContent).toContain('na posição 2');
    expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'start' });
    expect(sessionService.join).not.toHaveBeenCalled();
    page.destroy();
  });

  it('does not show a stale promotion as confirmed membership after leaving', () => {
    fixture.destroy();
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).queryParamMap = convertToParamMap({ membership: '1' });
    sessionService.detail.and.returnValue(of({
      ...session, joined: false, waitlisted: false,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    }));
    const scroll = jasmine.createSpy('scrollIntoView');
    const originalGetById = document.getElementById.bind(document);
    spyOn(document, 'getElementById').and.callFake((id: string) => {
      if (id === 'session-membership') {
        return { scrollIntoView: scroll } as unknown as HTMLElement;
      }
      return originalGetById(id);
    });

    const page = TestBed.createComponent(SessionDetailsComponent);
    page.detectChanges();
    expect(page.nativeElement.querySelector('#session-membership')).toBeNull();
    expect(scroll).not.toHaveBeenCalled();
    expect(sessionService.join).not.toHaveBeenCalled();
    page.destroy();
  });

  it('does not scroll to joining when the Discover visitor is already participating', () => {
    fixture.destroy();
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).queryParamMap = convertToParamMap({ join: '1' });
    sessionService.detail.and.returnValue(of({
      ...session, joined: true, gameDate: new Date(Date.now() + 3600_000).toISOString()
    }));
    const scroll = jasmine.createSpy('scrollIntoView');
    const originalGetById = document.getElementById.bind(document);
    spyOn(document, 'getElementById').and.callFake((id: string) => {
      if (id === 'session-participation') {
        return { scrollIntoView: scroll } as unknown as HTMLElement;
      }
      return originalGetById(id);
    });

    const page = TestBed.createComponent(SessionDetailsComponent);
    page.detectChanges();

    expect(scroll).not.toHaveBeenCalled();
    expect(sessionService.join).not.toHaveBeenCalled();
    page.destroy();
  });

  it('rejects non-integer session IDs without requesting details', () => {
    fixture.destroy();
    const route = TestBed.inject(ActivatedRoute);
    (route.snapshot as any).paramMap = convertToParamMap({ id: '7.5' });
    sessionService.detail.calls.reset();

    const page = TestBed.createComponent(SessionDetailsComponent);
    page.detectChanges();

    expect(page.componentInstance.errorMessage).toBeTruthy();
    expect(sessionService.detail).not.toHaveBeenCalled();
    page.destroy();
  });

  it('should join the session and refresh its details', () => {
    component.session = { ...session, gameDate: new Date(Date.now() + 3600_000).toISOString() };
    component.joinSession();

    expect(sessionService.join).toHaveBeenCalledWith(7, '');
    expect(sessionService.detail).toHaveBeenCalledTimes(2);
    expect(component.actionSuccess).toContain('sucesso');
  });

  it('should allow joining the waitlist when a future session is full', () => {
    component.session = {
      ...session,
      status: 'FULL',
      participantCount: 4,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    };
    sessionService.join.and.returnValue(of({ state: 'WAITLISTED', waitlistPosition: 1 }));

    expect(component.canJoinSession()).toBeTrue();
    expect(component.joinButtonLabel()).toContain('lista de espera');
    component.joinSession();

    expect(sessionService.join).toHaveBeenCalledWith(7, '');
    expect(component.actionSuccess).toContain('lista de espera');
  });

  it('should hide new inscriptions for cancelled, completed and already started sessions', () => {
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    for (const closedCase of [
      { status: 'CANCELLED', gameDate: futureDate },
      { status: 'COMPLETED', gameDate: futureDate },
      { status: 'OPEN', gameDate: new Date(Date.now() - 3600_000).toISOString() }
    ]) {
      component.session = { ...session, ...closedCase };
      expect(component.canJoinSession()).toBeFalse();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.join-controls .primary-action')).toBeNull();
      component.joinSession();
    }

    expect(sessionService.join).not.toHaveBeenCalled();
  });

  it('should not offer another inscription to an existing participant or waitlisted user', () => {
    const gameDate = new Date(Date.now() + 3600_000).toISOString();
    component.session = { ...session, joined: true, gameDate };
    expect(component.canJoinSession()).toBeFalse();
    component.joinSession();
    component.session = { ...session, waitlisted: true, gameDate };
    expect(component.canJoinSession()).toBeFalse();
    component.joinSession();
    expect(sessionService.join).not.toHaveBeenCalled();
  });

  it('does not offer leaving a completed or cancelled session', () => {
    for (const status of ['COMPLETED', 'CANCELLED']) {
      for (const membership of [{ joined: true }, { waitlisted: true }]) {
        component.session = { ...session, ...membership, status };
        fixture.detectChanges();

        expect(component.canLeaveSession()).toBeFalse();
        expect(fixture.nativeElement.querySelector('.participation-panel button.danger-action')).toBeNull();

        component.leaveSession();
      }
    }

    expect(sessionService.leave).not.toHaveBeenCalled();
  });

  it('does not offer leaving after the session starts', () => {
    component.session = {
      ...session,
      joined: true,
      status: 'OPEN',
      gameDate: new Date(Date.now() - 3600_000).toISOString()
    };
    fixture.detectChanges();

    expect(component.canLeaveSession()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.participation-panel button.danger-action')).toBeNull();

    component.leaveSession();
    expect(sessionService.leave).not.toHaveBeenCalled();
  });

  it('does not offer leaving a waitlist after the session starts', () => {
    component.session = {
      ...session,
      joined: false,
      waitlisted: true,
      status: 'FULL',
      gameDate: new Date(Date.now() - 3600_000).toISOString()
    };
    fixture.detectChanges();

    expect(component.canLeaveSession()).toBeFalse();
    component.leaveSession();
    expect(sessionService.leave).not.toHaveBeenCalled();
  });

  it('allows an active participant to leave an open session', () => {
    component.session = {
      ...session,
      joined: true,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    };
    fixture.detectChanges();

    expect(component.canLeaveSession()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.participation-panel button.danger-action')).not.toBeNull();

    component.leaveSession();

    expect(sessionService.leave).toHaveBeenCalledOnceWith(7);
  });

  it('should leave a waitlisted session and refresh details', () => {
    component.session = {
      ...session,
      waitlisted: true,
      waitlistPosition: 2,
      gameDate: new Date(Date.now() + 3600_000).toISOString()
    };

    component.leaveSession();

    expect(sessionService.leave).toHaveBeenCalledWith(7);
    expect(sessionService.detail).toHaveBeenCalledTimes(2);
    expect(component.actionSuccess).toContain('lista de espera');
  });

  it('should report a selected problem for a started session without reloading details', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      joined: true,
      status: 'OPEN',
      gameDate: '2026-09-30T18:00:00Z'
    };
    component.selectedProblemType = 'VENUE_PROBLEM';
    component.problemDetails = '  Campo sem iluminação  ';

    component.reportProblem();

    expect(sessionService.reportProblem).toHaveBeenCalledWith(
      7,
      'VENUE_PROBLEM',
      'Campo sem iluminação'
    );
    expect(sessionService.detail).toHaveBeenCalledTimes(1);
    expect(component.actionSuccess).toBeTruthy();
    expect(component.showProblemReport).toBeFalse();
    expect(component.selectedProblemType).toBe('');
    expect(component.problemDetails).toBe('');
  });

  it('should reject problem details longer than 500 characters', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      joined: true,
      status: 'OPEN',
      gameDate: '2026-09-30T18:00:00Z'
    };
    component.selectedProblemType = 'OTHER';
    component.problemDetails = 'x'.repeat(501);

    component.reportProblem();

    expect(sessionService.reportProblem).not.toHaveBeenCalled();
    expect(component.actionError).toContain('500');
  });

  it('should label a previously reported session problem', () => {
    expect(component.problemTypeLabel('NOT_OCCURRED')).toContain('não aconteceu');
    expect(component.problemTypeLabel('VENUE_PROBLEM')).toContain('recinto');
    expect(component.problemTypeLabel('OTHER')).toContain('Outro');
  });

  it('should show reported problem details returned for the creator', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      joined: true,
      problemType: 'OTHER',
      problemDetails: 'Balneário sem água quente'
    };

    fixture.detectChanges();

    const reportedState = fixture.nativeElement.querySelector('.reported-problem-state');
    expect(reportedState?.textContent).toContain('Outro');
    expect(reportedState?.textContent).toContain('Balneário sem água quente');
  });

  it('should not allow another problem report after one is already registered', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      joined: true,
      status: 'OPEN',
      gameDate: '2026-09-30T18:00:00Z',
      problemType: 'VENUE_PROBLEM'
    };

    expect(component.canReportProblem()).toBeFalse();

    component.selectedProblemType = 'OTHER';
    component.reportProblem();

    expect(sessionService.reportProblem).not.toHaveBeenCalled();
  });

  it('should not allow problem reporting before the session starts', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      joined: true,
      status: 'OPEN',
      gameDate: '2099-10-01T18:00:00Z'
    };

    component.selectedProblemType = 'OTHER';
    component.reportProblem();

    expect(sessionService.reportProblem).not.toHaveBeenCalled();
  });

  it('should require a password for private sessions', () => {
    component.session = {
      ...session,
      gameDate: new Date(Date.now() + 3600_000).toISOString(),
      privateGame: true
    };

    component.joinSession();

    expect(sessionService.join).not.toHaveBeenCalled();
    expect(component.actionError).toContain('palavra-passe');
  });

  it('lets the organizer update main details in the same session page', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, joined: true, address: 'Rua do Campo',
      status: 'OPEN', gameDate: new Date(Date.now() + 3_600_000).toISOString()
    };
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const edit = root.querySelector<HTMLButtonElement>('.session-edit-master-action button');
    expect(edit).not.toBeNull();
    edit!.click();
    fixture.detectChanges();
    expect(component.detailsEditing).toBeTrue();
    component.detailsDraft.maxParticipants = 6;
    component.detailsDraft.priceAmount = 6.5;
    component.saveDetailsEdit();
    fixture.detectChanges();
    expect(sessionService.updateDetails).toHaveBeenCalledWith(7,
      jasmine.objectContaining({ maxParticipants: 6, priceAmount: 6.5 }));
    expect(component.detailsEditing).toBeFalse();
    expect(component.session?.maxParticipants).toBe(6);
  });

  it('rejects editing below confirmed places and hides the editor from non-organizers', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, joined: true, address: 'Rua do Campo', participantCount: 3,
      status: 'OPEN', gameDate: new Date(Date.now() + 3_600_000).toISOString()
    };
    component.beginDetailsEdit();
    component.detailsDraft.maxParticipants = 2;
    component.saveDetailsEdit();
    expect(sessionService.updateDetails).not.toHaveBeenCalled();
    expect(component.detailsError).toBeTruthy();

    (component as any).currentUsername = 'player-one';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-edit-master-action')).toBeNull();
    (component as any).currentUsername = 'creator-user';
    component.session = { ...component.session, gameDate: '2020-01-01T10:00:00Z' };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-edit-master-action')).toBeNull();
  });

  it('should load chat messages for a participant before kickoff', () => {
    component.session = {
      ...session,
      joined: true,
      gameDate: new Date(Date.now() + 3_600_000).toISOString()
    };

    component.refreshMessages();

    expect(sessionService.messages).toHaveBeenCalledWith(7);
    expect(component.messages).toEqual([]);
  });

  it('keeps past-session chat unavailable on details without deleting server messages', () => {
    const archived: SessionMessage = {
      id: 7,
      sessionId: 7,
      senderUsername: 'player-one',
      body: 'Até ao próximo jogo!',
      createdAt: '2026-10-01T18:00:00Z'
    };
    component.session = { ...session, joined: true };
    sessionService.messages.and.returnValue(of([archived]));

    component.refreshMessages();
    fixture.detectChanges();

    expect(component.canAccessChat()).toBeTrue();
    expect(component.canSendChat()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.chat-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('.message-composer')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Chat indisponível');
    expect(sessionService.messages).not.toHaveBeenCalled();
    expect(component.messages).toEqual([]);

    component.messageBody = 'Tentar enviar depois do jogo';
    component.sendMessage();
    expect(sessionService.postMessage).not.toHaveBeenCalled();
  });

  it('closes chat as soon as the game starts', () => {
    component.session = {
      ...session,
      joined: true,
      gameDate: new Date(Date.now() - 60 * 60_000).toISOString()
    };
    fixture.detectChanges();

    expect(component.canSendChat()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.message-composer')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Chat indisponível');
  });

  it('immediately closes chat when the game is completed, cancelled or did not occur', () => {
    component.session = {
      ...session,
      joined: true,
      gameDate: new Date(Date.now() + 4 * 60 * 60_000).toISOString()
    };
    expect(component.canSendChat()).toBeTrue();

    component.session = { ...component.session, status: 'COMPLETED' };
    expect(component.canSendChat()).toBeFalse();

    component.session = { ...component.session, status: 'CANCELLED' };
    expect(component.canSendChat()).toBeFalse();

    component.session = { ...component.session, status: 'OPEN', problemType: 'NOT_OCCURRED' };
    expect(component.canSendChat()).toBeFalse();
  });

  it('keeps concluded sessions closed to sending until the archive is opened', () => {
    component.session = { ...session, joined: true };
    component.messages = [];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.empty-chat')).toBeNull();
    expect(fixture.nativeElement.querySelector('.message-composer')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Chat indisponível');
  });

  it('should send a chat message and append it locally', () => {
    component.session = {
      ...session,
      joined: true,
      gameDate: new Date(Date.now() + 4 * 60 * 60_000).toISOString()
    };
    component.messageBody = '  Bora jogar!  ';

    component.sendMessage();

    expect(sessionService.postMessage).toHaveBeenCalledWith(7, 'Bora jogar!');
    expect(component.messages.length).toBe(1);
    expect(component.messageBody).toBe('');
  });

  it('sends a quoted session reply with the parent ID and renders persisted snapshot', () => {
    component.session = { ...session, joined: true,
      gameDate: new Date(Date.now() + 3_600_000).toISOString() };
    const original: SessionMessage = { id: 30, sessionId: 7, senderUsername: 'player-two',
      body: 'Levas as bolas?', createdAt: new Date().toISOString() };
    component.messages = [original];
    component.replyToSessionMessage(original);
    expect(component.replyingToSessionMessage?.id).toBe(30);
    const response: SessionMessage = { id: 31, sessionId: 7, senderUsername: 'player-one',
      body: 'Levo!', createdAt: new Date().toISOString(),
      replyToMessageId: 30, replyToSender: 'player-two', replyToText: 'Levas as bolas?' };
    sessionService.postMessage.and.returnValue(of(response));
    component.messageBody = 'Levo!';
    component.sendMessage();
    expect(sessionService.postMessage).toHaveBeenCalledOnceWith(7, 'Levo!', 30);
    expect(component.replyingToSessionMessage).toBeNull();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.chat-panel')).toBeNull();
    expect(component.messages.some(item => item.replyToMessageId === 30)).toBeTrue();
  });

  it('preserves quoted parent and text after an uncertain session POST', () => {
    component.session = { ...session, joined: true,
      gameDate: new Date(Date.now() + 3_600_000).toISOString() };
    const original: SessionMessage = { id: 40, sessionId: 7, senderUsername: 'player-two',
      body: 'A que horas?', createdAt: new Date().toISOString() };
    component.replyToSessionMessage(original);
    component.messageBody = 'Às oito';
    sessionService.postMessage.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    sessionService.messages.and.returnValue(of([]));
    component.sendMessage();
    expect(component.replyingToSessionMessage?.id).toBe(40);
    expect(component.messageBody).toBe('Às oito');
    expect(component.chatDeliveryUncertain).toBeTrue();
    component.sendMessage();
    expect(sessionService.postMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps a socket message when an older HTTP chat response arrives afterwards', () => {
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() + 3_600_000).toISOString()
    };
    const pending = new Subject<SessionMessage[]>();
    sessionService.messages.and.returnValue(pending.asObservable());
    component.refreshMessages();
    const incoming: SessionMessage = {
      id: 801, sessionId: 7, senderUsername: 'player-one',
      body: 'Chego em 5 minutos', createdAt: new Date().toISOString()
    };
    realtimeSessionMessages.next(incoming);
    pending.next([]);
    pending.complete();
    expect(component.messages).toEqual([incoming]);
    realtimeSessionMessages.next(incoming);
    expect(component.messages.length).toBe(1);
  });

  it('shows one inline chat toggle without opening the conversation by default', () => {
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() + 3_600_000).toISOString()
    };
    realtimeConnected.next(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Chat da sessão');
    expect(fixture.nativeElement.querySelector('.chat-panel')).toBeNull();
    realtimeConnected.next(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sync-status')).toBeNull();
  });

  it('opens the session chat inline without redirecting to messages', () => {
    component.session = {
      ...session, joined: true, creatorUsername: 'different-user',
      status: 'OPEN', gameDate: new Date(Date.now() + 3_600_000).toISOString()
    };
    sessionService.messages.and.returnValue(of([
      { id: 11, sessionId: 7, senderUsername: 'player-one',
        body: 'Levo a bola', createdAt: new Date().toISOString() }
    ]));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLButtonElement>('.session-inline-chat-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    toggle!.click();
    fixture.detectChanges();
    expect(sessionService.messages).toHaveBeenCalledWith(7);
    expect(root.querySelector('.session-inline-chat-messages')?.textContent).toContain('Levo a bola');
    expect(root.querySelector('.session-inline-chat-compose textarea')).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    toggle!.click();
    fixture.detectChanges();
    expect(root.querySelector('.session-inline-chat-messages')).toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not open an inline chat after kickoff because the API forbids history access', () => {
    component.session = {
      ...session, joined: true,
      status: 'COMPLETED', gameDate: '2020-01-01T10:00:00Z'
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.session-inline-chat-toggle')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Chat indisponível');
    component.toggleInlineSessionChat();
    expect(component.sessionChatOpen).toBeFalse();
    expect(sessionService.messages).not.toHaveBeenCalled();
  });

  it('blocks a second session POST after network loss until delivery is verified', async () => {
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() + 3_600_000).toISOString()
    };
    (component as any).currentUsername = 'fixture-user';
    component.messageBody = 'Confirmam a hora?';
    sessionService.postMessage.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    sessionService.messages.and.returnValue(of([]));
    component.sendMessage();
    expect(component.chatDeliveryUncertain).toBeTrue();
    expect(component.messageBody).toBe('Confirmam a hora?');
    component.sendMessage();
    expect(sessionService.postMessage).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    await fixture.whenStable(); // ngModel schedules the disabled state asynchronously.
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.chat-delivery-warning')).toBeNull();
    expect(fixture.nativeElement.querySelector('.message-composer')).toBeNull();
    component.resumeChatAfterUncertainSend();
    expect(component.chatDeliveryUncertain).toBeFalse();
    expect(component.messageBody).toBe('Confirmam a hora?');
    expect(sessionService.postMessage).toHaveBeenCalledTimes(1);
  });

  it('confirms uncertain delivery from session chat history without a duplicate POST', () => {
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() + 3_600_000).toISOString()
    };
    (component as any).currentUsername = 'fixture-user';
    component.messageBody = 'Até logo, equipa';
    const delivered: SessionMessage = {
      id: 810, sessionId: 7, senderUsername: 'fixture-user',
      body: 'Até logo, equipa', createdAt: new Date().toISOString()
    };
    sessionService.postMessage.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    sessionService.messages.and.returnValue(of([delivered]));
    component.sendMessage();
    expect(component.chatDeliveryUncertain).toBeFalse();
    expect(component.messageBody).toBe('');
    expect(component.messages.map(message => message.id)).toContain(810);
    expect(sessionService.postMessage).toHaveBeenCalledTimes(1);
  });

  it('never mistakes an older identical message for the uncertain new message', () => {
    component.session = {
      ...session, joined: true,
      gameDate: new Date(Date.now() + 3_600_000).toISOString()
    };
    (component as any).currentUsername = 'fixture-user';
    const old: SessionMessage = {
      id: 707, sessionId: 7, senderUsername: 'fixture-user',
      body: 'Bora jogar', createdAt: new Date().toISOString()
    };
    component.messages = [old];
    component.messageBody = 'Bora jogar';
    sessionService.postMessage.and.returnValue(throwError(() => new HttpErrorResponse({ status: 408 })));
    sessionService.messages.and.returnValue(of([old]));
    component.sendMessage();
    expect(component.chatDeliveryUncertain).toBeTrue();
    expect(component.messageBody).toBe('Bora jogar');
    expect(sessionService.postMessage).toHaveBeenCalledTimes(1);
  });

  it('does not submit Enter during text composition', () => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true });
    component.onChatEnter(event);
    expect(event.defaultPrevented).toBeFalse();
    expect(sessionService.postMessage).not.toHaveBeenCalled();
  });

  it('should append a realtime session message only once', () => {
    const message: SessionMessage = {
      id: 50,
      sessionId: 7,
      senderUsername: 'player-one',
      body: 'Estou a caminho',
      createdAt: '2026-10-01T16:05:00Z'
    };

    realtimeSessionMessages.next(message);
    realtimeSessionMessages.next(message);

    expect(component.messages).toEqual([message]);
  });

  it('should deduplicate the WebSocket echo from the HTTP send response', () => {
    const message: SessionMessage = {
      id: 1,
      sessionId: 7,
      senderUsername: 'fixture-user',
      body: 'Bora jogar!',
      createdAt: '2026-10-01T16:00:00Z'
    };
    component.session = {
      ...session,
      joined: true,
      gameDate: new Date(Date.now() + 4 * 60 * 60_000).toISOString()
    };
    component.messageBody = 'Bora jogar!';

    realtimeSessionMessages.next(message);
    component.sendMessage();

    expect(sessionService.postMessage).toHaveBeenCalledWith(7, 'Bora jogar!');
    expect(component.messages).toEqual([message]);
  });

  it('lets the creator see confirmed player profiles without taking a playing spot', () => {
    sessionService.participants.calls.reset();
    sessionService.messages.calls.reset();
    (component as any).currentUsername = 'creator-user';
    sessionService.detail.and.returnValue(of({
      ...session,
      joined: false,
      gameDate: new Date(Date.now() + 86_400_000).toISOString()
    }));

    component.retrySessionLoad();
    fixture.detectChanges();

    expect(sessionService.participants).toHaveBeenCalledWith(7);
    expect(component.sessionParticipants.map(p => p.username)).toEqual(['player-one']);
    expect(component.session?.joined).toBeFalse();
    expect(sessionService.join).not.toHaveBeenCalled();
    expect(sessionService.messages).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.message-composer')).toBeNull();

    const section = fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    expect(section).not.toBeNull();
    expect(section.textContent).toContain('@player-one');
    expect(section.textContent).toContain('jogadores visíveis');
    const summary = fixture.nativeElement.querySelector('.organizer-preparation') as HTMLElement;
    const button = Array.from(summary.querySelectorAll('button'))
      .find((candidate: any) => candidate.textContent.includes('Quem vai')) as HTMLButtonElement;
    expect(button).toBeDefined();
    const scroll = spyOn(section, 'scrollIntoView');
    button.click();
    expect(scroll).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'start' });
  });

  it('shows creator roster loading and never equates its size with total confirmed places', () => {
    sessionService.participants.calls.reset();
    (component as any).currentUsername = 'creator-user';
    const pending = new Subject<any[]>();
    sessionService.participants.and.returnValue(pending.asObservable());
    sessionService.detail.and.returnValue(of({
      ...session,
      joined: false,
      participantCount: 4,
      maxParticipants: 5
    }));

    component.retrySessionLoad();
    fixture.detectChanges();
    const section = fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    expect(section.textContent).toContain('A carregar jogadores confirmados');
    expect(section.textContent).not.toContain('4 perfis');
    pending.next([{
      id: 15, username: 'player-one', attendanceStatus: 'PENDING',
      joinedAt: '2026-09-20T18:00:00Z'
    }]);
    pending.complete();
    fixture.detectChanges();

    expect(sessionService.participants).toHaveBeenCalledTimes(1);
    expect(section.textContent).toContain('1 jogadores visíveis');
    expect(section.textContent).not.toContain('A carregar jogadores confirmados');
  });

  it('keeps the participant roster inaccessible to non-participants who are not creators', () => {
    sessionService.participants.calls.reset();
    (component as any).currentUsername = 'outsider';
    component.session = {
      ...session,
      joined: false,
      creatorUsername: 'creator-user'
    };
    component.sessionParticipants = [{
      id: 15, username: 'player-one', attendanceStatus: 'PENDING',
      joinedAt: '2026-09-20T18:00:00Z'
    }];

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#session-participants')).toBeNull();
    expect(fixture.nativeElement.querySelector('.organizer-preparation')).toBeNull();
    component.loadSessionParticipants();
    component.scrollToParticipants();
    expect(sessionService.participants).not.toHaveBeenCalled();
  });

  it('should let a joined non-creator view who is going', () => {
    sessionService.participants.calls.reset();
    (component as any).currentUsername = 'player-one';
    component.session = {
      ...session,
      joined: true,
      creatorUsername: 'creator-user'
    };

    component.loadSessionParticipants();

    expect(sessionService.participants).toHaveBeenCalledWith(7);
    expect(component.sessionParticipants.length).toBe(1);
    expect(component.sessionParticipants[0].username).toBe('player-one');
  });

  it('should not load the visible participant list for outsiders', () => {
    sessionService.participants.calls.reset();
    component.session = {
      ...session,
      joined: false
    };

    component.loadSessionParticipants();

    expect(sessionService.participants).not.toHaveBeenCalled();
  });

  it('should allow the creator to load active participants', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      joined: true
    };

    component.loadParticipants();

    expect(sessionService.participants).toHaveBeenCalledWith(7);
    expect(component.participants.length).toBe(1);
  });

  it('offers the Excel team balancer to a community organiser who does not take a playing slot', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, creatorUsername: 'creator-user', joined: false, waitlisted: false,
      communityId: 9, sport: 'Futebol', teamBalanceSupported: true, participantCount: 10, maxParticipants: 10,
      status: 'FULL', gameDate: new Date(Date.now() + 86_400_000).toISOString()
    };
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.team-generator');
    expect(panel).toBeTruthy();
    const excel: HTMLButtonElement | null = panel.querySelector('.team-generator-excel-action');
    expect(excel).toBeTruthy();
    excel!.click();
    expect(sessionService.teamSuggestion).toHaveBeenCalledWith(7, 'EXCEL_POINTS');
    expect(component.teamSuggestionPendingConfirmation).toBeTrue();
  });

  it('does not offer Excel team generation to non-organisers or before the roster is full', () => {
    component.session = {
      ...session, communityId: 9, sport: 'Futebol', teamBalanceSupported: true, participantCount: 10, maxParticipants: 10,
      status: 'FULL', gameDate: new Date(Date.now() + 86_400_000).toISOString()
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.team-generator-excel-action')).toBeNull();
    (component as any).currentUsername = 'creator-user';
    component.session = { ...component.session, participantCount: 9, status: 'OPEN' };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.team-generator-excel-action')).toBeNull();
  });

  it('lets an organizer choose teams manually and blocks uneven confirmation', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, creatorUsername: 'creator-user', joined: true,
      communityId: 9, sport: 'Futebol', teamBalanceSupported: false,
      participantCount: 4, maxParticipants: 4, status: 'FULL'
    };
    const player = (username: string) => ({
      username, strengthScore: 0, statsAvailable: false,
      games: 0, wins: 0, goals: 0, assists: 0
    });
    sessionService.teamSuggestion.and.returnValue(of({
      teamA: [player('one'), player('two')],
      teamB: [player('three'), player('four')],
      teamAScore: 0, teamBScore: 0, playersWithStats: 0, totalPlayers: 4
    }));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const manual = Array.from(root.querySelectorAll<HTMLButtonElement>('.team-generator-actions button'))
      .find(button => button.textContent?.includes('Escolher equipas manualmente'));
    expect(manual).toBeDefined();
    manual!.click();
    fixture.detectChanges();
    expect(sessionService.teamSuggestion).toHaveBeenCalledWith(7, 'MANUAL');
    expect(component.teamsScoreSource).toBe('MANUAL');
    expect(root.querySelectorAll('.session-manual-team-move').length).toBe(4);
    component.moveSuggestedPlayer('two', 'A');
    fixture.detectChanges();
    expect(component.manualTeamsBalanced).toBeFalse();
    const confirmationButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('button.primary-action'));
    const confirmButton = confirmationButtons.find(button => button.textContent?.includes('Confirmar equipas'));
    expect(confirmButton).toBeDefined();
    expect(confirmButton?.disabled).toBeTrue();
    component.confirmTeams();
    expect(sessionService.confirmTeams).not.toHaveBeenCalled();
    component.moveSuggestedPlayer('three', 'B');
    fixture.detectChanges();
    expect(component.manualTeamsBalanced).toBeTrue();
    component.confirmTeams();
    expect(sessionService.confirmTeams).toHaveBeenCalledWith(7, 'MANUAL', jasmine.objectContaining({
      teamA: jasmine.arrayContaining([jasmine.objectContaining({ username: 'three' })]),
      teamB: jasmine.arrayContaining([jasmine.objectContaining({ username: 'two' })])
    }));
  });

  it('should generate balanced teams for a full community session created by the viewer', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      creatorUsername: 'creator-user',
      joined: true,
      communityId: 9, sport: 'Futebol', teamBalanceSupported: true,
      participantCount: 4,
      maxParticipants: 4,
      status: 'FULL'
    };

    expect(component.canGenerateTeams()).toBeTrue();

    component.generateTeams();

    expect(sessionService.teamSuggestion).toHaveBeenCalledWith(7, 'FORM');
    expect(component.teamSuggestion?.teamA[0].username).toBe('creator-user');
    expect(component.teamSuggestion?.playersWithStats).toBe(2);
    expect(component.teamSuggestionPendingConfirmation).toBeTrue();
  });

  it('should confirm generated teams and refresh participant assignments', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      creatorUsername: 'creator-user',
      joined: true,
      communityId: 9, sport: 'Futebol', teamBalanceSupported: true,
      participantCount: 4,
      maxParticipants: 4,
      status: 'FULL'
    };
    component.teamSuggestion = {
      teamA: [
        { username: 'creator-user', strengthScore: 2.8, statsAvailable: true, games: 8, wins: 5, goals: 6, assists: 2 }
      ],
      teamB: [
        { username: 'player-one', strengthScore: 2.7, statsAvailable: true, games: 8, wins: 4, goals: 7, assists: 1 }
      ],
      teamAScore: 2.8,
      teamBScore: 2.7,
      playersWithStats: 2,
      totalPlayers: 2
    };
    component.teamSuggestionPendingConfirmation = true;
    sessionService.participants.and.returnValue(of([
      {
        id: 1,
        username: 'creator-user',
        attendanceStatus: 'PENDING',
        joinedAt: '2026-09-20T18:00:00Z',
        teamCode: 'A'
      },
      {
        id: 15,
        username: 'player-one',
        attendanceStatus: 'PENDING',
        joinedAt: '2026-09-20T18:00:00Z',
        teamCode: 'B'
      }
    ]));

    component.confirmTeams();

    expect(sessionService.confirmTeams).toHaveBeenCalledWith(7, 'FORM', component.teamSuggestion);
    expect(component.teamsSuccess).toContain('confirmadas');
    expect(component.teamSuggestionPendingConfirmation).toBeFalse();
    expect(component.hasConfirmedTeams()).toBeTrue();
    expect(component.teamParticipants('A')[0].username).toBe('creator-user');
  });

  it('offers Excel balancing as a separate, non-persisting organiser preview', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, joined: true, creatorUsername: 'creator-user',
      communityId: 9, sport: 'Futebol', teamBalanceSupported: true, participantCount: 10, maxParticipants: 10, status: 'FULL'
    };
    const preview = {
      teamA: [{ username: 'creator-user', strengthScore: 20, statsAvailable: true,
        games: 0, wins: 0, goals: 0, assists: 0 }],
      teamB: [{ username: 'player-one', strengthScore: 19, statsAvailable: false,
        games: 0, wins: 0, goals: 0, assists: 0 }],
      teamAScore: 20, teamBScore: 19, playersWithStats: 1, totalPlayers: 2
    };
    sessionService.teamSuggestion.and.returnValue(of(preview));
    component.generateTeams('EXCEL_POINTS');
    fixture.detectChanges();

    expect(sessionService.teamSuggestion).toHaveBeenCalledWith(7, 'EXCEL_POINTS');
    expect(sessionService.confirmTeams).not.toHaveBeenCalled();
    expect(component.teamsScoreSource).toBe('EXCEL_POINTS');
    expect(component.teamSuggestionPendingConfirmation).toBeTrue();
    const shell: HTMLElement = fixture.nativeElement;
    expect(shell.querySelector('.team-generator-excel-action')).toBeTruthy();
    expect(shell.querySelector('.team-suggestion')?.textContent).toContain('20');
    expect(shell.querySelector('.team-suggestion')?.textContent).toContain('Sem pontuação associada');
  });

  it('confirms the same selected Excel ranking source and can switch back to form', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, joined: true, creatorUsername: 'creator-user',
      communityId: 9, sport: 'Futebol', teamBalanceSupported: true, participantCount: 10, maxParticipants: 10, status: 'FULL'
    };
    component.generateTeams('EXCEL_POINTS');
    component.confirmTeams();
    expect(sessionService.confirmTeams).toHaveBeenCalledWith(7, 'EXCEL_POINTS', component.teamSuggestion);
    expect(component.teamSuggestionPendingConfirmation).toBeFalse();

    component.generateTeams('FORM');
    expect(sessionService.teamSuggestion).toHaveBeenCalledWith(7, 'FORM');
    expect(component.teamsScoreSource).toBe('FORM');
    expect(component.teamSuggestionPendingConfirmation).toBeTrue();
  });

  it('should not confirm the same team suggestion twice', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      creatorUsername: 'creator-user',
      joined: true,
      communityId: 9, sport: 'Futebol', teamBalanceSupported: true,
      participantCount: 4,
      maxParticipants: 4,
      status: 'FULL'
    };
    component.teamSuggestion = {
      teamA: [],
      teamB: [],
      teamAScore: 0,
      teamBScore: 0,
      playersWithStats: 0,
      totalPlayers: 4
    };
    component.teamSuggestionPendingConfirmation = false;

    component.confirmTeams();

    expect(sessionService.confirmTeams).not.toHaveBeenCalled();
  });

  it('should not offer team generation outside community sessions', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      creatorUsername: 'creator-user',
      joined: true,
      participantCount: 4,
      maxParticipants: 4,
      status: 'FULL',
      communityId: null
    };

    expect(component.canGenerateTeams()).toBeFalse();

    component.generateTeams();

    expect(sessionService.teamSuggestion).not.toHaveBeenCalled();
  });


  it('hides the team generator for individual and undecided singles/doubles sports', () => {
    (component as any).currentUsername = 'creator-user';
    for (const sport of ['Atletismo', 'Ciclismo', 'Padel', 'Ténis']) {
      component.session = {
        ...session, creatorUsername: 'creator-user', sport,
        teamBalanceSupported: false, communityId: 9,
        participantCount: 10, maxParticipants: 10, status: 'FULL'
      };
      fixture.detectChanges();
      expect(component.canGenerateTeams()).withContext(sport).toBeFalse();
      expect(fixture.nativeElement.querySelector('.team-generator')).toBeNull();
    }
    expect(sessionService.teamSuggestion).not.toHaveBeenCalled();
  });

  it('supports different confirmed team rosters only when the API declares eligibility', () => {
    (component as any).currentUsername = 'creator-user';
    for (const size of [4, 6, 8, 10, 12, 14]) {
      component.session = {
        ...session, creatorUsername: 'creator-user', sport: 'Futebol',
        teamBalanceSupported: true, communityId: 9,
        participantCount: size, maxParticipants: size, status: 'FULL'
      };
      expect(component.canGenerateTeams()).withContext(String(size)).toBeTrue();
    }
    component.session = { ...component.session!, participantCount: 9, maxParticipants: 10 };
    expect(component.canGenerateTeams()).toBeFalse();
    component.session = { ...component.session!, participantCount: 10, maxParticipants: 10, teamBalanceSupported: false };
    expect(component.canGenerateTeams()).toBeTrue();
  });

  it('distinguishes cancelling removal from the destructive confirm action', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      creatorUsername: 'creator-user',
      joined: true
    };
    const participant = {
      id: 15,
      username: 'player-one',
      attendanceStatus: 'PENDING',
      joinedAt: '2026-09-20T18:00:00Z'
    } as any;

    component.participants = [participant];
    component.showAttendanceManager = true;
    component.requestRemoveParticipant(participant);
    fixture.detectChanges();

    const confirm = fixture.nativeElement.querySelector('.confirm-remove-action') as HTMLButtonElement;
    const cancel = fixture.nativeElement.querySelector('.cancel-remove-action') as HTMLButtonElement;
    expect(confirm).toBeTruthy();
    expect(cancel).toBeTruthy();
    expect(confirm.classList.contains('jynlo-action--danger')).toBeTrue();
    expect(cancel.classList.contains('jynlo-action--neutral')).toBeTrue();
    expect(cancel.classList.contains('jynlo-action--danger')).toBeFalse();
  });

  it('should remove a non-creator participant and refresh the session', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      creatorUsername: 'creator-user',
      joined: true
    };
    const participant = {
      id: 15,
      username: 'player-one',
      attendanceStatus: 'PENDING',
      joinedAt: '2026-09-20T18:00:00Z'
    } as any;

    component.requestRemoveParticipant(participant);
    component.confirmRemoveParticipant(participant);

    expect(sessionService.removeParticipant).toHaveBeenCalledWith(7, 15);
    expect(component.participantManagementSuccess).toContain('removido');
    expect(component.pendingRemovalId).toBeNull();
  });

  it('should never offer removal for the session creator', () => {
    component.session = {
      ...session,
      creatorUsername: 'creator-user'
    };
    const creatorParticipant = {
      id: 1,
      username: 'creator-user',
      attendanceStatus: 'PENDING',
      joinedAt: '2026-09-20T18:00:00Z'
    } as any;

    expect(component.canRemoveParticipant(creatorParticipant)).toBeFalse();
  });

  it('should block attendance during the 30 minute post-start delay', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      gameDate: new Date(Date.now() - (29 * 60 * 1000)).toISOString(),
      joined: true
    };
    const participant = {
      id: 15,
      username: 'player-one',
      attendanceStatus: 'PENDING',
      joinedAt: '2026-09-20T18:00:00Z'
    } as any;

    component.recordAttendance(participant, 'NO_SHOW');

    expect(reliabilityService.recordAttendance).not.toHaveBeenCalled();
    expect(component.attendanceError).toContain('30 minutos');
    expect(participant.attendanceStatus).toBe('PENDING');
  });

  it('should not allow attendance management for a cancelled session', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      status: 'CANCELLED',
      joined: true,
      gameDate: '2020-10-01T18:00:00Z'
    };

    expect(component.canRecordAttendance()).toBeFalse();

    component.toggleAttendanceManager();

    expect(component.showAttendanceManager).toBeFalse();
    expect(sessionService.participants).not.toHaveBeenCalled();
  });

  it('should hide attendance management before the 30 minute delay', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      joined: true,
      gameDate: new Date(Date.now() - (29 * 60 * 1000)).toISOString()
    };

    fixture.detectChanges();

    expect(component.canRecordAttendance()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.attendance-panel')).toBeNull();
  });

  it('should not load participants until attendance management is opened', () => {
    sessionService.participants.calls.reset();
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      joined: true,
      gameDate: '2020-10-01T18:00:00Z'
    };
    component.participants = [];

    expect(sessionService.participants).not.toHaveBeenCalled();

    component.toggleAttendanceManager();

    expect(sessionService.participants).toHaveBeenCalledWith(7);
  });

  it('should keep post-session attendance management collapsed until requested', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      joined: true,
      gameDate: '2020-10-01T18:00:00Z'
    };

    expect(component.canRecordAttendance()).toBeTrue();
    expect(component.showAttendanceManager).toBeFalse();

    component.toggleAttendanceManager();

    expect(component.showAttendanceManager).toBeTrue();
  });

  it('confirms all pending players with one click', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, gameDate: '2020-10-01T18:00:00Z', joined: true };
    component.showAttendanceManager = true;
    component.participants = [
      { id: 15, username: 'ana', attendanceStatus: 'PENDING', joinedAt: '2026-09-20T18:00:00Z' },
      { id: 16, username: 'rui', attendanceStatus: 'PENDING', joinedAt: '2026-09-20T18:00:00Z' }
    ];
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.confirm-bulk-attendance') as HTMLButtonElement;
    expect(button.textContent).toContain('Confirmar presença de todos');
    button.click();

    expect(reliabilityService.recordAttendance).toHaveBeenCalledWith(7, 15, 'ATTENDED');
    expect(reliabilityService.recordAttendance).toHaveBeenCalledWith(7, 16, 'ATTENDED');
    expect(component.participants.map(p => p.attendanceStatus)).toEqual(['ATTENDED', 'ATTENDED']);
    expect(component.canConfirmPendingAttendance()).toBeFalse();
  });

  it('switches label after a no-show and preserves prior decisions', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, gameDate: '2020-10-01T18:00:00Z', joined: true };
    component.showAttendanceManager = true;
    component.participants = [
      { id: 15, username: 'ana', attendanceStatus: 'NO_SHOW', joinedAt: '2026-09-20T18:00:00Z' },
      { id: 16, username: 'rui', attendanceStatus: 'PENDING', joinedAt: '2026-09-20T18:00:00Z' },
      { id: 17, username: 'leo', attendanceStatus: 'ATTENDED', joinedAt: '2026-09-20T18:00:00Z' },
      { id: 18, username: 'luis', attendanceStatus: 'LATE_CANCELLED', joinedAt: '2026-09-20T18:00:00Z' }
    ];
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.confirm-bulk-attendance') as HTMLButtonElement;
    expect(button.textContent).toContain('Confirmar presença dos restantes jogadores');
    button.click();

    expect(reliabilityService.recordAttendance).toHaveBeenCalledTimes(1);
    expect(reliabilityService.recordAttendance).toHaveBeenCalledWith(7, 16, 'ATTENDED');
    expect(component.participants.map(p => p.attendanceStatus))
      .toEqual(['NO_SHOW', 'ATTENDED', 'ATTENDED', 'LATE_CANCELLED']);
  });

  it('keeps failed bulk updates pending and reports partial success', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, gameDate: '2020-10-01T18:00:00Z', joined: true };
    component.participants = [
      { id: 15, username: 'ana', attendanceStatus: 'PENDING', joinedAt: '2026-09-20T18:00:00Z' },
      { id: 16, username: 'rui', attendanceStatus: 'PENDING', joinedAt: '2026-09-20T18:00:00Z' }
    ];
    reliabilityService.recordAttendance.and.callFake((_sessionId, participantId) =>
      participantId === 15 ? of(void 0) : throwError(() => new Error('failure'))
    );
    component.confirmPendingAttendance();
    expect(component.participants.map(p => p.attendanceStatus)).toEqual(['ATTENDED', 'PENDING']);
    expect(component.attendanceSuccess).toContain('1');
    expect(component.attendanceError).toContain('1 de 2');
    expect(component.canConfirmPendingAttendance()).toBeTrue();
  });

  it('blocks bulk attendance before the half-hour delay and for non-organisers', () => {
    component.participants = [
      { id: 15, username: 'ana', attendanceStatus: 'PENDING', joinedAt: '2026-09-20T18:00:00Z' }
    ];
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, gameDate: new Date(Date.now() - 29 * 60_000).toISOString(), joined: true
    };
    expect(component.canConfirmPendingAttendance()).toBeFalse();
    component.confirmPendingAttendance();
    expect(reliabilityService.recordAttendance).not.toHaveBeenCalled();

    component.session = { ...session, gameDate: '2020-10-01T18:00:00Z', joined: true };
    (component as any).currentUsername = 'someone-else';
    expect(component.canConfirmPendingAttendance()).toBeFalse();
  });

  it('offers an explicit choice only after a recorded absence and allows undo', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    component.showAttendanceManager = true;
    const absent = { id: 15, username: 'ana', attendanceStatus: 'NO_SHOW' as const,
      joinedAt: '2026-09-20T18:00:00Z' };
    sessionService.participants.and.returnValue(of([absent]));
    component.loadParticipants();

    expect(sessionService.futureExclusionStatus).toHaveBeenCalledWith(7, 15);
    expect(component.futureExclusions[15]).toBeFalse();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.future-exclusion-request') as HTMLButtonElement).click();
    expect(sessionService.excludeFromFutureSessions).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('ana');

    fixture.detectChanges();
    const reason = fixture.nativeElement.querySelector('.future-exclusion-reason') as HTMLSelectElement;
    expect(reason).not.toBeNull();
    expect((fixture.nativeElement.querySelector('.future-exclusion-confirm') as HTMLButtonElement).disabled).toBeTrue();
    reason.value = 'NO_SHOW';
    reason.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.future-exclusion-confirm') as HTMLButtonElement).click();
    expect(sessionService.excludeFromFutureSessions).toHaveBeenCalledWith(7, 15, 'NO_SHOW');
    expect(component.futureExclusions[15]).toBeTrue();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.future-exclusion-undo')).not.toBeNull();

    // Undo remains accessible even if the attendance record is subsequently corrected.
    absent.attendanceStatus = 'ATTENDED' as any;
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.future-exclusion-undo') as HTMLButtonElement).click();
    expect(sessionService.allowFutureSessions).toHaveBeenCalledWith(7, 15);
    expect(component.futureExclusions[15]).toBeFalse();
  });

  it('requires an explicit reason and does not allow restrictions by outsiders', () => {
    const participant = { id: 15, username: 'ana', attendanceStatus: 'PENDING' as const,
      joinedAt: '2026-09-20T18:00:00Z' };
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    component.futureExclusions[15] = false;
    component.requestFutureExclusion(participant);
    expect(component.pendingFutureExclusionId).toBe(15);
    component.confirmFutureExclusion(participant);
    expect(sessionService.excludeFromFutureSessions).not.toHaveBeenCalled();
    component.chooseFutureExclusionReason(participant, 'NO_SHOW');
    expect(component.pendingFutureExclusionReason).toBe('');
    component.cancelFutureExclusion();

    (component as any).currentUsername = 'outsider';
    component.requestFutureExclusion(participant);
    expect(component.pendingFutureExclusionId).toBeNull();
    expect(sessionService.excludeFromFutureSessions).not.toHaveBeenCalled();
  });

  it('shows confirmed guest team members by name without creating a profile link', () => {
    component.guestRequests = [
      {id: 501,name:'Afonso Salvador',status:'APPROVED',teamCode:'A',note:''},
      {id: 502,name:'João Marques',status:'APPROVED',teamCode:'B',note:''},
      {id: 503,name:'Outro',status:'CANCELLED',teamCode:'A',note:''}
    ];
    spyOn(component,'isCreator').and.returnValue(true);
    expect(component.guestTeamParticipants('A').map(item=>item.name)).toEqual(['Afonso Salvador']);
    expect(component.guestTeamParticipants('B').map(item=>item.name)).toEqual(['João Marques']);
    component.confirmedTeams=false;
    expect(component.hasConfirmedTeams()).toBeTrue();
  });

  it('lets the organizer restrict a present player for lack of fair play without changing attendance', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    component.showAttendanceManager = true;
    const player = { id: 15, username: 'ana', attendanceStatus: 'ATTENDED' as const,
      joinedAt: '2026-09-20T18:00:00Z' };
    sessionService.participants.and.returnValue(of([player]));
    component.loadParticipants();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.future-exclusion-request')).not.toBeNull();
    (fixture.nativeElement.querySelector('.future-exclusion-request') as HTMLButtonElement).click();
    fixture.detectChanges();
    const reason = fixture.nativeElement.querySelector('.future-exclusion-reason') as HTMLSelectElement;
    expect(Array.from(reason.options).some(option => option.value === 'NO_SHOW')).toBeFalse();
    reason.value = 'UNSPORTING_CONDUCT';
    reason.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.pendingFutureExclusionReason).toBe('UNSPORTING_CONDUCT');
    (fixture.nativeElement.querySelector('.future-exclusion-confirm') as HTMLButtonElement).click();
    expect(sessionService.excludeFromFutureSessions).toHaveBeenCalledOnceWith(7, 15, 'UNSPORTING_CONDUCT');
    expect(player.attendanceStatus).toBe('ATTENDED');
    expect(component.futureExclusions[15]).toBeTrue();

    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.future-exclusion-undo') as HTMLButtonElement).click();
    expect(sessionService.allowFutureSessions).toHaveBeenCalledOnceWith(7, 15);
    expect(component.futureExclusions[15]).toBeFalse();
  });

  it('shows a recoverable error when restriction status cannot be loaded', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = { ...session, joined: true, gameDate: '2020-10-01T18:00:00Z' };
    component.showAttendanceManager = true;
    sessionService.futureExclusionStatus.and.returnValue(throwError(() => new Error('unavailable')));
    sessionService.participants.and.returnValue(of([
      { id: 15, username: 'ana', attendanceStatus: 'NO_SHOW', joinedAt: '2026-09-20T18:00:00Z' }
    ]));
    component.loadParticipants();
    expect(component.futureExclusions[15]).toBeNull();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.future-exclusion-request')).toBeNull();
    const retryButton = fixture.nativeElement.querySelector('.future-exclusion-undo') as HTMLButtonElement;
    expect(retryButton).not.toBeNull();
    expect(retryButton.textContent).toContain('Tentar novamente');
    expect(fixture.nativeElement.textContent).toContain('Não foi possível verificar');

    retryButton.click();
    expect(sessionService.participants).toHaveBeenCalledTimes(2);
    expect(sessionService.futureExclusionStatus).toHaveBeenCalledTimes(2);
  });

  it('should record participant attendance after the 30 minute delay', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session,
      gameDate: '2020-10-01T18:00:00Z',
      joined: true
    };
    const participant = {
      id: 15,
      username: 'player-one',
      attendanceStatus: 'PENDING',
      joinedAt: '2026-09-20T18:00:00Z'
    } as any;

    component.recordAttendance(participant, 'ATTENDED');

    expect(reliabilityService.recordAttendance).toHaveBeenCalledWith(7, 15, 'ATTENDED');
    expect(participant.attendanceStatus).toBe('ATTENDED');
  });

  it('should expose a recoverable error when session details fail to load', () => {
    sessionService.detail.and.returnValue(
      throwError(() => new Error('API unavailable'))
    );

    component.retrySessionLoad();

    expect(component.loading).toBeFalse();
    expect(component.errorMessage).toContain('detalhes');
  });

  it('should clear the load error when retrying session details successfully', () => {
    component.errorMessage = 'temporary error';
    sessionService.detail.and.returnValue(of(session));

    component.retrySessionLoad();

    expect(component.errorMessage).toBe('');
    expect(component.session?.id).toBe(7);
  });

  it('shows account photos and guest initials in readable roster cards', () => {
    (component as any).currentUsername = 'player-one';
    component.session = {...session, joined:true};
    component.sessionParticipants = [
      {id:1,username:'player-one',profilePicUrl:'https://cdn.example.test/player.jpg',
       attendanceStatus:'PENDING',joinedAt:'2026-09-20T18:00:00Z'}
    ];
    component.memberConfirmedGuests = [{id:501,name:'Fresco',teamCode:null}];
    component.confirmedTeams = false;
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    const cards = panel.querySelectorAll('.session-player-card');
    expect(cards.length).toBe(2);
    const linked = panel.querySelector('a.session-player-card__profile') as HTMLAnchorElement;
    expect(linked).not.toBeNull();
    expect(linked.querySelector('img')?.getAttribute('src'))
      .toBe('https://cdn.example.test/player.jpg');
    const guest = panel.querySelector('.session-player-card--guest') as HTMLElement;
    expect(guest.querySelector('img')).toBeNull();
    expect(guest.querySelector('.session-player-card__avatar')?.textContent?.trim()).toBe('F');
    expect(panel.textContent).toContain('2 jogadores');
  });

  it('keeps location navigation without a meeting-point edit action', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {...session,canSeeExactAddress:true,
      address:'Rua da Paz 10, Lisboa',meetingPointInstructions:null,
      gameDate:'2099-10-01T18:00:00Z'};
    fixture.detectChanges();
    const location = fixture.nativeElement.querySelector('.address-panel') as HTMLElement;
    expect(location.querySelector('.session-location-heading')).not.toBeNull();
    expect(location.querySelector('.session-location-detail')).not.toBeNull();
    const maps = location.querySelector('a.session-location-map') as HTMLAnchorElement;
    expect(maps?.href).toContain('google.com/maps');
    expect(location.querySelector('.session-meeting-edit-button')).toBeNull();
    expect(location.querySelector('.session-meeting-edit')).toBeNull();
  });

  it('keeps approved guest cancellations only in Who is going, requiring explicit confirmation', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, creatorUsername:'creator-user', joined:true,
      audience:'COMMUNITY_ONLY', gameDate:'2099-10-01T18:00:00Z'
    };
    sessionService.detail.and.returnValue(of(component.session));
    component.invitePanelOpen = true;
    component.guestRequestsLoadedForSession = 7;
    component.guestRequests = [
      {id:30,name:'Fresco',status:'APPROVED',teamCode:null,note:''},
      {id:31,name:'Barata',status:'CANCELLED',teamCode:null,note:''}
    ];
    component.sessionParticipants = [{
      id:10,username:'creator-user',attendanceStatus:'PENDING',joinedAt:'2026-10-28T18:00:00Z'
    }];
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const invites = root.querySelector('.guest-organizer-panel') as HTMLElement;
    const roster = root.querySelector('#session-participants') as HTMLElement;
    expect(invites).not.toBeNull();
    expect(invites.querySelector('button.session-player-card__cancel')).toBeNull();
    expect(invites.textContent).toContain('Barata');
    expect(invites.textContent).not.toContain('Atualizar pedidos');
    expect(roster.querySelector('button.secondary-action')).toBeNull();
    const fresco = roster.querySelector('.session-player-card--guest') as HTMLElement;
    expect(fresco.textContent).toContain('Fresco');
    const request = fresco.querySelector('.session-player-card__cancel') as HTMLButtonElement;
    expect(request).toBeTruthy();
    request.click();
    fixture.detectChanges();
    expect(sessionService.cancelGuestRequest).not.toHaveBeenCalled();
    const confirmation = fresco.querySelector('.session-player-card__confirmation') as HTMLElement;
    expect(fresco.querySelector('.session-player-card__guest-actions')?.textContent).toContain('Fresco');
    (confirmation.querySelectorAll('button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(sessionService.cancelGuestRequest).not.toHaveBeenCalled();

    (fresco.querySelector('.session-player-card__cancel') as HTMLButtonElement).click();
    fixture.detectChanges();
    const submit = fresco.querySelector('.session-player-card__confirmation button') as HTMLButtonElement;
    submit.click();
    fixture.detectChanges();
    expect(sessionService.cancelGuestRequest).toHaveBeenCalledOnceWith(7,30);
    expect(component.guestRequests.find(g=>g.id===30)?.status).toBe('CANCELLED');
    expect(roster.querySelector('.session-player-card--guest')).toBeNull();
    expect(roster.textContent).toContain('Presença cancelada');
  });

  it('shows guest removal within confirmed teams but never to regular participants', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, creatorUsername:'creator-user',joined:true,
      audience:'PUBLIC',gameDate:'2099-10-01T18:00:00Z'
    };
    component.confirmedTeams = true;
    component.guestRequests=[{id:40,name:'Vasquinho',status:'APPROVED',note:'',teamCode:'A'}];
    fixture.detectChanges();
    const teamA = (fixture.nativeElement as HTMLElement).querySelector('.confirmed-teams > div') as HTMLElement;
    expect(teamA.querySelectorAll('.session-player-card__cancel').length).toBe(1);
    (component as any).currentUsername='other-user';
    component.session={...component.session,joined:true};
    component.memberConfirmedGuests=[{id:40,name:'Vasquinho',teamCode:'A'}];
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.session-player-card__cancel')).toBeNull();
    expect(sessionService.cancelGuestRequest).not.toHaveBeenCalled();
  });

  it('reconciles registered players and WhatsApp confirmations automatically without hiding cards', () => {
    (component as any).currentUsername='creator-user';
    component.session = {
      ...session, creatorUsername:'creator-user',joined:true,
      audience:'COMMUNITY_ONLY',gameDate:'2099-10-01T18:00:00Z'
    };
    component.sessionParticipants = [{
      id:11,username:'creator-user',attendanceStatus:'PENDING',joinedAt:'2026-10-28T18:00:00Z'
    }];
    component.guestRequests=[{id:33,name:'Fresco',status:'APPROVED',teamCode:null,note:''}];
    const pending = new Subject<any[]>();
    sessionService.participants.and.returnValue(pending.asObservable());
    fixture.detectChanges();
    component.loadSessionParticipants(true);
    fixture.detectChanges();
    let roster = (fixture.nativeElement as HTMLElement).querySelector('#session-participants') as HTMLElement;
    expect(roster.querySelectorAll('.session-player-card').length).toBe(2);
    expect(roster.querySelector('.session-participants-loading')).toBeNull();
    pending.next([{
      id:11,username:'creator-user',attendanceStatus:'PENDING',
      joinedAt:'2026-10-28T18:00:00Z'
    },{
      id:12,username:'player-two',attendanceStatus:'PENDING',
      joinedAt:'2026-10-28T18:01:00Z'
    }]);
    pending.complete();
    fixture.detectChanges();
    roster = (fixture.nativeElement as HTMLElement).querySelector('#session-participants') as HTMLElement;
    expect(roster.querySelectorAll('.session-player-card').length).toBe(3);
    expect(roster.textContent).toContain('@player-two');
    expect(roster.textContent).toContain('Fresco');

    sessionService.detail.and.returnValue(of(component.session));
    const before = sessionService.detail.calls.count();
    component.syncVisibleRoster();
    expect(sessionService.detail.calls.count()).toBeGreaterThan(before);
    expect(sessionService.guestRequests).toHaveBeenCalled();
  });

  it('offers registered player cancellation from Who is going only to the organiser', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, creatorUsername:'creator-user', joined:true,
      status:'OPEN', gameDate:'2099-10-01T18:00:00Z'
    };
    component.sessionParticipants = [
      {id:15,username:'creator-user',attendanceStatus:'PENDING',joinedAt:'2026-10-28T18:00:00Z'},
      {id:16,username:'player-two',attendanceStatus:'PENDING',joinedAt:'2026-10-28T18:00:00Z'}
    ];
    fixture.detectChanges();
    const roster=fixture.nativeElement.querySelector('#session-participants') as HTMLElement;
    const cards=roster.querySelectorAll('.session-player-card--member');
    expect(cards.length).toBe(2);
    expect(cards[0].querySelector('.session-player-card__cancel')).toBeNull();
    const cancel=cards[1].querySelector('.session-player-card__cancel') as HTMLButtonElement;
    expect(cancel).toBeTruthy();
    cancel.click();
    fixture.detectChanges();
    expect(sessionService.removeParticipant).not.toHaveBeenCalled();
    const confirm=cards[1].querySelector('.confirm-remove-action') as HTMLButtonElement;
    expect(confirm).toBeTruthy();
    confirm.click();
    fixture.detectChanges();
    expect(sessionService.removeParticipant).toHaveBeenCalledOnceWith(7,16);
    expect(roster.querySelectorAll('.session-player-card--member').length).toBe(1);
  });

  it('warns when a football session has too few confirmed players to play', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, sport:'Futsal',maxParticipants:10,minParticipants:6,participantCount:4,
      joined:true,gameDate:'2099-10-01T18:00:00Z'
    };
    fixture.detectChanges();
    const badge=fixture.nativeElement.querySelector('.session-minimum-indicator') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('4/6');
    expect(badge.textContent).toContain('Faltam 2');
    expect(badge.classList.contains('session-minimum-indicator--ready')).toBeFalse();
    component.session={...component.session,participantCount:6};
    fixture.detectChanges();
    expect(badge.classList.contains('session-minimum-indicator--ready')).toBeTrue();
  });

  it('aligns session chat and invite actions on the same baseline without old top margins', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, creatorUsername:'creator-user', joined:true, privateGame:false,
      audience:'COMMUNITY_ONLY', status:'OPEN', gameDate:'2099-10-01T18:00:00Z'
    };
    fixture.detectChanges();
    const toolbar = fixture.nativeElement.querySelector('.session-top-actions') as HTMLElement;
    expect(toolbar).not.toBeNull();
    const chat = toolbar.querySelector('.session-inline-chat-toggle') as HTMLElement;
    const invite = toolbar.querySelector('.session-invite-toggle') as HTMLElement;
    expect(chat).not.toBeNull();
    expect(invite).not.toBeNull();
    const chatStyle = getComputedStyle(chat);
    const inviteStyle = getComputedStyle(invite);
    expect(chatStyle.marginTop).toBe('0px');
    expect(inviteStyle.marginTop).toBe('0px');
    expect(chatStyle.minHeight).toBe(inviteStyle.minHeight);
    expect(chatStyle.display).toContain('flex');
    expect(inviteStyle.display).toContain('flex');
    expect(chat.getBoundingClientRect().top).toBeCloseTo(invite.getBoundingClientRect().top, 0);
  });

  it('uses real name initials rather than parentheses on the guest avatar', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {...session,joined:true};
    component.guestRequests = [{
      id: 121, name:'André (Borralho)', status:'APPROVED', note:'',teamCode:null
    }];
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector(
      '#session-participants .session-player-card--guest') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.querySelector('.session-player-card__avatar')?.textContent?.trim()).toBe('A');
    // Historical label is never rewritten as a real user's account name.
    expect(card.querySelector('.session-player-card__name')?.textContent).toContain('André (Borralho)');
  });
  it('offers random teams without standings and confirms the exact preview', () => {
    (component as any).currentUsername = 'creator-user';
    component.session = {
      ...session, creatorUsername: 'creator-user', joined: true,
      communityId: 9, sport: 'Futebol', teamBalanceSupported: false,
      participantCount: 10, maxParticipants: 10, status: 'FULL'
    };
    fixture.detectChanges();
    expect(component.canGenerateTeams()).toBeTrue();
    const panel: HTMLElement = fixture.nativeElement.querySelector('.team-generator');
    expect(panel).toBeTruthy();
    expect(panel.querySelector('.team-generator-excel-action')).toBeNull();
    const randomButton = Array.from(panel.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Equipas aleatórias')) as HTMLButtonElement;
    expect(randomButton).toBeTruthy();
    randomButton.click();
    expect(sessionService.teamSuggestion).toHaveBeenCalledWith(7, 'RANDOM');
    const preview = component.teamSuggestion;
    expect(preview).toBeTruthy();
    component.confirmTeams();
    expect(sessionService.confirmTeams).toHaveBeenCalledWith(7, 'RANDOM', preview);
  });

  it('offers session contact only between confirmed roster members within four hours of kickoff', () => {
    const now = Date.now();
    (component as any).currentUsername = 'creator-user';
    component.session = {...session, joined: true, gameDate: new Date(now + 60_000).toISOString()};
    component.sessionParticipants = [
      {id: 1, username: 'creator-user', attendanceStatus: 'PENDING', joinedAt: ''},
      {id: 2, username: 'player-two', attendanceStatus: 'PENDING', joinedAt: ''}
    ];
    expect(component.canContactSessionMember('player-two')).toBeTrue();
    expect(component.canContactSessionMember('outsider')).toBeFalse();
    expect(component.canContactSessionMember('creator-user')).toBeFalse();

    component.sessionParticipants = component.sessionParticipants.filter(p => p.username !== 'creator-user');
    expect(component.canContactSessionMember('player-two')).toBeFalse();
    component.sessionParticipants.push({id: 1, username: 'creator-user', attendanceStatus: 'PENDING', joinedAt: ''});
    component.session = {...component.session, gameDate: new Date(now - 60 * 60_000).toISOString()};
    expect(component.canContactSessionMember('player-two')).toBeTrue();
    component.session = {...component.session, gameDate: new Date(now - 5 * 60 * 60_000).toISOString()};
    expect(component.canContactSessionMember('player-two')).toBeFalse();
    component.session = {...component.session, status: 'CANCELLED' as any};
    expect(component.canContactSessionMember('player-two')).toBeFalse();
  });


});
