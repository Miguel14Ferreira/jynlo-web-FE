import { Component } from '@angular/core';
import { SocialFeedComponent } from './social-feed.component';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SessionDetail } from '../model/session-detail';
import { SessionSummary } from '../model/session-summary';
import { SocialFeedService } from '../../services/social-feed.service';
import { SessionService } from '../../services/session.service';
import { CommunityService } from '../../services/community.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { AuthenticationService } from '../../services/authethication.service';
import { FeedItem } from '../model/feed-item';
import { appTranslate as t, preloadEnglishTranslations } from '../../i18n/i18n.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';
import { VenueSportsBadgesComponent } from '../../shared/venue-sports-badges/venue-sports-badges.component';

@Component({ selector: 'app-social-stories', standalone: true, template: '' })
class StubStoriesComponent {}

describe('SocialFeedComponent discovery sidebar', () => {
  let fixture: ComponentFixture<SocialFeedComponent>;
  let component: SocialFeedComponent;
  let feed: jasmine.SpyObj<SocialFeedService>;
  let sessions: jasmine.SpyObj<SessionService>;
  let community: jasmine.SpyObj<CommunityService>;
  let groups: jasmine.SpyObj<CommunityGroupsService>;

  beforeEach(async () => {
    // Feed onboarding is persisted per user: isolate repeated component renders.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('jynlo:feed-welcome:v1:')) localStorage.removeItem(key);
    }
    feed = jasmine.createSpyObj<SocialFeedService>('SocialFeedService', ['feed', 'createPost']);
    feed.feed.and.returnValue(of([]));
    sessions = jasmine.createSpyObj<SessionService>('SessionService', ['discover', 'mine', 'detail']);
    sessions.discover.and.returnValue(of([]));
    sessions.mine.and.returnValue(of({ created: [], joined: [], waitlisted: [] }));
    community = jasmine.createSpyObj<CommunityService>(
      'CommunityService', ['discoverProfiles', 'publicProfile', 'friends']
    );
    community.discoverProfiles.and.returnValue(of([]));
    community.publicProfile.and.returnValue(of(null as any));
    community.friends.and.returnValue(of([]));
    groups = jasmine.createSpyObj<CommunityGroupsService>('CommunityGroupsService', ['mine']);
    groups.mine.and.returnValue(of([]));
    const auth = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['isLoggedIn']);
    auth.isLoggedIn.and.returnValue(true);
    Object.defineProperty(auth, 'loggedInPerfilname', { value: 'miguel', configurable: true });

    await TestBed.configureTestingModule({
      declarations: [SocialFeedComponent],
      imports: [...TEST_IMPORTS, StubStoriesComponent, VenueSportsBadgesComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: AuthenticationService, useValue: auth },
        { provide: SocialFeedService, useValue: feed },
        { provide: SessionService, useValue: sessions },
        { provide: CommunityService, useValue: community },
        { provide: CommunityGroupsService, useValue: groups }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SocialFeedComponent);
    component = fixture.componentInstance;
  });

  it('groups repeated attendance per session without hiding regular posts', fakeAsync(() => {
    const makeItem = (type: FeedItem['type'], username: string, sessionId: number | null): FeedItem => ({
      type, postId: type === 'POST' ? 42 : null,
      authorUsername: username, authorDisplayName: username,
      authorProfilePicUrl: null, content: type === 'POST' ? 'Grande jogo!' : null,
      imageUrl: null, createdAt: '2026-11-11T18:00:00Z',
      sessionId, sport: 'Futebol', city: 'Lisboa', gameDate: '2026-11-11T17:00:00Z',
      likeCount: 0, likedByMe: false, commentCount: 0
    });
    fixture.detectChanges();
    tick(351);
    component.items = [
      makeItem('SESSION_ATTENDED', 'miguel', 17),
      makeItem('SESSION_ATTENDED', 'ana', 17),
      makeItem('SESSION_ATTENDED', 'ana', 17),
      makeItem('SESSION_ATTENDED', 'joao', 18),
      makeItem('POST', 'ana', null)
    ];
    expect(component.attendanceGroups.length).toBe(2);
    expect(component.attendanceGroups.find(group => group.sessionId === 17)?.count).toBe(2);
    expect(component.attendanceGroups.find(group => group.sessionId === 17)?.ownActivity?.authorUsername).toBe('miguel');
    expect(component.fullFeedItems.map(item => item.type)).toEqual(['POST']);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.feed-attendance-row').length).toBe(2);
    const summaries = Array.from(root.querySelectorAll('.feed-attendance-summary strong'))
      .map(element => element.textContent?.trim());
    expect(summaries).toContain('miguel e mais 1 participaram numa sessão de Futebol');
    expect(summaries).toContain('joao participou numa sessão de Futebol');
    expect(root.querySelectorAll('.feed-list .feed-card').length).toBe(1);
  }));

  it('limits automatic activity to five sessions until explicitly expanded', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    component.items = Array.from({ length: 8 }, (_, index) => ({
      type: 'SESSION_ATTENDED', sessionId: index + 1,
      authorUsername: 'player' + index, authorDisplayName: 'Player ' + index,
      authorProfilePicUrl: null, postId: null, content: null, imageUrl: null,
      createdAt: '2026-11-11T18:00:00Z', sport: 'Futebol', city: 'Lisboa',
      gameDate: '2026-11-11T17:00:00Z', likeCount: 0,
      likedByMe: false, commentCount: 0
    } as FeedItem));
    fixture.detectChanges();
    expect(component.displayedAttendanceGroups.length).toBe(5);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.feed-attendance-row').length).toBe(5);
    const expand = (fixture.nativeElement as HTMLElement).querySelector('.feed-attendance-expand') as HTMLButtonElement;
    expect(expand).not.toBeNull();
    expand.click();
    fixture.detectChanges();
    expect(component.displayedAttendanceGroups.length).toBe(8);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.feed-attendance-row').length).toBe(8);
  }));

  it('shows onboarding for two visits and then preserves the regular feed', fakeAsync(() => {
    const first = fixture;
    first.detectChanges();
    tick(351);
    expect(first.nativeElement.querySelector('.feed-v3-welcome')).not.toBeNull();
    const key = 'jynlo:feed-welcome:v1:' + component.currentUsername.toLocaleLowerCase();
    if (!component.currentUsername) {
      // Anonymous fallback deliberately does not persist an account-specific key.
      component.ngOnDestroy();
      return;
    }
    expect(localStorage.getItem(key)).toBe('1');
    component.ngOnDestroy();
    first.destroy();

    const second = TestBed.createComponent(SocialFeedComponent);
    second.detectChanges();
    tick(351);
    expect(second.nativeElement.querySelector('.feed-v3-welcome')).not.toBeNull();
    expect(localStorage.getItem(key)).toBe('2');
    second.componentInstance.ngOnDestroy();
    second.destroy();

    const third = TestBed.createComponent(SocialFeedComponent);
    third.detectChanges();
    tick(351);
    expect(third.nativeElement.querySelector('.feed-v3-welcome')).toBeNull();
    expect(third.nativeElement.querySelector('.week-hub')).not.toBeNull();
    third.componentInstance.ngOnDestroy();
    third.destroy();
  }));

  it('uses the approved premium Concept One feed with genuine existing interactions', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.jynlo-feed-premium .jynlo-feed-hero')).not.toBeNull();
    expect(root.querySelector('.jynlo-premium-week .week-hub-grid')).not.toBeNull();
    expect(root.querySelectorAll('.jynlo-premium-week .week-hub-card').length).toBe(3);
    expect(root.querySelector('.jynlo-premium-feed-grid')).not.toBeNull();
    expect(root.querySelector('a[href="/menu/createEvent"]')).not.toBeNull();
    component.ngOnDestroy();
  }));

  it('keeps the Feed in two content columns without duplicate site navigation', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const shell = root.querySelector('.feed-v3-shell')!;
    expect(shell.querySelector('.feed-left-rail')).toBeNull();
    expect(shell.querySelector('.feed-rail-links')).toBeNull();
    expect(shell.querySelector('.feed-main .feed-v3-welcome h1')?.textContent).toContain(t('feed.v3.welcome'));
    expect(shell.querySelector('.feed-main .week-hub-grid')).not.toBeNull();
    expect(shell.querySelector('.feed-main .composer textarea')).not.toBeNull();
    expect(shell.querySelector('.feed-sidebar .feed-v3-community-panel')).toBeNull();
    expect(shell.querySelector('.feed-sidebar .feed-v3-join-card a[href="/menu/communities"]')).not.toBeNull();
    expect(shell.querySelectorAll('.feed-discovery-card').length).toBe(2);
    component.ngOnDestroy();
  }));

  it('keeps premium Feed buttons consistent without changing their real routes and actions', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.feed-rail-links')).toBeNull();
    expect(root.querySelectorAll('.composer-actions .jynlo-premium-btn').length).toBe(3);

    const primary = root.querySelector('.feed-hero-cta') as HTMLAnchorElement;
    expect(primary.classList.contains('jynlo-premium-btn--primary')).toBeTrue();
    expect(primary.getAttribute('href')).toBe('/menu/createEvent');

    const secondary = root.querySelector('.week-hub-create') as HTMLAnchorElement;
    expect(secondary.classList.contains('jynlo-premium-btn--quiet')).toBeTrue();
    expect(secondary.getAttribute('href')).toBe('/menu/my-sessions');

    const composer = root.querySelector('.composer')!;
    const pickers = Array.from(composer.querySelectorAll<HTMLLabelElement>('.image-picker'));
    expect(pickers.length).toBe(2);
    expect(pickers.every(label => label.classList.contains('jynlo-premium-btn--quiet'))).toBeTrue();
    expect(pickers.every(label => label.querySelector('input[type="file"]') !== null)).toBeTrue();
    expect(pickers.every(label => label.querySelector('svg.feed-ui-icon') !== null)).toBeTrue();

    const submit = composer.querySelector('button.jynlo-premium-btn--primary') as HTMLButtonElement;
    expect(submit.disabled).toBeTrue();
    expect(root.querySelector('.feed-v3-join-action[href="/menu/communities"]')).not.toBeNull();
    expect(root.querySelectorAll('.feed-v3-side-heading > a.feed-inline-link[href="/menu/perfis"]').length).toBe(1);
    expect(root.querySelectorAll('.feed-sidebar-link[href="/menu/events"]').length).toBe(1);
    expect(root.querySelectorAll('.feed-sidebar-link[href="/menu/perfis"]').length).toBe(0);
    component.ngOnDestroy();
  }));

  it('shows member communities instead of the discovery promotion when one exists', fakeAsync(() => {
    groups.mine.and.returnValue(of([
      { id: 11, name: 'Clube de Padel', visibility: 'PUBLIC', myRole: 'MEMBER', memberCount: 4, sport: 'Padel' }
    ] as any));
    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();
    const sidebar = (fixture.nativeElement as HTMLElement).querySelector('.feed-sidebar')!;
    expect(sidebar.querySelector('.feed-v3-community-panel')).not.toBeNull();
    expect(sidebar.querySelector('.feed-v3-community-row[href="/menu/communities/11"]')).not.toBeNull();
    expect(sidebar.querySelector('.feed-v3-join-card')).toBeNull();
    component.ngOnDestroy();
  }));

  it('keeps the feed controls real and separates the primary and weekly navigation actions', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    const root = fixture.nativeElement as HTMLElement;
    const header = root.querySelector('.jynlo-feed-hero') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.querySelector('h1')).not.toBeNull();
    expect(header.querySelector('.feed-hero-cta')?.getAttribute('href')).toBe('/menu/createEvent');
    expect(root.querySelector('.week-hub-heading .week-hub-create')?.getAttribute('href')).toBe('/menu/my-sessions');
    expect(root.querySelector('.composer textarea')).not.toBeNull();
    expect(root.querySelectorAll('.composer-actions .image-picker').length).toBe(2);
    expect(root.querySelector('.composer-actions button.jynlo-action--primary')).not.toBeNull();
    expect(root.querySelector('.feed-layout .feed-main')).not.toBeNull();
    expect(root.querySelector('.feed-layout .feed-sidebar')).not.toBeNull();
    component.ngOnDestroy();
  }));

  it('allows video selection, limits its size and keeps photo/video mutually exclusive', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    const url = spyOn(URL, 'createObjectURL').and.returnValue('blob:test-video');
    const revoke = spyOn(URL, 'revokeObjectURL');
    const video = new File(['video bytes'], 'clip.mp4', { type: 'video/mp4' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [video], configurable: true });
    component.onPostVideoChange({ target: input } as unknown as Event);
    fixture.detectChanges();
    expect(url).toHaveBeenCalledOnceWith(video);
    expect(component.postVideoFile).toBe(video);
    expect(component.postImageFile).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).querySelector('.composer-image-preview video')).not.toBeNull();
    component.removePostVideo();
    expect(revoke).toHaveBeenCalledWith('blob:test-video');
    expect(component.postVideoFile).toBeUndefined();
    component.ngOnDestroy();
  }));

  it('rejects oversized and unsupported video files', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    for (const video of [
      new File(['fake'], 'example.mov', { type: 'video/quicktime' }),
      new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.mp4', { type: 'video/mp4' })
    ]) {
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [video], configurable: true });
      component.onPostVideoChange({ target: input } as unknown as Event);
      expect(component.postVideoFile).toBeUndefined();
      expect(component.actionError).toBeTruthy();
    }
    component.ngOnDestroy();
  }));

  it('keeps one primary Create session action and a separate week shortcut', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.week-recruit')).toBeNull();
    expect(root.querySelectorAll('.feed-hero-cta')).toHaveSize(1);
    expect(root.querySelector('.feed-hero-cta')?.getAttribute('href')).toBe('/menu/createEvent');
    expect(root.querySelectorAll('.week-hub-create')).toHaveSize(1);
    expect(root.querySelector('.week-hub-create')?.getAttribute('href')).toBe('/menu/my-sessions');
  }));

  it('keeps narrow community suggestions separated, accessible and within their panel', fakeAsync(() => {
    const community = (id: number, name: string) => ({
      id, name, description: null, sport: 'Futebol', sports: ['Futebol'],
      photoUrl: null, visibility: 'PRIVATE' as const, rankingsEnabled: false,
      ownerUsername: 'ana', myRole: 'MEMBER' as const, memberCount: id,
      createdAt: '2026-10-01T09:00:00Z', members: []
    });
    groups.mine.and.returnValue(of([
      community(2, 'reis da cerveja'), community(3, 'Colégio Pio'),
      community(4, 'Uma comunidade com um nome muito longo para um cartão lateral')
    ]));

    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();

    const panel = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLElement>('.feed-v3-community-panel')!;
    const list = panel.querySelector<HTMLElement>('.feed-v3-communities')!;
    const links = Array.from(panel.querySelectorAll<HTMLAnchorElement>('.feed-v3-community-row'));
    expect(links.length).toBe(3);
    expect(getComputedStyle(list).display).toBe('grid');
    expect(parseFloat(getComputedStyle(list).rowGap)).toBeGreaterThanOrEqual(8);
    expect(panel.querySelectorAll('.feed-v3-side-heading a').length).toBe(1);
    expect(panel.querySelectorAll('.feed-v3-side-button').length).toBe(0);
    links.forEach((link, index) => {
      expect(link.getAttribute('href')).toBe('/menu/communities/' + (index + 2));
      expect(link.getAttribute('title')).toBeTruthy();
      expect(link.getAttribute('aria-label')).toBe(link.getAttribute('title'));
      expect(getComputedStyle(link).boxSizing).toBe('border-box');
      expect(getComputedStyle(link).display).toBe('grid');
      expect(getComputedStyle(link.querySelector('strong')!).textOverflow).toBe('ellipsis');
    });
    const positions = links.map(link => link.getBoundingClientRect());
    if (positions.every(position => position.height > 0)) {
      for (let index = 1; index < positions.length; index++) {
        expect(positions[index].top).toBeGreaterThanOrEqual(positions[index - 1].bottom + 7);
      }
    }
    component.ngOnDestroy();
  }));

  it('shows my sports week before the feed using real session and community links', fakeAsync(() => {
    const at = Date.now() + 86_400_000;
    const upcoming = (id: number, other: Partial<SessionSummary> = {}): SessionSummary => ({
      id, sport: 'Padel', city: 'Lisboa', gameDate: new Date(at).toISOString(),
      distanceKm: null, participantCount: 3, maxParticipants: 4,
      priceAmount: 0, privateGame: false, audience: 'PUBLIC', status: 'OPEN', ...other
    });
    sessions.mine.and.returnValue(of({
      created: [upcoming(4, { privateGame: true, audience: 'COMMUNITY_ONLY' })],
      joined: [upcoming(4)],
      waitlisted: [upcoming(5)]
    }));
    sessions.discover.and.returnValue(of([
      upcoming(4), upcoming(5), upcoming(6), upcoming(7, { privateGame: true }),
      upcoming(8, { audience: 'COMMUNITY_ONLY' }), upcoming(9, { participantCount: 4 })
    ]));
    groups.mine.and.returnValue(of([{
      id: 13, name: 'Amigos de desporto', description: null, sport: 'Futebol', sports: ['Futebol'],
      photoUrl: null, visibility: 'PRIVATE', rankingsEnabled: false,
      ownerUsername: 'ana', myRole: 'MEMBER', memberCount: 12,
      createdAt: '2026-10-01T09:00:00Z', members: []
    }]));

    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const hub = root.querySelector<HTMLElement>('.week-hub');
    expect(hub).not.toBeNull();
    expect(root.querySelector('.feed-main')?.contains(hub)).toBeTrue();
    expect(root.querySelector('.feed-layout')?.contains(hub)).toBeTrue();
    expect(root.querySelector('.feed-main')?.querySelector('.composer')).not.toBeNull();
    expect(hub?.querySelector('a[href="/menu/events/4"]')).not.toBeNull();
    expect(hub?.querySelector('a[href="/menu/events/5"]')).not.toBeNull();
    const openGame = hub?.querySelector<HTMLAnchorElement>('a[href^="/menu/events/6?"]');
    expect(openGame).not.toBeNull();
    expect(openGame?.getAttribute('href')).toContain('join=1');
    expect(hub?.querySelector('a[href="/menu/communities/13"]')).not.toBeNull();
    expect(hub?.querySelector('a[href="/menu/events/7"]')).toBeNull();
    expect(hub?.querySelector('a[href="/menu/events/8"]')).toBeNull();
    expect(hub?.querySelector('a[href="/menu/events/9"]')).toBeNull();
    expect(groups.mine).toHaveBeenCalledTimes(1);
  }));

  it('offers a share shortcut only on my upcoming public games with vacancies', fakeAsync(() => {
    const future = new Date(Date.now() + 36_000_000).toISOString();
    const game = (id: number, override: Partial<SessionSummary> = {}): SessionSummary => ({
      id, sport: 'Futebol', city: 'Lisboa', gameDate: future,
      distanceKm: null, participantCount: 7, maxParticipants: 10,
      priceAmount: 0, status: 'OPEN', privateGame: false, audience: 'PUBLIC', ...override
    });
    sessions.mine.and.returnValue(of({
      created: [
        game(10), game(11, { privateGame: true }), game(12, { audience: 'COMMUNITY_ONLY' }),
        game(13, { participantCount: 10 }), game(14, { status: 'CANCELLED' })
      ],
      joined: [game(15)], waitlisted: []
    }));
    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();

    const shortcuts = (fixture.nativeElement as HTMLElement)
      .querySelectorAll<HTMLAnchorElement>('.week-share-action');
    expect(shortcuts.length).toBe(1);
    expect(shortcuts[0].getAttribute('href')).toBe('/menu/events/10?promote=1');
    expect(shortcuts[0].textContent).toContain('3');
    expect(component.canPromoteWeekGame(game(15))).toBeFalse();
    expect(component.canPromoteWeekGame(game(10, { gameDate: '2020-01-01T10:00:00Z' }))).toBeFalse();
    expect(component.canPromoteWeekGame(game(11, { privateGame: true }))).toBeFalse();
    expect(component.canPromoteWeekGame(game(12, { audience: 'COMMUNITY_ONLY' }))).toBeFalse();
  }));

  it('shows independent empty states when there are no sessions or communities', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();
    const hub = (fixture.nativeElement as HTMLElement).querySelector('.week-hub');
    expect(hub?.textContent).toContain(t('week.noUpcoming'));
    expect(hub?.textContent).toContain(t('week.noOpenSlots'));
    expect(hub?.textContent).toContain(t('week.noCommunities'));
    expect(hub?.querySelector('a[href="/menu/discover"]')).not.toBeNull();
    expect(hub?.querySelector('a[href="/menu/my-sessions"]')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.feed-hero-cta[href="/menu/createEvent"]')).not.toBeNull();
  }));

  it('keeps normal publications simple, without manual session selection', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();
    const composer = (fixture.nativeElement as HTMLElement).querySelector('.composer')!;
    expect(composer.querySelector('.composer-session-toggle')).toBeNull();
    expect(composer.querySelector('.composer-session-select')).toBeNull();
    expect(composer.querySelector('select')).toBeNull();
    expect(composer.textContent).not.toContain(t('feed.linkPublicSession'));
    expect(composer.querySelector('input[accept="image/jpeg,image/png,image/webp"]')).not.toBeNull();
    expect(composer.querySelector('input[accept="video/mp4,video/webm"]')).not.toBeNull();

    component.postContent = 'Hoje foi dia de treino!';
    feed.createPost.and.returnValue(of({
      type: 'POST', postId: 17, authorUsername: 'jogador', authorDisplayName: 'Jogador',
      authorProfilePicUrl: null, content: 'Hoje foi dia de treino!', imageUrl: null,
      createdAt: new Date().toISOString(), sessionId: null, sport: null,
      city: null, gameDate: null, likeCount: 0, likedByMe: false, commentCount: 0
    }));
    component.publish();
    expect(feed.createPost).toHaveBeenCalledOnceWith('Hoje foi dia de treino!', undefined, undefined, undefined);
    expect(component.selectedSessionId).toBeNull();
  }));

  it('clears a contextual session link after a successful post', fakeAsync(() => {
    const posted: FeedItem = {
      type: 'POST', postId: 7, authorUsername: 'miguel',
      authorDisplayName: 'Miguel', authorProfilePicUrl: null,
      content: 'Bora jogar?', imageUrl: null,
      createdAt: new Date().toISOString(), sessionId: 42,
      sport: 'Padel', city: 'Lisboa', gameDate: new Date().toISOString(),
      likeCount: 0, likedByMe: false, commentCount: 0
    };
    feed.createPost.and.returnValue(of(posted));

    fixture.detectChanges();
    tick(351);
    component.postContent = 'Bora jogar?';
    component.selectedSessionId = 42;

    component.publish();
    fixture.detectChanges();

    expect(feed.createPost).toHaveBeenCalledOnceWith('Bora jogar?', undefined, 42, undefined);
    expect(component.postContent).toBe('');
    expect(component.selectedSessionId).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.composer-session-select')).toBeNull();
  }));

  it('keeps the discovery sidebar available when the feed contains posts', fakeAsync(() => {
    const post: FeedItem = {
      type: 'POST', postId: 1, authorUsername: 'jogador',
      authorDisplayName: 'Jogador', authorProfilePicUrl: null,
      content: 'Bora jogar?', imageUrl: null,
      createdAt: new Date().toISOString(), sessionId: null,
      sport: null, city: null, gameDate: null,
      likeCount: 0, likedByMe: false, commentCount: 0
    };
    feed.feed.and.returnValue(of([post]));
    sessions.discover.and.returnValue(of([{
      id: 24, sport: 'Padel', city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(),
      distanceKm: null, participantCount: 2, maxParticipants: 4,
      priceAmount: 0, privateGame: false, status: 'OPEN', audience: 'PUBLIC'
    }]));

    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.feed-layout .feed-main .composer')).not.toBeNull();
    expect(root.querySelector('.feed-main .feed-list .feed-card')).not.toBeNull();
    const aside = root.querySelector('.feed-layout > .feed-sidebar') as HTMLElement;
    expect(aside).not.toBeNull();
    expect(aside.querySelector('.feed-suggested-session')?.getAttribute('href'))
      .toBe('/menu/events/24');
    expect(aside.querySelector('a[href="/menu/perfis"]')).not.toBeNull();
  }));

  it('shows up to three genuine public profiles and excludes the current player', fakeAsync(() => {
    const candidate = (username: string) => ({
      username, nickname: null, fullName: username, country: 'Portugal',
      location: 'Lisboa', favoriteSports: 'Padel', bio: null,
      skillLevel: null, availability: null, age: null,
      profilePicUrl: null, joinDateDisplay: null
    });
    community.discoverProfiles.and.returnValue(of([
      candidate('miguel'), candidate('jynloteste01'), candidate('JYNLOTESTE02'),
      candidate('ana'), candidate('bruno'), candidate('carla'), candidate('diogo')
    ]));

    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();

    expect(community.discoverProfiles).toHaveBeenCalledTimes(1);
    // QA accounts must never take slots from real player suggestions, even if
    // the discovery API still returns them during a rolling deployment.
    expect(component.suggestedPeople.map(person => person.username))
      .toEqual(['ana', 'bruno', 'carla']);
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        '.feed-sidebar .feed-suggested-person'
      )
    );
    expect(links.map(link => link.getAttribute('href')))
      .toEqual([
        '/menu/perfis/ana?from=feed',
        '/menu/perfis/bruno?from=feed',
        '/menu/perfis/carla?from=feed'
      ]);
    expect(links[0].textContent).toContain('Padel');
  }));

  it('keeps the people search available if profile discovery fails', fakeAsync(() => {
    community.discoverProfiles.and.returnValue(
      throwError(() => new Error('Profiles unavailable'))
    );
    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();

    const aside = fixture.nativeElement.querySelector('.feed-sidebar') as HTMLElement;
    expect(component.suggestedPeople).toEqual([]);
    expect(aside.querySelector('.feed-suggested-person')).toBeNull();
    expect(aside.querySelector('.feed-v3-side-heading a[href="/menu/perfis"]')).not.toBeNull();
    expect(aside.querySelectorAll('a[href="/menu/perfis"]').length).toBe(1);
  }));

  it('keeps discovery links visible when no sessions are suggested', fakeAsync(() => {
    fixture.detectChanges();
    tick(351);
    fixture.detectChanges();

    const aside = fixture.nativeElement.querySelector('.feed-sidebar') as HTMLElement;
    expect(aside).not.toBeNull();
    expect(aside.querySelector('.feed-suggested-session')).toBeNull();
    expect(aside.querySelector('a[href="/menu/events"]')).not.toBeNull();
    expect(aside.querySelector('a[href="/menu/perfis"]')).not.toBeNull();
  }));
});

describe('SocialFeedComponent session sharing fallback', () => {
  let component: SocialFeedComponent;
  let item: FeedItem;

  beforeEach(() => {
    const auth = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService', ['isLoggedIn']
    );
    auth.isLoggedIn.and.returnValue(true);
    component = new SocialFeedComponent(
      {} as SocialFeedService, {} as SessionService, auth,
      { snapshot: { queryParamMap: convertToParamMap({}) } } as unknown as ActivatedRoute,
      {} as CommunityService
    );
    item = {
      type: 'POST',
      postId: 1,
      authorUsername: 'player',
      authorDisplayName: 'Player',
      authorProfilePicUrl: null,
      content: 'Bora jogar?',
      imageUrl: null,
      createdAt: '2026-10-12T12:00:00Z',
      sessionId: 42,
      sport: 'Padel',
      city: 'Lisboa',
      gameDate: '2026-10-14T18:00:00Z',
      likeCount: 0,
      likedByMe: false,
      commentCount: 0
    };
  });

  function makeNativeSharingUnavailable(): void {
    if (typeof navigator.share === 'function') {
      spyOn(navigator, 'share').and.returnValue(Promise.reject(new Error('Native sharing unavailable')));
    }
  }

  it('shows a manual public link when native sharing and clipboard both fail', async () => {
    makeNativeSharingUnavailable();
    spyOn<any>(component, 'copyShareUrl').and.returnValue(Promise.reject(new Error('Clipboard denied')));

    await component.shareSession(item);

    expect(component.manualShareItem).toBe(item);
    expect(component.manualShareUrl).toBe(new URL('/sessions/42', window.location.origin).href);
    expect(component.shareFeedbackMessage).toBe(t('publicSession.selectLink'));
    expect(component.sharingSessionId).toBeNull();
  });

  it('does not show a manual link after successfully copying the public URL', async () => {
    makeNativeSharingUnavailable();
    const copy = spyOn<any>(component, 'copyShareUrl').and.returnValue(Promise.resolve());

    await component.shareSession(item);

    expect(copy).toHaveBeenCalledWith(new URL('/sessions/42', window.location.origin).href);
    expect(component.shareFeedbackMessage).toBe(t('publicSession.linkCopied'));
    expect(component.manualShareItem).toBeNull();
    expect(component.manualShareUrl).toBe('');
  });

  it('localizes clipboard sharing feedback in English', async () => {
    const previousLanguage = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'en');
      await preloadEnglishTranslations();
      makeNativeSharingUnavailable();
      spyOn<any>(component, 'copyShareUrl').and.returnValue(Promise.resolve());

      await component.shareSession(item);

      expect(component.shareFeedbackMessage).toBe('Link copied');
    } finally {
      if (previousLanguage === null) {
        localStorage.removeItem('d24-language');
      } else {
        localStorage.setItem('d24-language', previousLanguage);
      }
    }
  });

  it('clears an earlier manual link when sharing another session', async () => {
    makeNativeSharingUnavailable();
    const copy = spyOn<any>(component, 'copyShareUrl')
      .and.returnValue(Promise.reject(new Error('Clipboard denied')));
    await component.shareSession(item);

    const nextItem = { ...item, postId: 2, sessionId: 43 };
    copy.and.returnValue(Promise.resolve());
    await component.shareSession(nextItem);

    expect(component.manualShareItem).toBeNull();
    expect(component.manualShareUrl).toBe('');
    expect(component.shareFeedbackSessionId).toBe(43);
  });

  it('does not share posts without a linked session', async () => {
    const copy = spyOn<any>(component, 'copyShareUrl');
    await component.shareSession({ ...item, sessionId: null });

    expect(copy).not.toHaveBeenCalled();
    expect(component.manualShareUrl).toBe('');
  });
});

describe('SocialFeedComponent new session promotion', () => {
  function openNewSession(overrides: Partial<SessionDetail> = {}, rawId = '42') {
    const auth = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['isLoggedIn']);
    auth.isLoggedIn.and.returnValue(true);
    Object.defineProperty(auth, 'loggedInPerfilname', { value: 'organizer', configurable: true });
    const feed = jasmine.createSpyObj<SocialFeedService>('SocialFeedService', ['feed', 'createPost']);
    feed.feed.and.returnValue(of([]));
    const sessions = jasmine.createSpyObj<SessionService>('SessionService', ['discover', 'detail', 'mine']);
    sessions.discover.and.returnValue(of([]));
    sessions.mine.and.returnValue(of({ created: [], joined: [], waitlisted: [] }));
    sessions.detail.and.returnValue(of({
      id: 42, sport: 'Padel', city: 'Lisboa',
      gameDate: '2099-10-01T18:00:00Z', status: 'OPEN',
      distanceKm: null, participantCount: 2, maxParticipants: 4, priceAmount: 0,
      privateGame: false, canSharePublicly: true, joined: true,
      waitlisted: false, waitlistPosition: null, creatorUsername: 'organizer',
      address: null, canSeeExactAddress: true, gamePhoto: null, ...overrides
    } as SessionDetail));
    const route = { snapshot: { queryParamMap: convertToParamMap({ shareSession: rawId }) } } as unknown as ActivatedRoute;
    const target = new SocialFeedComponent(
      feed, sessions, auth, route,
      { discoverProfiles: () => of([]), publicProfile: () => of(null), friends: () => of([]) } as unknown as CommunityService
    );
    target.ngOnInit();
    return { target, sessions, feed };
  }

  it('preselects a public game but never publishes automatically', () => {
    const { target, sessions, feed } = openNewSession();
    expect(sessions.detail).toHaveBeenCalledWith(42);
    expect(target.newSessionForFeed?.id).toBe(42);
    expect(target.postContent).toContain('Padel');
    expect(target.selectedSessionId).toBe(42);
    expect(feed.createPost).not.toHaveBeenCalled();
    target.detachNewSession();
    expect(target.selectedSessionId).toBeNull();
    target.ngOnDestroy();
  });

  it('rejects private, non-owned, or invalid deep links', () => {
    for (const scenario of [
      { privateGame: true, canSharePublicly: false },
      { audience: 'COMMUNITY_ONLY' as const, canSharePublicly: false },
      { creatorUsername: 'stranger' }, { canSharePublicly: false }
    ]) {
      const { target } = openNewSession(scenario);
      expect(target.selectedSessionId).toBeNull();
      target.ngOnDestroy();
    }
    const { target, sessions } = openNewSession({}, '../5');
    expect(sessions.detail).not.toHaveBeenCalled();
    target.ngOnDestroy();
  });
});

describe('SocialFeedComponent post-game entry', () => {
  function openFromSession(overrides: Partial<SessionDetail> = {}, rawId = '42') {
    const auth = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['isLoggedIn']);
    auth.isLoggedIn.and.returnValue(true);
    Object.defineProperty(auth, 'loggedInPerfilname', { value: 'participant', configurable: true });

    const feed = jasmine.createSpyObj<SocialFeedService>('SocialFeedService', ['feed']);
    feed.feed.and.returnValue(of([]));
    const sessions = jasmine.createSpyObj<SessionService>('SessionService', ['discover', 'detail', 'mine']);
    sessions.discover.and.returnValue(of([]));
    sessions.mine.and.returnValue(of({ created: [], joined: [], waitlisted: [] }));
    sessions.detail.and.returnValue(of({
      id: 42, sport: 'Padel', city: 'Lisboa',
      gameDate: '2026-10-01T18:00:00Z', status: 'COMPLETED',
      distanceKm: null, participantCount: 4, maxParticipants: 4, priceAmount: 0,
      privateGame: false, canSharePublicly: true, joined: true,
      waitlisted: false, waitlistPosition: null, creatorUsername: 'organizer',
      address: null, canSeeExactAddress: false, gamePhoto: null,
      ...overrides
    } as SessionDetail));
    const route = ({
      snapshot: { queryParamMap: convertToParamMap({ momentSession: rawId }) }
    } as unknown as ActivatedRoute);
    const target = new SocialFeedComponent(
      feed, sessions, auth, route,
      { discoverProfiles: () => of([]), publicProfile: () => of(null),
        friends: () => of([]) } as unknown as CommunityService
    );
    target.ngOnInit();
    return { target, sessions };
  }

  it('prefills a completed public session without publishing a post', () => {
    const { target, sessions } = openFromSession();
    expect(sessions.detail).toHaveBeenCalledWith(42);
    expect(target.selectedSessionId).toBe(42);
    expect(target.postGameSessionId).toBe(42);
    expect(target.availableSessions.map(session => session.id)).toEqual([42]);
    expect(target.postContent).toBe('');
    target.ngOnDestroy();
  });

  it('shows only the verified session in the post-game draft summary', () => {
    const { target } = openFromSession();
    expect(target.postGameSession).toEqual(jasmine.objectContaining({
      id: 42, sport: 'Padel', city: 'Lisboa', status: 'COMPLETED'
    }));
    target.selectedSessionId = 43;
    expect(target.postGameSession).toBeNull();
    target.ngOnDestroy();
  });

  it('detaches the completed session while preserving the draft and photo', () => {
    const { target } = openFromSession();
    target.postContent = 'O melhor momento foi o último ponto!';
    target.postImagePreview = 'blob:my-photo';
    target.postImageFile = new File(['photo'], 'jogo.jpg', { type: 'image/jpeg' });
    const photo = target.postImageFile;

    target.detachPostGameSession();

    expect(target.selectedSessionId).toBeNull();
    expect(target.postGameSessionId).toBeNull();
    expect(target.postGameSession).toBeNull();
    expect(target.postContent).toBe('O melhor momento foi o último ponto!');
    expect(target.postImagePreview).toBe('blob:my-photo');
    expect(target.postImageFile).toBe(photo);
    target.ngOnDestroy();
  });

  it('does not detach the session during publication or if another is selected', () => {
    const { target } = openFromSession();
    target.posting = true;
    target.detachPostGameSession();
    expect(target.selectedSessionId).toBe(42);
    expect(target.postGameSessionId).toBe(42);

    target.posting = false;
    target.selectedSessionId = 99;
    target.detachPostGameSession();
    expect(target.selectedSessionId).toBe(99);
    expect(target.postGameSessionId).toBe(42);
    target.ngOnDestroy();
  });

  it('starts an editable post-game draft from a suggestion without posting', () => {
    const previousLanguage = localStorage.getItem('d24-language');
    localStorage.setItem('d24-language', 'pt');
    const { target } = openFromSession();
    try {
      target.applyPostGamePrompt('feed.postGamePrompt.bestMoment');
      expect(target.postContent).toBe('O melhor momento foi…');

      target.postContent = 'Que grande partida!';
      target.applyPostGamePrompt('feed.postGamePrompt.nextGame');
      expect(target.postContent).toBe('Que grande partida!\nQuem alinha na próxima? 🏃');

      target.applyPostGamePrompt('feed.postGamePrompt.nextGame');
      expect(target.postContent).toBe('Que grande partida!\nQuem alinha na próxima? 🏃');
    } finally {
      target.ngOnDestroy();
      if (previousLanguage === null) {
        localStorage.removeItem('d24-language');
      } else {
        localStorage.setItem('d24-language', previousLanguage);
      }
    }
  });

  it('uses an English prompt when the user has selected English', async () => {
    const previousLanguage = localStorage.getItem('d24-language');
    localStorage.setItem('d24-language', 'en');
    await preloadEnglishTranslations();
    const { target } = openFromSession();
    try {
      target.applyPostGamePrompt('feed.postGamePrompt.team');
      expect(target.postContent).toBe('Great game, everyone! 👏');
    } finally {
      target.ngOnDestroy();
      if (previousLanguage === null) {
        localStorage.removeItem('d24-language');
      } else {
        localStorage.setItem('d24-language', previousLanguage);
      }
    }
  });

  it('never replaces a draft or inserts prompts outside the active post-game flow', () => {
    const { target } = openFromSession();
    const prompt = 'feed.postGamePrompt.bestMoment';
    target.postContent = 'x'.repeat(999);
    target.applyPostGamePrompt(prompt);
    expect(target.postContent).toBe('x'.repeat(999));

    target.postContent = 'Meu texto';
    target.selectedSessionId = null;
    target.applyPostGamePrompt(prompt);
    expect(target.postContent).toBe('Meu texto');

    target.selectedSessionId = target.postGameSessionId;
    target.posting = true;
    target.applyPostGamePrompt(prompt);
    expect(target.postContent).toBe('Meu texto');

    target.posting = false;
    target.applyPostGamePrompt('feed.postGamePrompt.unknown');
    expect(target.postContent).toBe('Meu texto');
    target.ngOnDestroy();
  });

  it('does not preselect a private or unrelated completed session', () => {
    for (const overrides of [
      { canSharePublicly: false },
      { privateGame: true },
      { joined: false },
      { status: 'CANCELLED' },
      { id: 99 }
    ]) {
      const { target } = openFromSession(overrides);
      expect(target.selectedSessionId).withContext(JSON.stringify(overrides)).toBeNull();
      expect(target.postGameSessionId).toBeNull();
      target.ngOnDestroy();
    }
  });

  it('ignores invalid or noncanonical session IDs without calling the details API', () => {
    for (const raw of ['0', '00042', '42.0', '-1', '1e2', '9007199254740992']) {
      const { target, sessions } = openFromSession({}, raw);
      expect(sessions.detail).withContext(raw).not.toHaveBeenCalled();
      expect(target.postGameSessionId).toBeNull();
      target.ngOnDestroy();
    }
  });
});

describe('SocialFeedComponent empty-feed session suggestions', () => {
  it('suggests only joinable public games, excluding ones already joined or waitlisted', fakeAsync(() => {
    const auth = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['isLoggedIn']);
    auth.isLoggedIn.and.returnValue(true);
    const feed = jasmine.createSpyObj<SocialFeedService>('SocialFeedService', ['feed']);
    feed.feed.and.returnValue(of([]));
    const sessions = jasmine.createSpyObj<SessionService>('SessionService', ['discover', 'mine', 'detail']);
    const candidate = (id: number, status = 'OPEN', privateGame = false, count = 2,
      audience: 'PUBLIC' | 'COMMUNITY_ONLY' = 'PUBLIC') => ({
      id, status, privateGame, audience, sport: 'Futebol', city: 'Lisboa',
      gameDate: new Date(Date.now() + 86_400_000).toISOString(), distanceKm: null,
      participantCount: count, maxParticipants: 10, priceAmount: 0
    });
    sessions.discover.and.returnValue(of([
      candidate(1), candidate(2, 'CANCELLED'), candidate(3, 'OPEN', true),
      candidate(4, 'OPEN', false, 10), candidate(5, 'OPEN', false, 2, 'COMMUNITY_ONLY'),
      { ...candidate(11), joinedByViewer: true },
      { ...candidate(12), waitlistedByViewer: true },
      candidate(6), candidate(7), candidate(8),
      { ...candidate(9), gameDate: new Date(Date.now() - 86_400_000).toISOString() },
      { ...candidate(10), gameDate: 'invalid-date' },
      { ...candidate(13), gameDate: new Date(Date.now() + 3_600_000).toISOString() },
      { ...candidate(14), gameDate: new Date(Date.now() + 3 * 86_400_000).toISOString() }
    ]));
    sessions.mine.and.returnValue(of({ created: [], joined: [], waitlisted: [] }));
    const route = { snapshot: { queryParamMap: convertToParamMap({}) } } as unknown as ActivatedRoute;
    const target = new SocialFeedComponent(
      feed, sessions, auth, route,
      { discoverProfiles: () => of([]) } as unknown as CommunityService
    );

    target.ngOnInit();
    tick(351);

    expect(target.suggestedSessions.map(session => session.id)).toEqual([13, 1, 6]);
    expect(sessions.discover).toHaveBeenCalledTimes(1);
    expect(target.items).toEqual([]);
    target.ngOnDestroy();
  }));
});

describe('SocialFeedComponent session association restrictions', () => {
  it('never auto-attaches owned history or discoveries to a normal post', () => {
    const auth = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['isLoggedIn']);
    auth.isLoggedIn.and.returnValue(true);
    const feed = jasmine.createSpyObj<SocialFeedService>('SocialFeedService', ['feed']);
    feed.feed.and.returnValue(of([]));
    const sessions = jasmine.createSpyObj<SessionService>('SessionService', ['discover', 'detail', 'mine']);
    const historical: SessionSummary = {
      id: 2, sport: 'Futebol', city: 'Parede', gameDate: '2026-10-12T21:00:00Z',
      distanceKm: null, participantCount: 8, maxParticipants: 10, priceAmount: 0,
      privateGame: false, audience: 'PUBLIC', status: 'COMPLETED'
    };
    sessions.mine.and.returnValue(of({ created: [historical], joined: [], waitlisted: [] }));
    sessions.discover.and.returnValue(of([historical]));
    const route = { snapshot: { queryParamMap: convertToParamMap({}) } } as unknown as ActivatedRoute;
    const component = new SocialFeedComponent(
      feed, sessions, auth, route,
      { discoverProfiles: () => of([]) } as unknown as CommunityService
    );
    component.ngOnInit();
    expect(sessions.mine).toHaveBeenCalledTimes(1);
    expect(sessions.detail).not.toHaveBeenCalled();
    expect(component.selectedSessionId).toBeNull();
    expect(component.availableSessions).toEqual([]);
    expect(component.postGameSession).toBeNull();
    component.ngOnDestroy();
  });
});

describe('SocialFeedComponent attendance activity visibility', () => {
  let component: SocialFeedComponent;
  let feed: jasmine.SpyObj<SocialFeedService>;
  let activity: FeedItem;

  beforeEach(() => {
    const auth = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService', ['isLoggedIn']
    );
    auth.isLoggedIn.and.returnValue(true);
    Object.defineProperty(auth, 'loggedInPerfilname', { value: 'player', configurable: true });

    feed = jasmine.createSpyObj<SocialFeedService>(
      'SocialFeedService', ['hideAttendanceActivity', 'ensureAttendancePost', 'likePost', 'comments', 'setLikersHidden', 'likers']
    );
    feed.hideAttendanceActivity.and.returnValue(of(void 0));
    component = new SocialFeedComponent(
      feed, {} as SessionService, auth,
      { snapshot: { queryParamMap: convertToParamMap({}) } } as unknown as ActivatedRoute,
      {} as CommunityService
    );
    activity = {
      type: 'SESSION_ATTENDED', postId: null,
      authorUsername: 'player', authorDisplayName: 'Player',
      authorProfilePicUrl: null, content: null, imageUrl: null,
      createdAt: '2026-10-13T12:00:00Z', sessionId: 42,
      sport: 'Padel', city: 'Lisboa', gameDate: '2026-10-12T18:00:00Z',
      likeCount: 0, likedByMe: false, commentCount: 0
    };
  });

  it('creates a stable interaction post on first like and updates its count', () => {
    feed.ensureAttendancePost.and.returnValue(of(91));
    feed.likePost.and.returnValue(of({ likedByMe: true, likeCount: 1 }));

    component.toggleLike(activity);

    expect(feed.ensureAttendancePost).toHaveBeenCalledOnceWith(42, 'player');
    expect(feed.likePost).toHaveBeenCalledOnceWith(91);
    expect(activity.postId).toBe(91);
    expect(activity.likedByMe).toBeTrue();
    expect(activity.likeCount).toBe(1);
  });

  it('loads existing comments after resolving the attendance interaction post', () => {
    feed.ensureAttendancePost.and.returnValue(of(91));
    feed.comments.and.returnValue(of([]));

    component.toggleComments(activity);

    expect(feed.ensureAttendancePost).toHaveBeenCalledOnceWith(42, 'player');
    expect(feed.comments).toHaveBeenCalledOnceWith(91);
    expect(component.openCommentPosts.has(91)).toBeTrue();
  });

  it('keeps the activity unchanged when creating its interaction post fails', () => {
    feed.ensureAttendancePost.and.returnValue(throwError(() => new Error('offline')));

    component.toggleLike(activity);

    expect(activity.postId).toBeNull();
    expect(activity.likeCount).toBe(0);
    expect(feed.likePost).not.toHaveBeenCalled();
  });

  it('shows a natural liked-by sentence and honours hidden identities', () => {
    const post = { ...activity, postId: 91, likeCount: 3, authorUsername: 'friend' };
    component.likerPreview[91] = 'Ana';
    expect(component.likedByText(post)).toBe('Gostado por Ana e outras pessoas');
    post.hideLikers = true;
    expect(component.likedByText(post)).toBe('3 gostos');
    component.showLikers(post);
    expect(feed.likers).not.toHaveBeenCalled();
  });

  it('allows the author to hide and restore the liker list', () => {
    const post = { ...activity, postId: 91, likeCount: 2, hideLikers: false };
    feed.setLikersHidden.and.returnValues(of(true), of(false));
    component.toggleLikersPrivacy(post);
    expect(feed.setLikersHidden).toHaveBeenCalledWith(91, true);
    expect(post.hideLikers).toBeTrue();
    component.toggleLikersPrivacy(post);
    expect(feed.setLikersHidden).toHaveBeenCalledWith(91, false);
    expect(post.hideLikers).toBeFalse();
  });

  it('hides only the current player attendance activity after a successful request', () => {
    const otherAuthor = { ...activity, authorUsername: 'friend' };
    const anotherSession = { ...activity, sessionId: 43 };
    const post: FeedItem = { ...activity, type: 'POST', postId: 7 };
    component.items = [activity, otherAuthor, anotherSession, post];

    component.hideAttendanceActivity(activity);

    expect(feed.hideAttendanceActivity).toHaveBeenCalledOnceWith(42);
    expect(component.items).toEqual([otherAuthor, anotherSession, post]);
    expect(component.hidingAttendanceSessionId).toBeNull();
  });

  it('rejects hiding another player activity or non-attendance feed items', () => {
    component.hideAttendanceActivity({ ...activity, authorUsername: 'friend' });
    component.hideAttendanceActivity({ ...activity, type: 'SESSION_CREATED' });
    component.hideAttendanceActivity({ ...activity, sessionId: null });

    expect(feed.hideAttendanceActivity).not.toHaveBeenCalled();
  });

  it('keeps the activity visible and shows an error when hiding fails', () => {
    feed.hideAttendanceActivity.and.returnValue(
      throwError(() => new Error('offline'))
    );
    component.items = [activity];

    component.hideAttendanceActivity(activity);

    expect(component.items).toEqual([activity]);
    expect(component.actionError).toBe(t('feedback.feed.hideAttendanceError'));
    expect(component.hidingAttendanceSessionId).toBeNull();
  });
});
