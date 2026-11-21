import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { JynloSelectComponent } from '../../shared/jynlo-select/jynlo-select.component';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { appTranslate as t } from '../../i18n/i18n.service';

import { AuthenticationService } from '../../services/authethication.service';
import { GoogleRegistrationRequest } from '../model/google-auth-response';
import { COUNTRY_CALLING_CODES, COUNTRY_SELECT_CHOICES, countryNameFromLabel } from '../../shared/country-calling-codes';
import { safeLoginReturnUrl } from '../../shared/safe-login-return-url';

@Component({
  selector: 'app-google-onboarding',
  templateUrl: './google-onboarding.component.html',
  styleUrls: ['./google-onboarding.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, JynloSelectComponent]
})
export class GoogleOnboardingComponent implements OnInit {
  credential = '';
  email = '';
  fullName = '';
  pictureUrl = '';

  username = '';
  nickname = '';
  dateOfBirth = '';
  country = 'Portugal';
  indicativePhone = '351';
  phone = '';
  gender = '';
  acceptedLegalTerms = false;

  loading = false;
  errorMessage = '';

  readonly maxBirthDate = this.dateYearsAgo(18);
  readonly minBirthDate = this.dateYearsAgo(120);

  readonly countryOptions = COUNTRY_CALLING_CODES;
  readonly countrySelectChoices = COUNTRY_SELECT_CHOICES;

  constructor(
    private authenticationService: AuthenticationService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.credential = sessionStorage.getItem('google-onboarding-credential') || '';
    this.email = sessionStorage.getItem('google-onboarding-email') || '';
    this.fullName = sessionStorage.getItem('google-onboarding-name') || '';
    this.pictureUrl = sessionStorage.getItem('google-onboarding-picture') || '';

    if (!this.credential || !this.email) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl } });
    }
  }

  countryName(label: string): string {
    return countryNameFromLabel(label);
  }

  submit(): void {
    const validation = this.validate();
    if (validation || this.loading) {
      this.errorMessage = validation || '';
      return;
    }

    const request: GoogleRegistrationRequest = {
      credential: this.credential,
      username: this.username.trim(),
      nickname: this.nickname.trim() || null,
      dateOfBirth: this.dateOfBirth,
      country: this.country.trim(),
      indicativePhone: this.phone.trim() ? this.indicativePhone.replace(/\D/g, '') : null,
      phone: this.phone.trim() ? this.phone.replace(/\D/g, '') : null,
      gender: this.gender || null,
      acceptedLegalTerms: this.acceptedLegalTerms
    };

    this.loading = true;
    this.errorMessage = '';

    this.authenticationService.googleRegister(request)
      .pipe(
        timeout(10_000),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: response => {
          if (!response.token) {
            this.errorMessage = t('feedback.google.createdNoLogin');
            return;
          }

          this.authenticationService.saveToken(response.token);
          this.clearPendingGoogleRegistration();
          this.router.navigateByUrl(this.returnUrl);
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.google.completeError')
          );
        }
      });
  }

  cancel(): void {
    this.clearPendingGoogleRegistration();
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl } });
  }

  private get returnUrl(): string {
    return safeLoginReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
  }

  private validate(): string | null {
    const required = [
      this.username,
      this.dateOfBirth,
      this.country
    ];

    if (required.some(value => !value?.trim())) {
      return t('feedback.register.required');
    }

    if (this.username.trim().length < 3) {
      return t('feedback.register.usernameMin');
    }

    if (!this.isAdultBirthDate(this.dateOfBirth)) {
      return t('feedback.register.minimumAge');
    }

    const indicative = this.indicativePhone.replace(/\D/g, '');
    const phone = this.phone.replace(/\D/g, '');
    if (this.phone.trim() && (phone.length < 4 || indicative.length + phone.length > 15)) {
      return t('feedback.register.invalidPhone');
    }

    if (this.phone.trim() && !indicative) {
      return t('feedback.register.invalidPhone');
    }

    if (!this.acceptedLegalTerms) {
      return t('feedback.register.acceptLegal');
    }

    return null;
  }

  private isAdultBirthDate(value: string): boolean {
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

  private clearPendingGoogleRegistration(): void {
    sessionStorage.removeItem('google-onboarding-credential');
    sessionStorage.removeItem('google-onboarding-email');
    sessionStorage.removeItem('google-onboarding-name');
    sessionStorage.removeItem('google-onboarding-picture');
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
