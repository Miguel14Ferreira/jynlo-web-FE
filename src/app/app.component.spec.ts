import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { rememberRegistrationDestination, takeRegistrationDestination } from './shared/registration-return-url';
import { AppComponent } from './app.component';
import { AuthenticationService } from './services/authethication.service';
import { PilotAnalyticsService } from './services/pilot-analytics.service';
import { OnlinePresenceService } from './services/online-presence.service';

describe('AppComponent', () => {
  let authenticationService: jasmine.SpyObj<AuthenticationService>;
  let pilotAnalyticsService: jasmine.SpyObj<PilotAnalyticsService>;
  let onlinePresenceService: jasmine.SpyObj<OnlinePresenceService>;
  let initialLocation: string;

  beforeEach(async () => {
    initialLocation = window.location.pathname + window.location.search + window.location.hash;
    localStorage.removeItem('jynlo-registration-destination');
    authenticationService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      ['confirmRegistration']
    );
    authenticationService.confirmRegistration.and.returnValue(of({ message: 'Conta confirmada' } as any));
    pilotAnalyticsService = jasmine.createSpyObj<PilotAnalyticsService>(
      'PilotAnalyticsService',
      ['recordFirstAccess']
    );

    onlinePresenceService = jasmine.createSpyObj<OnlinePresenceService>(
      'OnlinePresenceService', ['start', 'stop']
    );
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      declarations: [AppComponent],
      providers: [
        { provide: AuthenticationService, useValue: authenticationService },
        { provide: PilotAnalyticsService, useValue: pilotAnalyticsService },
        { provide: OnlinePresenceService, useValue: onlinePresenceService }
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem('jynlo-registration-destination');
    sessionStorage.removeItem('auth-success-message');
    sessionStorage.removeItem('auth-error-message');
    window.history.replaceState({}, '', initialLocation);
  });

  it('should return to a shared session after email confirmation on another device', () => {
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token&returnSessionId=42');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    TestBed.createComponent(AppComponent).detectChanges();

    expect(authenticationService.confirmRegistration).toHaveBeenCalledWith('fixture-token');
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/menu/events/42' } });
  });

  it('should prioritize the session from the confirmation email over the current browser', () => {
    rememberRegistrationDestination('/menu/events/7');
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token&returnSessionId=42');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    TestBed.createComponent(AppComponent).detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/menu/events/42' } });
    expect(takeRegistrationDestination()).toBeNull();
  });

  it('should ignore malformed session IDs in confirmation links', () => {
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token&returnSessionId=bad-id');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    TestBed.createComponent(AppComponent).detectChanges();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('preserves the session on the login page when email confirmation fails', () => {
    authenticationService.confirmRegistration.and.returnValue(
      throwError(() => ({ error: { message: 'Confirmação expirada' } }))
    );
    window.history.pushState({}, '', '/?confirmRegistration=expired-token&returnSessionId=42');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    TestBed.createComponent(AppComponent).detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'], { queryParams: { returnUrl: '/menu/events/42' } }
    );
    expect(sessionStorage.getItem('auth-error-message')).toBe('Confirmação expirada');
  });

  it('keeps the remembered session if email confirmation fails without a session parameter', () => {
    authenticationService.confirmRegistration.and.returnValue(
      throwError(() => new Error('Temporary failure'))
    );
    rememberRegistrationDestination('/menu/events/7');
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    TestBed.createComponent(AppComponent).detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'], { queryParams: { returnUrl: '/menu/events/7' } }
    );
    expect(takeRegistrationDestination()).toBeNull();
  });

  it('does not forward malformed session IDs after failed confirmation', () => {
    authenticationService.confirmRegistration.and.returnValue(
      throwError(() => new Error('Confirmation unavailable'))
    );
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token&returnSessionId=../login');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    TestBed.createComponent(AppComponent).detectChanges();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('should return to a shared session after email confirmation in the same browser', () => {
    rememberRegistrationDestination('/menu/events/42');
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    TestBed.createComponent(AppComponent).detectChanges();

    expect(authenticationService.confirmRegistration).toHaveBeenCalledWith('fixture-token');
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/menu/events/42' } });
    expect(takeRegistrationDestination()).toBeNull();
  });

  it('restores a WhatsApp community invitation after email confirmation in the same browser', () => {
    rememberRegistrationDestination('/menu/communities/42');
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    TestBed.createComponent(AppComponent).detectChanges();

    expect(authenticationService.confirmRegistration).toHaveBeenCalledWith('fixture-token');
    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'], { queryParams: { returnUrl: '/menu/communities/42' } }
    );
    expect(takeRegistrationDestination()).toBeNull();
  });

  it('returns to an emailed community invitation after confirmation on a different device', () => {
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token&returnCommunityId=42');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    TestBed.createComponent(AppComponent).detectChanges();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'], { queryParams: { returnUrl: '/menu/communities/42' } }
    );
  });

  it('uses the emailed invitation instead of stale local storage', () => {
    rememberRegistrationDestination('/menu/events/7');
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token&returnCommunityId=42');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    TestBed.createComponent(AppComponent).detectChanges();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'], { queryParams: { returnUrl: '/menu/communities/42' } }
    );
    expect(takeRegistrationDestination()).toBeNull();
  });

  it('still prioritizes the session invitation if both IDs occur in an email', () => {
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token&returnSessionId=9&returnCommunityId=42');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    TestBed.createComponent(AppComponent).detectChanges();
    expect(router.navigate).toHaveBeenCalledWith(
      ['/login'], { queryParams: { returnUrl: '/menu/events/9' } }
    );
  });

  it('rejects malformed community destinations in confirmation emails', () => {
    window.history.pushState({}, '', '/?confirmRegistration=fixture-token&returnCommunityId=../login');
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));
    TestBed.createComponent(AppComponent).detectChanges();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should record the first access when the app starts', async () => {
    const fixture = TestBed.createComponent(AppComponent);

    fixture.detectChanges();
    // Presence starts synchronously; optional analytics is loaded in a
    // separate chunk so it does not inflate the initial Angular bundle.
    expect(onlinePresenceService.start).toHaveBeenCalledTimes(1);
    await fixture.whenStable();
    expect(pilotAnalyticsService.recordFirstAccess).toHaveBeenCalledTimes(1);
  });

  it('should expose the Desporto24 title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.title).toEqual('desporto24');
  });

  it('should render the application shell', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-navbar')).not.toBeNull();
    expect(compiled.querySelector('app-footer')).not.toBeNull();
  });
});
