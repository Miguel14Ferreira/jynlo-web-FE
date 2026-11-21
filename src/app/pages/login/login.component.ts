import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { AfterViewInit, ChangeDetectionStrategy, Component, NgZone, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';

import { AuthenticationService } from '../../services/authethication.service';
import { safeLoginReturnUrl } from '../../shared/safe-login-return-url';
import { registrationSessionId, registrationCommunityId } from '../../shared/registration-return-url';

declare global {
  interface Window {
    google?: any;
  }
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class LoginComponent implements OnInit, AfterViewInit {
  username = '';
  password = '';
  showPassword = false;

  loading = false;
  errorMessage = '';
  successMessage = '';
  canResendConfirmation = false;
  resendLoading = false;
  resendCooldownSeconds = 0;
  googleLoading = false;
  googleReady = false;

  private resendCooldownTimer?: ReturnType<typeof setInterval>;

  private returnUrl = '/menu/feed';
  /** Shown instead of the form when a signed-in user asks to switch account. */
  switchingFrom: string | null = null;
  switchingOut = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authenticationService: AuthenticationService,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.returnUrl = safeLoginReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));

    this.successMessage = sessionStorage.getItem('auth-success-message') || '';
    this.errorMessage = sessionStorage.getItem('auth-error-message') || '';
    // A failed registration email confirmation should allow resending immediately.
    this.canResendConfirmation = Boolean(this.errorMessage);
    sessionStorage.removeItem('auth-success-message');
    sessionStorage.removeItem('auth-error-message');

    if (this.authenticationService.hasValidToken()) {
      // "Trocar de conta": let the user choose instead of silently going back to the feed.
      if (this.route.snapshot.queryParamMap.get('switch') === '1') {
        this.switchingFrom = this.authenticationService.loggedInPerfilname || '';
        return;
      }
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  continueCurrentAccount(): void {
    this.router.navigateByUrl(this.returnUrl);
  }

  /** Ends the server session (refresh cookie) and clears this browser before showing the form. */
  signInWithAnotherAccount(): void {
    if (this.switchingOut) return;
    this.switchingOut = true;
    const finish = () => {
      this.authenticationService.logOut();
      this.switchingFrom = null;
      this.switchingOut = false;
      this.username = '';
      this.password = '';
    };
    this.authenticationService.terminarSessao().pipe(timeout(10_000)).subscribe({ next: finish, error: finish });
  }

  get loginContextKey(): string {
    const path = this.returnUrl.split(/[?#]/)[0];
    if (registrationSessionId(path) !== null) {
      return 'login.viewSession';
    }
    if (registrationCommunityId(path) !== null) return 'login.viewCommunity';
    return path === '/menu/notifications' || path.startsWith('/menu/notifications/')
      ? 'login.viewRequest'
      : '';
  }

  ngAfterViewInit(): void {
    this.authenticationService.googleConfig()
      .pipe(timeout(10_000))
      .subscribe({
      next: config => {
        if (!config.clientId?.trim()) {
          return;
        }

        this.loadGoogleIdentityScript(config.clientId.trim());
      }
    });
  }

  private loadGoogleIdentityScript(clientId: string): void {
    const initialize = () => {
      if (!window.google?.accounts?.id) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          this.ngZone.run(() => this.handleGoogleCredential(response.credential || ''));
        }
      });

      const host = document.getElementById('google-signin-button');
      if (!host) {
        return;
      }

      host.innerHTML = '';
      const width = Math.max(260, Math.min(420, Math.floor(host.getBoundingClientRect().width || 360)));

      window.google.accounts.id.renderButton(host, {
        theme: 'outline',
        size: 'large',
        width,
        text: 'continue_with',
        shape: 'pill'
      });
      this.googleReady = true;
    };

    if (window.google?.accounts?.id) {
      initialize();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener('load', initialize, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initialize;
    document.head.appendChild(script);
  }

  private handleGoogleCredential(credential: string): void {
    if (!credential || this.googleLoading) {
      return;
    }

    this.googleLoading = true;
    this.errorMessage = '';

    this.authenticationService.googleLogin(credential)
      .pipe(timeout(10_000), finalize(() => this.googleLoading = false))
      .subscribe({
        next: response => {
          if (response.onboardingRequired) {
            sessionStorage.setItem('google-onboarding-credential', credential);
            sessionStorage.setItem('google-onboarding-email', response.email || '');
            sessionStorage.setItem('google-onboarding-name', response.fullName || '');
            sessionStorage.setItem('google-onboarding-picture', response.pictureUrl || '');
            this.router.navigate(['/login/google/complete-profile'], {
              queryParams: { returnUrl: this.returnUrl }
            });
            return;
          }

          if (response.mfaRequired) {
            if (!response.challengeId) {
              this.errorMessage = 'Não foi possível iniciar a autenticação multifator.';
              return;
            }

            sessionStorage.setItem('mfa-challenge-id', response.challengeId);
            sessionStorage.setItem('mfa-return-url', this.returnUrl);

            if (response.challengeExpiresAt) {
              sessionStorage.setItem('mfa-expires-at', response.challengeExpiresAt);
            } else {
              sessionStorage.removeItem('mfa-expires-at');
            }

            this.router.navigate(['/login/MFAauthentication']);
            return;
          }

          if (!response.token) {
            this.errorMessage = 'Não foi possível concluir o login com Google.';
            return;
          }

          this.authenticationService.saveToken(response.token);
          this.router.navigateByUrl(this.returnUrl);
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            'Não foi possível iniciar sessão com Google.'
          );
        }
      });
  }

  onLogin(): void {
    const username = this.username.trim();

    if (!username || !this.password) {
      this.errorMessage = t('feedback.login.required');
      return;
    }

    if (this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.canResendConfirmation = false;

    this.authenticationService.login(username, this.password)
      .pipe(timeout(10_000), finalize(() => this.loading = false))
      .subscribe({
        next: response => {
          if (response.mfaRequired) {
            if (!response.challengeId) {
              this.errorMessage = t('feedback.login.noChallenge');
              return;
            }

            sessionStorage.setItem('mfa-challenge-id', response.challengeId);
            sessionStorage.setItem('mfa-return-url', this.returnUrl);

            if (response.challengeExpiresAt) {
              sessionStorage.setItem('mfa-expires-at', response.challengeExpiresAt);
            } else {
              sessionStorage.removeItem('mfa-expires-at');
            }

            this.router.navigate(['/login/MFAauthentication']);
            return;
          }

          if (!response.token) {
            this.errorMessage = t('feedback.login.noToken');
            return;
          }

          this.authenticationService.saveToken(response.token);
          this.router.navigateByUrl(this.returnUrl);
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.login.error')
          );

          const normalizedError = this.errorMessage.toLowerCase();
          this.canResendConfirmation =
            normalizedError.includes('email ainda não está verificado')
            || normalizedError.includes('email ainda não foi verificado')
            || normalizedError.includes('verifica o teu email');
        }
      });
  }

  resendConfirmation(): void {
    const username = this.username.trim();
    if (!username || this.resendLoading) {
      return;
    }

    this.resendLoading = true;
    this.successMessage = '';

    const sessionId = registrationSessionId(this.returnUrl);
    const communityId = registrationCommunityId(this.returnUrl);
    const request = communityId !== null
      ? this.authenticationService.resendRegistrationConfirmation(username, sessionId, communityId)
      : this.authenticationService.resendRegistrationConfirmation(username, sessionId);
    request
      .pipe(timeout(10_000), finalize(() => this.resendLoading = false))
      .subscribe({
        next: response => {
          this.successMessage = t('feedback.register.resent');
          this.errorMessage = '';
          this.startResendCooldown();
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.register.resendError')
          );
        }
      });
  }

  private startResendCooldown(): void {
    this.resendCooldownSeconds = 60;
    if (this.resendCooldownTimer) {
      clearInterval(this.resendCooldownTimer);
    }
    this.resendCooldownTimer = setInterval(() => {
      this.resendCooldownSeconds = Math.max(0, this.resendCooldownSeconds - 1);
      if (this.resendCooldownSeconds === 0 && this.resendCooldownTimer) {
        clearInterval(this.resendCooldownTimer);
        this.resendCooldownTimer = undefined;
      }
    }, 1000);
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
