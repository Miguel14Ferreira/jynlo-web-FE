import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { of, throwError } from 'rxjs';

import { AuthenticationGuard } from './authentication.guard';
import { AuthenticationService } from '../services/authethication.service';
import { TEST_IMPORTS } from '../testing/test-providers';

describe('AuthenticationGuard', () => {
  let guard: AuthenticationGuard;
  let router: Router;
  let authenticationService: jasmine.SpyObj<AuthenticationService>;

  beforeEach(() => {
    localStorage.clear();
    authenticationService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      ['refreshSession']
    );

    TestBed.configureTestingModule({
      imports: TEST_IMPORTS,
      providers: [
        AuthenticationGuard,
        { provide: AuthenticationService, useValue: authenticationService }
      ]
    });

    guard = TestBed.inject(AuthenticationGuard);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should allow a non-expired token', async () => {
    localStorage.setItem('t', 'header.payload.signature');
    spyOn(JwtHelperService.prototype, 'isTokenExpired')
      .and.returnValue(Promise.resolve(false));

    const result = await guard.canActivate(
      {} as any,
      { url: '/menu/events' } as any
    );

    expect(result).toBeTrue();
    expect(authenticationService.refreshSession).not.toHaveBeenCalled();
  });

  it('should recover an expired access token through refresh', async () => {
    localStorage.setItem('t', 'header.payload.signature');
    spyOn(JwtHelperService.prototype, 'isTokenExpired')
      .and.returnValue(Promise.resolve(true));
    authenticationService.refreshSession.and.returnValue(
      of({ token: 'fresh-token' } as any)
    );

    const result = await guard.canActivate(
      {} as any,
      { url: '/menu/events' } as any
    );

    expect(result).toBeTrue();
  });

  it('should redirect when refresh succeeds without an access token', async () => {
    authenticationService.refreshSession.and.returnValue(
      of({ token: null } as any)
    );

    const result = await guard.canActivate(
      {} as any,
      { url: '/menu/events/42?join=1' } as any
    );

    expect(result).not.toBeTrue();
    expect(router.serializeUrl(result as any)).toContain('/login');
    expect(router.serializeUrl(result as any)).toContain('returnUrl=');
    expect(router.serializeUrl(result as any)).not.toContain('sessionExpired');
  });

  it('should keep the route on a temporary refresh outage', async () => {
    localStorage.setItem('t', 'header.payload.signature');
    spyOn(JwtHelperService.prototype, 'isTokenExpired')
      .and.returnValue(Promise.resolve(true));
    authenticationService.refreshSession.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 503 }))
    );

    const result = await guard.canActivate(
      {} as any,
      { url: '/menu/events' } as any
    );

    expect(result).toBeTrue();
    expect(localStorage.getItem('t')).toBe('header.payload.signature');
  });

  it('must not admit a new guest to protected pages during a refresh outage', async () => {
    expect(localStorage.getItem('t')).toBeNull();
    authenticationService.refreshSession.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 503 }))
    );

    const result = await guard.canActivate(
      {} as any, { url: '/menu/events/42?join=1' } as any
    );

    expect(result).not.toBeTrue();
    const redirect = router.serializeUrl(result as any);
    expect(redirect).toContain('/login?');
    expect(redirect).not.toContain('sessionExpired');
    expect(redirect).toContain('returnUrl=');
    expect(authenticationService.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('should redirect when the refresh session is definitively rejected', async () => {
    localStorage.setItem('t', 'header.payload.signature');
    spyOn(JwtHelperService.prototype, 'isTokenExpired')
      .and.returnValue(Promise.resolve(true));
    authenticationService.refreshSession.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 400 }))
    );

    const result = await guard.canActivate(
      {} as any,
      { url: '/menu/events' } as any
    );

    expect(localStorage.getItem('t')).toBeNull();
    expect(router.serializeUrl(result as any)).toContain('/login');
    expect(router.serializeUrl(result as any)).toContain('sessionExpired=1');
  });
});
