import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from 'src/environment/environment';
import { TranslatePipe } from 'src/app/i18n/translate.pipe';
import { appTranslate as t } from 'src/app/i18n/i18n.service';

/** Opened from the link sent to the new address: applies the email change. */
@Component({
  selector: 'app-confirm-email-change',
  standalone: true,
  // Angular 22 defaults to OnPush; these update plain fields from HTTP callbacks.
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    <main class="confirm-email-page">
      <section class="account-box">
        <span class="section-kicker">{{ 'Email da conta' | t }}</span>
        @if (state === 'loading') {
          <h1>{{ 'A confirmar o teu novo email…' | t }}</h1>
        } @else if (state === 'done') {
          <h1>{{ 'Email confirmado' | t }}</h1>
          <p>{{ 'Já podes usar o novo endereço para entrar e recuperar a palavra-passe.' | t }}</p>
          <a class="jynlo-action jynlo-action--primary" routerLink="/menu/feed">{{ 'Ir para a Jynlo' | t }}</a>
        } @else {
          <h1>{{ 'Não foi possível confirmar' | t }}</h1>
          <p role="alert">{{ error }}</p>
          <a class="jynlo-action jynlo-action--neutral" routerLink="/menu/alterardados">{{ 'Pedir outra vez' | t }}</a>
        }
      </section>
    </main>`
})
export class ConfirmEmailChangeComponent implements OnInit {
  state: 'loading' | 'done' | 'error' = 'loading';
  error = '';

  constructor(private route: ActivatedRoute, private http: HttpClient) {}

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token') || '';
    this.http.post(environment.apiUrl + '/api/auth/email-change/confirm', { token }).subscribe({
      next: () => this.state = 'done',
      error: (e: HttpErrorResponse) => {
        this.state = 'error';
        this.error = typeof e.error?.message === 'string' && e.error.message.length < 200
          ? e.error.message : t('Este link não é válido ou expirou.');
      }
    });
  }
}
