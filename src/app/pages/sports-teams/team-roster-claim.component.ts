import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate } from '../../i18n/i18n.service';
import { SportsTeamsService, TeamRosterClaim } from '../../services/sports-teams.service';

/** "És o nº 7 desta equipa?": the player accepts and joins with their account. */
@Component({
  selector: 'app-team-roster-claim',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="team-roster-claim">
      @if (loading) { <p>{{ 'A abrir o convite…' | t }}</p> }
      @if (error) {
        <p role="alert">{{ error }}</p>
        <a routerLink="/menu/teams">{{ 'Ver as minhas equipas' | t }}</a>
      }
      @if (claim && !done) {
        <span class="team-roster-claim__kicker">{{ 'Convite para o plantel' | t }}</span>
        <h1>{{ claim.teamName }}</h1>
        <p class="team-roster-claim__line">{{ 'És' | t }} <strong>{{ claim.name }}</strong>{{ claimDetails() }}?</p>
        <p>{{ 'Ao aceitar, entras na equipa com a tua conta e ficas com este lugar no plantel.' | t }}</p>
        <div class="team-roster-claim__actions">
          <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="accept()">
            {{ busy ? ('A entrar…' | t) : ('Sim, sou eu · Entrar na equipa' | t) }}
          </button>
          <a class="jynlo-action" routerLink="/menu/teams">{{ 'Não sou eu' | t }}</a>
        </div>
      }
    </main>
  `,
  styles: [`
    .team-roster-claim__kicker { color: #5ee6c8; font-size: .75rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .team-roster-claim { max-width: 560px; margin: clamp(96px, 14vh, 140px) auto 64px; padding: 28px 22px; display: grid; gap: 14px;
      border-radius: 20px; border: 1px solid rgba(83, 188, 180, .35); background: rgba(13, 44, 60, .58); }
    h1 { margin: 0; }
    .team-roster-claim__line { font-size: 1.15rem; margin: 0; }
    .team-roster-claim__actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  `]
})
export class TeamRosterClaimComponent implements OnInit {
  claim: TeamRosterClaim | null = null;
  loading = true;
  busy = false;
  done = false;
  error = '';
  private token = '';

  constructor(private readonly route: ActivatedRoute, private readonly router: Router,
              private readonly api: SportsTeamsService, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(this.token)) {
      this.loading = false; this.error = appTranslate('Link inválido ou já usado'); return;
    }
    this.api.rosterClaim(this.token)
      .pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: claim => {
          this.claim = claim;
          if (claim.alreadyLinked) this.error = appTranslate('Este lugar no plantel já foi associado a uma conta');
        },
        error: e => this.error = e?.error?.message || appTranslate('Link inválido ou já usado')
      });
  }

  claimDetails(): string {
    if (!this.claim) return '';
    return (this.claim.shirtNumber != null ? ' · nº ' + this.claim.shirtNumber : '')
      + (this.claim.position ? ' · ' + this.claim.position : '');
  }

  accept(): void {
    if (this.busy || !this.claim) return;
    this.busy = true; this.error = '';
    this.api.acceptRosterClaim(this.token)
      .pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: claim => { this.done = true; void this.router.navigate(['/menu/teams', claim.teamId]); },
        error: e => this.error = e?.error?.message || appTranslate('Não foi possível entrar na equipa')
      });
  }
}
