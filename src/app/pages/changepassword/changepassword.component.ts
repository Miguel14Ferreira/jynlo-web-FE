import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { finalize, timeout } from 'rxjs';

import { MyProfileService } from '../../services/my-profile.service';
import { AuthenticationService } from '../../services/authethication.service';

@Component({
  selector: 'app-changepassword',
  templateUrl: './changepassword.component.html',
  styleUrls: ['./changepassword.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe]
})
export class ChangepasswordComponent {
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  showCurrent = false;
  showNew = false;

  saving = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private myProfileService: MyProfileService,
    private authenticationService: AuthenticationService
  ) {}

  changePassword(): void {
    if (this.saving) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.errorMessage = t('feedback.password.fillAll');
      return;
    }

    if (this.newPassword.length < 8) {
      this.errorMessage = t('feedback.password.min8');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = t('feedback.password.mismatch');
      return;
    }

    if (this.currentPassword === this.newPassword) {
      this.errorMessage = t('feedback.password.different');
      return;
    }

    this.saving = true;

    this.myProfileService.changePassword(this.currentPassword, this.newPassword)
      .pipe(timeout(10_000), finalize(() => this.saving = false))
      .subscribe({
        next: () => {
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmPassword = '';

          sessionStorage.setItem(
            'auth-success-message',
            t('feedback.password.changed')
          );
          this.authenticationService.logOut();
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.password.changeError')
          );
        }
      });
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
