import { ComponentFixture, TestBed } from '@angular/core/testing';
import { defer, of, throwError } from 'rxjs';

import { PerfilDataComponent } from './perfil-data.component';
import { MyProfileService } from '../../services/my-profile.service';
import { ReliabilityService } from '../../services/reliability.service';
import { SocialGraphService } from '../../services/social-graph.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('PerfilDataComponent', () => {
  let component: PerfilDataComponent;
  let fixture: ComponentFixture<PerfilDataComponent>;
  let profileService: jasmine.SpyObj<MyProfileService>;
  let reliabilityService: jasmine.SpyObj<ReliabilityService>;
  let socialGraphService: jasmine.SpyObj<SocialGraphService>;

  beforeEach(async () => {
    profileService = jasmine.createSpyObj<MyProfileService>('MyProfileService', ['get']);
    socialGraphService = jasmine.createSpyObj<SocialGraphService>('SocialGraphService', ['status', 'followers', 'following']);
    socialGraphService.status.and.returnValue(of({ followedByMe: false, followsMe: false, followers: 2, following: 3 }));
    socialGraphService.followers.and.returnValue(of([{ username: 'ana', fullName: 'Ana', nickname: null, profilePicUrl: null }]));
    socialGraphService.following.and.returnValue(of([]));
    reliabilityService = jasmine.createSpyObj<ReliabilityService>('ReliabilityService', ['summary', 'activity']);

    profileService.get.and.returnValue(of({
      userId: 'u1',
      username: 'miguel',
      fullName: 'Miguel Ferreira',
      nickname: null,
      bio: null,
      skillLevel: null,
      availability: null,
      dateOfBirth: null,
      address: null,
      country: 'Portugal',
      location: 'Lisboa',
      postalCode: null,
      indicativePhone: '351',
      phone: '912345678',
      gender: null,
      email: 'miguel@example.com',
      favoriteSports: 'Padel, Futebol, Futsal, Corrida, Ténis, Natação',
      mfa: true,
      profilePicUrl: null,
      joinDateDisplay: null,
      lastLoginDateDisplay: null
    }));

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
    reliabilityService.activity.and.returnValue(of({
      activitiesCompleted: 0,
      peoplePlayedWith: 0,
      sportsPractised: 0,
      eventsCreated: 0,
      participantsMobilized: 0,
      communitiesJoined: 0,
      achievements: []
    }));

    await TestBed.configureTestingModule({
      declarations: [PerfilDataComponent],
      imports: TEST_IMPORTS,
      providers: [
        ...TEST_PROVIDERS,
        { provide: MyProfileService, useValue: profileService },
        { provide: ReliabilityService, useValue: reliabilityService },
        { provide: SocialGraphService, useValue: socialGraphService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PerfilDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('preserves profile actions while the brand stays only in the navbar', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.page-header .eyebrow')).toBeNull();
    expect(root.querySelector('.page-header h1')).not.toBeNull();
    expect(root.querySelector('.profile-card .identity')).not.toBeNull();
    expect(root.querySelector('a[href="/menu/alterardados"]')).not.toBeNull();
  });

  it('should create and load the authenticated profile', () => {
    expect(component).toBeTruthy();
    expect(profileService.get).toHaveBeenCalled();
    expect(component.profile?.username).toBe('miguel');
  });

  it('opens the own followers list with real linked profiles', () => {
    const button = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.my-follow-summary button');
    expect(button).not.toBeNull();
    button?.click();
    fixture.detectChanges();
    expect(socialGraphService.followers).toHaveBeenCalledOnceWith('miguel');
    expect((fixture.nativeElement as HTMLElement).querySelector('.social-list-people')?.textContent).toContain('Ana');
    expect((fixture.nativeElement as HTMLElement).querySelector('.social-list-people a')?.getAttribute('href')).toBe('/menu/perfis/ana');
  });

  it('should collapse favorite sports after five', () => {
    expect(component.favoriteSports.length).toBe(6);
    expect(component.visibleFavoriteSports.length).toBe(5);
    expect(component.hiddenFavoriteSportsCount).toBe(1);

    component.toggleFavoriteSports();

    expect(component.visibleFavoriteSports.length).toBe(6);
  });

  it('should expose profile completion', () => {
    expect(component.profileCompletion.percentage).toBeGreaterThan(0);
    expect(component.profileCompletion.missing.length).toBeGreaterThan(0);
  });

  it('should load reliability after the profile', () => {
    expect(reliabilityService.summary).toHaveBeenCalledWith('miguel');
    expect(component.reliability?.attendanceRate).toBe(90);
  });

  it('should expose a recoverable error when profile loading keeps failing', () => {
    profileService.get.calls.reset();
    let subscriptions = 0;
    profileService.get.and.returnValue(defer(() => {
      subscriptions++;
      return throwError(() => new Error('service unavailable'));
    }));

    component.load();

    expect(profileService.get).toHaveBeenCalledTimes(1);
    expect(subscriptions).toBe(2);
    expect(component.loading).toBeFalse();
    expect(component.errorMessage).toBeTruthy();
  });

  it('should recover profile loading after one automatic retry', () => {
    const profile = component.profile!;
    profileService.get.calls.reset();
    let subscriptions = 0;
    profileService.get.and.returnValue(defer(() => {
      subscriptions++;
      return subscriptions === 1
        ? throwError(() => new Error('temporary failure'))
        : of(profile);
    }));

    component.load();

    expect(profileService.get).toHaveBeenCalledTimes(1);
    expect(subscriptions).toBe(2);
    expect(component.errorMessage).toBe('');
    expect(component.profile?.username).toBe('miguel');
  });

});
