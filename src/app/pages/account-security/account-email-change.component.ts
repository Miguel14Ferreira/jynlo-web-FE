import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from 'src/environment/environment';
import { TranslatePipe } from 'src/app/i18n/translate.pipe';
import { appTranslate as t } from 'src/app/i18n/i18n.service';

/**
 * "Mudar email": asks for the current password and sends a confirmation link to
 * the new address. The email only changes once that link is opened.
 */
@Component({
  selector: 'app-account-email-change',
  standalone: true,
  // Angular 22 defaults to OnPush; these update plain fields from HTTP callbacks.
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <section class="account-box" aria-labelledby="email-change-heading">
      <div class="account-box__head">
        <div>
          <span class="section-kicker">{{ 'Email da conta' | t }}</span>
          <h2 id="email-change-heading">{{ currentEmail || '—' }}</h2>
          <p>{{ 'Para mudar, confirmamos a tua palavra-passe e o novo endereço.' | t }}</p>
        </div>
        @if (!open) {
          <button type="button" class="jynlo-action jynlo-action--neutral" (click)="open = true; message = ''; error = ''">
            {{ 'Mudar email' | t }}
          </button>
        }
      </div>
      @if (open) {
        <form class="account-box__form" (ngSubmit)="submit()" autocomplete="off">
          <label>
            <span>{{ 'Novo email' | t }}</span>
            <input type="email" name="newEmail" [(ngModel)]="newEmail" required maxlength="254" autocomplete="email" [disabled]="busy">
          </label>
          <label>
            <span>{{ 'Palavra-passe atual' | t }}</span>
            <div class="account-pw">
              <input [type]="showPassword ? 'text' : 'password'" id="email-change-password" name="currentPassword"
                [(ngModel)]="currentPassword" autocomplete="current-password" [disabled]="busy">
              <button type="button" class="jynlo-action jynlo-action--neutral" aria-controls="email-change-password"
                [attr.aria-pressed]="showPassword" [attr.aria-label]="(showPassword ? 'common.hide' : 'common.show') | t"
                (click)="showPassword = !showPassword">{{ (showPassword ? 'common.hide' : 'common.show') | t }}</button>
            </div>
            <small>{{ 'Se entras só com Google ou Apple, deixa em branco.' | t }}</small>
          </label>
          <div class="account-box__actions">
            <button type="submit" class="jynlo-action jynlo-action--primary" [disabled]="busy || !newEmail.trim()">
              {{ (busy ? 'A enviar…' : 'Enviar link de confirmação') | t }}
            </button>
            <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy" (click)="cancel()">{{ 'common.cancel' | t }}</button>
          </div>
        </form>
      }
      @if (message) { <p class="account-box__ok" role="status">{{ message }}</p> }
      @if (error) { <p class="account-box__error" role="alert">{{ error }}</p> }
    </section>`
})
export class AccountEmailChangeComponent {
  @Input() currentEmail: string | null = null;
  open = false;
  busy = false;
  newEmail = '';
  currentPassword = '';
  showPassword = false;
  message = '';
  error = '';

  constructor(private http: HttpClient) {}

  cancel(): void {
    this.open = false;
    this.newEmail = '';
    this.currentPassword = '';
    this.showPassword = false;
    this.error = '';
  }

  submit(): void {
    if (this.busy || !this.newEmail.trim()) return;
    this.busy = true;
    this.error = '';
    this.http.post<{ message?: string }>(environment.apiUrl + '/api/profile/me/email-change',
      { newEmail: this.newEmail.trim(), currentPassword: this.currentPassword || null }).subscribe({
      next: () => {
        this.busy = false;
        this.message = t('Enviámos um link para {{email}}. O email só muda quando o abrires.', { email: this.newEmail.trim() });
        this.cancel();
      },
      error: (e: HttpErrorResponse) => {
        this.busy = false;
        this.currentPassword = '';
        this.error = e.status === 400 && typeof e.error?.message === 'string' && e.error.message.length < 200
          ? e.error.message
          : t('Não foi possível pedir a alteração. Tenta novamente.');
      }
    });
  }
}
