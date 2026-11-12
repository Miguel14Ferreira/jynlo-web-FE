import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, BehaviorSubject, throwError } from 'rxjs';

import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { PerfisComponent } from './perfis.component';
import { appTranslate as t } from '../../i18n/i18n.service';
import { CommunityService } from '../../services/community.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { SessionService } from '../../services/session.service';
import { SocialGraphService } from '../../services/social-graph.service';
import { SocialFeedService } from '../../services/social-feed.service';
import { FeedItem } from '../model/feed-item';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';
import { VenueSportsBadgesComponent } from '../../shared/venue-sports-badges/venue-sports-badges.component';

describe('PerfisComponent', () => {
  let component: PerfisComponent;
  let fixture: ComponentFixture<PerfisComponent>;
  let service: jasmine.SpyObj<CommunityService>;
  let socialGraphService: jasmine.SpyObj<SocialGraphService>;
  let socialFeed: jasmine.SpyObj<SocialFeedService>;
  let groups: jasmine.SpyObj<CommunityGroupsService>;
  let sessions: jasmine.SpyObj<SessionService>;

  const profile = {
    username: 'ana',
    fullName: 'Ana Silva',
    nickname: null,
    country: 'Portugal',
    location: 'Lisboa',
    favoriteSports: 'Padel',
    bio: null,
    skillLevel: 'INTERMEDIATE',
    availability: null,
    age: 37,
    profilePicUrl: null,
    joinDateDisplay: '2026-09-01'
  };

  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    routeParams = new BehaviorSubject(convertToParamMap({}));
    service = jasmine.createSpyObj<CommunityService>(
      'CommunityService',
      ['searchProfiles', 'findProfiles', 'sendFriendRequest', 'reportUser', 'userBlockStatus', 'blockUser', 'unblockUser', 'discoverProfiles', 'friends', 'publicProfile', 'friendshipStatus']
    );
    service.searchProfiles.and.returnValue(of([profile]));
    service.findProfiles.and.returnValue(of([profile]));
    service.discoverProfiles.and.returnValue(of([profile]));
    service.friends.and.returnValue(of([]));
    service.friendshipStatus.and.returnValue(of({ friends: false, pendingRequest: false }));
    service.publicProfile.and.returnValue(of(profile));
    service.sendFriendRequest.and.returnValue(of({}));
    service.reportUser.and.returnValue(of(void 0));
    service.userBlockStatus.and.returnValue(of({ blocked: false }));
    service.blockUser.and.returnValue(of({ blocked: true }));
    service.unblockUser.and.returnValue(of({ blocked: false }));

    socialGraphService = jasmine.createSpyObj<SocialGraphService>(
      'SocialGraphService',
      ['status', 'follow', 'unfollow']
    );
    socialGraphService.status.and.returnValue(of({
      followedByMe: false,
      followsMe: false,
      followers: 3,
      following: 5
    }));
    socialGraphService.follow.and.returnValue(of({
      followedByMe: true,
      followsMe: false,
      followers: 4,
      following: 5
    }));
    socialGraphService.unfollow.and.returnValue(of({
      followedByMe: false,
      followsMe: false,
      followers: 3,
      following: 5
    }));

    socialFeed = jasmine.createSpyObj<SocialFeedService>('SocialFeedService', ['profilePosts']);
    socialFeed.profilePosts.and.returnValue(of([]));

    groups = jasmine.createSpyObj<CommunityGroupsService>('CommunityGroupsService', ['mine','invite']);
    sessions = jasmine.createSpyObj<SessionService>('SessionService', ['mine','invitePlayer']);
    groups.mine.and.returnValue(of([]));
    groups.invite.and.returnValue(of({} as any));
    sessions.mine.and.returnValue(of({created:[],joined:[],waitlisted:[]}));
    sessions.invitePlayer.and.returnValue(of({id:1}));

    await TestBed.configureTestingModule({
      declarations: [PerfisComponent],
      imports: [...TEST_IMPORTS, VenueSportsBadgesComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: CommunityService, useValue: service },
        { provide: SocialGraphService, useValue: socialGraphService },
        { provide: SocialFeedService, useValue: socialFeed },
        { provide: CommunityGroupsService, useValue: groups },
        { provide: SessionService, useValue: sessions },
        { provide: ActivatedRoute, useValue: { paramMap: routeParams, snapshot: { params: {}, queryParams: {}, paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}) } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PerfisComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps the player-search title and actions without repeating the navbar brand', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.page-header .eyebrow')).toBeNull();
    expect(root.querySelector('.page-header h1')).not.toBeNull();
    expect(root.querySelector('.partner-search')).not.toBeNull();
    expect(root.querySelector('a[href="/menu/friendList"]')).not.toBeNull();
  });

  it('preserves successful player results and their profile links if a later search fails', () => {
    component.sportFilter = 'Padel';
    component.locationFilter = 'Lisboa';
    component.search();
    fixture.detectChanges();

    const originalHref = '/menu/perfis/ana?from=people&sport=Padel&city=Lisboa';
    expect(fixture.nativeElement.querySelector('a.profile-card').getAttribute('href')).toBe(originalHref);

    const pending = new Subject<typeof profile[]>();
    service.findProfiles.and.returnValue(pending);
    component.sportFilter = 'Ténis';
    component.locationFilter = 'Sintra';
    component.search();
    pending.error({ error: {} });
    fixture.detectChanges();

    expect(component.profiles).toEqual([profile]);
    expect(component.searched).toBeTrue();
    expect(component.errorMessage).toBeTruthy();
    expect(component.peopleProfileParams.sport).toBe('Padel');
    expect(fixture.nativeElement.querySelector('a.profile-card').getAttribute('href')).toBe(originalHref);
  });

  it('keeps an initial failed search empty and shows its error', () => {
    service.findProfiles.and.returnValue(new Subject<typeof profile[]>());
    component.sportFilter = 'Padel';
    component.search();
    // A failed first request must not pretend there was a successful result.
    component.clearSearch();
    const failing = new Subject<typeof profile[]>();
    service.findProfiles.and.returnValue(failing);
    component.sportFilter = 'Padel';
    component.search();
    failing.error({ error: {} });
    fixture.detectChanges();
    expect(component.profiles).toEqual([]);
    expect(component.searched).toBeTrue();
    expect(component.errorMessage).toBeTruthy();
  });

  it('keeps the applied filters on profile links when the form is edited without searching', () => {
    component.searchTerm = 'Ana';
    component.sportFilter = 'Padel';
    component.locationFilter = 'Lisboa';
    component.minAge = 20;
    component.maxAge = 40;
    component.levelFilter = 'BEGINNER';
    component.search();
    fixture.detectChanges();

    const link = (): HTMLAnchorElement => fixture.nativeElement.querySelector('a.profile-card');
    const originalHref = '/menu/perfis/ana?from=people&player=Ana&sport=Padel&city=Lisboa&minAge=20&maxAge=40&level=BEGINNER';
    expect(link().getAttribute('href')).toBe(originalHref);

    component.searchTerm = 'Rui';
    component.sportFilter = 'Ténis';
    component.locationFilter = 'Sintra';
    component.minAge = 30;
    component.maxAge = 50;
    component.levelFilter = 'ADVANCED';
    fixture.detectChanges();

    expect(link().getAttribute('href')).toBe(originalHref);
  });

  it('keeps previous result filters during a pending search and captures the submitted values on success', () => {
    component.sportFilter = 'Padel';
    component.locationFilter = 'Lisboa';
    component.search();
    fixture.detectChanges();

    const link = (): HTMLAnchorElement => fixture.nativeElement.querySelector('a.profile-card');
    expect(link().getAttribute('href')).toBe('/menu/perfis/ana?from=people&sport=Padel&city=Lisboa');

    const pending = new Subject<typeof profile[]>();
    service.findProfiles.and.returnValue(pending);
    component.sportFilter = 'Ténis';
    component.search();
    component.locationFilter = 'Sintra';
    fixture.detectChanges();

    expect(link().getAttribute('href')).toBe('/menu/perfis/ana?from=people&sport=Padel&city=Lisboa');

    pending.next([profile]);
    pending.complete();
    fixture.detectChanges();

    expect(link().getAttribute('href')).toBe('/menu/perfis/ana?from=people&sport=T%C3%A9nis&city=Lisboa');
  });

  it('resets applied filters after clearing the player search', () => {
    component.sportFilter = 'Padel';
    component.search();
    fixture.detectChanges();
    expect(component.peopleProfileParams.sport).toBe('Padel');

    component.clearSearch();
    fixture.detectChanges();
    expect(component.peopleProfileParams.sport).toBeNull();
    expect(fixture.nativeElement.querySelector('a.profile-card')).toBeNull();

    component.locationFilter = 'Sintra';
    component.search();
    fixture.detectChanges();
    expect(component.peopleProfileParams.sport).toBeNull();
    expect(component.peopleProfileParams.city).toBe('Sintra');
  });

  it('carries all active advanced-search filters into a player profile', () => {
    component.searchTerm = 'Ana';
    component.sportFilter = 'Ténis';
    component.locationFilter = 'Sintra';
    component.minAge = 25;
    component.maxAge = 40;
    component.levelFilter = 'INTERMEDIATE';
    component.search();
    fixture.detectChanges();

    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a.profile-card');
    expect(link?.getAttribute('href'))
      .toBe('/menu/perfis/ana?from=people&player=Ana&sport=T%C3%A9nis&city=Sintra&minAge=25&maxAge=40&level=INTERMEDIATE');
  });

  it('returns from a player profile to the advanced search with its filters', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({
        from: 'people', player: 'Ana', sport: 'Ténis', city: 'Sintra',
        minAge: '25', maxAge: '40', level: 'INTERMEDIATE'
      })
    });
    try {
      routeParams.next(convertToParamMap({ username: 'ana' }));
      fixture.detectChanges();

      const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a.back-to-search');
      expect(link?.textContent).toContain(t('community.backToSearch'));
      expect(link?.getAttribute('href'))
        .toBe('/menu/perfis?from=people&player=Ana&sport=T%C3%A9nis&city=Sintra&minAge=25&maxAge=40&level=INTERMEDIATE');
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('restores and reruns advanced people search after returning from a profile', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({
        from: 'people', player: 'Ana', sport: 'Ténis', city: 'Sintra',
        minAge: '25', maxAge: '40', level: 'INTERMEDIATE'
      })
    });
    try {
      const page = TestBed.createComponent(PerfisComponent);
      page.detectChanges();

      expect(page.componentInstance.searchTerm).toBe('Ana');
      expect(page.componentInstance.sportFilter).toBe('Ténis');
      expect(page.componentInstance.locationFilter).toBe('Sintra');
      expect(page.componentInstance.minAge).toBe(25);
      expect(page.componentInstance.maxAge).toBe(40);
      expect(page.componentInstance.levelFilter).toBe('INTERMEDIATE');
      expect(service.findProfiles).toHaveBeenCalledWith({
        name: 'Ana', sport: 'Ténis', location: 'Sintra',
        minAge: 25, maxAge: 40, skillLevel: 'INTERMEDIATE'
      });
      expect(page.componentInstance.searched).toBeTrue();
      page.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('preserves original Discover filters separately when advanced search filters change', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({ from: 'discover', sport: 'Padel', city: 'Lisboa', player: '' })
    });
    try {
      component.sportFilter = 'Ténis';
      component.locationFilter = 'Sintra';
      component.search();
      fixture.detectChanges();

      const profileLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a.profile-card');
      expect(profileLink.getAttribute('href')).toBe(
        '/menu/perfis/ana?from=people&sport=T%C3%A9nis&city=Sintra&via=discover&discoverSport=Padel&discoverCity=Lisboa&discoverPlayer='
      );
      expect(component.discoverReturnParams).toEqual({
        sport: 'Padel', city: 'Lisboa', player: ''
      });
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('returns through advanced search to the original Discover filters, not the edited search', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({
        from: 'people', sport: 'Ténis', city: 'Sintra', via: 'discover',
        discoverSport: 'Padel', discoverCity: 'Lisboa', discoverPlayer: 'Ana'
      })
    });
    try {
      routeParams.next(convertToParamMap({ username: 'ana' }));
      fixture.detectChanges();

      const profileBack: HTMLAnchorElement = fixture.nativeElement.querySelector('a.back-to-search');
      expect(profileBack.getAttribute('href')).toBe(
        '/menu/perfis?from=people&sport=T%C3%A9nis&city=Sintra&via=discover&discoverSport=Padel&discoverCity=Lisboa&discoverPlayer=Ana'
      );

      routeParams.next(convertToParamMap({}));
      const advanced = TestBed.createComponent(PerfisComponent);
      advanced.detectChanges();
      expect(advanced.componentInstance.sportFilter).toBe('Ténis');
      expect(advanced.componentInstance.locationFilter).toBe('Sintra');
      expect(service.findProfiles).toHaveBeenCalledWith({
        name: undefined, sport: 'Ténis', location: 'Sintra',
        minAge: undefined, maxAge: undefined, skillLevel: undefined
      });
      const discoverBack: HTMLAnchorElement = advanced.nativeElement.querySelector('.discover-return-link');
      expect(discoverBack.getAttribute('href'))
        .toBe('/menu/discover?sport=Padel&city=Lisboa&player=Ana');
      advanced.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('keeps cleared Discover filters cleared after editing the advanced search', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true, value: convertToParamMap({ from: 'discover' })
    });
    try {
      component.sportFilter = 'Ténis';
      component.search();
      fixture.detectChanges();

      const profileLink: HTMLAnchorElement = fixture.nativeElement.querySelector('a.profile-card');
      expect(profileLink.getAttribute('href'))
        .toBe('/menu/perfis/ana?from=people&sport=T%C3%A9nis&via=discover&discoverSport=&discoverCity=&discoverPlayer=');
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('retains a route back to Discover after a profile round trip', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({ from: 'discover', sport: 'Padel', city: 'Lisboa' })
    });
    try {
      component.sportFilter = 'Padel';
      component.locationFilter = 'Lisboa';
      component.search();
      fixture.detectChanges();
      const profileLink: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a.profile-card');
      expect(profileLink?.getAttribute('href'))
        .toBe('/menu/perfis/ana?from=people&sport=Padel&city=Lisboa&via=discover&discoverSport=Padel&discoverCity=Lisboa&discoverPlayer=');

      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true,
        value: convertToParamMap({ from: 'people', sport: 'Padel', city: 'Lisboa', via: 'discover' })
      });
      const page = TestBed.createComponent(PerfisComponent);
      page.detectChanges();
      const back: HTMLAnchorElement | null = page.nativeElement.querySelector('.discover-return-link');
      expect(back?.getAttribute('href')).toBe('/menu/discover?sport=Padel&city=Lisboa&player=');
      page.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('ignores invalid query filter values when returning to advanced people search', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({
        from: 'people', sport: 'Padel', minAge: '-2', maxAge: '9999', level: 'UNKNOWN'
      })
    });
    try {
      const page = TestBed.createComponent(PerfisComponent);
      page.detectChanges();
      expect(page.componentInstance.minAge).toBeNull();
      expect(page.componentInstance.maxAge).toBeNull();
      expect(page.componentInstance.levelFilter).toBe('');
      expect(service.findProfiles).toHaveBeenCalledWith({
        name: undefined, sport: 'Padel', location: undefined,
        minAge: undefined, maxAge: undefined, skillLevel: undefined
      });
      page.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('shows a return to Discover preserving the filters of the advanced search', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({ from: 'discover', sport: 'Ténis', city: 'Sintra' })
    });
    try {
      fixture.detectChanges();
      const back: HTMLAnchorElement | null = fixture.nativeElement.querySelector('.discover-return-link');
      expect(back).not.toBeNull();
      expect(back?.textContent).toContain(t('discover.backFromProfile'));
      expect(back?.getAttribute('href')).toBe('/menu/discover?sport=T%C3%A9nis&city=Sintra&player=');
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('preserves an applied name when returning from the advanced player search', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({ from: 'discover', player: 'Ana' })
    });
    try {
      fixture.detectChanges();
      const back: HTMLAnchorElement | null = fixture.nativeElement.querySelector('.discover-return-link');
      expect(back?.getAttribute('href')).toBe('/menu/discover?sport=&city=&player=Ana');
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('keeps cleared Discover filters cleared on return from advanced search', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previous = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true,
      value: convertToParamMap({ from: 'discover' })
    });
    try {
      fixture.detectChanges();
      const back: HTMLAnchorElement | null = fixture.nativeElement.querySelector('.discover-return-link');
      expect(back?.getAttribute('href')).toBe('/menu/discover?sport=&city=&player=');
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: previous
      });
    }
  });

  it('does not show a Discover return on an unrelated player search', () => {
    expect(fixture.nativeElement.querySelector('.discover-return-link')).toBeNull();
  });

  it('applies Discover sport and locality to the advanced people search', () => {
    const route = TestBed.inject(ActivatedRoute);
    const oldQuery = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true, value: convertToParamMap({ from: 'discover', sport: 'Ténis', city: 'Sintra' })
    });
    try {
      const page = TestBed.createComponent(PerfisComponent);
      page.detectChanges();

      expect(page.componentInstance.sportFilter).toBe('Ténis');
      expect(page.componentInstance.locationFilter).toBe('Sintra');
      expect(page.componentInstance.searched).toBeTrue();
      expect(service.findProfiles).toHaveBeenCalledWith({
        name: undefined, sport: 'Ténis', location: 'Sintra',
        minAge: undefined, maxAge: undefined, skillLevel: undefined
      });
      page.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: oldQuery
      });
    }
  });

  it('applies only the name filter from a Discover name search', () => {
    const route = TestBed.inject(ActivatedRoute);
    const oldQuery = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true, value: convertToParamMap({
        from: 'discover', player: '  Ana  ', sport: 'Padel', city: 'Lisboa'
      })
    });
    try {
      const page = TestBed.createComponent(PerfisComponent);
      page.detectChanges();

      expect(page.componentInstance.searchTerm).toBe('Ana');
      expect(page.componentInstance.sportFilter).toBe('');
      expect(page.componentInstance.locationFilter).toBe('');
      expect(service.findProfiles).toHaveBeenCalledWith({
        name: 'Ana', sport: undefined, location: undefined,
        minAge: undefined, maxAge: undefined, skillLevel: undefined
      });
      page.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: oldQuery
      });
    }
  });

  it('keeps the advanced people search idle when Discover passed no filters', () => {
    const route = TestBed.inject(ActivatedRoute);
    const oldQuery = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      configurable: true, value: convertToParamMap({ from: 'discover' })
    });
    try {
      const page = TestBed.createComponent(PerfisComponent);
      page.detectChanges();

      expect(page.componentInstance.searched).toBeFalse();
      expect(page.componentInstance.profiles).toEqual([]);
      expect(service.findProfiles).not.toHaveBeenCalled();
      page.destroy();
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        configurable: true, value: oldQuery
      });
    }
  });

  it('should start without requesting or showing discoverable profiles', () => {
    expect(service.discoverProfiles).not.toHaveBeenCalled();
    expect(service.findProfiles).not.toHaveBeenCalled();
    expect(service.publicProfile).not.toHaveBeenCalled();
    expect(component.profiles).toEqual([]);
    expect(component.searched).toBeFalse();
  });

  it('should clear results without loading discovery again', () => {
    component.profiles = [profile];
    component.searched = true;
    component.searchTerm = 'ana';
    component.clearSearch();
    expect(component.profiles).toEqual([]);
    expect(component.searched).toBeFalse();
    expect(service.discoverProfiles).not.toHaveBeenCalled();
  });

  it('should cancel a pending search when results are cleared', () => {
    const pending = new Subject<typeof profile[]>();
    service.findProfiles.and.returnValue(pending);
    component.searchTerm = 'ana';
    component.search();
    component.clearSearch();
    pending.next([profile]);
    pending.complete();
    expect(component.profiles).toEqual([]);
    expect(component.loading).toBeFalse();
    expect(component.searched).toBeFalse();
  });

  it('returns to Discover after opening a player from Discover', () => {
    const activatedRoute = TestBed.inject(ActivatedRoute);
    Object.defineProperty(activatedRoute.snapshot, 'queryParamMap', {
      value: convertToParamMap({ from: 'discover' }),
      configurable: true
    });
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();

    expect(component.backToDiscover).toBeTrue();
    expect(component.selectedProfile?.username).toBe('ana');
    const back = fixture.nativeElement.querySelector('a.back-to-search') as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/menu/discover');
    expect(back.textContent).toContain(t('discover.backFromProfile'));
    expect(socialGraphService.status).toHaveBeenCalledWith('ana');
  });

  it('returns to Discover with its original sport, locality and name filters', () => {
    const route = TestBed.inject(ActivatedRoute);
    const previousParams = route.snapshot.queryParamMap;
    Object.defineProperty(route.snapshot, 'queryParamMap', {
      value: convertToParamMap({
        from: 'discover', sport: 'Ténis', city: 'Sintra', player: 'Ana'
      }),
      configurable: true
    });
    try {
      routeParams.next(convertToParamMap({ username: 'ana' }));
      fixture.detectChanges();

      expect(component.backToDiscover).toBeTrue();
      const back: HTMLAnchorElement = fixture.nativeElement.querySelector('a.back-to-search');
      expect(back.getAttribute('href'))
        .toBe('/menu/discover?sport=T%C3%A9nis&city=Sintra&player=Ana');
    } finally {
      Object.defineProperty(route.snapshot, 'queryParamMap', {
        value: previousParams, configurable: true
      });
    }
  });

  it('returns to the feed when a profile was opened from a feed link', () => {
    const activatedRoute = TestBed.inject(ActivatedRoute);
    Object.defineProperty(activatedRoute.snapshot, 'queryParamMap', {
      value: convertToParamMap({ from: 'feed' }),
      configurable: true
    });
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();

    expect(component.backToFeed).toBeTrue();
    const back = fixture.nativeElement.querySelector('a.back-to-search') as HTMLAnchorElement;
    expect(back).toBeTruthy();
    expect(back.getAttribute('href')).toBe('/menu/feed');
    expect(back.textContent).toContain(t('feed.backToFeed'));
  });

  it('should load a profile from its dedicated URL without searching', () => {
    routeParams.next(convertToParamMap({ username: 'ana' }));
    expect(service.publicProfile).toHaveBeenCalledWith('ana');
    expect(component.profilePage).toBeTrue();
    expect(component.selectedProfile?.username).toBe('ana');
    expect(service.findProfiles).not.toHaveBeenCalled();
    expect(service.discoverProfiles).not.toHaveBeenCalled();
  });

  it('should cancel an old profile request when the URL changes', () => {
    const pending = new Subject<typeof profile>();
    service.publicProfile.and.returnValue(pending);
    routeParams.next(convertToParamMap({ username: 'ana' }));
    service.publicProfile.and.returnValue(of({ ...profile, username: 'rui' }));
    routeParams.next(convertToParamMap({ username: 'rui' }));
    pending.next(profile);
    expect(component.selectedProfile?.username).toBe('rui');
  });

  it('should show an error if a profile URL cannot be loaded', () => {
    const pending = new Subject<typeof profile>();
    service.publicProfile.and.returnValue(pending);
    routeParams.next(convertToParamMap({ username: 'missing' }));
    pending.error({ error: {} });
    expect(component.selectedProfile).toBeUndefined();
    expect(component.errorMessage).toBeTruthy();
    expect(component.loading).toBeFalse();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should search profiles using sports matching filters', () => {
    component.searchTerm = 'ana';
    component.sportFilter = 'Padel';
    component.locationFilter = 'Lisboa';
    component.minAge = 30;
    component.maxAge = 45;
    component.levelFilter = 'INTERMEDIATE';

    component.search();

    expect(service.findProfiles).toHaveBeenCalledWith({
      name: 'ana',
      sport: 'Padel',
      location: 'Lisboa',
      minAge: 30,
      maxAge: 45,
      skillLevel: 'INTERMEDIATE'
    });
    expect(component.profiles).toEqual([profile]);
  });

  it('shows a compact relationship row and two equal priority actions for friends', () => {
    service.friendshipStatus.and.returnValue(of({ friends: true, pendingRequest: false }));
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const panel = root.querySelector<HTMLElement>('.profile-hero > .profile-actions-panel');
    const relation = panel?.querySelector<HTMLElement>('.profile-relationship-row');
    const actions = panel?.querySelector<HTMLElement>('.profile-primary-actions');
    const badge = relation?.querySelector<HTMLElement>('.profile-friend-badge');
    const following = relation?.querySelector<HTMLButtonElement>('.profile-follow-toggle');
    const chat = actions?.querySelector<HTMLAnchorElement>('.profile-chat-action');
    const invite = actions?.querySelector<HTMLButtonElement>('.profile-invite-trigger');

    expect(panel).toBeTruthy();
    expect(getComputedStyle(panel!).display).toBe('grid');
    expect(getComputedStyle(actions!).display).toBe('grid');
    expect(actions?.children.length).toBe(2);
    expect(relation?.contains(chat!)).toBeFalse();
    expect(badge?.textContent).toContain(t('friends.title'));
    expect(badge?.tagName).toBe('SPAN'); // a status, not a disabled button
    expect(following?.getAttribute('aria-pressed')).toBe('false');
    expect(chat?.getAttribute('href')).toContain('/menu/messages?kind=direct');
    expect(invite?.getAttribute('aria-expanded')).toBe('false');
    invite!.click();
    fixture.detectChanges();
    expect(invite?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('#profile-invitation-panel')).toBeTruthy();
  });

  it('keeps unfollow/follow distinct from friend status and request controls', () => {
    service.friendshipStatus.and.returnValue(of({ friends: true, pendingRequest: false }));
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();
    const following = fixture.nativeElement.querySelector('.profile-follow-toggle') as HTMLButtonElement | null;
    expect(following?.getAttribute('aria-pressed')).toBe('false');
    following!.click();
    fixture.detectChanges();
    expect(socialGraphService.follow).toHaveBeenCalledOnceWith('ana');
    expect(fixture.nativeElement.querySelector('.profile-follow-toggle')?.getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.profile-friend-badge')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.profile-chat-action')).toBeTruthy();
  });

  it('places a friend request next to invite without showing a false friendship badge', () => {
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();
    const actions = fixture.nativeElement.querySelector('.profile-primary-actions') as HTMLElement | null;
    expect(actions?.querySelector('button.profile-request-action')).toBeTruthy();
    expect(actions?.querySelector('button.profile-invite-trigger')).toBeTruthy();
    expect(actions?.children.length).toBe(2);
    expect(fixture.nativeElement.querySelector('.profile-friend-badge')).toBeNull();
    expect(fixture.nativeElement.querySelector('.profile-chat-action')).toBeNull();
  });

  it('does not show primary profile actions on own or blocked profiles', () => {
    component.profilePage = true;
    component.selectedProfile = { ...profile, username: 'ana' };
    spyOn(component, 'isOwnProfile').and.returnValue(true);
    fixture.detectChanges();
    const edit: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a.profile-edit-action');
    expect(edit?.getAttribute('href')).toBe('/menu/alterardados');
    expect(edit?.textContent).toContain(t('profile.edit.title'));
    expect(fixture.nativeElement.querySelector('.profile-relation-note')).toBeNull();
    expect(fixture.nativeElement.querySelector('.profile-primary-actions')?.children.length).toBe(0);
  });

  it('keeps edit profile private to the owner and achievements collapsed by default', () => {
    component.profilePage = true;
    component.selectedProfile = { ...profile, username: 'ana' };
    component.selectedActivity = {
      activitiesCompleted: 2, peoplePlayedWith: 0, sportsPractised: 1,
      eventsCreated: 8, participantsMobilized: 0, communitiesJoined: 0,
      achievements: ['FIRST_ACTIVITY', 'ORGANIZER']
    } as any;
    spyOn(component, 'isOwnProfile').and.returnValue(false);
    fixture.detectChanges();
    let root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('a.profile-edit-action')).toBeNull();
    const disclosure = root.querySelector('details.public-achievements-disclosure') as HTMLDetailsElement;
    expect(disclosure).toBeTruthy();
    expect(disclosure.open).toBeFalse();
    expect(disclosure.querySelectorAll('.public-achievements > span').length).toBe(2);

    (component.isOwnProfile as jasmine.Spy).and.returnValue(true);
    fixture.detectChanges();
    root = fixture.nativeElement;
    expect(root.querySelector('a.profile-edit-action')?.getAttribute('href')).toBe('/menu/alterardados');
    expect(root.querySelector('.profile-invite-trigger')).toBeNull();
  });

  it('shows the chat instead of another request when the server confirms friendship', () => {
    service.friendshipStatus.and.returnValue(of({ friends: true, pendingRequest: false }));
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();

    expect(service.friendshipStatus).toHaveBeenCalledWith('ana');
    expect(component.isFriend(profile)).toBeTrue();
    expect(fixture.nativeElement.querySelector('.friend-status')?.textContent).toContain(t('friends.title'));
    expect(fixture.nativeElement.querySelector('a[href*="/menu/messages?kind=direct"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.detail-actions button.primary-action')).toBeNull();
    component.sendFriendRequest(profile);
    expect(service.sendFriendRequest).not.toHaveBeenCalled();
  });

  it('recovers from an already-friends response instead of keeping a red error and duplicate button', () => {
    service.friendshipStatus.and.returnValues(
      of({ friends: false, pendingRequest: false }),
      of({ friends: true, pendingRequest: false })
    );
    service.sendFriendRequest.and.returnValue(throwError(() => ({
      status: 409, error: { message: 'Tu já tens este perfil na tua lista de amigos!' }
    })));
    routeParams.next(convertToParamMap({ username: 'ana' }));
    component.sendFriendRequest(profile);
    fixture.detectChanges();

    expect(service.friendshipStatus).toHaveBeenCalledTimes(2);
    expect(component.actionError).toBe('');
    expect(component.isFriend(profile)).toBeTrue();
    expect(fixture.nativeElement.querySelector('a[href*="/menu/messages?kind=direct"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.detail-actions button.primary-action')).toBeNull();
  });

  it('renders an outstanding friend request without offering another request', () => {
    service.friendshipStatus.and.returnValue(of({ friends: false, pendingRequest: true }));
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();

    expect(component.friendRequestPending(profile)).toBeTrue();
    const request: HTMLButtonElement = fixture.nativeElement.querySelector('.detail-actions button.primary-action');
    expect(request.disabled).toBeTrue();
    expect(request.textContent).toContain(t('community.requestPending'));
  });

  it('separates the relationship loading message from action buttons without clipping', () => {
    const pending = new Subject<{ friends: boolean; pendingRequest: boolean }>();
    service.friendshipStatus.and.returnValue(pending);
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const status = root.querySelector<HTMLElement>('.profile-relationship-feedback[role="status"]');
    const actions = root.querySelector<HTMLElement>('.profile-hero > .detail-actions');
    expect(status).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(actions?.contains(status!)).toBeFalse();
    expect(status?.textContent?.trim()).toBe(t('profile.relationshipChecking'));
    expect(getComputedStyle(status!).whiteSpace).toBe('normal');
    expect(getComputedStyle(status!).overflowWrap).toBe('anywhere');
    expect(root.querySelector('.profile-invite-trigger')).toBeTruthy();

    pending.error({ status: 503 });
    fixture.detectChanges();
    const error = root.querySelector<HTMLElement>('.profile-relationship-feedback[role="alert"]');
    expect(error?.textContent).toContain(t('profile.relationshipCheckFailed'));
    expect(error?.querySelector('button')?.textContent?.trim()).toBe(t('common.retry'));
    expect(root.querySelector('.detail-actions button.primary-action')).toBeNull();
  });

  it('lays out the back action separately from the full profile card', () => {
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const back = root.querySelector<HTMLElement>('a.back-to-search');
    const card = root.querySelector<HTMLElement>('.profile-detail');
    expect(back).not.toBeNull();
    expect(card).not.toBeNull();
    expect(getComputedStyle(back!).display).toBe('flex');
    expect(parseFloat(getComputedStyle(back!).marginBottom)).toBeGreaterThan(0);
    expect(card?.contains(back!)).toBeFalse();
  });

  it('fails closed while status is loading or failed, rather than displaying add-friend', () => {
    const pending = new Subject<{ friends: boolean; pendingRequest: boolean }>();
    service.friendshipStatus.and.returnValue(pending);
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-actions button.primary-action')).toBeNull();
    expect(component.friendshipLoading).toBeTrue();

    pending.error({ status: 503 });
    fixture.detectChanges();
    expect(component.friendshipError).toBeTrue();
    expect(fixture.nativeElement.querySelector('.detail-actions button.primary-action')).toBeNull();

    service.friendshipStatus.and.returnValue(of({ friends: true, pendingRequest: false }));
    component.loadFriendshipStatus('ana');
    fixture.detectChanges();
    expect(component.friendshipError).toBeFalse();
    expect(component.isFriend(profile)).toBeTrue();
  });

  it('ignores friendship responses from a profile that is no longer selected', () => {
    const oldStatus = new Subject<{ friends: boolean; pendingRequest: boolean }>();
    service.friendshipStatus.and.returnValue(oldStatus);
    routeParams.next(convertToParamMap({ username: 'ana' }));

    const secondProfile = { ...profile, username: 'rui' };
    service.publicProfile.and.returnValue(of(secondProfile));
    service.friendshipStatus.and.returnValue(of({ friends: false, pendingRequest: false }));
    routeParams.next(convertToParamMap({ username: 'rui' }));
    oldStatus.next({ friends: true, pendingRequest: false });
    fixture.detectChanges();

    expect(component.selectedProfile?.username).toBe('rui');
    expect(component.isFriend(secondProfile)).toBeFalse();
    expect(component.friendUsernames.has('ana')).toBeFalse();
  });

  it('should send a friend request for the selected profile', () => {
    component.sendFriendRequest(profile);

    expect(service.sendFriendRequest).toHaveBeenCalledWith('ana');
    expect(component.actionSuccess).toContain('ana');
    expect(component.friendRequestPending(profile)).toBeTrue();
  });

  it('should follow a selected profile', () => {
    component.selectedProfile = profile;
    component.selectedFollowStatus = {
      followedByMe: false,
      followsMe: false,
      followers: 3,
      following: 5
    };

    component.toggleFollow(profile);

    expect(socialGraphService.follow).toHaveBeenCalledWith('ana');
    expect(component.selectedFollowStatus?.followedByMe).toBeTrue();
  });

  it('should block a selected user and remove local social actions', () => {
    component.selectedProfile = profile;
    component.selectedFollowStatus = {
      followedByMe: true,
      followsMe: true,
      followers: 4,
      following: 5
    };
    component.friendUsernames.add('ana');

    component.toggleBlock(profile);

    expect(service.blockUser).toHaveBeenCalledWith('ana');
    expect(component.selectedBlocked).toBeTrue();
    expect(component.selectedFollowStatus).toBeUndefined();
    expect(component.friendUsernames.has('ana')).toBeFalse();
    expect(component.actionSuccess).toContain('ana');
  });

  it('should unblock a selected user', () => {
    component.selectedProfile = profile;
    component.selectedBlocked = true;

    component.toggleBlock(profile);

    expect(service.unblockUser).toHaveBeenCalledWith('ana');
    expect(component.selectedBlocked).toBeFalse();
    expect(component.actionSuccess).toContain('ana');
  });

  it('should not send social actions while the selected user is blocked', () => {
    component.selectedBlocked = true;

    component.toggleFollow(profile);
    component.sendFriendRequest(profile);
    component.reportReason = 'motivo';
    component.submitReport(profile);

    expect(socialGraphService.follow).not.toHaveBeenCalled();
    expect(service.sendFriendRequest).not.toHaveBeenCalled();
    expect(service.reportUser).not.toHaveBeenCalled();
  });

  it('should report a selected user with a trimmed reason', () => {
    component.selectedProfile = profile;
    component.reportOpen = true;
    component.reportReason = '  Comportamento abusivo  ';

    component.submitReport(profile);

    expect(service.reportUser).toHaveBeenCalledWith('ana', 'Comportamento abusivo');
    expect(component.reportOpen).toBeFalse();
    expect(component.reportReason).toBe('');
    expect(component.actionSuccess).toContain('ana');
  });

  it('should not report the logged-in profile', () => {
    const ownProfile = { ...profile, username: 'miguel' };
    component.reportReason = 'motivo';

    component.submitReport(ownProfile);

    expect(service.reportUser).not.toHaveBeenCalled();
  });

  it('should not allow a friend request to the logged-in profile', () => {
    const ownProfile = { ...profile, username: 'miguel' };

    component.sendFriendRequest(ownProfile);

    expect(component.isOwnProfile(ownProfile)).toBeTrue();
    expect(service.sendFriendRequest).not.toHaveBeenCalled();
  });

  it('should not resend a locally pending friend request', () => {
    component.pendingFriendRequests.add('ana');

    component.sendFriendRequest(profile);

    expect(service.sendFriendRequest).not.toHaveBeenCalled();
  });

  it('should keep results empty when all filters are empty', () => {
    component.searchTerm = '  ';
    component.sportFilter = '';
    component.locationFilter = '';
    component.minAge = null;
    component.maxAge = null;
    component.levelFilter = '';

    component.search();

    expect(service.findProfiles).not.toHaveBeenCalled();
    expect(service.discoverProfiles).not.toHaveBeenCalled();
    expect(component.profiles).toEqual([]);
    expect(component.searched).toBeFalse();
  });

  it('loads only authored persistent posts for the selected profile', () => {
    const post: FeedItem = {
      type: 'POST', postId: 9, authorUsername: 'ana', authorDisplayName: 'Ana',
      authorProfilePicUrl: null, content: 'Jogo de hoje', imageUrl: null,
      createdAt: '2026-11-11T17:00:00Z', sessionId: null, sport: null,
      city: null, gameDate: null, likeCount: 2, likedByMe: false, commentCount: 1
    };
    socialFeed.profilePosts.and.returnValue(of([
      post, { ...post, postId: 10, type: 'SESSION_ATTENDED' }
    ]));
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();

    expect(socialFeed.profilePosts).toHaveBeenCalledOnceWith('ana');
    expect(component.profilePosts.map(p => p.postId)).toEqual([9]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.profile-publication-card')?.textContent)
      .toContain('Jogo de hoje');
  });

  it('never displays another profile posts after switching usernames', () => {
    const former = new Subject<FeedItem[]>();
    socialFeed.profilePosts.and.returnValues(former, of([]));
    routeParams.next(convertToParamMap({ username: 'ana' }));
    expect(component.postsLoading).toBeTrue();

    const nextProfile = { ...profile, username: 'bruno' };
    service.publicProfile.and.returnValue(of(nextProfile));
    routeParams.next(convertToParamMap({ username: 'bruno' }));
    former.next([{
      type: 'POST', postId: 9, authorUsername: 'ana',
      authorDisplayName: 'Ana', authorProfilePicUrl: null,
      content: 'Old post', imageUrl: null, createdAt: '2026-11-11T17:00:00Z',
      sessionId: null, sport: null, city: null, gameDate: null,
      likeCount: 0, likedByMe: false, commentCount: 0
    }]);

    expect(component.selectedProfile?.username).toBe('bruno');
    expect(component.profilePosts).toEqual([]);
    expect(component.postsLoading).toBeFalse();
  });

  it('can retry failed profile post loading without hiding the profile', () => {
    socialFeed.profilePosts.and.returnValues(
      throwError(() => new Error('Network unavailable')), of([])
    );
    routeParams.next(convertToParamMap({ username: 'ana' }));
    fixture.detectChanges();
    expect(component.postsLoadError).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).querySelector('.profile-publications [role="alert"]'))
      .toBeTruthy();

    component.loadProfilePosts('ana');
    fixture.detectChanges();
    expect(component.postsLoadError).toBeFalse();
    expect(component.profilePosts).toEqual([]);
    expect(component.selectedProfile?.username).toBe('ana');
  });

  it('keeps premium profile hero actions, iconic details and activity accessible', () => {
    component.profilePage = true;
    component.selectedProfile = { ...profile, username: 'ana', bio: 'Gosto de jogar' };
    component.selectedActivity = {
      activitiesCompleted: 3, peoplePlayedWith: 5, sportsPractised: 2,
      eventsCreated: 1, participantsMobilized: 8, communitiesJoined: 1,
      achievements: []
    };
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.profile-hero > .detail-heading')).toBeTruthy();
    expect(root.querySelector('.profile-hero > .detail-actions')).toBeTruthy();
    expect(root.querySelectorAll('.profile-meta > .profile-meta-card').length).toBe(5);
    expect(root.querySelectorAll('.profile-meta .profile-stat-icon svg').length).toBe(5);
    expect(root.querySelectorAll('.public-activity-grid > .profile-activity-card').length).toBe(4);
    expect(root.querySelectorAll('.public-activity-grid svg').length).toBe(4);
    expect(root.querySelector('.profile-invite-trigger')).toBeTruthy();
    expect(root.querySelector('.profile-safety summary')).toBeTruthy();
    expect(root.querySelector('.public-bio')?.textContent).toContain('Gosto de jogar');
  });

  describe('profile community and session invitations', () => {
    const future = () => new Date(Date.now()+86400_000).toISOString();
    const eligibleGroup = (members: {username:string}[] = []) => ({
      id: 41, name:'Futebol de sábado', sport:'Futebol', myRole:'OWNER',
      members
    });
    const eligibleSession = () => ({
      id: 55, sport:'Futebol', city:'Lisboa', gameDate:future(), status:'OPEN',
      privateGame:false, audience:'PUBLIC'
    });

    beforeEach(() => {
      component.currentUsername='miguel';
      component.profilePage=true;
      component.selectedProfile={...profile,username:'ana'};
      component.selectedBlocked=false;
    });

    it('loads on demand and includes future public, private and community sessions created by the organiser', () => {
      groups.mine.and.returnValue(of([
        eligibleGroup(), {...eligibleGroup(),id:42,myRole:'MEMBER'},
        {...eligibleGroup(),id:43,members:[{username:'ANA'}]}
      ] as any));
      sessions.mine.and.returnValue(of({
        created:[eligibleSession(),{...eligibleSession(),id:56,privateGame:true},
          {...eligibleSession(),id:57,audience:'COMMUNITY_ONLY'},
          {...eligibleSession(),id:58,gameDate:'2020-01-01T00:00:00Z'}],
        joined:[],waitlisted:[]
      } as any));
      expect(groups.mine).not.toHaveBeenCalled();
      expect(sessions.mine).not.toHaveBeenCalled();
      component.toggleInvitePanel();
      fixture.detectChanges();
      expect(component.availableInviteCommunities.map(v=>v.id)).toEqual([41]);
      expect(component.availableInviteSessions.map(v=>v.id)).toEqual([55,56,57]);
      component.inviteTab = 'session';
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.profile-invite-option').length).toBe(3);
      expect(fixture.nativeElement.textContent).toContain('Futebol');
      expect(fixture.nativeElement.querySelector('.profile-invite-state')).toBeNull();
      component.inviteTab = 'community';
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.profile-invite-tabs')).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll('.profile-invite-option').length).toBe(1);
    });

    it('sends invitations for private and community sessions without accidentally including joined-only games', () => {
      groups.mine.and.returnValue(of([]));
      sessions.mine.and.returnValue(of({
        created:[{...eligibleSession(),id:56,privateGame:true},
          {...eligibleSession(),id:57,audience:'COMMUNITY_ONLY'}],
        joined:[{...eligibleSession(),id:99}],waitlisted:[]
      } as any));
      component.toggleInvitePanel();
      component.sendProfileInvite('session',56);
      component.sendProfileInvite('session',57);
      component.sendProfileInvite('session',99);
      expect(sessions.invitePlayer).toHaveBeenCalledTimes(2);
      expect(sessions.invitePlayer).toHaveBeenCalledWith(56,'ana');
      expect(sessions.invitePlayer).toHaveBeenCalledWith(57,'ana');
      expect(component.availableInviteSessions.map(s=>s.id)).toEqual([56,57]);
    });

    it('sends authorized invitations through existing endpoints exactly once per target', () => {
      groups.mine.and.returnValue(of([eligibleGroup()] as any));
      sessions.mine.and.returnValue(of({created:[eligibleSession()],joined:[],waitlisted:[]} as any));
      component.toggleInvitePanel();
      component.sendProfileInvite('community',41);
      component.sendProfileInvite('community',41);
      component.sendProfileInvite('session',55);
      component.sendProfileInvite('session',55);
      expect(groups.invite).toHaveBeenCalledOnceWith(41,'ana');
      expect(sessions.invitePlayer).toHaveBeenCalledOnceWith(55,'ana');
      expect(component.sentInvites.size).toBe(2);
    });

    it('will not invite to an unauthorized community, old session, or from own and blocked profiles', () => {
      groups.mine.and.returnValue(of([{...eligibleGroup(),myRole:'MEMBER'}] as any));
      sessions.mine.and.returnValue(of({created:[{...eligibleSession(),gameDate:'2020-01-01T00:00:00Z'}],joined:[],waitlisted:[]} as any));
      component.toggleInvitePanel();
      component.sendProfileInvite('community',41);
      component.sendProfileInvite('session',55);
      expect(groups.invite).not.toHaveBeenCalled();
      expect(sessions.invitePlayer).not.toHaveBeenCalled();
      component.closeInvitePanel();
      component.selectedBlocked=true;
      component.toggleInvitePanel();
      expect(component.invitePanelOpen).toBeFalse();
      component.selectedBlocked=false;
      component.selectedProfile={...profile,username:'miguel'};
      component.toggleInvitePanel();
      expect(component.invitePanelOpen).toBeFalse();
    });

    it('invalidates stale invite choices after navigating to a different profile', () => {
      const pending=new Subject<any[]>();
      groups.mine.and.returnValue(pending.asObservable());
      sessions.mine.and.returnValue(of({created:[],joined:[],waitlisted:[]}));
      component.toggleInvitePanel();
      expect(component.inviteLoading).toBeTrue();
      component.closeProfile();
      component.selectedProfile={...profile,username:'bea'};
      pending.next([eligibleGroup()]);
      pending.complete();
      expect(component.invitePanelOpen).toBeFalse();
      expect(component.availableInviteCommunities).toEqual([]);
    });

    it('keeps profile details compact without placeholder tiles for missing public fields', () => {
      component.profilePage=true;
      component.selectedProfile={...profile,country:null,location:null,age:null,
        favoriteSports:null,skillLevel:null,availability:null,joinDateDisplay:null};
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.profile-meta > div').length).toBe(0);
    });
  });


});
