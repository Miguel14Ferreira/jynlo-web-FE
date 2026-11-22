import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { firstValueFrom } from 'rxjs';

import { AuthenticationService } from '../services/authethication.service';

@Injectable({ providedIn: 'root' })
export class AuthenticationGuard {
  private readonly jwtHelper = new JwtHelperService();

  constructor(
    private router: Router,
    private authenticationService: AuthenticationService
  ) {}

  async canActivate(
    _next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean | UrlTree> {
    const token = localStorage.getItem('t');

    if (token) {
      try {
        const expired = await this.jwtHelper.isTokenExpired(token);
        if (!expired) {
          return true;
        }
      } catch {
        // Invalid access token: attempt to recover the session via refresh cookie.
      }
    }

    try {
      const refreshed = await firstValueFrom(this.authenticationService.refreshSession());
      if (refreshed.token) {
        return true;
      }
      // A successful refresh response without a token cannot authenticate a user.
    } catch (error) {
      if (!this.isRefreshRejected(error) && token) {
        // Only preserve an already-existing local session candidate during
        // temporary outages. A new guest with no token must never pass
        // an authenticated route guard just because refresh is unavailable.
        return true;
      }
    }

    localStorage.removeItem('t');
    return this.router.createUrlTree(
      ['/login'],
      // "Session expired" only makes sense to someone who had a session;
      // a visitor who taps "Join" just gets the sign-in page.
      { queryParams: token ? { returnUrl: state.url, sessionExpired: '1' } : { returnUrl: state.url } }
    );
  }

  private isRefreshRejected(error: unknown): boolean {
    if (!(error instanceof HttpErrorResponse)) {
      return false;
    }

    return [400, 401, 403].includes(error.status);
  }
}
