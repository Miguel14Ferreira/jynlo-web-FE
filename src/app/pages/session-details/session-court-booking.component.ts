import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { environment } from 'src/environment/environment';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';

export interface CourtBooking {
  organiser: boolean; bookingUrl: string | null; suggestedUrl: string | null;
  venueName: string | null; booked: boolean; bookedAt: string | null; editable: boolean;
}

/**
 * "Reservar campo": the organiser opens the club's booking page, books there and
 * marks the court as booked; players see whether the court is guaranteed.
 * Jynlo only links out — it never books or charges.
 */
@Component({
  selector: 'app-session-court-booking',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data; as booking) {
      <section class="court-booking" [class.is-booked]="booking.booked" aria-labelledby="court-booking-title">
        <div class="court-booking__head">
          <h2 id="court-booking-title">{{ 'Campo' | t }}</h2>
          <span class="court-booking__state">{{ (booking.booked ? '✓ Campo reservado' : 'Campo por reservar') | t }}</span>
        </div>
        @if (booking.editable) {
          <p class="court-booking__hint">{{ 'Reserva no site do clube e depois marca aqui. Os jogadores veem que o campo está garantido.' | t }}</p>
          <label class="court-booking__field">
            <span>{{ 'Link de reserva do clube' | t }}</span>
            <input type="url" inputmode="url" maxlength="500" [placeholder]="'Ex.: página do clube no Playtomic ou site do clube' | t"
              [(ngModel)]="draftUrl" [disabled]="saving">
          </label>
          <div class="court-booking__actions">
            @if (openUrl; as url) {
              <a class="jynlo-action jynlo-action--primary" [href]="url" target="_blank" rel="noopener noreferrer">{{ 'Reservar campo' | t }} ↗</a>
            }
            <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="saving"
              (click)="save(!booking.booked)">
              {{ (booking.booked ? 'Desmarcar reserva' : 'Já reservei o campo') | t }}
            </button>
            @if (draftUrl.trim() !== (booking.bookingUrl || '')) {
              <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="saving" (click)="save(booking.booked)">
                {{ 'Guardar link' | t }}
              </button>
            }
          </div>
        } @else if (!booking.booked) {
          <p class="court-booking__hint">{{ 'O organizador ainda vai reservar o campo.' | t }}</p>
        }
        @if (error) { <small role="alert">{{ error }}</small> }
      </section>
    }
  `,
  styles: [`
    .court-booking { display:grid; gap:.6rem; margin:.75rem 0; padding:1rem; border-radius:16px;
      border:1px solid rgba(96,176,182,.3); background:rgba(10,41,55,.65); }
    .court-booking.is-booked { border-color:rgba(94,230,200,.55); }
    .court-booking__head { display:flex; align-items:center; justify-content:space-between; gap:.6rem; flex-wrap:wrap; }
    .court-booking__head h2 { margin:0; font-size:1.05rem; }
    .court-booking__state { font-weight:800; font-size:.85rem; color:#fcd34d; }
    .court-booking.is-booked .court-booking__state { color:#7ae5c5; }
    .court-booking__hint { margin:0; color:#b9d4d6; font-size:.88rem; }
    .court-booking__field { display:grid; gap:.3rem; font-size:.82rem; font-weight:700; color:#bfe9df; }
    .court-booking__field input { min-height:42px; padding:0 .8rem; border-radius:10px; border:1px solid rgba(63,216,180,.35);
      background:#0a3340; color:#effffb; font:inherit; font-weight:500; }
    .court-booking__actions { display:flex; flex-wrap:wrap; gap:.5rem; }
    small[role=alert] { color:#ffb4b4; }
  `]
})
export class SessionCourtBookingComponent implements OnChanges {
  @Input() sessionId: number | null = null;
  /** Only organisers and players who joined can see the court booking. */
  @Input() allowed = false;

  data: CourtBooking | null = null;
  draftUrl = '';
  saving = false;
  error = '';
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);

  get openUrl(): string | null {
    const raw = (this.draftUrl.trim() || this.data?.bookingUrl || this.data?.suggestedUrl || '').trim();
    if (!raw) return null;
    const url = /^[a-z]+:\/\//i.test(raw) ? raw : 'https://' + raw;
    return /^https:\/\/[^\s/]+\.[^\s/]+/i.test(url) ? url : null;
  }

  ngOnChanges(): void {
    this.data = null;
    if (!this.sessionId || !this.allowed) return;
    this.http.get<CourtBooking>(this.url()).pipe(timeout(10000)).subscribe({
      next: data => { this.apply(data); },
      error: () => { /* optional panel: stay hidden */ }
    });
  }

  save(booked: boolean): void {
    if (!this.sessionId || this.saving) return;
    this.saving = true;
    this.error = '';
    this.http.put<CourtBooking>(this.url(), { bookingUrl: this.draftUrl.trim() || null, booked })
      .pipe(timeout(10000), finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: data => this.apply(data),
        error: (e: HttpErrorResponse) => {
          this.error = typeof e?.error?.message === 'string' && e.status < 500 ? e.error.message : t('Não foi possível guardar. Tenta novamente.');
        }
      });
  }

  private apply(data: CourtBooking): void {
    this.data = data;
    this.draftUrl = data.bookingUrl || data.suggestedUrl || '';
    this.cdr.markForCheck();
  }

  private url(): string {
    return environment.apiUrl + '/api/sessions/' + this.sessionId + '/court-booking';
  }
}
