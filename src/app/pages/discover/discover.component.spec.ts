import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { DiscoverComponent } from './discover.component';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';
import { CommunityService } from '../../services/community.service';
import { SessionService } from '../../services/session.service';
import { VenueService } from '../../services/venue.service';
import { CommunityProfile } from '../model/community-profile';

describe('DiscoverComponent', () => {
  let component: DiscoverComponent;
  let fixture: ComponentFixture<DiscoverComponent>;
  let venueService: jasmine.SpyObj<VenueService>;
  let sessionService: jasmine.SpyObj<SessionService>;
  let communityService: jasmine.SpyObj<CommunityService>;

  beforeEach(async () => {
    venueService = jasmine.createSpyObj<VenueService>('VenueService', ['search', 'suggest']);
    sessionService = jasmine.createSpyObj<SessionService>('SessionService', ['discover']);
    communityService = jasmine.createSpyObj<CommunityService>(
      'CommunityService',
      ['publicProfile', 'findProfiles', 'discoverProfiles']
    );

    venueService.search.and.returnValue(of([]));
    venueService.suggest.and.returnValue(of({ venues: [], page: 0, hasMore: false }));
    sessionService.discover.and.returnValue(of([]));
    communityService.publicProfile.and.returnValue(of({
      username: 'miguel',
      fullName: 'Miguel',
      nickname: null,
      country: 'Portugal',
      location: 'Lisboa',
      favoriteSports: 'Padel, Futebol',
      bio: null,
      skillLevel: 'INTERMEDIATE',
      availability: null,
      age: 37,
      profilePicUrl: null,
      joinDateDisplay: null
    }));
    communityService.findProfiles.and.returnValue(of([]));
    communityService.discoverProfiles.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      declarations: [DiscoverComponent],
      imports: TEST_IMPORTS,
      providers: [
        ...TEST_PROVIDERS,
        { provide: VenueService, useValue: venueService },
        { provide: SessionService, useValue: sessionService },
        { provide: CommunityService, useValue: communityService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DiscoverComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });


  it('keeps the Explore title without repeating the navbar brand', () => {
    const header = fixture.nativeElement.querySelector('.discover-header') as HTMLElement;
    expect(header.querySelector('.eyebrow')).toBeNull();
    expect(header.querySelector('h1')).not.toBeNull();
  });

  it('keeps sport and locality when opening all activities, including clearing them', () => {
    const fullList = (): HTMLAnchorElement =>
      fixture.nativeElement.querySelector('a.pillar-action[href^="/menu/events"]');

    expect(fullList().getAttribute('href')).toBe('/menu/events?sport=Padel&city=Lisboa');

    component.onSportChange('Ténis');
    component.onLocationChange('Sintra');
    component.search();
    fixture.detectChanges();
    expect(fullList().getAttribute('href')).toBe('/menu/events?sport=T%C3%A9nis&city=Sintra');

    component.clear();
    fixture.detectChanges();
    expect(fullList().getAttribute('href')).toBe('/menu/events');
  });

  it('shows only unavailable result categories in the shared error panel', () => {
    component.venuesLoadError = true;
    component.sessionsLoadError = false;
    component.peopleLoadError = true;
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('.discover-error') as HTMLElement;
    expect(error.textContent).toContain('Recintos indisponíveis.');
    expect(error.textContent).toContain('Jogadores indisponíveis.');
    expect(error.textContent).not.toContain('Sessões indisponíveis.');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('prefills sport and locality from the profile and uses both when searching', () => {
    expect(component.sport).toBe('Padel');
    expect(component.location).toBe('Lisboa');
    expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Lisboa', 'Padel', 0);
    expect(sessionService.discover).toHaveBeenCalledWith(
      jasmine.objectContaining({
        sport: 'Padel',
        city: 'Lisboa',
        availability: undefined
      })
    );
    expect(communityService.findProfiles).toHaveBeenCalledWith(jasmine.objectContaining({
      sport: 'Padel',
      location: 'Lisboa'
    }));
    const locality: HTMLInputElement = fixture.nativeElement.querySelector('input[name="location"]');
    expect(locality.value).toBe('Lisboa');
  });

  it('restores sport, locality and player-name search after returning from a profile', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previousParams = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({ sport: 'Ténis', city: 'Sintra', player: 'Ana' })
    });
    try {
      const player: CommunityProfile = {
        username: 'ana', fullName: 'Ana Silva', nickname: null,
        country: 'Portugal', location: 'Porto', favoriteSports: 'Futebol',
        bio: null, skillLevel: null, availability: null, age: 30,
        profilePicUrl: null, joinDateDisplay: null
      };
      communityService.findProfiles.and.returnValue(of([player]));
      const page = TestBed.createComponent(DiscoverComponent);
      page.detectChanges();

      expect(page.componentInstance.sport).toBe('Ténis');
      expect(page.componentInstance.location).toBe('Sintra');
      expect(page.componentInstance.playerName).toBe('Ana');
      expect(page.componentInstance.appliedPlayerName).toBe('Ana');
      expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Sintra', 'Ténis', 0);
      expect(communityService.findProfiles).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Ana' }));
      const link: HTMLAnchorElement = page.nativeElement.querySelector('.person-card');
      expect(link.getAttribute('href'))
        .toBe('/menu/perfis/ana?from=discover&sport=T%C3%A9nis&city=Sintra&player=Ana');
      page.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previousParams
      });
    }
  });

  it('keeps explicitly cleared filters instead of repopulating profile suggestions', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previousParams = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true, value: convertToParamMap({ sport: '', city: '', player: '' })
    });
    try {
      const page = TestBed.createComponent(DiscoverComponent);
      page.detectChanges();

      expect(page.componentInstance.sport).toBe('');
      expect(page.componentInstance.location).toBe('');
      expect(page.componentInstance.playerName).toBe('');
      expect(venueService.suggest).toHaveBeenCalledWith(undefined, undefined, undefined, 0);
      page.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previousParams
      });
    }
  });

  it('keeps manually entered filters if the profile arrives after editing', () => {
    const delayedProfile = new Subject<CommunityProfile>();
    communityService.publicProfile.and.returnValue(delayedProfile.asObservable());
    const page = TestBed.createComponent(DiscoverComponent);
    page.detectChanges();

    // Simulate the values emitted by the form without waiting for the deliberately pending profile.
    page.componentInstance.onSportChange('Ténis');
    page.componentInstance.onLocationChange('Sintra');

    expect(page.componentInstance.sport).toBe('Ténis');
    expect(page.componentInstance.location).toBe('Sintra');

    delayedProfile.next({
      username: 'miguel', fullName: 'Miguel', nickname: null,
      country: 'Portugal', location: 'Lisboa', favoriteSports: 'Padel, Futebol',
      bio: null, skillLevel: null, availability: null, age: 37,
      profilePicUrl: null, joinDateDisplay: null
    });
    delayedProfile.complete();

    expect(page.componentInstance.sport).toBe('Ténis');
    expect(page.componentInstance.location).toBe('Sintra');
    expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Sintra', 'Ténis', 0);
    page.destroy();
  });

  it('uses only sports from the catalog when suggesting a favorite', () => {
    communityService.publicProfile.and.returnValue(of({
      username: 'miguel', fullName: 'Miguel', nickname: null,
      country: 'Portugal', location: '  Porto  ', favoriteSports: 'Not a sport, pAdEl',
      bio: null, skillLevel: null, availability: null, age: 37,
      profilePicUrl: null, joinDateDisplay: null
    }));
    const page = TestBed.createComponent(DiscoverComponent);
    page.detectChanges();

    expect(page.componentInstance.sport).toBe('Padel');
    expect(page.componentInstance.location).toBe('Porto');
    expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Porto', 'Padel', 0);
    page.destroy();
  });

  it('keeps discovery broad when the profile has no preferences', () => {
    communityService.publicProfile.and.returnValue(of({
      username: 'miguel', fullName: 'Miguel', nickname: null,
      country: 'Portugal', location: null, favoriteSports: null,
      bio: null, skillLevel: null, availability: null, age: 37,
      profilePicUrl: null, joinDateDisplay: null
    }));
    const page = TestBed.createComponent(DiscoverComponent);
    page.detectChanges();

    expect(page.componentInstance.sport).toBe('');
    expect(page.componentInstance.location).toBe('');
    expect(venueService.suggest).toHaveBeenCalledWith(undefined, undefined, undefined, 0);
    page.destroy();
  });

  it('searches nearby venues by device position without changing sessions or people', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 38.72, longitude: -9.14 } } as unknown as GeolocationPosition)
      }
    });
    try {
      component.enableNearbyVenues();
      expect(component.nearbyVenuePosition).toEqual({ latitude: 38.72, longitude: -9.14 });
      expect(venueService.search).toHaveBeenCalledWith(undefined, 'Padel', 38.72, -9.14, 25);
      expect(sessionService.discover).toHaveBeenCalledWith(jasmine.objectContaining({
        city: 'Lisboa', latitude: undefined, radiusKm: undefined, sort: 'date'
      }));
      expect(communityService.findProfiles).toHaveBeenCalledWith(jasmine.objectContaining({
        sport: 'Padel', location: 'Lisboa'
      }));
    } finally {
      if (original) {
        Object.defineProperty(navigator, 'geolocation', original);
      } else {
        delete (navigator as any).geolocation;
      }
    }
  });

  it('updates nearby venue radius and restores city filtering when the location changes', () => {
    component.nearbyVenuePosition = { latitude: 38.72, longitude: -9.14 };
    component.changeNearbyVenueRadius(50);
    expect(venueService.search).toHaveBeenCalledWith(undefined, 'Padel', 38.72, -9.14, 50);

    component.onLocationChange('Sintra');
    component.search();
    expect(component.nearbyVenuePosition).toBeNull();
    expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Sintra', 'Padel', 0);
  });

  it('keeps the normal venue search when location permission is denied', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({} as unknown as GeolocationPositionError)
      }
    });
    try {
      component.setCategory('venues');
      component.enableNearbyVenues();
      fixture.detectChanges();
      expect(component.nearbyVenuePosition).toBeNull();
      expect(component.nearbyVenueError).toBe('unavailable');
      expect(fixture.nativeElement.querySelector('.discover-nearby--venues [role="alert"]')).not.toBeNull();
      expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Lisboa', 'Padel', 0);
    } finally {
      if (original) {
        Object.defineProperty(navigator, 'geolocation', original);
      } else {
        delete (navigator as any).geolocation;
      }
    }
  });

  it('ignores a late venue GPS response after the user edits their locality', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    let resolvePosition: PositionCallback | undefined;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (success: PositionCallback) => { resolvePosition = success; } }
    });
    try {
      component.enableNearbyVenues();
      component.onLocationChange('Sintra');
      resolvePosition?.({ coords: { latitude: 38.72, longitude: -9.14 } } as unknown as GeolocationPosition);
      expect(component.nearbyVenuePosition).toBeNull();
      expect(component.locatingVenues).toBeFalse();
    } finally {
      if (original) {
        Object.defineProperty(navigator, 'geolocation', original);
      } else {
        delete (navigator as any).geolocation;
      }
    }
  });

  it('uses the requested device position for nearby sessions only', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({ coords: { latitude: 38.72, longitude: -9.14 } } as unknown as GeolocationPosition);
        }
      }
    });
    try {
      component.enableNearbySessions();
      expect(component.nearbyPosition).toEqual({ latitude: 38.72, longitude: -9.14 });
      expect(sessionService.discover).toHaveBeenCalledWith(jasmine.objectContaining({
        sport: 'Padel', city: undefined, latitude: 38.72, longitude: -9.14,
        radiusKm: 25, sort: 'distance'
      }));
      expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Lisboa', 'Padel', 0);
      expect(communityService.findProfiles).toHaveBeenCalledWith(jasmine.objectContaining({ sport: 'Padel', location: 'Lisboa' }));
    } finally {
      if (original) {
        Object.defineProperty(navigator, 'geolocation', original);
      } else {
        delete (navigator as any).geolocation;
      }
    }
  });

  it('updates nearby radius and reverts to city search when locality is edited', () => {
    component.nearbyPosition = { latitude: 38.72, longitude: -9.14 };
    component.changeNearbyRadius(50);
    expect(sessionService.discover).toHaveBeenCalledWith(jasmine.objectContaining({
      radiusKm: 50, sort: 'distance', city: undefined
    }));
    component.onLocationChange('Sintra');
    component.search();
    expect(component.nearbyPosition).toBeNull();
    expect(sessionService.discover).toHaveBeenCalledWith(jasmine.objectContaining({
      city: 'Sintra', latitude: undefined, longitude: undefined,
      radiusKm: undefined, sort: 'date'
    }));
  });

  it('does not enable nearby mode when location permission is denied', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({} as unknown as GeolocationPositionError) }
    });
    try {
      component.enableNearbySessions();
      fixture.detectChanges();
      expect(component.nearbyPosition).toBeNull();
      expect(component.nearbySessionError).toBe('unavailable');
      expect(fixture.nativeElement.querySelector('.discover-nearby [role="alert"]')).not.toBeNull();
      expect(sessionService.discover).not.toHaveBeenCalledWith(jasmine.objectContaining({ sort: 'distance' }));
    } finally {
      if (original) {
        Object.defineProperty(navigator, 'geolocation', original);
      } else {
        delete (navigator as any).geolocation;
      }
    }
  });

  it('ignores a late GPS result after the locality was changed', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    let resolvePosition: PositionCallback | undefined;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (success: PositionCallback) => { resolvePosition = success; } }
    });
    try {
      component.enableNearbySessions();
      component.onLocationChange('Sintra');
      resolvePosition?.({ coords: { latitude: 38.72, longitude: -9.14 } } as unknown as GeolocationPosition);
      expect(component.nearbyPosition).toBeNull();
      expect(component.locatingSessions).toBeFalse();
    } finally {
      if (original) {
        Object.defineProperty(navigator, 'geolocation', original);
      } else {
        delete (navigator as any).geolocation;
      }
    }
  });

  it('keeps the Jogadores tab focused on finding profiles rather than creating sessions', () => {
    component.setCategory('people');
    fixture.detectChanges();
    const panel: HTMLElement = fixture.nativeElement.querySelector('#explore-people');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Não encontrámos jogadores com estes critérios');
    expect(panel.querySelector('.people-empty-recruit')).toBeNull();
    expect(panel.querySelector('a[href*="/menu/createEvent"]')).toBeNull();

    const heading: HTMLElement = fixture.nativeElement.querySelector('.explore-results-heading');
    expect(heading.hasAttribute('hidden')).toBeTrue();
    expect(panel.querySelector('.pillar-heading h2')?.textContent).toContain('Pessoas para conhecer');
    const directory: HTMLAnchorElement = panel.querySelector('a[href^="/menu/perfis?"]')!;
    expect(directory.textContent).toContain('Ver todos os jogadores');
    expect(directory.getAttribute('href')).toBe('/menu/perfis?from=discover&sport=Padel&city=Lisboa');
  });

  it('does not duplicate the people heading in the focused tab while keeping other headings', () => {
    component.setCategory('people');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.explore-results-heading').hasAttribute('hidden')).toBeTrue();

    component.setCategory('venues');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.explore-results-heading').hasAttribute('hidden')).toBeFalse();
  });

  it('explains unmatched name searches without suggesting a recruiting session', () => {
    component.playerName = 'Utilizador inexistente';
    component.searchPlayers();
    fixture.detectChanges();

    const empty: HTMLElement | null = fixture.nativeElement.querySelector('.people-empty');
    expect(empty?.textContent).toContain('Não encontrámos nenhum jogador com esse nome');
    expect(fixture.nativeElement.querySelector('.people-empty-recruit')).toBeNull();
  });

  it('does not show recruiting CTA when results exist or the player request fails', () => {
    communityService.findProfiles.and.returnValue(of([{
      username: 'joao', fullName: 'João', nickname: null,
      location: 'Lisboa', country: 'Portugal', favoriteSports: 'Padel',
      bio: null, skillLevel: null, availability: null, age: 25,
      profilePicUrl: null, joinDateDisplay: null
    }]));
    component.search();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.people-empty-recruit')).toBeNull();

    communityService.findProfiles.and.returnValue(throwError(() => new Error('Offline')));
    component.search();
    fixture.detectChanges();
    expect(component.peopleLoadError).toBeTrue();
    expect(fixture.nativeElement.querySelector('.people-empty-recruit')).toBeNull();
  });

  it('searches for a player by name without restricting the request to profile defaults', () => {
    const teammate: CommunityProfile = {
      username: 'ana', fullName: 'Ana Silva', nickname: null,
      country: 'Portugal', location: 'Porto', favoriteSports: 'Futebol',
      bio: null, skillLevel: null, availability: null, age: 30,
      profilePicUrl: null, joinDateDisplay: null
    };
    communityService.findProfiles.and.returnValue(of([teammate]));
    const venueCalls = venueService.suggest.calls.count();
    const sessionCalls = sessionService.discover.calls.count();

    component.playerName = '  Ana  ';
    component.searchPlayers();

    expect(communityService.findProfiles.calls.mostRecent().args[0]).toEqual({ name: 'Ana' });
    expect(component.people).toEqual([teammate]);
    expect(component.topPeople).toEqual([teammate]);
    expect(component.appliedPlayerName).toBe('Ana');
    expect(venueService.suggest.calls.count()).toBe(venueCalls);
    expect(sessionService.discover.calls.count()).toBe(sessionCalls);
  });

  it('searches globally by name even when sport and location filters are active', () => {
    component.onSportChange('Padel');
    component.onLocationChange('Lisboa');
    component.playerName = 'Maria';
    component.searchPlayers();
    expect(communityService.findProfiles.calls.mostRecent().args[0]).toEqual({name: 'Maria'});
  });

  it('rejects a one-character name search and displays an explanation', () => {
    const previousCalls = communityService.findProfiles.calls.count();
    component.playerName = 'M';
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.discover-people-search button[type="submit"]');
    expect(button.disabled).toBeTrue();
    expect(fixture.nativeElement.querySelector('.discover-name-min-length')?.textContent)
      .toContain('Escreve pelo menos 2 caracteres');
    component.searchPlayers();
    expect(communityService.findProfiles.calls.count()).toBe(previousCalls);
  });

  it('restores sport and locality filtering after clearing player name', () => {
    component.playerName = 'Ana';
    component.searchPlayers();
    component.clearPlayerName();

    expect(component.playerName).toBe('');
    expect(component.appliedPlayerName).toBe('');
    expect(communityService.findProfiles).toHaveBeenCalledWith(jasmine.objectContaining({
      sport: 'Padel', location: 'Lisboa'
    }));
  });

  it('allows name-only player searches when no sport or location is selected', () => {
    component.clear();
    component.playerName = 'Miguel';
    component.searchPlayers();

    expect(communityService.findProfiles).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Miguel' }));
  });

  it('expands and collapses suggested players directly in Discover', () => {
    const players: CommunityProfile[] = Array.from({ length: 6 }, (_, index) => ({
      username: 'player' + index, fullName: 'Jogador ' + index, nickname: null,
      country: 'Portugal', location: 'Lisboa', favoriteSports: 'Padel',
      bio: null, skillLevel: null, availability: null, age: null,
      profilePicUrl: null, joinDateDisplay: null
    }));
    communityService.findProfiles.and.returnValue(of(players));
    component.search();
    fixture.detectChanges();

    expect(component.topPeople.length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('.person-card').length).toBe(4);

    const toggle = (): HTMLButtonElement => fixture.nativeElement.querySelector('.people-toggle');
    expect(toggle().textContent).toContain('Mostrar mais jogadores');
    toggle().click();
    fixture.detectChanges();

    expect(component.topPeople).toEqual(players);
    expect(fixture.nativeElement.querySelectorAll('.person-card').length).toBe(6);
    expect(toggle().textContent).toContain('Ver menos');

    toggle().click();
    fixture.detectChanges();
    expect(component.topPeople.length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('.person-card').length).toBe(4);
  });

  it('collapses expanded player suggestions on a new general search', () => {
    communityService.findProfiles.and.returnValue(of(Array.from({ length: 6 }, (_, index) => ({
      username: 'player' + index, fullName: 'Jogador ' + index,
      nickname: null, country: 'Portugal', location: 'Lisboa',
      favoriteSports: 'Padel', bio: null, skillLevel: null,
      availability: null, age: null, profilePicUrl: null, joinDateDisplay: null
    } as CommunityProfile))));
    component.search();
    component.toggleAllPeople();
    expect(component.topPeople.length).toBe(6);

    component.onLocationChange('Sintra');
    component.search();
    expect(component.showAllPeople).toBeFalse();
    expect(component.topPeople.length).toBe(4);
  });

  it('shows every matching name-search result without an expand button', () => {
    const players: CommunityProfile[] = Array.from({ length: 6 }, (_, index) => ({
      username: 'ana' + index, fullName: 'Ana ' + index, nickname: null,
      country: 'Portugal', location: 'Porto', favoriteSports: null,
      bio: null, skillLevel: null, availability: null, age: null,
      profilePicUrl: null, joinDateDisplay: null
    }));
    communityService.findProfiles.and.returnValue(of(players));
    component.playerName = 'Ana';
    component.searchPlayers();
    fixture.detectChanges();

    expect(component.topPeople).toEqual(players);
    expect(fixture.nativeElement.querySelectorAll('.person-card').length).toBe(6);
    expect(fixture.nativeElement.querySelector('.people-toggle')).toBeNull();
  });

  it('shows all matching players after a name search instead of only four suggestions', () => {
    const people = Array.from({ length: 6 }, (_, index) => ({
      username: 'ana' + index, fullName: 'Ana ' + index, nickname: null,
      country: 'Portugal', location: 'Porto', favoriteSports: null,
      bio: null, skillLevel: null, availability: null, age: null,
      profilePicUrl: null, joinDateDisplay: null
    } as CommunityProfile));
    communityService.findProfiles.and.returnValue(of(people));
    component.playerName = 'Ana';
    component.searchPlayers();

    expect(component.topPeople).toEqual(people);
    component.clearPlayerName();
    expect(component.topPeople.length).toBe(4);
  });

  it('shows a player-only error when name search fails', () => {
    communityService.findProfiles.and.returnValue(throwError(() => new Error('API unavailable')));
    component.playerName = 'Ana';
    component.searchPlayers();

    expect(component.playerSearchError).toBeTrue();
    expect(component.people).toEqual([]);
    expect(component.loadingPeople).toBeFalse();
    expect(component.loadError).toBeFalse();
  });

  it('carries sport and locality into the full player search', () => {
    const morePeople = (): HTMLAnchorElement =>
      fixture.nativeElement.querySelector('a[routerLink="/menu/perfis"], a[href^="/menu/perfis?"]');

    expect(morePeople().getAttribute('href'))
      .toBe('/menu/perfis?from=discover&sport=Padel&city=Lisboa');

    component.onSportChange('Ténis');
    component.onLocationChange('Sintra');
    component.search();
    fixture.detectChanges();
    expect(morePeople().getAttribute('href'))
      .toBe('/menu/perfis?from=discover&sport=T%C3%A9nis&city=Sintra');

    component.clear();
    fixture.detectChanges();
    expect(morePeople().getAttribute('href')).toBe('/menu/perfis?from=discover');
  });

  it('uses name-only filtering in full people search when a name was applied', () => {
    component.playerName = '  Ana  ';
    component.searchPlayers();
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href^="/menu/perfis?"]');
    expect(link.getAttribute('href')).toBe('/menu/perfis?from=discover&player=Ana');
  });

  it('opens discovered people directly in their public profiles', () => {
    const profile = {
      username: 'teammate',
      fullName: 'Teammate',
      nickname: null,
      country: 'Portugal',
      location: 'Lisboa',
      favoriteSports: 'Padel',
      bio: null,
      skillLevel: null,
      availability: null,
      age: 28,
      profilePicUrl: null,
      joinDateDisplay: null
    };
    component.people = [profile];
    component.topPeopleResults = [profile];
    component.initialized = true;
    fixture.detectChanges();

    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('.person-card');
    expect(link?.getAttribute('href'))
      .toBe('/menu/perfis/teammate?from=discover&sport=Padel&city=Lisboa&player=');
    expect(link?.textContent).toContain('Teammate');
    expect(link?.textContent).toContain('Ver perfil e interagir');
  });

  it('carries the selected sport and locality into venue creation', () => {
    component.setCategory('venues');
    fixture.detectChanges();
    const addVenueLink = (): HTMLAnchorElement =>
      fixture.nativeElement.querySelector('a[href^="/menu/venues/new"]');

    // The initial values are suggested by the profile.
    expect(addVenueLink().getAttribute('href')).toBe('/menu/venues/new?sport=Padel&city=Lisboa');

    component.onSportChange('Ténis');
    component.onLocationChange('Sintra');
    fixture.detectChanges();
    expect(addVenueLink().getAttribute('href')).toBe('/menu/venues/new?sport=T%C3%A9nis&city=Sintra');

    // A cleared discovery search must not forward stale profile preferences.
    component.clear();
    fixture.detectChanges();
    expect(addVenueLink().getAttribute('href')).toBe('/menu/venues/new');
  });

  it('offers creating a session when no activities match the search', () => {
    expect(component.initialized).toBeTrue();
    expect(component.sessions).toEqual([]);
    fixture.detectChanges();

    const createLink: HTMLAnchorElement | null =
      fixture.nativeElement.querySelector('.session-empty-create');
    expect(createLink?.getAttribute('href')).toBe('/menu/createEvent?sport=Padel&city=Lisboa');
    expect(createLink?.textContent).toContain('Criar uma sessão');
  });

  it('passes the manually selected sport and locality to session creation', () => {
    component.onSportChange('Ténis');
    component.onLocationChange('Sintra');
    component.search();
    fixture.detectChanges();

    const link: HTMLAnchorElement | null =
      fixture.nativeElement.querySelector('.session-empty-create');
    expect(link?.getAttribute('href')).toBe('/menu/createEvent?sport=T%C3%A9nis&city=Sintra');
  });

  it('does not add empty sport or locality query parameters to session creation', () => {
    component.clear();
    fixture.detectChanges();

    const link: HTMLAnchorElement | null =
      fixture.nativeElement.querySelector('.session-empty-create');
    expect(link?.getAttribute('href')).toBe('/menu/createEvent');
  });

  it('suggests custom sports from public sessions without making them official catalog entries', () => {
    sessionService.discover.and.returnValue(of([{
      id: 96, sport: 'Bossaball', city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(), distanceKm: null,
      participantCount: 2, maxParticipants: 8,
      priceAmount: 0, privateGame: false, status: 'OPEN'
    }]));
    component.clear();
    fixture.detectChanges();

    expect(component.sportsCatalog).not.toContain('Bossaball');
    expect(component.searchableSports).toContain('Bossaball');
    expect(Array.from(fixture.nativeElement.querySelectorAll('#discover-sports option') as NodeListOf<HTMLOptionElement>)
      .some(option => option.value === 'Bossaball')).toBeTrue();
    component.onSportChange('Bossaball');
    component.search();
    expect(sessionService.discover.calls.mostRecent().args[0]?.sport).toBe('Bossaball');
  });

  it('hides the create-session empty action when activities are available', () => {
    sessionService.discover.and.returnValue(of([{
      id: 34, sport: 'Padel', city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(), distanceKm: null,
      participantCount: 2, maxParticipants: 4,
      priceAmount: 0, privateGame: false, status: 'OPEN'
    }]));
    component.search();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.session-empty-create')).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-card')).not.toBeNull();
  });

  it('does not suggest creating a session when session discovery fails', () => {
    sessionService.discover.and.returnValue(
      throwError(() => new Error('API unavailable'))
    );
    component.search();
    fixture.detectChanges();

    expect(component.sessionsLoadError).toBeTrue();
    expect(fixture.nativeElement.querySelector('.discover-error')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.session-empty-create')).toBeNull();
  });

  it('preserves discovery filters on session links without an automatic join action', () => {
    sessionService.discover.and.returnValue(of([{
      id: 71, sport: 'Ténis', city: 'Sintra',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(), distanceKm: null,
      participantCount: 1, maxParticipants: 4, priceAmount: 0,
      privateGame: false, status: 'OPEN'
    }]));
    component.onSportChange('Ténis');
    component.onLocationChange('Sintra');
    component.playerName = 'Ana';
    component.search();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('.session-card') as HTMLAnchorElement;
    const url = new URL(link.getAttribute('href')!, 'https://jynlo.test');
    expect(url.pathname).toBe('/menu/events/71');
    expect(url.searchParams.get('from')).toBe('discover');
    expect(url.searchParams.get('sport')).toBe('Ténis');
    expect(url.searchParams.get('city')).toBe('Sintra');
    expect(url.searchParams.get('player')).toBe('Ana');
    expect(url.searchParams.get('join')).toBe('1');
    expect(sessionService.discover).toHaveBeenCalled();
  });

  it('shows a clear participation link with price and distance without joining automatically', () => {
    const session = {
      id: 31, sport: 'Padel', city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(), distanceKm: 3.4,
      participantCount: 2, maxParticipants: 4,
      priceAmount: 5, privateGame: false, status: 'OPEN'
    };
    sessionService.discover.and.returnValue(of([session]));
    component.search();
    fixture.detectChanges();

    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('.session-card');
    expect(link?.getAttribute('href')).toBe('/menu/events/31?from=discover&sport=Padel&city=Lisboa&join=1');
    expect(link?.textContent).toContain('Ver e participar');
    expect(link?.textContent).toMatch(/5[,.]00\s*€/);
    expect(link?.textContent).toMatch(/3[,.]4\s*km/);
  });

  it('shows participation status instead of an invitation to join again', () => {
    const baseSession = {
      id: 32, sport: 'Padel', city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(), distanceKm: null,
      participantCount: 2, maxParticipants: 4,
      priceAmount: 0, privateGame: false, status: 'OPEN'
    };

    sessionService.discover.and.returnValue(of([{ ...baseSession, joinedByViewer: true }]));
    component.search();
    fixture.detectChanges();
    let link: HTMLAnchorElement = fixture.nativeElement.querySelector('.session-card');
    expect(link.textContent).toContain('Já estás inscrito');
    expect(link.getAttribute('href')).toBe('/menu/events/32?from=discover&sport=Padel&city=Lisboa');
    expect(link.textContent).toContain('Grátis');
    expect(link.textContent).not.toContain('Ver e participar');

    sessionService.discover.and.returnValue(of([{ ...baseSession, waitlistedByViewer: true }]));
    component.search();
    fixture.detectChanges();
    link = fixture.nativeElement.querySelector('.session-card');
    expect(link.textContent).toContain('Em lista de espera');
    expect(link.getAttribute('href')).toBe('/menu/events/32?from=discover&sport=Padel&city=Lisboa');
    expect(link.textContent).not.toContain('Ver e participar');
  });

  it('shows the waitlist instead of promising spots when a future public session is FULL', () => {
    const full = {
      id: 33, sport: 'Futsal', city: 'Porto',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(),
      distanceKm: null, participantCount: 3, maxParticipants: 4,
      priceAmount: 0, privateGame: false, status: 'FULL'
    };
    sessionService.discover.and.returnValue(of([full]));
    component.search();
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.session-card');
    expect(link.getAttribute('href')).toBe('/menu/events/33?from=discover&sport=Padel&city=Lisboa&join=1');
    expect(link.textContent).toContain('Entrar na lista de espera');
    expect(link.textContent).toContain('Lotado');
    expect(link.textContent).not.toContain('1 vagas');
    expect(link.textContent).not.toContain('Ver e participar');
    expect(sessionService.discover).toHaveBeenCalledWith(jasmine.objectContaining({
      availability: undefined
    }));
  });

  it('only opens the join area for future public sessions with verified availability', () => {
    const base = {
      id: 34, sport: 'Padel', city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(),
      distanceKm: null, participantCount: 2, maxParticipants: 4,
      priceAmount: 0, privateGame: false, status: 'OPEN'
    };
    const renderCard = (overrides: Record<string, unknown>) => {
      const session = { ...base, ...overrides };
      component.sessions = [session];
      component.topSessionResults = [session];
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('.session-card') as HTMLAnchorElement;
    };

    expect(renderCard({}).getAttribute('href')).toBe('/menu/events/34?from=discover&sport=Padel&city=Lisboa&join=1');
    expect(renderCard({ status: 'FULL', joinedByViewer: true }).textContent)
      .toContain('Já estás inscrito');
    expect(renderCard({ status: 'FULL', waitlistedByViewer: true }).textContent)
      .toContain('Em lista de espera');

    for (const overrides of [
      { status: 'CANCELLED' },
      { status: 'COMPLETED' },
      { privateGame: true },
      { audience: 'COMMUNITY_ONLY' },
      { joinedByViewer: true },
      { waitlistedByViewer: true },
      { participantCount: 4 },
      { participantCount: Number.NaN },
      { maxParticipants: 0 },
      { gameDate: 'invalid' },
      { gameDate: new Date(Date.now() - 86_400_000).toISOString() }
    ]) {
      const card = renderCard(overrides);
      expect(card.getAttribute('href')).withContext(JSON.stringify(overrides))
        .toBe('/menu/events/34?from=discover&sport=Padel&city=Lisboa');
      expect(card.textContent).not.toContain('Entrar na lista de espera');
      if (overrides.gameDate === 'invalid') {
        expect(card.textContent).toContain('Por indicar');
      }
    }
  });

  it('should calculate session vacancies', () => {
    expect(component.vacancies({
      id: 1,
      sport: 'Padel',
      city: 'Lisboa',
      gameDate: '2026-10-01T18:00:00Z',
      distanceKm: null,
      participantCount: 6,
      maxParticipants: 8,
      priceAmount: 5,
      privateGame: false,
      status: 'OPEN'
    })).toBe(2);
  });
  it('collapses expanded venue results when starting a new search', () => {
    component.showAllVenues = true;
    component.search();
    expect(component.showAllVenues).toBeFalse();
  });



  it('shows a lower-bound count when the paginated response has more venues', () => {
    const venues = Array.from({ length: 36 }, (_, i) => ({
      id: i + 1, name: 'Venue ' + i, city: 'Lisboa'
    } as any));
    venueService.suggest.and.returnValue(of({ venues, page: 0, hasMore: true }));
    component.search();
    fixture.detectChanges();
    // The category tab now carries the catalogue count, not a second venue card.
    const count: HTMLElement = fixture.nativeElement.querySelector(
      '.explore-category-nav button:nth-child(2) .explore-tab-count'
    );
    expect(component.venuesHasMore).toBeTrue();
    expect(count.textContent?.replace(/\s/g, '')).toBe('36+');
    expect(count.title).toContain('Existem mais recintos');

    venueService.suggest.and.returnValue(of({ venues: venues.slice(0, 2), page: 0, hasMore: false }));
    component.search();
    fixture.detectChanges();
    expect(count.textContent?.replace(/\s/g, '')).toBe('2');
  });

  it('preserves relevance order from the paginated API, even when first-page metadata differs', () => {
    const venues = [
      { id: 1, name: 'A', city: 'Grande Lisboa', sports: 'Padel',
        latitude: 38.7, longitude: -9.1, address: 'Rua A', venueType: 'Campo' },
      { id: 2, name: 'B', city: 'Lisboa', sports: null, latitude: null,
        longitude: null, address: '', venueType: null },
      { id: 3, name: 'C', city: 'Lisboa', sports: 'Padel',
        latitude: 38.7, longitude: -9.1, address: '', venueType: 'Campo' }
    ] as any[];
    // Only the server can rank records beyond the currently loaded page.
    venueService.suggest.and.returnValue(of({ venues, page: 0, hasMore: true }));
    component.search();
    expect(component.venues.map(venue => venue.id)).toEqual([1, 2, 3]);
    expect(component.topVenues.map(venue => venue.id)).toEqual([1, 2, 3]);
    expect(component.venuesHasMore).toBeTrue();
  });

  it('never rearranges the distance-ordered nearby venues', () => {
    venueService.search.and.returnValue(of([
      { id: 1, name: 'A', city: 'Lisboa', sports: null } as any,
      { id: 2, name: 'B', city: 'Lisboa', sports: 'Padel' } as any
    ]));
    component.nearbyVenuePosition = { latitude: 38.72, longitude: -9.14 };
    component.search();
    expect(component.venues.map(venue => venue.id)).toEqual([1, 2]);
    expect(component.venuesHasMore).toBeFalse();
  });

  it('offers explicit alternatives inside the map when a combined search has no venues', () => {
    component.setCategory('venues');
    component.search();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.venue-broaden--sport')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.venue-broaden--city')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Experimenta alargar um filtro');

    const before = venueService.suggest.calls.count();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.venue-broaden--sport');
    button.click();
    expect(component.sport).toBe('');
    expect(component.location).toBe('Lisboa');
    expect(venueService.suggest.calls.count()).toBe(before + 1);
    expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Lisboa', undefined, 0);
  });

  it('does not call extra fallback searches or claim no venues when API is unavailable', () => {
    venueService.suggest.and.returnValue(throwError(() => new Error('offline')));
    const before = venueService.suggest.calls.count();
    component.search();
    fixture.detectChanges();
    expect(component.venuesLoadError).toBeTrue();
    expect(venueService.suggest.calls.count()).toBe(before + 1);
    expect(fixture.nativeElement.querySelector('.venue-broaden--sport')).toBeNull();
    expect(fixture.nativeElement.querySelector('.explore-map-panel')).toBeNull();
  });

  it('suggests increasing the GPS radius inside the map without dropping other filters', () => {
    component.setCategory('venues');
    component.nearbyVenuePosition = { latitude: 38.72, longitude: -9.14 };
    component.nearbyVenueRadiusKm = 25;
    component.search();
    fixture.detectChanges();

    const radius: HTMLButtonElement = fixture.nativeElement.querySelector('.venue-broaden--radius');
    expect(radius).not.toBeNull();
    radius.click();
    expect(component.nearbyVenueRadiusKm).toBe(50);
    expect(component.sport).toBe('Padel');
    expect(component.location).toBe('Lisboa');
    expect(venueService.search).toHaveBeenCalledWith(undefined, 'Padel', 38.72, -9.14, 50);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.venue-broaden--radius')).toBeNull();
  });

  it('uses bounded venue suggestions for the preview, keeping filters on the full-catalogue link', () => {
    const venues = Array.from({ length: 36 }, (_, index) => ({
      id: index + 1, name: 'Recinto ' + index, city: 'Lisboa'
    } as any));
    venueService.suggest.and.returnValue(of({ venues, page: 0, hasMore: true }));

    component.search();
    component.setCategory('venues');
    fixture.detectChanges();

    expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Lisboa', 'Padel', 0);
    expect(venueService.search).not.toHaveBeenCalled();
    expect(component.topVenues.length).toBe(4);
    const directory: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href^="/menu/venues?"]');
    expect(directory.getAttribute('href')).toBe('/menu/venues?sport=Padel&city=Lisboa');
  });

  it('keeps GPS-based nearby searches on the geo endpoint', () => {
    const pagedCalls = venueService.suggest.calls.count();
    component.nearbyVenuePosition = { latitude: 38.72, longitude: -9.14 };
    component.search();

    expect(venueService.search).toHaveBeenCalledWith(undefined, 'Padel', 38.72, -9.14, 25);
    expect(venueService.suggest.calls.count()).toBe(pagedCalls);
  });

  it('ignores late paginated venue results after switching filters', () => {
    const delayed = new Subject<{ venues: any[]; page: number; hasMore: boolean }>();
    venueService.suggest.and.returnValues(
      delayed.asObservable(),
      of({ venues: [{ id: 101, name: 'Recinto novo', city: 'Sintra' } as any], page: 0, hasMore: false })
    );

    component.onLocationChange('Porto');
    component.search();
    component.onLocationChange('Sintra');
    component.search();
    delayed.next({ venues: [{ id: 100, name: 'Recinto antigo', city: 'Porto' } as any], page: 0, hasMore: false });
    delayed.complete();

    expect(component.venues.map(venue => venue.id)).toEqual([101]);
    expect(component.topVenues.map(venue => venue.id)).toEqual([101]);
  });

  it('expands and collapses venue results', () => {
    const venues = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1
    } as any));
    venueService.suggest.and.returnValue(of({ venues, page: 0, hasMore: false }));
    component.search();

    expect(component.venues).toEqual(venues);
    expect(component.topVenues.length).toBe(4);

    component.toggleAllVenues();
    expect(component.topVenues.length).toBe(6);

    component.toggleAllVenues();
    expect(component.topVenues.length).toBe(4);
  });

  it('should show an availability error when a discover request still fails after retry', () => {
    venueService.suggest.and.returnValue(
      throwError(() => new Error('API unavailable'))
    );

    component.search();

    expect(venueService.suggest).toHaveBeenCalled();
    expect(component.venuesLoadError).toBeTrue();
    expect(component.initialized).toBeTrue();
  });

  it('should clear the availability error when a retry search succeeds', () => {
    venueService.suggest.and.returnValue(
      throwError(() => new Error('API unavailable'))
    );
    component.search();
    expect(component.venuesLoadError).toBeTrue();

    venueService.suggest.and.returnValue(of({ venues: [], page: 0, hasMore: false }));
    component.search();

    expect(component.venuesLoadError).toBeFalse();
  });
  it('focuses categories without reloading and shows the venue map only once in Recintos', () => {
    const calls = venueService.suggest.calls.count();
    const sessionsPanel: HTMLElement = fixture.nativeElement.querySelector('#explore-sessions');
    const peoplePanel: HTMLElement = fixture.nativeElement.querySelector('#explore-people');

    expect(component.activeTab).toBe('all');
    expect(sessionsPanel.hasAttribute('hidden')).toBeTrue();
    expect(fixture.nativeElement.querySelector('.explore-map-panel')).toBeNull();

    component.setCategory('sessions');
    fixture.detectChanges();
    expect(sessionsPanel.hasAttribute('hidden')).toBeFalse();
    expect(peoplePanel.hasAttribute('hidden')).toBeTrue();
    expect(fixture.nativeElement.querySelector('.explore-map-panel')).toBeNull();

    component.setCategory('people');
    fixture.detectChanges();
    expect(peoplePanel.hasAttribute('hidden')).toBeFalse();
    component.setCategory('venues');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.explore-map-panel').length).toBe(1);
    expect(sessionsPanel.hasAttribute('hidden')).toBeTrue();
    expect(fixture.nativeElement.querySelector('#explore-venues')).toBeNull();
    expect(venueService.suggest.calls.count()).toBe(calls);
  });

  it('shows only the map and venue actions in Recintos, with no duplicated cards or title', () => {
    component.venues = [
      { id: 77, name: 'Recinto de teste', city: 'Lisboa', latitude: 38.72, longitude: -9.14 }
    ] as any;
    component.initialized = true;
    fixture.detectChanges();

    const resultsHeading: HTMLElement = fixture.nativeElement.querySelector('.explore-results-heading');
    expect(fixture.nativeElement.querySelector('.explore-map-panel')).toBeNull();
    expect(resultsHeading.hasAttribute('hidden')).toBeTrue();

    component.setCategory('venues');
    fixture.detectChanges();
    const map: HTMLElement = fixture.nativeElement.querySelector('.explore-map-panel');
    expect(map).not.toBeNull();
    expect(resultsHeading.hasAttribute('hidden')).toBeFalse();
    expect(map.querySelector('.explore-map-pick')?.textContent).toContain('Recinto de teste');
    expect(fixture.nativeElement.querySelectorAll('.explore-map-panel').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.venue-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('#explore-venues')).toBeNull();
    expect(map.querySelector('a[href="/menu/venues?sport=Padel&city=Lisboa"]')).not.toBeNull();
    expect(map.querySelector('a[href="/menu/venues/new?sport=Padel&city=Lisboa"]')).not.toBeNull();
    expect(map.querySelectorAll('.discover-nearby--venues').length).toBe(1);

    component.setCategory('all');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.explore-map-panel')).toBeNull();
  });

  it('keeps actions and a useful empty state if no venue has valid GPS coordinates', () => {
    component.venues = [
      { id: 91, name: 'Sem GPS', city: 'Lisboa', latitude: null, longitude: null }
    ] as any;
    component.initialized = true;
    component.setCategory('venues');
    fixture.detectChanges();
    const map: HTMLElement = fixture.nativeElement.querySelector('.explore-map-panel');
    expect(map).not.toBeNull();
    expect(map.querySelector('.explore-map-layout')).toBeNull();
    expect(map.querySelector('.explore-map-empty')?.textContent).toContain('não têm coordenadas');
    expect(map.querySelector('a[href^="/menu/venues?"]')).not.toBeNull();
    expect(map.querySelector('a[href^="/menu/venues/new?"]')).not.toBeNull();
  });

  it('uses sport quick picks as real search filters and allows toggling them off', () => {
    const calls = venueService.suggest.calls.count();
    component.selectQuickSport('Futebol');
    expect(component.sport).toBe('Futebol');
    expect(venueService.suggest).toHaveBeenCalledWith(undefined, 'Lisboa', 'Futebol', 0);
    component.selectQuickSport('Futebol');
    expect(component.sport).toBe('');
    expect(venueService.suggest.calls.count()).toBe(calls + 2);
  });

  it('shows the community entry only in the community category', () => {
    expect(fixture.nativeElement.querySelector('.explore-community-entry')).toBeNull();
    component.setCategory('communities');
    fixture.detectChanges();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.explore-community-entry a');
    expect(link.getAttribute('href')).toBe('/menu/communities');
    expect(fixture.nativeElement.querySelector('.explore-map-panel')).toBeNull();
  });

  it('shows a real venue map only for validated GPS locations and keeps the selection in sync', () => {
    component.venues = [
      { id: 100, name: 'Recinto A', city: 'Lisboa', latitude: 38.72, longitude: -9.14 },
      { id: 101, name: 'Sem coordenadas', city: 'Lisboa', latitude: null, longitude: null },
      { id: 102, name: 'Recinto B', city: 'Porto', latitude: 41.15, longitude: -8.61 }
    ] as any;
    component.setCategory('venues');
    fixture.detectChanges();
    expect(component.mapAvailableVenues.length).toBe(2);
    const map: HTMLElement = fixture.nativeElement.querySelector('.explore-map-panel');
    expect(map).not.toBeNull();
    expect(map.querySelectorAll('.explore-map-pick').length).toBe(2);
    component.selectMapVenue(102);
    fixture.detectChanges();
    expect(component.focusedMapVenue?.id).toBe(102);
    expect(map.querySelector('a[href="/menu/venues/102"]')).not.toBeNull();
  });

});
