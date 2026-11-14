import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';

import { EventsComponent } from './events.component';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';
import { SessionService } from '../../services/session.service';
import { SessionSummary } from '../model/session-summary';

describe('EventsComponent', () => {
  let component: EventsComponent;
  let fixture: ComponentFixture<EventsComponent>;
  let sessionService: jasmine.SpyObj<SessionService>;

  beforeEach(async () => {
    sessionService = jasmine.createSpyObj<SessionService>('SessionService', ['discover']);
    sessionService.discover.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      declarations: [EventsComponent],
      imports: TEST_IMPORTS,
      providers: [
        ...TEST_PROVIDERS,
        { provide: SessionService, useValue: sessionService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EventsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });


  it('offers a discovered custom sport in filters while preserving catalog membership', () => {
    sessionService.discover.and.returnValue(of([{
      id: 97, sport: 'Bossaball', city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(), distanceKm: null,
      participantCount: 2, maxParticipants: 8,
      priceAmount: 0, privateGame: false, status: 'OPEN'
    }]));
    component.loadSessions();
    fixture.detectChanges();

    expect(component.sportsCatalog).not.toContain('Bossaball');
    expect(component.searchableSports).toContain('Bossaball');
    expect(Array.from(fixture.nativeElement.querySelectorAll('#sport-options option') as NodeListOf<HTMLOptionElement>)
      .some(option => option.value === 'Bossaball')).toBeTrue();

    component.sport = 'Bossaball';
    component.loadSessions();
    expect(sessionService.discover.calls.mostRecent().args[0]?.sport).toBe('Bossaball');
  });

  it('keeps action semantics and search bindings while adopting Neon Glass controls', () => {
    const root = fixture.nativeElement as HTMLElement;
    const header = root.querySelector('.sessions-page .page-header')!;
    expect(header.querySelector('a[href="/menu/createEvent"]')?.classList.contains('jynlo-premium-btn--primary')).toBeTrue();
    expect(header.querySelector('a[href="/menu/my-sessions"]')?.classList.contains('jynlo-premium-btn--quiet')).toBeTrue();
    const form = root.querySelector('.jynlo-session-filters') as HTMLFormElement;
    expect(form.querySelector('input[name="sport"]')).not.toBeNull();
    expect(form.querySelector('input[name="city"]')).not.toBeNull();
    expect(form.querySelector('select[name="sort"]')).not.toBeNull();
    expect(form.querySelector('button[type="submit"]')?.classList.contains('jynlo-premium-btn--primary')).toBeTrue();
    expect(form.querySelector('.advanced-toggle')?.classList.contains('jynlo-premium-btn--quiet')).toBeTrue();
    expect(form.querySelectorAll('.quick-chip').length).toBe(5);
    expect(root.querySelectorAll('.nearby-panel .jynlo-premium-btn').length).toBeGreaterThan(0);
  });

  it('exposes the premium filter groups and working quick action buttons', () => {
    const page = fixture.nativeElement as HTMLElement;
    const form = page.querySelector('.jynlo-session-filters') as HTMLFormElement;
    expect(form).not.toBeNull();
    expect(form.querySelectorAll('.filters-primary > label').length).toBe(3);
    expect(form.querySelectorAll('.filters-quick .quick-chip').length).toBe(5);
    expect(form.querySelector('.filters-toolbar .filter-actions')).not.toBeNull();

    const padel = form.querySelectorAll<HTMLButtonElement>('.quick-chip')[3];
    padel.click();
    fixture.detectChanges();
    expect(component.sport).toBe('Padel');
    expect(padel.getAttribute('aria-pressed')).toBe('true');
    expect(sessionService.discover.calls.mostRecent().args[0]?.sport).toBe('Padel');
    padel.click();
    fixture.detectChanges();
    expect(component.sport).toBe('');
    expect(padel.getAttribute('aria-pressed')).toBe('false');
  });

  it('applies real search date boundaries and toggles quick dates off', () => {
    component.applyQuickDate('today');
    expect(component.quickDate).toBe('today');
    expect(component.fromDateTime).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T00:00$/);
    expect(component.toDateTime).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T23:59$/);
    expect(sessionService.discover.calls.mostRecent().args[0]?.from).toBeTruthy();
    expect(sessionService.discover.calls.mostRecent().args[0]?.to).toBeTruthy();
    component.applyQuickDate('today');
    expect(component.quickDate).toBe('');
    expect(component.fromDateTime).toBe('');
    expect(component.toDateTime).toBe('');
    component.applyQuickDate('weekend');
    expect(component.quickDate).toBe('weekend');
    expect(Date.parse(component.toDateTime)).toBeGreaterThan(Date.parse(component.fromDateTime));
    component.clearFilters();
    expect(component.quickDate).toBe('');
    expect(component.fromDateTime).toBe('');
  });

  it('only increases radius when nearby search is active', () => {
    const calls = sessionService.discover.calls.count();
    component.increaseRadius();
    expect(sessionService.discover.calls.count()).toBe(calls);
    component.nearbyActive = true;
    component.latitude = 38.7;
    component.longitude = -9.1;
    component.radiusKm = 25;
    component.increaseRadius();
    expect(component.radiusKm).toBe(50);
    expect(sessionService.discover.calls.mostRecent().args[0]?.radiusKm).toBe(50);
    component.radiusKm = 100;
    const atMaximum = sessionService.discover.calls.count();
    component.increaseRadius();
    expect(sessionService.discover.calls.count()).toBe(atMaximum);
  });

  it('restores Discover sport and locality before the first full session search', async () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({ sport: '  Ténis  ', city: '  Sintra  ', unrelated: 'ignored' })
    });
    try {
      const deepLinked = TestBed.createComponent(EventsComponent);
      deepLinked.detectChanges();
      // ngModel writes to the input after the initial change-detection microtask.
      await deepLinked.whenStable();
      deepLinked.detectChanges();

      expect(deepLinked.componentInstance.sport).toBe('Ténis');
      expect(deepLinked.componentInstance.city).toBe('Sintra');
      expect(sessionService.discover).toHaveBeenCalledWith(
        jasmine.objectContaining({ sport: 'Ténis', city: 'Sintra' })
      );
      const form = deepLinked.nativeElement.querySelector('.filters') as HTMLFormElement;
      expect((form.querySelector('input[name="sport"]') as HTMLInputElement).value).toBe('Ténis');
      expect((form.querySelector('input[name="city"]') as HTMLInputElement).value).toBe('Sintra');

      deepLinked.componentInstance.clearFilters();
      expect(sessionService.discover.calls.mostRecent().args[0]).toEqual(
        jasmine.objectContaining({ sport: '', city: '' })
      );
      deepLinked.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('keeps the normal Sessions entry unfiltered without Discover parameters', () => {
    expect(component.sport).toBe('');
    expect(component.city).toBe('');
    expect(sessionService.discover.calls.first().args[0]).toEqual(
      jasmine.objectContaining({ sport: '', city: '' })
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load discovered sessions on init', () => {
    expect(component.sessions).toEqual([]);
    expect(sessionService.discover).toHaveBeenCalled();
  });

  it('shows full sessions by default while retaining the only-with-vacancies filter', () => {
    expect(component.availableOnly).toBeFalse();
    expect(sessionService.discover).toHaveBeenCalledWith(
      jasmine.objectContaining({ availability: undefined })
    );

    component.availableOnly = true;
    component.loadSessions();
    expect(sessionService.discover).toHaveBeenCalledWith(
      jasmine.objectContaining({ availability: 'available' })
    );

    component.clearFilters();
    expect(component.availableOnly).toBeFalse();
    expect(sessionService.discover.calls.mostRecent().args[0]?.availability).toBeUndefined();
  });

  it('should send coordinates and radius when nearby search is active', () => {
    component.nearbyActive = true;
    component.latitude = 38.72;
    component.longitude = -9.14;
    component.radiusKm = 10;
    component.sort = 'distance';

    component.loadSessions();

    expect(sessionService.discover).toHaveBeenCalledWith(
      jasmine.objectContaining({
        latitude: 38.72,
        longitude: -9.14,
        radiusKm: 10,
        sort: 'distance'
      })
    );
  });

  it('should send advanced time and price filters', () => {
    component.fromDateTime = '2026-10-02T18:00';
    component.toDateTime = '2026-10-02T22:00';
    component.minPrice = 2;
    component.maxPrice = 10;

    component.loadSessions();

    expect(sessionService.discover).toHaveBeenCalledWith(
      jasmine.objectContaining({
        from: jasmine.any(String),
        to: jasmine.any(String),
        minPrice: 2,
        maxPrice: 10
      })
    );
  });

  it('should calculate vacancies and join eligibility', () => {
    const openSession = {
      id: 1,
      sport: 'Padel',
      city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(),
      distanceKm: null,
      participantCount: 2,
      maxParticipants: 4,
      priceAmount: 7.5,
      privateGame: false,
      status: 'OPEN'
    };

    expect(component.vacancies(openSession)).toBe(2);
    expect(component.canJoin(openSession)).toBeTrue();
    expect(component.canJoin({ ...openSession, privateGame: true })).toBeFalse();
    expect(component.canJoin({ ...openSession, participantCount: 4 })).toBeFalse();
    expect(component.canJoin({ ...openSession, joinedByViewer: true })).toBeFalse();
    expect(component.canJoin({ ...openSession, waitlistedByViewer: true })).toBeFalse();
    expect(component.canJoin({ ...openSession, status: 'CANCELLED' })).toBeFalse();
    expect(component.canJoin({
      ...openSession, gameDate: new Date(Date.now() - 86_400_000).toISOString()
    })).toBeFalse();
    expect(component.canJoin({ ...openSession, gameDate: 'invalid-date' })).toBeFalse();
  });

  it('offers the waitlist from the session list only for joinable full games', () => {
    const fullSession = {
      id: 22,
      sport: 'Padel',
      city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(),
      distanceKm: null,
      participantCount: 4,
      maxParticipants: 4,
      priceAmount: 0,
      privateGame: false,
      status: 'FULL'
    };

    expect(component.canJoinWaitlist(fullSession)).toBeTrue();
    expect(component.canJoin(fullSession)).toBeFalse();

    component.sessions = [fullSession];
    fixture.detectChanges();

    const action = fixture.nativeElement.querySelector(
      '.session-row .session-action'
    ) as HTMLAnchorElement;
    expect(action.getAttribute('href')).toBe('/menu/events/22?join=1');
    expect(action.textContent).toContain('lista de espera');
    expect(action.classList.contains('session-action--join')).toBeTrue();

    expect(component.canJoinWaitlist({ ...fullSession, privateGame: true })).toBeFalse();
    expect(component.canJoinWaitlist({ ...fullSession, joinedByViewer: true })).toBeFalse();
    expect(component.canJoinWaitlist({ ...fullSession, waitlistedByViewer: true })).toBeFalse();
    expect(component.canJoinWaitlist({ ...fullSession, status: 'CANCELLED' })).toBeFalse();
    expect(component.canJoinWaitlist({ ...fullSession, status: 'OPEN' })).toBeFalse();
    expect(component.canJoinWaitlist({
      ...fullSession, gameDate: new Date(Date.now() - 86_400_000).toISOString()
    })).toBeFalse();
  });

  it('keeps only the newest session search results when responses arrive out of order', () => {
    const earlier = new Subject<SessionSummary[]>();
    const latest = new Subject<SessionSummary[]>();
    sessionService.discover.and.returnValues(earlier.asObservable(), latest.asObservable());
    component.city = 'Lisboa';
    component.loadSessions();
    expect(component.loading).toBeTrue();

    component.city = 'Porto';
    component.loadSessions();
    const porto = { id: 101, city: 'Porto', sport: 'Futsal' } as SessionSummary;
    earlier.next([{ id: 100, city: 'Lisboa', sport: 'Padel' } as SessionSummary]);
    earlier.error(new Error('stale request failed'));
    expect(component.loading).toBeTrue();
    expect(component.errorMessage).toBe('');

    latest.next([porto]);
    latest.complete();
    expect(component.sessions).toEqual([porto]);
    expect(component.citySuggestions).toEqual(['Porto']);
    expect(component.loading).toBeFalse();
    expect(component.errorMessage).toBe('');
    const mostRecentFilters = sessionService.discover.calls.mostRecent().args[0];
    expect(mostRecentFilters).toBeDefined();
    expect(mostRecentFilters?.city).toBe('Porto');
  });

  it('invalidates an in-flight search when the user enters an invalid date range', () => {
    const pending = new Subject<SessionSummary[]>();
    sessionService.discover.and.returnValue(pending.asObservable());
    component.city = 'Lisboa';
    component.loadSessions();
    expect(component.loading).toBeTrue();

    component.fromDateTime = '2026-11-02T20:00';
    component.toDateTime = '2026-11-02T19:00';
    component.loadSessions();
    expect(component.loading).toBeFalse();
    expect(component.errorMessage).toBeTruthy();
    pending.next([{ id: 52, city: 'Lisboa' } as SessionSummary]);
    pending.complete();
    expect(component.sessions).toEqual([]);
    expect(component.citySuggestions).toEqual([]);
    expect(component.errorMessage).toBeTruthy();
  });

  it('ignores an outdated geolocation success after nearby mode was disabled', () => {
    const geolocation = spyOn(navigator.geolocation, 'getCurrentPosition');
    let respond: PositionCallback | undefined;
    geolocation.and.callFake(success => { respond = success; });
    component.useCurrentLocation();
    expect(component.locating).toBeTrue();
    component.disableNearby();
    const requests = sessionService.discover.calls.count();

    respond?.({ coords: { latitude: 38.7, longitude: -9.3 } } as GeolocationPosition);
    expect(component.locating).toBeFalse();
    expect(component.nearbyActive).toBeFalse();
    expect(component.latitude).toBeNull();
    expect(component.longitude).toBeNull();
    expect(sessionService.discover.calls.count()).toBe(requests);
  });

  it('unsubscribes from pending session results on destroy', () => {
    const pending = new Subject<SessionSummary[]>();
    sessionService.discover.and.returnValue(pending.asObservable());
    component.loadSessions();
    component.ngOnDestroy();
    pending.next([{ id: 81, city: 'Porto' } as SessionSummary]);
    pending.complete();
    expect(component.sessions).toEqual([]);
    expect(component.errorMessage).toBe('');
  });

  it('offers to create a session with the selected sport and city when no sessions match', () => {
    component.sport = 'Futsal';
    component.city = 'Lisboa';
    component.loadSessions();
    fixture.detectChanges();
    const create = fixture.nativeElement.querySelector('.session-empty-create') as HTMLAnchorElement;
    expect(create).not.toBeNull();
    expect(create.getAttribute('href')).toContain('/menu/createEvent?');
    expect(create.getAttribute('href')).toContain('sport=Futsal');
    expect(create.getAttribute('href')).toContain('city=Lisboa');
  });

  it('lets users clear filters directly from the empty state', () => {
    component.sport = 'Padel';
    component.city = 'Sintra';
    component.availableOnly = true;
    component.loadSessions();
    fixture.detectChanges();
    const clear = fixture.nativeElement.querySelector('.session-empty-clear') as HTMLButtonElement;
    expect(clear).not.toBeNull();
    clear.click();
    expect(component.sport).toBe('');
    expect(component.city).toBe('');
    expect(component.availableOnly).toBeFalse();
    const mostRecentFilters = sessionService.discover.calls.mostRecent().args[0];
    expect(mostRecentFilters).toBeDefined();
    expect(mostRecentFilters?.availability).toBeUndefined();
  });

  it('should disable nearby search and clear coordinates', () => {
    component.nearbyActive = true;
    component.latitude = 38.72;
    component.longitude = -9.14;

    component.disableNearby();

    expect(component.nearbyActive).toBeFalse();
    expect(component.latitude).toBeNull();
    expect(component.longitude).toBeNull();
  });
});
