import { Injectable } from '@angular/core';
import {
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, defer, finalize, firstValueFrom, from, shareReplay, switchMap, catchError, throwError } from 'rxjs';
import { JwtHelperService } from '@auth0/angular-jwt';

import { environment } from '../environment/environment';
import { LoginResponse } from './pages/model/login-response';
import { safeLoginReturnUrl } from './shared/safe-login-return-url';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly rawHttp: HttpClient;
  private refreshInFlight?: Observable<LoginResponse>;
  private readonly jwtHelper = new JwtHelperService();

  constructor(
    private router: Router,
    httpBackend: HttpBackend
  ) {
    this.rawHttp = new HttpClient(httpBackend);
  }

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Never forward access tokens to other origins, even when third-party
    // requests happen through Angular HttpClient. The refresh/401 recovery
    // logic must also stay confined to our own backend API.
    if (!this.isTrustedApiRequest(request.url)) {
      return next.handle(request);
    }

    const token = localStorage.getItem('t');
    const authenticatedRequest = token && !request.headers.has('Authorization')
      ? request.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        })
      : request;

    return next.handle(authenticatedRequest).pipe(
      catchError((error: HttpErrorResponse) => {
        if (
          !this.isAuthenticationFailure(error)
          || request.url.includes('/api/auth/login')
          || request.url.includes('/api/auth/google/login')
          || request.url.includes('/api/auth/google/register')
          || request.url.includes('/api/auth/facebook/login')
          || request.url.includes('/api/auth/facebook/register')
          || request.url.includes('/api/auth/apple/login')
          || request.url.includes('/api/auth/apple/register')
          || request.url.includes('/api/auth/mfa/')
          || request.url.includes('/api/auth/refresh')
        ) {
          return throwError(() => error);
        }

        return this.refreshAccessToken(token).pipe(
          // Handle only errors from the refresh call. A forbidden response from
          // the retried request means insufficient permissions, not a lost session.
          catchError(refreshError => {
            // Another tab may have refreshed successfully in the meantime.
            // A stale 400 from this tab must not erase a NEW session token.
            if (this.isRefreshRejected(refreshError)
                && localStorage.getItem('t') === token) {
              this.clearSessionAndRedirect();
            }
            return throwError(() => refreshError);
          }),
          switchMap(response => {
            if (!response.token) {
              return throwError(() => error);
            }

            const retryRequest = request.clone({
              setHeaders: {
                Authorization: `Bearer ${response.token}`
              }
            });
            return next.handle(retryRequest);
          })
        );
      })
    );
  }

  private isAuthenticationFailure(error: HttpErrorResponse): boolean {
    if (error.status === 401) {
      return true;
    }

    // The current backend uses HTTP 403 both for expired/invalid JWTs and
    // genuine community permission denials. Retry only the authentication
    // entry-point response; refreshing on every 403 would mask permission
    // failures and could unnecessarily rotate the refresh cookie.
    const body = error.error;
    return error.status === 403
      && Boolean(localStorage.getItem('t'))
      && body?.httpStatusCode === 403
      && body?.message === 'Tu percisas de efetuar o login para aceder a esta página';
  }

  private isTrustedApiRequest(url: string): boolean {
    try {
      const api = new URL(environment.apiUrl);
      // Angular callers use either absolute backend URLs or relative /api paths.
      // Both must resolve to our configured backend origin and API namespace.
      const target = new URL(url, api.origin);
      return target.origin === api.origin
        && (target.pathname === '/api' || target.pathname.startsWith('/api/'));
    } catch {
      return false;
    }
  }

  private refreshAccessToken(observedToken: string | null): Observable<LoginResponse> {
    if (!this.refreshInFlight) {
      const renew = async (): Promise<LoginResponse> => {
        const currentToken = localStorage.getItem('t');
        // If another tab already rotated the HttpOnly cookie, use the access
        // JWT it published in shared storage instead of reusing the old cookie.
        if (observedToken && currentToken && observedToken !== currentToken) {
          const previous = this.decodeIdentity(observedToken);
          const current = this.decodeIdentity(currentToken);
          if (!previous || !current || previous !== current) {
            throw new Error('Authentication identity changed while refreshing');
          }
          if (!this.jwtHelper.isTokenExpired(currentToken)) {
            return {
              mfaRequired: false, challengeId: null, challengeExpiresAt: null,
              token: currentToken, profile: null
            };
          }
        }

        const response = await firstValueFrom(this.rawHttp.post<LoginResponse>(
          environment.apiUrl + '/api/auth/refresh',
          null,
          { withCredentials: true }
        ));
        if (!response.token) {
          throw new Error('Refresh response did not include an access token');
        }
        localStorage.setItem('t', response.token);
        return response;
      };

      this.refreshInFlight = defer(() => {
        // Web Locks are origin-wide: unlike this singleton, they coordinate
        // multiple browser tabs. Older browsers retain same-tab single flight.
        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
          return from(navigator.locks.request(
            'jynlo-refresh-cookie', { mode: 'exclusive' }, renew
          ));
        }
        return from(renew());
      }).pipe(
        finalize(() => this.refreshInFlight = undefined),
        shareReplay(1)
      );
    }
    return this.refreshInFlight;
  }

  private decodeIdentity(token: string): string | null {
    try {
      return this.jwtHelper.decodeToken(token)?.sub ?? null;
    } catch {
      return null;
    }
  }

  private isRefreshRejected(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }

    return [400, 401, 403].includes(error.status);
  }

  private clearSessionAndRedirect(): void {
    localStorage.removeItem('t');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('MFA');
    localStorage.removeItem('Sessao');

    sessionStorage.removeItem('auth-token');
    sessionStorage.removeItem('user-data');
    sessionStorage.removeItem('mfa-challenge-id');
    sessionStorage.removeItem('mfa-expires-at');
    sessionStorage.removeItem('mfa-return-url');

    const returnUrl = safeLoginReturnUrl(this.router.url);
    void this.router.navigate(['/login'], {
      queryParams: { sessionExpired: '1', returnUrl }
    });
  }
}
