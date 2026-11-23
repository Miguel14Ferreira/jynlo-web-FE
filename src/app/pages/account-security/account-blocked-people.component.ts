import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environment/environment';
import { TranslatePipe } from 'src/app/i18n/translate.pipe';
import { appTranslate as t } from 'src/app/i18n/i18n.service';

interface BlockedPerson { username: string; fullName?: string | null; blockedAt?: string | null; }

/** "Pessoas bloqueadas": who I blocked, with an unblock button each. */
@Component({
  selector: 'app-account-blocked-people',
  standalone: true,
  // Angular 22 defaults to OnPush; these update plain fields from HTTP callbacks.
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    <section class="account-box" aria-labelledby="blocked-heading">
      <span class="section-kicker">{{ 'Privacidade' | t }}</span>
      <h2 id="blocked-heading">{{ 'Pessoas bloqueadas' | t }}</h2>
      @if (loading) {
        <p role="status">{{ 'common.loading' | t }}</p>
      } @else if (error) {
        <p class="account-box__error" role="alert">{{ error }}</p>
      } @else if (!people.length) {
        <p>{{ 'Não bloqueaste ninguém.' | t }}</p>
      } @else {
        <ul class="account-blocked-list">
          @for (person of people; track person.username) {
            <li>
              <a [routerLink]="['/menu/perfis', person.username]">
                <strong>{{ person.fullName || person.username }}</strong>
                <span>&#64;{{ person.username }}</span>
              </a>
              <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy === person.username"
                (click)="unblock(person)">{{ (busy === person.username ? 'A desbloquear…' : 'Desbloquear') | t }}</button>
            </li>
          }
        </ul>
      }
    </section>`
})
export class AccountBlockedPeopleComponent implements OnInit {
  people: BlockedPerson[] = [];
  loading = true;
  error = '';
  busy: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.http.get<BlockedPerson[]>(environment.apiUrl + '/api/blocks/users').subscribe({
      next: list => { this.people = Array.isArray(list) ? list : []; this.loading = false; },
      error: () => { this.error = t('Não foi possível carregar as pessoas bloqueadas.'); this.loading = false; }
    });
  }

  unblock(person: BlockedPerson): void {
    if (this.busy) return;
    this.busy = person.username;
    this.http.delete(environment.apiUrl + '/api/blocks/users/' + encodeURIComponent(person.username)).subscribe({
      next: () => { this.people = this.people.filter(p => p.username !== person.username); this.busy = null; },
      error: () => { this.error = t('Não foi possível desbloquear. Tenta novamente.'); this.busy = null; }
    });
  }
}
