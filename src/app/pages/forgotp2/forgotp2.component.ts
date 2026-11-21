import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';

import { AuthenticationService } from '../../services/authethication.service';

@Component({
  selector: 'app-forgotp2',
  templateUrl: './forgotp2.component.html',
  styleUrls: ['./forgotp2.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe]
})
export class Forgotp2Component implements OnInit {
  token = '';
  newPassword = '';
  confirmPassword = '';
  showPassword = false;

  loading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authenticationService: AuthenticationService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';

    if (!this.token) {
      this.errorMessage = t('feedback.reset.invalidToken');
    }
  }

  resetPassword(): void {
    if (!this.token || this.loading) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';

    if (this.newPassword.length < 8) {
      this.errorMessage = t('feedback.password.min8');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = t('feedback.password.mismatch');
      return;
    }

    this.loading = true;

    this.authenticationService.confirmPasswordReset(this.token, this.newPassword)
      .pipe(timeout(10_000), finalize(() => this.loading = false))
      .subscribe({
        next: response => {
          this.successMessage = t('feedback.reset.changed');
          this.newPassword = '';
          this.confirmPassword = '';
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.reset.error')
          );
        }
      });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
