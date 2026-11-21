import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { JynloSelectComponent } from '../../shared/jynlo-select/jynlo-select.component';
import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { finalize, timeout } from 'rxjs';

import { RegistrationRequest } from '../model/registration-request';
import { AuthenticationService } from '../../services/authethication.service';
import { COUNTRY_CALLING_CODES, COUNTRY_SELECT_CHOICES, countryNameFromLabel } from '../../shared/country-calling-codes';
import { ActivatedRoute } from '@angular/router';
import { registrationSessionId, registrationCommunityId, rememberRegistrationDestination } from '../../shared/registration-return-url';

@Component({
  selector: 'app-createaccount',
  templateUrl: './createaccount.component.html',
  styleUrls: ['./createaccount.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, JynloSelectComponent]
})
export class CreateaccountComponent {
  username = '';
  password = '';
  confirmPassword = '';
  nickname = '';
  dateOfBirth = '';
  country = 'Portugal';
  gender = '';
  email = '';
  acceptedLegalTerms = false;

  readonly maxBirthDate = this.dateYearsAgo(18);
  readonly minBirthDate = this.dateYearsAgo(120);

  readonly countryOptions = COUNTRY_CALLING_CODES;
  readonly countrySelectChoices = COUNTRY_SELECT_CHOICES;

  showPassword = false;
  photo?: File;
  photoPreview = '';

  loading = false;
  errorMessage = '';
  successMessage = '';
  registrationComplete = false;
  existingAccountRecovery = false;
  resendLoading = false;
  resendCooldownSeconds = 0;

  private resendCooldownTimer?: ReturnType<typeof setInterval>;

  constructor(
    private authenticationService: AuthenticationService,
    private route: ActivatedRoute
  ) {}

  countryName(label: string): string {
    return countryNameFromLabel(label);
  }

  get hasSharedSessionInvitation(): boolean {
    return registrationSessionId(this.route.snapshot.queryParamMap.get('returnUrl')) !== null;
  }

  get hasSharedCommunityInvitation(): boolean {
    return registrationCommunityId(this.route.snapshot.queryParamMap.get('returnUrl')) !== null;
  }

  register(): void {
    const validation = this.validate();
    if (validation) {
      this.errorMessage = validation;
      this.successMessage = '';
      return;
    }

    const request: RegistrationRequest = {
      username: this.username.trim(),
      password: this.password,
      nickname: this.nickname.trim() || null,
      dateOfBirth: this.dateOfBirth,
      country: this.country.trim(),
      indicativePhone: null,
      phone: null,
      gender: this.gender || null,
      email: this.email.trim(),
      acceptedLegalTerms: this.acceptedLegalTerms,
      returnSessionId: registrationSessionId(this.route.snapshot.queryParamMap.get('returnUrl')),
      returnCommunityId: registrationCommunityId(this.route.snapshot.queryParamMap.get('returnUrl'))
    };

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.existingAccountRecovery = false;

    this.authenticationService.register(request, this.photo)
      .pipe(timeout(10_000), finalize(() => this.loading = false))
      .subscribe({
        next: response => {
          rememberRegistrationDestination(this.route.snapshot.queryParamMap.get('returnUrl'));
          this.successMessage = t('feedback.register.created');
          this.registrationComplete = true;
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.register.createError')
          );
          const normalizedError = this.errorMessage.toLowerCase();
          this.existingAccountRecovery =
            normalizedError.includes('já se encontra registado')
            || normalizedError.includes('já se encontra registrado')
            || normalizedError.includes('já existe um perfil');
        }
      });
  }

  resendConfirmation(): void {
    const username = this.username.trim();
    if (!username || this.resendLoading) {
      return;
    }

    this.resendLoading = true;
    this.errorMessage = '';

    const destination = this.route.snapshot.queryParamMap.get('returnUrl');
    const sessionId = registrationSessionId(destination);
    const communityId = registrationCommunityId(destination);
    if (communityId !== null) {
      this.sendCommunityConfirmation(username, sessionId, communityId);
      return;
    }
    this.sendCommunityConfirmation(username, sessionId, null);
  }

  private sendCommunityConfirmation(username: string, sessionId: number | null, communityId: number | null): void {
    const request = communityId !== null
      ? this.authenticationService.resendRegistrationConfirmation(username, sessionId, communityId)
      : this.authenticationService.resendRegistrationConfirmation(username, sessionId);
    request
      .pipe(timeout(10_000), finalize(() => this.resendLoading = false))
      .subscribe({
        next: () => {
          this.successMessage = t('feedback.register.resent');
          this.startResendCooldown();
        },
        error: error => {
          this.errorMessage = this.errorFrom(error, t('feedback.register.resendError'));
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

  onPhotoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      this.photo = undefined;
      this.photoPreview = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.errorMessage = t('feedback.image.choose');
      input.value = '';
      return;
    }

    this.photo = file;
    this.errorMessage = '';

    const reader = new FileReader();
    reader.onload = () => {
      this.photoPreview = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  }

  private validate(): string | null {
    const required = [
      this.username,
      this.password,
      this.confirmPassword,
      this.dateOfBirth,
      this.country,
      this.email
    ];

    if (required.some(value => !value?.trim())) {
      return t('feedback.register.required');
    }

    if (this.username.trim().length < 3) {
      return t('feedback.register.usernameMin');
    }

    if (this.password.length < 8) {
      return t('feedback.register.passwordMin');
    }

    if (this.password !== this.confirmPassword) {
      return t('feedback.register.passwordMismatch');
    }

    if (!this.isAdultBirthDate(this.dateOfBirth)) {
      return t('feedback.register.minimumAge');
    }

    if (!this.email.includes('@')) {
      return t('feedback.contact.invalidEmail');
    }

    if (!this.acceptedLegalTerms) {
      return t('feedback.register.acceptLegal');
    }

    return null;
  }

  private isAdultBirthDate(value: string): boolean {
    if (!value) {
      return false;
    }

    const birthDate = new Date(value + 'T00:00:00');
    if (Number.isNaN(birthDate.getTime())) {
      return false;
    }

    const minDate = new Date(this.minBirthDate + 'T00:00:00');
    const maxDate = new Date(this.maxBirthDate + 'T00:00:00');
    return birthDate >= minDate && birthDate <= maxDate;
  }

  private dateYearsAgo(years: number): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - years);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
