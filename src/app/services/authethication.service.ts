import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environment/environment';
import { CustomHttpResponse } from '../pages/custom-http-response';
import { LoginResponse } from '../pages/model/login-response';
import { RegistrationRequest } from '../pages/model/registration-request';
import { GoogleAuthResponse, GoogleRegistrationRequest } from '../pages/model/google-auth-response';

@Injectable()
export class AuthenticationService {
  public host = environment.apiUrl;

  token: string | null = null;
  loggedInPerfilname: string | null = null;
  email: string | null = null;
  PerfilName: string | null = null;

  private readonly jwtHelper = new JwtHelperService();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  googleConfig(): Observable<{ clientId: string }> {
    return this.http.get<{ clientId: string }>(
      `${this.host}/api/auth/google/config`
    );
  }

  googleLogin(credential: string): Observable<GoogleAuthResponse> {
    return this.http.post<GoogleAuthResponse>(
      `${this.host}/api/auth/google/login`,
      { credential },
      { withCredentials: true }
    );
  }

  facebookConfig(): Observable<{ appId: string }> {
    return this.http.get<{ appId: string }>(
      `${this.host}/api/auth/facebook/config`
    );
  }

  facebookLogin(accessToken: string): Observable<GoogleAuthResponse> {
    return this.http.post<GoogleAuthResponse>(
      `${this.host}/api/auth/facebook/login`,
      { credential: accessToken },
      { withCredentials: true }
    );
  }

  facebookRegister(request: GoogleRegistrationRequest): Observable<GoogleAuthResponse> {
    const cohort = this.getPilotCohort();
    const options: { withCredentials: boolean; params?: { cohort: string } } = { withCredentials: true };
    if (cohort) {
      options.params = { cohort };
    }
    return this.http.post<GoogleAuthResponse>(
      `${this.host}/api/auth/facebook/register`,
      request,
      options
    );
  }

  googleRegister(request: GoogleRegistrationRequest): Observable<GoogleAuthResponse> {
    const cohort = this.getPilotCohort();
    const options: {
      withCredentials: boolean;
      params?: { cohort: string };
    } = { withCredentials: true };

    if (cohort) {
      options.params = { cohort };
    }

    return this.http.post<GoogleAuthResponse>(
      `${this.host}/api/auth/google/register`,
      request,
      options
    );
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.host}/api/auth/login`,
      { username, password },
      { withCredentials: true }
    );
  }

  confirmMfaChallenge(challengeId: string, code: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.host}/api/auth/mfa/confirm`,
      { challengeId, code },
      { withCredentials: true }
    );
  }

  resendMfaChallenge(challengeId: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.host}/api/auth/mfa/resend`,
      { challengeId }
    );
  }

  register(request: RegistrationRequest, photo?: File): Observable<CustomHttpResponse> {
    const formData = new FormData();
    formData.append(
      'profile',
      new Blob([JSON.stringify(request)], { type: 'application/json' })
    );

    if (photo) {
      formData.append('photo', photo);
    }

    const cohort = this.getPilotCohort();
    if (cohort) {
      formData.append('cohort', cohort);
    }

    return this.http.post<CustomHttpResponse>(
      `${this.host}/api/auth/register`,
      formData
    );
  }

  confirmRegistration(token: string): Observable<CustomHttpResponse> {
    return this.http.get<CustomHttpResponse>(
      `${this.host}/api/auth/register/confirm`,
      { params: { token } }
    );
  }

  resendRegistrationConfirmation(username: string, returnSessionId?: number | null, returnCommunityId?: number | null): Observable<CustomHttpResponse> {
    const params: { username: string; returnSessionId?: string; returnCommunityId?: string } = {
      username: username.trim()
    };
    if (returnSessionId != null && Number.isSafeInteger(returnSessionId) && returnSessionId > 0) {
      params.returnSessionId = String(returnSessionId);
    } else if (returnCommunityId != null && Number.isSafeInteger(returnCommunityId) && returnCommunityId > 0) {
      params.returnCommunityId = String(returnCommunityId);
    }

    return this.http.post<CustomHttpResponse>(
      `${this.host}/api/auth/register/resend-confirmation`,
      null,
      { params }
    );
  }

  initiatePasswordReset(email: string): Observable<CustomHttpResponse> {
    return this.http.post<CustomHttpResponse>(
      `${this.host}/api/auth/reset-password/initiate`,
      { email: email.trim() }
    );
  }

  confirmPasswordReset(token: string, newPassword: string): Observable<CustomHttpResponse> {
    return this.http.put<CustomHttpResponse>(
      `${this.host}/api/auth/reset-password/confirm`,
      { token, newPassword }
    );
  }

  refreshSession(): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.host}/api/auth/refresh`,
      null,
      { withCredentials: true }
    ).pipe(
      tap(response => {
        if (response.token) {
          this.saveToken(response.token);
        }
      })
    );
  }

  terminarSessao(): Observable<void> {
    return this.http.post<void>(
      `${this.host}/api/auth/logout`,
      null,
      { withCredentials: true }
    );
  }

  private getPilotCohort(): string | null {
    try {
      const cohort = localStorage.getItem('d24_pilot_cohort')?.trim();
      return cohort ? cohort : null;
    } catch {
      return null;
    }
  }

  public logOut(): void {
    this.token = null;
    this.loggedInPerfilname = null;
    this.email = null;
    this.PerfilName = null;

    localStorage.removeItem('t');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('MFA');
    localStorage.removeItem('Sessao');

    sessionStorage.removeItem('auth-token');
    sessionStorage.removeItem('user-data');
    sessionStorage.removeItem('mfa-challenge-id');
    sessionStorage.removeItem('mfa-expires-at');
    sessionStorage.removeItem('mfa-return-url');

    this.router.navigateByUrl('/login');
  }

  public logOut2(): void {
    this.token = null;
    this.loggedInPerfilname = null;
    localStorage.removeItem('MFA');
  }

  public saveToken(token: string): void {
    this.token = token;
    localStorage.setItem('t', token);
  }

  public hasSessionCandidate(): boolean {
    const token = localStorage.getItem('t');
    if (!token) {
      this.token = null;
      this.loggedInPerfilname = null;
      return false;
    }

    try {
      const payload = this.jwtHelper.decodeToken(token);
      this.token = token;
      this.loggedInPerfilname = payload?.sub ?? null;
      return Boolean(this.loggedInPerfilname);
    } catch {
      localStorage.removeItem('t');
      this.token = null;
      this.loggedInPerfilname = null;
      return false;
    }
  }

  public hasValidToken(): boolean {
    const token = localStorage.getItem('t');
    if (!token) {
      return false;
    }

    try {
      const payload = this.jwtHelper.decodeToken(token);
      return Boolean(payload?.exp && payload.exp * 1000 > Date.now());
    } catch {
      localStorage.removeItem('t');
      this.token = null;
      return false;
    }
  }

  public hasAnyRole(...roles: string[]): boolean {
    const token = localStorage.getItem('t');
    if (!token) {
      return false;
    }

    try {
      const payload = this.jwtHelper.decodeToken(token);
      const rawAuthorities = payload?.Authorities ?? payload?.authorities;
      const authorities = Array.isArray(rawAuthorities)
        ? rawAuthorities as string[]
        : [];

      return roles.some(role => authorities.includes(role));
    } catch {
      return false;
    }
  }

  public saveRefreshToken(token: string): void {
    localStorage.setItem('refreshToken', token);
  }

  public loadToken(): void {
    this.token = localStorage.getItem('t');
  }

  public getToken(): string | null {
    return this.token;
  }

  isLoggedIn(): boolean {
    this.loadToken();

    const token = this.token;
    if (!token || !this.hasValidToken()) {
      return false;
    }

    const payload = this.jwtHelper.decodeToken(token);
    this.loggedInPerfilname = payload?.sub ?? null;
    return Boolean(this.loggedInPerfilname);
  }
}
