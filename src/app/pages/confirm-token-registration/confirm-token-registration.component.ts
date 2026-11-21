import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize, timeout } from 'rxjs';

import { AuthenticationService } from '../../services/authethication.service';

@Component({
  selector: 'app-confirm-token-registration',
  templateUrl: './confirm-token-registration.component.html',
  styleUrls: ['./confirm-token-registration.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe]
})
export class ConfirmTokenRegistrationComponent implements OnInit {
  token = '';
  loading = false;
  successMessage = '';
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private authenticationService: AuthenticationService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';

    if (!this.token) {
      this.errorMessage = t('feedback.confirm.invalidToken');
      return;
    }

    this.confirm();
  }

  confirm(): void {
    if (!this.token || this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authenticationService.confirmRegistration(this.token)
      .pipe(timeout(10_000), finalize(() => this.loading = false))
      .subscribe({
        next: response => {
          this.successMessage = t('feedback.confirm.success');
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.confirm.error')
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
