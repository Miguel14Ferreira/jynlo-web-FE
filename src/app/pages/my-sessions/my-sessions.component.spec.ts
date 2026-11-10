import { ComponentFixture, TestBed } from '@angular/core/testing';
import { defer, of, throwError } from 'rxjs';

import { MySessionsComponent } from './my-sessions.component';
import { ReliabilityService } from '../../services/reliability.service';
import { SessionService } from '../../services/session.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('MySessionsComponent', () => {
  let component: MySessionsComponent;
  let fixture: ComponentFixture<MySessionsComponent>;
  let sessionService: jasmine.SpyObj<SessionService>;
  let reliabilityService: jasmine.SpyObj<ReliabilityService>;
  let communityGroupsService: jasmine.SpyObj<CommunityGroupsService>;

  const createdSession = {
    id: 11,
    sport: 'Futebol',
    city: 'Lisboa',
    gameDate: new Date(Date.now() + 86_400_000).toISOString(),
    distanceKm: null,
    participantCount: 3,
    maxParticipants: 10,
    priceAmount: 0,
    privateGame: false,
    status: 'OPEN'
  };

  const noShow = {
    participantId: 20,
    sessionId: 12,
    sport: 'Padel',
    city: 'Lisboa',
    gameDate: '2026-09-20T19:00:00Z',
    attendanceStatus: 'NO_SHOW' as const,
    attendanceRecordedAt: '2026-09-20T20:00:00Z',
    disputeStatus: null,
    canDispute: true
  };

  beforeEach(async () => {
    sessionService = jasmine.createSpyObj<SessionService>(
      'SessionService',
      ['mine', 'cancel', 'leave']
    );
    reliabilityService = jasmine.createSpyObj<ReliabilityService>(
      'ReliabilityService',
      ['attendanceHistory', 'createDispute']
    );

    communityGroupsService = jasmine.createSpyObj<CommunityGroupsService>('CommunityGroupsService', ['mine']);
    communityGroupsService.mine.and.returnValue(of([{id: 52, name: 'Lisboa Padel'}] as any));

    sessionService.mine.and.returnValue(of({
      created: [createdSession],
      joined: [],
      waitlisted: []
    }));
    sessionService.cancel.and.returnValue(of(void 0));
    sessionService.leave.and.returnValue(of(void 0));

    reliabilityService.attendanceHistory.and.returnValue(of([noShow]));
    reliabilityService.createDispute.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      declarations: [MySessionsComponent],
      imports: TEST_IMPORTS,
      providers: [
        ...TEST_PROVIDERS,
        { provide: SessionService, useValue: sessionService },
        { provide: ReliabilityService, useValue: reliabilityService },
        { provide: CommunityGroupsService, useValue: communityGroupsService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MySessionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('uses consistent pills for empty creation and discovery states', () => {
    component.selectTab('participation');
    fixture.detectChanges();
    const find = fixture.nativeElement.querySelector('.empty-card a[href="/menu/events"]') as HTMLAnchorElement;
    expect(find).toBeTruthy();
    expect(find.classList.contains('jynlo-action')).toBeTrue();
    expect(find.classList.contains('jynlo-action--neutral')).toBeTrue();

    component.data = { ...component.data, created: [] };
    component.selectTab('upcoming');
    fixture.detectChanges();

    const create = fixture.nativeElement.querySelector('.empty-card a[href="/menu/createEvent"]') as HTMLAnchorElement;
    expect(create).toBeTruthy();
    expect(create.classList.contains('jynlo-action')).toBeTrue();
    expect(create.classList.contains('jynlo-action--primary')).toBeTrue();
  });

  it('groups upcoming empty-state actions with a dedicated spacing container', () => {
    component.data = {
      ...component.data,
      created: [{ ...createdSession, gameDate: '2020-01-01T18:00:00Z' }]
    };
    component.selectTab('upcoming');
    fixture.detectChanges();

    const actions = fixture.nativeElement.querySelector(
      '#panel-upcoming .empty-session-actions'
    ) as HTMLElement;
    expect(actions).toBeTruthy();
    expect(actions.querySelector('a[href="/menu/createEvent"]')).toBeTruthy();
    expect(actions.querySelector('button')?.textContent).toContain('Histórico');
    expect(actions.children.length).toBe(2);
  });

  it('aligns created session details with the destructive cancellation action', () => {
    const actions: HTMLElement = fixture.nativeElement.querySelector('.session-card .card-actions');
    const details = actions.querySelector('a[href="/menu/events/11"]') as HTMLAnchorElement;
    const cancel = actions.querySelector('button.danger-action') as HTMLButtonElement;

    expect(details).toBeTruthy();
    expect(cancel).toBeTruthy();
    expect(details.classList.contains('jynlo-action')).toBeTrue();
    expect(details.classList.contains('jynlo-action--primary')).toBeTrue();
    expect(cancel.classList.contains('jynlo-action--danger')).toBeTrue();
  });

  it('should create and load sessions and attendance history', () => {
    expect(component).toBeTruthy();
    expect(component.data.created.length).toBe(1);
    expect(component.attendanceHistory.length).toBe(1);
    expect(sessionService.mine).toHaveBeenCalled();
    expect(reliabilityService.attendanceHistory).toHaveBeenCalled();
  });

  it('should cancel a created session and refresh the list', () => {
    component.requestCancel(createdSession);
    component.confirmCancel();

    expect(sessionService.cancel).toHaveBeenCalledWith(11);
    expect(sessionService.mine).toHaveBeenCalledTimes(1);
    expect(component.data.created[0].status).toBe('CANCELLED');
    expect(component.pendingCancelId).toBeNull();
    expect(component.actionMessage).toContain('cancelada');
  });

  it('should leave a waitlisted session without a page reload', () => {
    const waitlisted = {
      ...createdSession,
      id: 22,
      status: 'FULL',
      gameDate: new Date(Date.now() + 86_400_000).toISOString()
    };
    component.data = {
      ...component.data,
      waitlisted: [waitlisted]
    };

    component.leaveWaitlist(waitlisted);

    expect(sessionService.leave).toHaveBeenCalledWith(22);
    expect(component.data.waitlisted.length).toBe(0);
    expect(component.actionMessage).toContain('lista de espera');
  });

  it('hides waitlist withdrawal for completed and cancelled sessions', () => {
    for (const status of ['COMPLETED', 'CANCELLED']) {
      const waitlisted = {
        ...createdSession, id: 22, status,
        gameDate: new Date(Date.now() + 86_400_000).toISOString()
      };
      component.data = { ...component.data, waitlisted: [waitlisted] };
      component.selectTab('participation');
      fixture.detectChanges();

      const waitlistCard: HTMLElement = fixture.nativeElement.querySelector('.waitlist-badge')
        ?.closest('.session-card');
      expect(waitlistCard.querySelector('a[href="/menu/events/22?membership=1"]')).toBeTruthy();
      expect(waitlistCard.querySelector('button.danger-action')).toBeNull();
      expect(component.canLeaveWaitlist(waitlisted)).toBeFalse();

      component.leaveWaitlist(waitlisted);
    }

    expect(sessionService.leave).not.toHaveBeenCalled();
  });

  it('keeps waitlist withdrawal available for open and full sessions', () => {
    for (const status of ['OPEN', 'FULL']) {
      const waitlisted = {
        ...createdSession, id: 22, status,
        gameDate: new Date(Date.now() + 86_400_000).toISOString()
      };
      component.data = { ...component.data, waitlisted: [waitlisted] };
      component.selectTab('participation');
      fixture.detectChanges();

      const waitlistCard: HTMLElement = fixture.nativeElement.querySelector('.waitlist-badge')
        ?.closest('.session-card');
      expect(waitlistCard.querySelector('button.danger-action')).toBeTruthy();
      expect(component.canLeaveWaitlist(waitlisted)).toBeTrue();
    }
  });

  it('highlights only the earliest future confirmed game, not a waitlist or historical session', () => {
    const inHours = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();
    const later = { ...createdSession, id: 31, status: 'OPEN', gameDate: inHours(72) };
    const next = { ...createdSession, id: 32, status: 'FULL', gameDate: inHours(2) };
    component.data = {
      created: [],
      joined: [
        later,
        { ...createdSession, id: 33, gameDate: inHours(-24) },
        { ...createdSession, id: 34, gameDate: 'not-a-date' },
        { ...createdSession, id: 35, status: 'CANCELLED', gameDate: inHours(1) },
        next
      ],
      waitlisted: [{ ...createdSession, id: 36, gameDate: inHours(1) }]
    };
    component.selectTab('participation');
    fixture.detectChanges();

    expect(component.nextJoinedSession?.id).toBe(32);
    const highlight = fixture.nativeElement.querySelector('.next-session-highlight') as HTMLElement;
    expect(highlight.textContent).toContain('Próximo jogo confirmado');
    expect(highlight.textContent).toContain('Futebol');
    expect(highlight.querySelector('a')?.getAttribute('href'))
      .toBe('/menu/events/32?membership=1');

    const joinedLinks = fixture.nativeElement.querySelectorAll('.session-section a[href*="membership=1"]');
    expect(joinedLinks.length).toBeGreaterThan(0);
    expect(component.data.joined[0].id).toBe(31); // No in-place sorting of API data.
  });

  it('does not promise a confirmed upcoming game for past, cancelled or waitlisted sessions', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    component.data = {
      created: [],
      joined: [
        { ...createdSession, id: 40, gameDate: tomorrow, status: 'COMPLETED' },
        { ...createdSession, id: 41, gameDate: 'invalid-date', status: 'OPEN' },
        { ...createdSession, id: 42, gameDate: new Date(Date.now() - 1000).toISOString(), status: 'OPEN' }
      ],
      waitlisted: [{ ...createdSession, id: 43, gameDate: tomorrow, status: 'FULL' }]
    };
    component.selectTab('participation');
    fixture.detectChanges();

    expect(component.nextJoinedSession).toBeNull();
    expect(fixture.nativeElement.querySelector('.next-session-highlight')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Por indicar');
    const waitlistLink = fixture.nativeElement.querySelector('.waitlist-badge')
      ?.closest('.session-card')?.querySelector('a') as HTMLAnchorElement;
    expect(waitlistLink.getAttribute('href')).toBe('/menu/events/43?membership=1');
  });

  it('prevents withdrawing from a waitlist after the session begins or with invalid dates', () => {
    for (const gameDate of [
      new Date(Date.now() - 60_000).toISOString(),
      'invalid-date'
    ]) {
      const waitlisted = { ...createdSession, id: 44, status: 'FULL', gameDate };
      component.data = { ...component.data, waitlisted: [waitlisted] };
      component.selectTab('participation');
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('.waitlist-badge')?.closest('.session-card') as HTMLElement;
      expect(card.querySelector('button.danger-action')).toBeNull();
      expect(component.canLeaveWaitlist(waitlisted)).toBeFalse();
      component.leaveWaitlist(waitlisted);
    }
    expect(sessionService.leave).not.toHaveBeenCalled();
  });

  it('should calculate remaining vacancies', () => {
    expect(component.vacancies(createdSession)).toBe(7);
  });

  it('aligns attendance history session links with dispute actions', () => {
    component.selectTab('participation');
    fixture.detectChanges();
    const actions: HTMLElement = fixture.nativeElement.querySelector('.attendance-card .attendance-actions');
    const sessionLink = actions.querySelector('a[href="/menu/events/12"]') as HTMLAnchorElement;
    const dispute = actions.querySelector('button.dispute-action') as HTMLButtonElement;

    expect(sessionLink).toBeTruthy();
    expect(sessionLink.classList.contains('jynlo-action')).toBeTrue();
    expect(sessionLink.classList.contains('jynlo-action--neutral')).toBeTrue();
    expect(dispute).toBeTruthy();
    expect(dispute.classList.contains('jynlo-action')).toBeTrue();
  });

  it('should dispute a no-show and update its local state', () => {
    component.requestDispute(component.attendanceHistory[0]);
    component.disputeReason = 'Estive presente nesta sessão.';

    component.confirmDispute();

    expect(reliabilityService.createDispute).toHaveBeenCalledWith(
      20,
      'Estive presente nesta sessão.'
    );
    expect(component.attendanceHistory[0].disputeStatus).toBe('OPEN');
    expect(component.attendanceHistory[0].canDispute).toBeFalse();
    expect(component.actionMessage).toContain('Contestação enviada');
  });

  it('should require a reason before sending a dispute', () => {
    component.requestDispute(component.attendanceHistory[0]);
    component.disputeReason = '   ';

    component.confirmDispute();

    expect(reliabilityService.createDispute).not.toHaveBeenCalled();
    expect(component.actionError).toContain('Explica');
  });

  it('should expose a recoverable error when my sessions keep failing', () => {
    sessionService.mine.calls.reset();
    let subscriptions = 0;
    sessionService.mine.and.returnValue(defer(() => {
      subscriptions++;
      return throwError(() => new Error('service unavailable'));
    }));

    component.load();

    expect(sessionService.mine).toHaveBeenCalledTimes(1);
    expect(subscriptions).toBe(2);
    expect(component.loading).toBeFalse();
    expect(component.errorMessage).toBeTruthy();
  });

  it('should recover my sessions after one automatic retry', () => {
    sessionService.mine.calls.reset();
    let subscriptions = 0;
    sessionService.mine.and.returnValue(defer(() => {
      subscriptions++;
      return subscriptions === 1
        ? throwError(() => new Error('temporary failure'))
        : of({
            created: [createdSession],
            joined: [],
            waitlisted: []
          });
    }));

    component.load();

    expect(sessionService.mine).toHaveBeenCalledTimes(1);
    expect(subscriptions).toBe(2);
    expect(component.errorMessage).toBe('');
    expect(component.data.created.length).toBe(1);
  });

  it('should expose a recoverable error when attendance history keeps failing', () => {
    reliabilityService.attendanceHistory.calls.reset();
    let subscriptions = 0;
    reliabilityService.attendanceHistory.and.returnValue(defer(() => {
      subscriptions++;
      return throwError(() => new Error('service unavailable'));
    }));

    component.loadAttendanceHistory();

    expect(reliabilityService.attendanceHistory).toHaveBeenCalledTimes(1);
    expect(subscriptions).toBe(2);
    expect(component.attendanceLoading).toBeFalse();
    expect(component.attendanceHistory).toEqual([]);
    expect(component.attendanceError).toBeTruthy();
  });


  it('uses the premium sessions shell without changing navigation or cancellation controls', () => {
    const shell: HTMLElement = fixture.nativeElement.querySelector('.my-sessions-page');
    expect(shell.classList.contains('jynlo-sessions-premium')).toBeTrue();
    expect(shell.classList.contains('jynlo-games')).toBeTrue();
    expect(shell.querySelector('.page-header a[href="/menu/createEvent"]')).toBeTruthy();
    expect(shell.querySelector('.page-header a[href="/menu/events"]')).toBeTruthy();
    const ownSession = shell.querySelector('.session-card') as HTMLElement;
    expect(ownSession.querySelector('a[href="/menu/events/11"]')).toBeTruthy();
    expect(ownSession.querySelector('button.danger-action')).toBeTruthy();
    component.selectTab('participation');
    fixture.detectChanges();
    expect(shell.querySelector('.attendance-card a[href="/menu/events/12"]')).toBeTruthy();
  });

  it('keeps the confirmed-session and waitlist membership routes inside the premium layout', () => {
    const upcoming = new Date(Date.now() + 86_400_000).toISOString();
    component.data = {
      created: [createdSession],
      joined: [{ ...createdSession, id: 51, gameDate: upcoming, status: 'OPEN' }],
      waitlisted: [{ ...createdSession, id: 52, gameDate: upcoming, status: 'FULL' }]
    };
    fixture.detectChanges();

    component.selectTab('participation');
    fixture.detectChanges();
    const shell: HTMLElement = fixture.nativeElement.querySelector('.jynlo-sessions-premium');
    expect(shell.querySelector('.next-session-highlight a[href="/menu/events/51?membership=1"]')).toBeTruthy();
    expect(shell.querySelector('a[href="/menu/events/52?membership=1"]')).toBeTruthy();
    const waitlist = shell.querySelector('.waitlist-badge')?.closest('.session-card') as HTMLElement;
    expect(waitlist.querySelector('button.danger-action')).toBeTruthy();
    expect(waitlist.querySelector('.waitlist-badge')).toBeTruthy();
  });

  it('starts with only upcoming organised sessions and displays two-column premium cards', () => {
    component.data = {
      ...component.data,
      created: [
        {...createdSession,id:101,gameDate:new Date(Date.now()+86400000).toISOString(),status:'OPEN'},
        {...createdSession,id:102,gameDate:new Date(Date.now()+172800000).toISOString(),status:'FULL'},
        {...createdSession,id:103,gameDate:new Date(Date.now()-86400000).toISOString(),status:'COMPLETED'},
        {...createdSession,id:104,gameDate:new Date(Date.now()+86400000).toISOString(),status:'CANCELLED'}
      ]
    };
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(component.activeTab).toBe('upcoming');
    expect(component.upcomingCreated.map(s=>s.id)).toEqual([101,102]);
    expect(component.historicalCreated.map(s=>s.id)).toEqual([104,103]);
    expect(root.querySelectorAll('.upcoming-grid .upcoming-card')).toHaveSize(2);
    expect(root.querySelectorAll('.history-row')).toHaveSize(0);
    expect(root.textContent).toContain('Inscrições abertas');
    expect(root.textContent).toContain('Lotação completa');
    expect(root.querySelector('#tab-history')?.textContent).toContain('2');
    expect(root.querySelector('.session-view-tabs [aria-selected="true"]')?.id).toBe('tab-upcoming');
    expect(root.querySelectorAll('.upcoming-card .card-actions a[href^="/menu/events/"]')).toHaveSize(2);
  });

  it('moves cancellation to history immediately and preserves confirmation modal', () => {
    component.requestCancel(createdSession);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-labelledby="cancel-title"]')).toBeTruthy();
    component.confirmCancel();
    fixture.detectChanges();
    expect(component.upcomingCreated).toHaveSize(0);
    expect(component.historicalCreated.map(s=>s.id)).toEqual([11]);
    component.selectTab('history');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.history-row .history-status')?.textContent)
      .toContain('Cancelada');
    expect(fixture.nativeElement.querySelector('.history-row a[href="/menu/events/11"]')).toBeTruthy();
  });

  it('filters, orders and paginates historical activities without mutating source data', () => {
    const previous=Array.from({length:21},(_,index)=>({
      ...createdSession,id:100+index,city:index%2?'Cascais':'Lisboa',
      sport:index%2?'Padel':'Futsal',
      gameDate:new Date(Date.now()-(index+1)*86400000).toISOString(),
      status:index%3?'COMPLETED':'CANCELLED'
    }));
    component.data={...component.data,created:previous};
    component.selectTab('history');
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(component.historicalCreated).toHaveSize(21);
    expect(root.querySelectorAll('.history-row')).toHaveSize(8);
    expect(component.visibleHistory[0].id).toBe(100);
    component.showMoreHistory();
    fixture.detectChanges();
    expect(root.querySelectorAll('.history-row')).toHaveSize(16);
    component.historySport='Padel';
    component.historyStatus='CANCELLED';
    component.historyQuery='cAscais';
    component.historyShown=8;
    fixture.detectChanges();
    expect(component.filteredHistory.length).toBeGreaterThan(0);
    expect(component.filteredHistory.every(s=>s.sport==='Padel'&&s.status==='CANCELLED')).toBeTrue();
    const snapshot=previous.map(s=>s.id);
    component.resetHistoryFilters();
    expect(component.historyShown).toBe(8);
    expect(component.historyQuery).toBe('');
    expect(component.data.created.map(s=>s.id)).toEqual(snapshot);
  });

  it('handles invalid dates and older open sessions as history instead of upcoming', () => {
    component.data={...component.data,created:[
      {...createdSession,id:11,gameDate:'invalid-date',status:'OPEN'},
      {...createdSession,id:12,gameDate:new Date(Date.now()-86400000).toISOString(),status:'OPEN'},
      {...createdSession,id:13,gameDate:new Date(Date.now()+86400000).toISOString(),status:'CANCELLED'}
    ]};
    expect(component.upcomingCreated).toHaveSize(0);
    expect(component.historicalCreated).toHaveSize(3);
    expect(component.sessionStatusLabel(component.data.created[1])).toBe('Data passada');
    component.selectTab('history');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.history-row')).toHaveSize(3);
  });

  it('keeps attendance disputes, joined sessions and waitlist controls in participations', () => {
    const tomorrow=new Date(Date.now()+86400000).toISOString();
    component.data={...component.data,joined:[{...createdSession,id:50,gameDate:tomorrow}],
      waitlisted:[{...createdSession,id:51,gameDate:tomorrow,status:'FULL'}]};
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.attendance-card')).toBeNull();
    component.selectTab('participation');
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.attendance-card a[href="/menu/events/12"]')).toBeTruthy();
    expect(root.querySelector('a[href="/menu/events/50?membership=1"]')).toBeTruthy();
    expect(root.querySelector('a[href="/menu/events/51?membership=1"]')).toBeTruthy();
    expect(root.querySelector('.waitlist-badge')?.closest('.session-card')?.querySelector('button')).toBeTruthy();
    expect(root.querySelector('.attendance-card button.dispute-action')).toBeTruthy();
  });


  it('filters history by inclusive local date range and community without mutating the API data', () => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    d.setHours(12, 0, 0, 0);
    const localDay = (date: Date) =>
      [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')].join('-');
    const earlier = new Date(d);
    earlier.setDate(earlier.getDate() - 2);
    const later = new Date(d);
    later.setDate(later.getDate() + 2);
    const original = [
      {...createdSession, id: 201, gameDate: d.toISOString(), status:'COMPLETED', communityId:52},
      {...createdSession, id: 202, gameDate: earlier.toISOString(), status:'COMPLETED', communityId:52},
      {...createdSession, id: 203, gameDate: d.toISOString(), status:'CANCELLED', communityId:98},
      {...createdSession, id: 204, gameDate: later.toISOString(), status:'COMPLETED'}
    ];
    component.data = {...component.data, created:original};
    component.selectTab('history');
    component.historyFrom = localDay(d);
    component.historyTo = localDay(d);
    component.historyCommunityId = '52';
    fixture.detectChanges();
    expect(component.historyCommunityIds).toEqual([52, 98]);
    expect(component.communityLabel(52)).toBe('Lisboa Padel');
    expect(component.filteredHistory.map(s => s.id)).toEqual([201]);
    expect(fixture.nativeElement.querySelectorAll('.history-row')).toHaveSize(1);
    expect(fixture.nativeElement.querySelector('input[name="historyFrom"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('select[name="historyCommunityId"]')).toBeTruthy();
    component.resetHistoryFilters();
    expect(component.historyFrom).toBe('');
    expect(component.historyTo).toBe('');
    expect(component.historyCommunityId).toBe('');
    expect(component.data.created.map(s => s.id)).toEqual([201, 202, 203, 204]);
  });

  it('does not repeat organised sessions in joined, waitlist or attendance sections', () => {
    const external = {...createdSession, id: 309};
    component.data = {
      created: [createdSession],
      joined: [createdSession, external],
      waitlisted: [createdSession, {...createdSession, id: 310}]
    };
    component.attendanceHistory = [
      {...noShow, participantId: 99, sessionId: createdSession.id},
      noShow
    ];
    component.selectTab('participation');
    fixture.detectChanges();
    expect(component.joinedOtherSessions.map(s => s.id)).toEqual([309]);
    expect(component.waitlistedOtherSessions.map(s => s.id)).toEqual([310]);
    expect(component.externalAttendanceHistory.map(s => s.sessionId)).toEqual([12]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.session-card')).toHaveSize(2);
    expect(root.querySelectorAll('.attendance-card')).toHaveSize(1);
    expect(root.querySelector('#tab-participation')?.textContent).toContain('2');
  });

  it('translates participation statuses and preserves community fallback labels', () => {
    expect(component.attendanceLabel(noShow)).toBe('Faltou');
    expect(component.communityLabel(999)).toContain('#999');
  });

});
