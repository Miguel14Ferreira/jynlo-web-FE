import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { finalize, timeout } from 'rxjs';

import { AuthenticationService } from '../../services/authethication.service';

@Component({
  selector: 'app-forgotp',
  templateUrl: './forgotp.component.html',
  styleUrls: ['./forgotp.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe]
})
export class ForgotpComponent {
  email = '';
  loading = false;
  errorMessage = '';
  successMessage = '';

  constructor(private authenticationService: AuthenticationService) {}

  sendResetEmail(): void {
    const email = this.email.trim();

    if (!email) {
      this.errorMessage = t('feedback.reset.emailRequired');
      this.successMessage = '';
      return;
    }

    if (this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authenticationService.initiatePasswordReset(email)
      .pipe(timeout(10_000), finalize(() => this.loading = false))
      .subscribe({
        next: response => {
          this.successMessage = t('feedback.reset.sent');
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.reset.startError')
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
