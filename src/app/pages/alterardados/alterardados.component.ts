import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit } from '@angular/core';
import { finalize, retry, timeout } from 'rxjs';

import { environment } from 'src/environment/environment';
import { MyProfile, UpdateMyProfileRequest } from '../model/my-profile';
import { DeviceSession, MfaSetupResponse, MyProfileService } from '../../services/my-profile.service';
import { AuthenticationService } from '../../services/authethication.service';
import { SPORTS_CATALOG, sportIcon } from '../../shared/sports-catalog';
import { COUNTRY_CALLING_CODES, COUNTRY_SELECT_CHOICES, countryNameFromLabel } from '../../shared/country-calling-codes';
import { calculateProfileCompletion } from '../../shared/profile-completion';

@Component({
  selector: 'app-alterardados',
  templateUrl: './alterardados.component.html',
  styleUrls: ['./alterardados.component.css', './alterardados-v3-finish.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AlterardadosComponent implements OnInit {
  profile?: MyProfile;
  deviceSessions: DeviceSession[] = [];
  deviceSessionsLoading = false;
  deviceSessionsError = '';
  revokingDeviceId: string | null = null;
  pendingRevokeId: string | null = null;
  pendingRevokeOtherDevices = false;
  revokingOtherDevices = false;
  photo?: File;
  photoPreview = '';

  loading = false;
  saving = false;
  photoSaving = false;
  photoEditing = false;
  mfaSetup?: MfaSetupResponse;
  mfaSetupCode = '';
  mfaSetupLoading = false;
  mfaConfirming = false;
  mfaDisabling = false;
  mfaDisablePending = false;
  mfaDisableCode = '';
  accountDeletionPending = false;
  accountDeletionConfirmation = '';
  deletingAccount = false;
  errorMessage = '';
  successMessage = '';
  toastMessage = '';
  sportQuery = '';
  sportFeedbackKey = '';
  selectedSports: string[] = [];
  sportSuggestions: string[] = [];
  fieldErrors: Partial<Record<'email' | 'dateOfBirth' | 'country' | 'phone' | 'bio', string>> = {};
  readonly sportsCatalog = SPORTS_CATALOG;
  readonly iconForSport = sportIcon;
  readonly countryOptions = COUNTRY_CALLING_CODES;
  readonly countrySelectChoices = COUNTRY_SELECT_CHOICES;
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly maxBirthDate = this.dateYearsAgo(18);
  readonly minBirthDate = this.dateYearsAgo(120);

  constructor(
    private myProfileService: MyProfileService,
    private authenticationService: AuthenticationService,
    private host: ElementRef<HTMLElement>
  ) {}

  /** The email field is read-only: jump to the secure "Mudar email" box. */
  goToEmailChange(): void {
    const box = this.host.nativeElement.querySelector('app-account-email-change');
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => (box?.querySelector('.account-box__head button') as HTMLButtonElement | null)?.click(), 400);
  }

  ngOnInit(): void {
    this.load();
    this.loadDeviceSessions();
  }

  get hasOtherDeviceSessions(): boolean {
    return this.deviceSessions.some(session => session.current)
      && this.deviceSessions.some(session => !session.current);
  }

  confirmRevokeOtherDevices(): void {
    if (this.revokingOtherDevices || this.revokingDeviceId || !this.hasOtherDeviceSessions) return;
    this.pendingRevokeOtherDevices = true;
  }

  cancelRevokeOtherDevices(): void {
    if (!this.revokingOtherDevices) this.pendingRevokeOtherDevices = false;
  }

  revokeOtherDevices(): void {
    if (!this.pendingRevokeOtherDevices || !this.hasOtherDeviceSessions
        || this.revokingOtherDevices || this.revokingDeviceId) return;
    this.revokingOtherDevices = true;
    this.deviceSessionsError = '';
    this.myProfileService.revokeOtherDeviceSessions()
      .pipe(timeout(10_000), finalize(() => this.revokingOtherDevices = false))
      .subscribe({
        next: () => {
          this.deviceSessions = this.deviceSessions.filter(session => session.current);
          this.pendingRevokeOtherDevices = false;
          this.pendingRevokeId = null;
          this.showToast(t('profile.sessions.othersRevoked'));
        },
        error: () => this.deviceSessionsError = t('profile.sessions.othersError')
      });
  }

  loadDeviceSessions(): void {
    this.deviceSessionsLoading = true;
    this.deviceSessionsError = '';
    this.myProfileService.getDeviceSessions()
      .pipe(timeout(10_000), finalize(() => this.deviceSessionsLoading = false))
      .subscribe({
        next: sessions => {
          this.deviceSessions = sessions;
          this.pendingRevokeOtherDevices = false;
          this.pendingRevokeId = null;
        },
        error: () => this.deviceSessionsError = t('profile.sessions.loadError')
      });
  }

  confirmRevokeDevice(id: string): void {
    if (this.revokingOtherDevices) return;
    if (this.revokingDeviceId) return;
    this.pendingRevokeId = id;
  }

  cancelRevokeDevice(): void {
    this.pendingRevokeId = null;
  }

  revokeDevice(session: DeviceSession): void {
    if (this.revokingOtherDevices) return;
    if (this.pendingRevokeId !== session.id || this.revokingDeviceId) return;
    this.revokingDeviceId = session.id;
    this.deviceSessionsError = '';
    this.myProfileService.revokeDeviceSession(session.id)
      .pipe(timeout(10_000), finalize(() => this.revokingDeviceId = null))
      .subscribe({
        next: () => {
          if (session.current) {
            this.authenticationService.logOut();
            return;
          }
          this.deviceSessions = this.deviceSessions.filter(item => item.id !== session.id);
          this.pendingRevokeId = null;
          this.showToast(t('profile.sessions.revoked'));
        },
        error: () => this.deviceSessionsError = t('profile.sessions.revokeError')
      });
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.myProfileService.get()
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: profile => {
          this.profile = { ...profile };
          if (!this.profile.indicativePhone) {
            const matchingCountry = this.countryOptions.find(
              item => this.countryName(item.label) === this.profile?.country
            );
            this.profile.indicativePhone = matchingCountry?.code ?? '351';
          }
          this.photoPreview = this.profileImage(profile) || '';
          this.selectedSports = (profile.favoriteSports || '')
            .split(',')
            .map(value => value.trim())
            .filter(value => this.sportsCatalog.includes(value));
          this.syncFavoriteSports();
          this.updateSportSuggestions();
        },
        error: () => this.errorMessage = t('feedback.profile.dataLoadError')
      });
  }

  save(): void {
    if (!this.profile || this.saving) {
      return;
    }

    this.fieldErrors = this.validateProfile();

    if (Object.keys(this.fieldErrors).length > 0) {
      this.errorMessage = t('feedback.form.attention');
      this.focusFirstInvalidField();
      return;
    }

    const normalizedPhone = (this.profile.phone || '').replace(/\D/g, '');

    const request: UpdateMyProfileRequest = {
      // Legacy fields are preserved even though they are no longer part of the current account form.
      fullName: this.clean(this.profile.fullName),
      nickname: this.clean(this.profile.nickname),
      dateOfBirth: this.profile.dateOfBirth,
      address: this.clean(this.profile.address),
      country: (this.profile.country || '').trim(),
      location: this.clean(this.profile.location),
      postalCode: this.clean(this.profile.postalCode),
      indicativePhone: normalizedPhone ? this.clean(this.profile.indicativePhone) : null,
      phone: normalizedPhone || null,
      gender: this.clean(this.profile.gender),
      email: this.profile.email.trim(),
      favoriteSports: this.clean(this.profile.favoriteSports),
      bio: this.clean(this.profile.bio),
      skillLevel: this.clean(this.profile.skillLevel),
      availability: this.clean(this.profile.availability),
      mfa: Boolean(this.profile.mfa)
    };

    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.myProfileService.update(request)
      .pipe(
        timeout(10_000),
        finalize(() => this.saving = false)
      )
      .subscribe({
        next: updated => {
          this.profile = { ...updated };
          this.photo = undefined;
          this.photoPreview = this.profileImage(updated) || this.photoPreview;
          this.showToast(t('feedback.profile.updated'));
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.profile.updateError')
          );
        }
      });
  }

  clearFieldError(field: 'email' | 'dateOfBirth' | 'country' | 'phone' | 'bio'): void {
    if (!this.fieldErrors[field]) {
      return;
    }

    const updated = { ...this.fieldErrors };
    delete updated[field];
    this.fieldErrors = updated;
  }

  private validateProfile(): Partial<Record<'email' | 'dateOfBirth' | 'country' | 'phone' | 'bio', string>> {
    const errors: Partial<Record<'email' | 'dateOfBirth' | 'country' | 'phone' | 'bio', string>> = {};

    if (!this.profile) {
      return errors;
    }

    if (!this.profile.email?.trim()) {
      errors.email = t('feedback.contact.emailRequired');
    } else if (!this.profile.email.includes('@')) {
      errors.email = t('feedback.contact.invalidEmail');
    }

    if (!this.profile.dateOfBirth?.trim()) {
      errors.dateOfBirth = t('feedback.profile.birthDateRequired');
    } else if (!this.isAdultBirthDate(this.profile.dateOfBirth)) {
      errors.dateOfBirth = t('feedback.register.minimumAge');
    }

    if (!this.profile.country?.trim()) {
      errors.country = t('feedback.profile.countryRequired');
    }

    const normalizedPhone = (this.profile.phone || '').replace(/\D/g, '');
    if (
      this.profile.phone?.trim()
      && (
        normalizedPhone.length < 4
        || normalizedPhone.length > 15
        || !this.profile.indicativePhone?.trim()
      )
    ) {
      errors.phone = t('feedback.register.invalidPhone');
    }

    if (this.profile.bio && this.profile.bio.length > 280) {
      errors.bio = t('feedback.profile.bioLong');
    }

    return errors;
  }

  private focusFirstInvalidField(): void {
    queueMicrotask(() => {
      const firstInvalid = this.host.nativeElement.querySelector<HTMLElement>(
        '[aria-invalid="true"]'
      );

      if (!firstInvalid) {
        return;
      }

      firstInvalid.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      firstInvalid.focus({ preventScroll: true });
    });
  }

  get profileCompletion() {
    return calculateProfileCompletion(this.profile);
  }

  get completionMissingPreview() {
    return this.profileCompletion.missing.slice(0, 3);
  }

  countryName(label: string): string {
    return countryNameFromLabel(label);
  }

  updateSportSuggestions(): void {
    const query = this.sportQuery.trim().toLocaleLowerCase('pt');
    this.sportSuggestions = this.sportsCatalog
      .filter(sport => !this.selectedSports.includes(sport))
      .filter(sport => !query || sport.toLocaleLowerCase('pt').includes(query))
      .slice(0, 8);
  }

  addSport(sport: string): void {
    if (!this.sportsCatalog.includes(sport) || this.selectedSports.includes(sport)) {
      return;
    }

    this.selectedSports = [...this.selectedSports, sport];
    this.sportFeedbackKey = 'profile.favoriteSportsAdded';
    this.sportQuery = '';
    this.syncFavoriteSports();
    this.updateSportSuggestions();
  }

  removeSport(sport: string): void {
    this.selectedSports = this.selectedSports.filter(item => item !== sport);
    this.sportFeedbackKey = 'profile.favoriteSportsRemoved';
    this.syncFavoriteSports();
    this.updateSportSuggestions();
  }

  onSportSearchKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    const query = this.sportQuery.trim().toLocaleLowerCase('pt');
    const exactMatch = this.sportsCatalog.find(
      sport => sport.toLocaleLowerCase('pt') === query
    );

    if (exactMatch) {
      this.addSport(exactMatch);
    } else {
      this.sportFeedbackKey = 'profile.favoriteSportsNotFound';
      this.updateSportSuggestions();
    }
  }

  clearInvalidSportQuery(): void {
    const query = this.sportQuery.trim();
    if (!query) {
      return;
    }

    const exactMatch = this.sportsCatalog.find(
      sport => sport.toLocaleLowerCase('pt') === query.toLocaleLowerCase('pt')
    );

    if (exactMatch) {
      this.addSport(exactMatch);
    } else {
      this.sportQuery = '';
      this.updateSportSuggestions();
    }
  }

  private syncFavoriteSports(): void {
    if (this.profile) {
      this.profile.favoriteSports = this.selectedSports.join(', ');
    }
  }

  onMfaToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    if (checked) {
      this.startMfaSetup();
      return;
    }

    (event.target as HTMLInputElement).checked = true;
    this.mfaDisablePending = true;
    this.mfaDisableCode = '';
    this.errorMessage = '';
  }

  startMfaSetup(): void {
    if (this.mfaSetupLoading || this.profile?.mfa) {
      return;
    }

    this.mfaSetupLoading = true;
    this.errorMessage = '';

    this.myProfileService.setupMfa()
      .pipe(
        timeout(10_000),
        finalize(() => this.mfaSetupLoading = false)
      )
      .subscribe({
        next: setup => {
          this.mfaSetup = setup;
          this.mfaSetupCode = '';
        },
        error: error => {
          this.errorMessage = this.errorFrom(error, t('feedback.profile.mfaSetupError'));
        }
      });
  }

  confirmMfaSetup(): void {
    const code = this.mfaSetupCode.trim();
    if (!/^\d{6}$/.test(code) || this.mfaConfirming) {
      this.errorMessage = t('feedback.profile.mfaCodeRequired');
      return;
    }

    this.mfaConfirming = true;
    this.errorMessage = '';

    this.myProfileService.confirmMfa(code)
      .pipe(
        timeout(10_000),
        finalize(() => this.mfaConfirming = false)
      )
      .subscribe({
        next: updated => {
          this.profile = { ...updated };
          this.mfaSetup = undefined;
          this.mfaSetupCode = '';
          this.showToast(t('feedback.profile.mfaEnabled'));
        },
        error: error => {
          this.errorMessage = this.errorFrom(error, t('feedback.profile.mfaInvalidCode'));
        }
      });
  }

  cancelMfaSetup(): void {
    this.mfaSetup = undefined;
    this.mfaSetupCode = '';
  }

  disableMfa(): void {
    const code = this.mfaDisableCode.trim();

    if (!/^\d{6}$/.test(code) || this.mfaDisabling) {
      this.errorMessage = t('feedback.profile.mfaCodeRequired');
      return;
    }

    if (!this.profile?.mfa) {
      this.cancelMfaDisable();
      return;
    }

    this.mfaDisabling = true;
    this.errorMessage = '';

    this.myProfileService.disableMfa(code)
      .pipe(
        timeout(10_000),
        finalize(() => this.mfaDisabling = false)
      )
      .subscribe({
        next: updated => {
          this.profile = { ...updated };
          this.mfaSetup = undefined;
          this.mfaSetupCode = '';
          this.mfaDisablePending = false;
          this.mfaDisableCode = '';
          this.showToast(t('feedback.profile.mfaDisabled'));
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.profile.mfaDisableError')
          );
        }
      });
  }

  cancelMfaDisable(): void {
    this.mfaDisablePending = false;
    this.mfaDisableCode = '';
  }

  openAccountDeletion(): void {
    this.accountDeletionPending = true;
    this.accountDeletionConfirmation = '';
    this.errorMessage = '';
  }

  cancelAccountDeletion(): void {
    this.accountDeletionPending = false;
    this.accountDeletionConfirmation = '';
  }

  deleteAccount(): void {
    if (!this.profile || this.deletingAccount) {
      return;
    }

    if (this.accountDeletionConfirmation.trim() !== this.profile.username) {
      this.errorMessage = t('feedback.profile.deleteConfirmationMismatch');
      return;
    }

    this.deletingAccount = true;
    this.errorMessage = '';

    this.myProfileService.deleteAccount()
      .pipe(
        timeout(10_000),
        finalize(() => this.deletingAccount = false)
      )
      .subscribe({
        next: () => this.authenticationService.logOut(),
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.profile.deleteError')
          );
        }
      });
  }

  startPhotoEdit(): void {
    this.photoEditing = true;
    this.photo = undefined;
    this.errorMessage = '';
    this.successMessage = '';
  }

  cancelPhotoEdit(): void {
    this.photoEditing = false;
    this.photo = undefined;
    this.photoPreview = this.profile ? (this.profileImage(this.profile) || '') : '';
  }

  savePhoto(): void {
    if (!this.photo || this.photoSaving) {
      return;
    }

    this.photoSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.myProfileService.updatePhoto(this.photo)
      .pipe(
        timeout(10_000),
        finalize(() => this.photoSaving = false)
      )
      .subscribe({
        next: updated => {
          this.profile = { ...updated };
          this.photoPreview = this.profileImage(updated) || this.photoPreview;
          this.photo = undefined;
          this.photoEditing = false;
          this.showToast(t('feedback.profile.photoUpdated'));
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.profile.photoError')
          );
        }
      });
  }

  onPhotoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      this.photo = undefined;
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

  private profileImage(profile: MyProfile): string | null {
    const path = profile.profilePicUrl;
    if (!path) {
      return null;
    }

    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }

    return environment.apiUrl + (path.startsWith('/') ? path : '/' + path);
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

  private clean(value: string | null): string | null {
    const cleaned = value?.trim();
    return cleaned ? cleaned : null;
  }

  private showToast(message: string): void {
    this.toastMessage = message;

    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }

    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
      this.toastTimer = undefined;
    }, 3500);
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
