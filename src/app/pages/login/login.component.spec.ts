import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { LoginComponent } from './login.component';
import { AuthenticationService } from '../../services/authethication.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let auth: jasmine.SpyObj<AuthenticationService>;
  let router: Router;
  let queryParamMap: ReturnType<typeof convertToParamMap>;

  beforeEach(async () => {
    queryParamMap = convertToParamMap({});
    auth = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      ['login', 'hasValidToken', 'saveToken', 'googleConfig', 'resendRegistrationConfirmation', 'terminarSessao', 'logOut']
    );
    auth.hasValidToken.and.returnValue(false);
    auth.googleConfig.and.returnValue(of({ clientId: '' }));
    auth.resendRegistrationConfirmation.and.returnValue(of({ message: 'Email reenviado' } as any));
    auth.login.and.returnValue(of({
      mfaRequired: false,
      challengeId: null,
      challengeExpiresAt: null,
      token: 'jwt-token',
      profile: null
    }));

    await TestBed.configureTestingModule({
      declarations: [LoginComponent],
      imports: TEST_IMPORTS,
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() { return queryParamMap; }
            }
          }
        },
        { provide: AuthenticationService, useValue: auth }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    fixture.detectChanges();
  });

  afterEach(() => sessionStorage.clear());

  it('switch account: a signed-in user chooses to continue or sign in with another account', () => {
    auth.hasValidToken.and.returnValue(true);
    (auth as unknown as { loggedInPerfilname: string }).loggedInPerfilname = 'miguel';
    auth.terminarSessao.and.returnValue(of(undefined));
    queryParamMap = convertToParamMap({ switch: '1' });
    (router.navigateByUrl as jasmine.Spy).calls.reset();
    component.ngOnInit();
    expect(component.switchingFrom).toBe('miguel');
    expect(router.navigateByUrl).not.toHaveBeenCalled();

    component.signInWithAnotherAccount();
    expect(auth.terminarSessao).toHaveBeenCalled();
    expect(auth.logOut).toHaveBeenCalled();
    expect(component.switchingFrom).toBeNull();
  });

  it('without switch=1 a signed-in user still goes straight back', () => {
    auth.hasValidToken.and.returnValue(true);
    (router.navigateByUrl as jasmine.Spy).calls.reset();
    component.ngOnInit();
    expect(component.switchingFrom).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/menu/feed');
  });

  it('declares POST and accessible password toggle', () => {
    const form = fixture.nativeElement.querySelector('.login-card form') as HTMLFormElement;
    const toggle = form.querySelector('.password-field button') as HTMLButtonElement;
    expect(form.getAttribute('method')).toBe('post');
    expect(toggle.getAttribute('aria-controls')).toBe('login-password');
    toggle.click();
    fixture.detectChanges();
    expect((form.querySelector('[name="password"]') as HTMLInputElement).type).toBe('text');
  });

  it('offers confirmation resend immediately after an expired email link', () => {
    sessionStorage.setItem('auth-error-message', 'A ligação de confirmação expirou.');
    queryParamMap =
      convertToParamMap({ returnUrl: '/menu/events/42' });

    component.ngOnInit();
    fixture.detectChanges();

    expect(component.canResendConfirmation).toBeTrue();
    expect(fixture.nativeElement.querySelector('.confirmation-resend .resend-confirmation'))
      .not.toBeNull();
    expect(component.errorMessage).toContain('expirou');
    expect(sessionStorage.getItem('auth-error-message')).toBeNull();

    component.username = 'fixture-user';
    spyOn<any>(component, 'startResendCooldown');
    component.resendConfirmation();

    expect(auth.resendRegistrationConfirmation).toHaveBeenCalledWith('fixture-user', 42);
    expect(component.successMessage).toContain('novo email');
  });

  it('does not offer confirmation resend after a successful email confirmation', () => {
    sessionStorage.setItem('auth-success-message', 'Email confirmado.');

    component.ngOnInit();
    fixture.detectChanges();

    expect(component.canResendConfirmation).toBeFalse();
    expect(fixture.nativeElement.querySelector('.confirmation-resend')).toBeNull();
    expect(component.successMessage).toBe('Email confirmado.');
  });

  it('should explain the request login and return to notifications after signing in', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/notifications' });
    component.ngOnInit();
    fixture.detectChanges();

    expect(component.loginContextKey).toBe('login.viewRequest');
    expect(fixture.nativeElement.querySelector('.login-context')).not.toBeNull();
    component.username = 'fixture-user';
    component.password = 'fixture-password';
    component.onLogin();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/menu/notifications');
  });

  it('explains the invitation when login is opened from a shared session', () => {
    queryParamMap =
      convertToParamMap({ returnUrl: '/menu/events/42' });
    component.ngOnInit();
    fixture.detectChanges();

    expect(component.loginContextKey).toBe('login.viewSession');
    const message = fixture.nativeElement.querySelector('.login-context') as HTMLElement;
    expect(message).not.toBeNull();
    expect(message.textContent).toContain('sessão desportiva');
    expect(message.textContent).toContain('inscrever-te');
  });

  it('welcomes people with a community invitation and returns to the group after login', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/communities/42' });
    component.ngOnInit();
    fixture.detectChanges();
    expect(component.loginContextKey).toBe('login.viewCommunity');
    expect((fixture.nativeElement.querySelector('.login-context') as HTMLElement).textContent)
      .toContain('convite para uma comunidade');
    component.username = 'fixture-user';
    component.password = 'fixture-password';
    component.onLogin();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/menu/communities/42');
  });

  it('preserves a community invite through MFA', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/communities/42' });
    component.ngOnInit();
    auth.login.and.returnValue(of({
      mfaRequired: true, challengeId: 'challenge', challengeExpiresAt: null,
      token: null, profile: null
    }));
    component.username = 'fixture-user';
    component.password = 'fixture-password';
    component.onLogin();
    expect(sessionStorage.getItem('mfa-return-url')).toBe('/menu/communities/42');
  });

  it('resends an expired community confirmation link with its ID', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/communities/42' });
    component.ngOnInit();
    component.username = 'fixture-user';
    spyOn<any>(component, 'startResendCooldown');
    component.resendConfirmation();
    expect(auth.resendRegistrationConfirmation).toHaveBeenCalledWith('fixture-user', null, 42);
  });

  it('shows no invitation message for unrelated or malformed destinations', () => {
    for (const returnUrl of ['/menu/feed', 'https://example.com', '/menu/events/not-a-number']) {
      queryParamMap = convertToParamMap({ returnUrl });
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.loginContextKey).toBe('');
      expect(fixture.nativeElement.querySelector('.login-context')).toBeNull();
    }
  });

  it('should preserve the request destination while MFA is required', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/notifications' });
    component.ngOnInit();
    auth.login.and.returnValue(of({
      mfaRequired: true, challengeId: 'fixture-challenge', challengeExpiresAt: null,
      token: null, profile: null
    }));
    component.username = 'fixture-user';
    component.password = 'fixture-password';
    component.onLogin();
    expect(sessionStorage.getItem('mfa-return-url')).toBe('/menu/notifications');
  });

  it('should preserve a shared session destination after login', () => {
    queryParamMap =
      convertToParamMap({ returnUrl: '/menu/events/42' });
    component.ngOnInit();
    component.username = 'fixture-user';
    component.password = 'fixture-password';

    component.onLogin();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/menu/events/42');
  });

  it('should keep a legitimate internal destination with query parameters', () => {
    queryParamMap =
      convertToParamMap({ returnUrl: '/menu/notifications?view=requests' });
    component.ngOnInit();
    component.username = 'fixture-user';
    component.password = 'fixture-password';

    component.onLogin();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/menu/notifications?view=requests');
  });

  it('should reject external and malformed login return URLs', () => {
    const invalidTargets = [
      'https://example.com',
      '//example.com',
      '/login',
      '/menu/../login',
      '/menu//events/42',
      '/menu/%2e%2e/login',
      '/menu/events%2f42',
      '/menu/events\\42'
    ];

    for (const returnUrl of invalidTargets) {
      queryParamMap =
        convertToParamMap({ returnUrl });
      component.ngOnInit();
      component.username = 'fixture-user';
      component.password = 'fixture-password';

      component.onLogin();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/menu/feed');
      (router.navigateByUrl as jasmine.Spy).calls.reset();
    }
  });

  it('should store only a validated destination for MFA', () => {
    queryParamMap =
      convertToParamMap({ returnUrl: '//example.com' });
    component.ngOnInit();
    auth.login.and.returnValue(of({
      mfaRequired: true, challengeId: 'fixture-challenge', challengeExpiresAt: null,
      token: null, profile: null
    }));
    component.username = 'fixture-user';
    component.password = 'fixture-password';

    component.onLogin();

    expect(sessionStorage.getItem('mfa-return-url')).toBe('/menu/feed');
  });

  it('preserves a shared session when resending confirmation after failed login', () => {
    queryParamMap =
      convertToParamMap({ returnUrl: '/menu/events/42' });
    component.ngOnInit();
    component.username = 'fixture-user';
    spyOn<any>(component, 'startResendCooldown');

    component.resendConfirmation();

    expect(auth.resendRegistrationConfirmation).toHaveBeenCalledWith('fixture-user', 42);
  });

  it('does not forward other login destinations as session IDs', () => {
    queryParamMap =
      convertToParamMap({ returnUrl: '/menu/notifications' });
    component.ngOnInit();
    component.username = 'fixture-user';
    spyOn<any>(component, 'startResendCooldown');

    component.resendConfirmation();

    expect(auth.resendRegistrationConfirmation).toHaveBeenCalledWith('fixture-user', null);
  });

  it('should not show the request message for a normal login', () => {
    expect(component.loginContextKey).toBe('');
    expect(fixture.nativeElement.querySelector('.login-context')).toBeNull();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should save a JWT and navigate after normal login', () => {
    component.username = 'miguel';
    component.password = 'password-123';

    component.onLogin();

    expect(auth.login).toHaveBeenCalledWith('miguel', 'password-123');
    expect(auth.saveToken).toHaveBeenCalledWith('jwt-token');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/menu/feed');
  });

  it('shows username, email or mobile number in the same accessible login field', () => {
    const form = fixture.nativeElement.querySelector('.login-card form') as HTMLFormElement;
    const input = form.querySelector('input[name="username"]') as HTMLInputElement;
    const label = input.closest('label') as HTMLLabelElement;
    expect(label.textContent).toContain('email');
    expect(label.textContent).toContain('telemóvel');
    expect(input.autocomplete).toBe('username');
    expect(input.placeholder).toContain('email');
    expect(input.type).toBe('text');
  });

  it('submits username, email and mobile identifiers using the existing login contract', () => {
    for (const identifier of [
      'fixture-user', 'fixture@example.test', '912345678', '+351 912 345 678'
    ]) {
      component.username = ' ' + identifier + ' ';
      component.password = 'fixture-password';
      component.onLogin();

      expect(auth.login).toHaveBeenCalledWith(identifier, 'fixture-password');
      expect(auth.saveToken).toHaveBeenCalledWith('jwt-token');
    }
  });

  it('should store the MFA challenge instead of a JWT', () => {
    auth.login.and.returnValue(of({
      mfaRequired: true,
      challengeId: 'challenge-123',
      challengeExpiresAt: '2026-09-26T00:05:00Z',
      token: null,
      profile: null
    }));
    component.username = 'miguel';
    component.password = 'password-123';

    component.onLogin();

    expect(sessionStorage.getItem('mfa-challenge-id')).toBe('challenge-123');
    expect(auth.saveToken).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login/MFAauthentication']);
  });
});
