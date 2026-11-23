import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { VenueBookingService, VenueClaim, lisbonDateTime } from '../../services/venue-booking.service';
import { bookingError } from '../../shared/venue-jynlo-booking/venue-jynlo-booking.component';

/** Admin queue: people asking to manage a venue and take Jynlo bookings. */
@Component({
  selector: 'app-admin-venue-claims',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="avc">
      <a class="avc__back" routerLink="/menu/admin">← {{ 'Administração' | t }}</a>
      <h2>{{ 'Pedidos para gerir recintos' | t }}</h2>
      <p class="avc__muted">{{ 'Confirma que a pessoa trabalha no recinto (por exemplo, ligando para o número do clube) antes de aprovar.' | t }}</p>
      @if (!pending.length) { <p class="avc__muted">{{ 'Não há pedidos à espera.' | t }}</p> }
      @for (c of pending; track c.id) {
        <article class="avc__item">
          <strong><a [routerLink]="['/menu/venues', c.venueId]">{{ c.venueName }}</a> · {{ c.venueCity }}</strong>
          <span>&#64;{{ c.username }} · {{ when(c.createdAt) }}@if (c.contactPhone) { · {{ c.contactPhone }} }</span>
          <p>“{{ c.roleDescription }}”</p>
          <div class="avc__actions">
            <input type="text" maxlength="500" [(ngModel)]="notes[c.id]" [placeholder]="'Nota para a pessoa (opcional)' | t"
              [attr.aria-label]="'Nota para a pessoa' | t">
            <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="decide(c, true)">{{ 'Aprovar' | t }}</button>
            <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy" (click)="decide(c, false)">{{ 'Recusar' | t }}</button>
          </div>
        </article>
      }
      @if (error) { <p class="avc__error" role="alert">{{ error }}</p> }
      @if (history.length) {
        <h3>{{ 'Decididos' | t }}</h3>
        @for (c of history; track c.id) {
          <p class="avc__muted">{{ c.venueName }} · &#64;{{ c.username }} · {{ (c.status === 'APPROVED' ? 'Aprovado' : 'Recusado') | t }}@if (c.decidedBy) { · {{ c.decidedBy }} }</p>
        }
      }
    </section>
  `,
  styles: [`
    .avc { display:grid; gap:.7rem; max-width:900px; margin:0 auto; padding:6.4rem 1rem 4rem; color:#eafff9; }
    .avc__back { color:#7ae5c5; font-weight:700; text-decoration:none; min-height:44px; display:inline-flex; align-items:center; }
    .avc__muted { color:#b9d4d6; margin:0; }
    .avc__item { display:grid; gap:.35rem; padding:.9rem; border-radius:14px; border:1px solid rgba(96,176,182,.3); }
    .avc__item p { margin:0; }
    .avc__item a { color:#7ae5c5; }
    .avc__actions { display:flex; flex-wrap:wrap; gap:.5rem; }
    .avc__actions input { flex:1 1 220px; min-height:44px; padding:0 .7rem; border-radius:10px; border:1px solid rgba(63,216,180,.35);
      background:#0a3340; color:#effffb; font:inherit; }
    .avc__error { color:#ffb4b4; margin:0; }
  `]
})
export class AdminVenueClaimsComponent implements OnInit {
  pending: VenueClaim[] = [];
  history: VenueClaim[] = [];
  notes: Record<number, string> = {};
  busy = false;
  error = '';

  private readonly api = inject(VenueBookingService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void { this.load(); }

  when(iso: string): string { return lisbonDateTime(iso); }

  decide(c: VenueClaim, approve: boolean): void {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    const note = (this.notes[c.id] ?? '').trim() || null;
    (approve ? this.api.approveClaim(c.id, note) : this.api.rejectClaim(c.id, note))
      .pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ next: () => this.load(), error: e => { this.error = bookingError(e, 'Não foi possível guardar a decisão.'); } });
  }

  private load(): void {
    this.api.pendingClaims().subscribe({
      next: list => { this.pending = list; this.cdr.markForCheck(); },
      error: e => { this.error = bookingError(e, 'Não foi possível carregar os pedidos.'); this.cdr.markForCheck(); }
    });
    this.api.claimHistory().subscribe({ next: list => { this.history = list; this.cdr.markForCheck(); }, error: () => {} });
  }
}
