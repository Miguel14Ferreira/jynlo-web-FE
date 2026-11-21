import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';

import { AuthenticationService } from '../../services/authethication.service';
import { safeLoginReturnUrl } from '../../shared/safe-login-return-url';

@Component({
  selector: 'app-login-mfa',
  templateUrl: './login-mfa.component.html',
  styleUrls: ['./login-mfa.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe]
})
export class LoginMFAComponent implements OnInit, OnDestroy {
  code = '';
  challengeId = '';
  expiresAt = '';

  confirming = false;
  resending = false;
  errorMessage = '';
  successMessage = '';
  remainingSeconds: number | null = null;
  resendCooldownSeconds = 0;

  private countdownTimer?: ReturnType<typeof setInterval>;
  private resendCooldownTimer?: ReturnType<typeof setInterval>;

  constructor(
    private authService: AuthenticationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.challengeId = sessionStorage.getItem('mfa-challenge-id') || '';
    this.expiresAt = sessionStorage.getItem('mfa-expires-at') || '';

    if (!this.challengeId) {
      this.errorMessage = t('feedback.mfa.missing');
      return;
    }

    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.stopCountdown();
    if (this.resendCooldownTimer) {
      clearInterval(this.resendCooldownTimer);
    }
  }

  confirmCode(): void {
    const code = this.code.trim();

    if (!this.challengeId) {
      this.errorMessage = t('feedback.mfa.expiredLogin');
      return;
    }

    if (this.isChallengeExpired()) {
      this.errorMessage = t('feedback.mfa.codeExpired');
      this.successMessage = '';
      return;
    }

    if (!code) {
      this.errorMessage = t('feedback.mfa.enterCode');
      return;
    }

    if (this.confirming) {
      return;
    }

    this.confirming = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.confirmMfaChallenge(this.challengeId, code)
      .pipe(timeout(10_000), finalize(() => this.confirming = false))
      .subscribe({
        next: response => {
          if (!response.token) {
            this.errorMessage = t('feedback.mfa.noToken');
            return;
          }

          this.authService.saveToken(response.token);
          const returnUrl = safeLoginReturnUrl(sessionStorage.getItem('mfa-return-url'));
          this.clearChallenge();
          this.router.navigateByUrl(returnUrl);
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.mfa.invalid')
          );
        }
      });
  }

  resendCode(): void {
    if (!this.challengeId || this.resending) {
      return;
    }

    this.resending = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService.resendMfaChallenge(this.challengeId)
      .pipe(timeout(10_000), finalize(() => this.resending = false))
      .subscribe({
        next: response => {
          if (!response.challengeId) {
            this.errorMessage = t('feedback.mfa.noChallenge');
            return;
          }

          this.challengeId = response.challengeId;
          sessionStorage.setItem('mfa-challenge-id', response.challengeId);

          if (response.challengeExpiresAt) {
            this.expiresAt = response.challengeExpiresAt;
            sessionStorage.setItem('mfa-expires-at', response.challengeExpiresAt);
            this.startCountdown();
          } else {
            this.expiresAt = '';
            this.remainingSeconds = null;
            sessionStorage.removeItem('mfa-expires-at');
            this.stopCountdown();
          }

          this.successMessage = t('feedback.mfa.resent');
          this.startResendCooldown();
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.mfa.resendError')
          );
        }
      });
  }

  cancel(): void {
    const returnUrl = safeLoginReturnUrl(sessionStorage.getItem('mfa-return-url'));
    this.clearChallenge();
    this.router.navigate(['/login'], { queryParams: { returnUrl } });
  }

  countdownLabel(): string {
    if (this.remainingSeconds === null) {
      return '';
    }

    const minutes = Math.floor(this.remainingSeconds / 60);
    const seconds = this.remainingSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  isChallengeExpired(): boolean {
    if (!this.expiresAt) {
      return false;
    }

    const parsed = Date.parse(this.expiresAt);
    return !Number.isNaN(parsed) && parsed <= Date.now();
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

  private startCountdown(): void {
    this.stopCountdown();
    this.syncCountdown();

    if (this.remainingSeconds !== null && this.remainingSeconds > 0) {
      this.countdownTimer = setInterval(() => this.syncCountdown(), 1000);
    }
  }

  private syncCountdown(): void {
    if (!this.expiresAt) {
      this.remainingSeconds = null;
      return;
    }

    const parsed = Date.parse(this.expiresAt);
    if (Number.isNaN(parsed)) {
      this.remainingSeconds = null;
      return;
    }

    this.remainingSeconds = Math.max(
      0,
      Math.ceil((parsed - Date.now()) / 1000)
    );

    if (this.remainingSeconds === 0) {
      this.stopCountdown();
    }
  }

  private stopCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }
  }

  private clearChallenge(): void {
    this.stopCountdown();
    sessionStorage.removeItem('mfa-challenge-id');
    sessionStorage.removeItem('mfa-expires-at');
    sessionStorage.removeItem('mfa-return-url');
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
