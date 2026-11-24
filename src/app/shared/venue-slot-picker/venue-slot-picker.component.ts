import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import {
  BookingOffer, CourtSlots, VenueBookingService, formatPrice, lisbonTime, nextLisbonDays,
} from '../../services/venue-booking.service';
import { currentLang } from '../venue-jynlo-booking/venue-jynlo-booking.component';

/** The court and time the organiser picked while creating a game. */
export interface PickedVenueSlot {
  venueId: number;
  courtId: number;
  courtName: string;
  start: string;
  end: string;
  priceCents: number | null;
  paymentMethod: 'MBWAY' | 'IN_PERSON' | null;
}

/** Same Lisbon "YYYY-MM-DDTHH:mm" the game form's date field holds. */
export function slotLocalDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Lisbon',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/**
 * Game creation at a venue that takes Jynlo bookings: pick a day and a free court time.
 * Renders nothing for venues that do not take bookings, so it stays hidden until one joins.
 */
@Component({
  selector: 'app-venue-slot-picker',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (offer && offer.acceptsBookings && offer.courts.length) {
      <section class="vsp" [attr.aria-label]="'Reservar o campo' | t">
        <div class="vsp__head">
          <strong>📅 {{ 'Este recinto aceita reservas na Jynlo' | t }}</strong>
          <span class="vsp__muted">{{ 'Escolhe o dia e um horário livre: o jogo fica nessa hora e o pedido de reserva segue para o recinto.' | t }}</span>
        </div>
        <div class="vsp__days" role="group" [attr.aria-label]="'Dia' | t">
          @for (d of days; track d) {
            <button type="button" class="vsp__chip" [class.is-active]="d === day" [attr.aria-pressed]="d === day"
                    [disabled]="disabled" (click)="pickDay(d)">{{ dayLabel(d) }}</button>
          }
        </div>
        @if (loading) { <p class="vsp__muted" role="status">{{ 'A procurar horários…' | t }}</p> }
        @if (error) { <p class="vsp__error" role="alert">{{ error }}</p> }
        @if (!loading && !error && !freeCount()) {
          <p class="vsp__muted">{{ 'Não há horários livres neste dia. Experimenta outro dia.' | t }}</p>
        }
        @for (c of courts; track c.courtId) {
          @if (free(c).length) {
            <div class="vsp__court">
              <span class="vsp__court-name">{{ c.name }}@if (c.sport) { · {{ c.sport }} }@if (price(c.priceCents); as p) { · {{ p }} }</span>
              <div class="vsp__slots">
                @for (s of free(c); track s.start) {
                  <button type="button" class="vsp__chip" [class.is-active]="selectedStart === s.start && selectedCourtId === c.courtId"
                          [disabled]="disabled" (click)="pick(c, s.start, s.end)">{{ time(s.start) }}</button>
                }
              </div>
            </div>
          }
        }
        @if (selectedStart) {
          <p class="vsp__picked" role="status">
            ✅ {{ 'Horário escolhido:' | t }} {{ selectedCourtName }}, {{ time(selectedStart) }}.
            {{ 'O recinto ainda tem de confirmar a reserva.' | t }}
            <button type="button" class="vsp__link" [disabled]="disabled" (click)="clear()">{{ 'Não reservar' | t }}</button>
          </p>
        }
      </section>
    }
  `,
  styles: [`
    .vsp { display:grid; gap:.6rem; padding:1rem; border-radius:16px; border:1px solid rgba(98,230,196,.45); background:rgba(98,230,196,.06); }
    .vsp__head { display:grid; gap:.2rem; }
    .vsp__muted { color:#b9d4d6; font-size:.86rem; margin:0; }
    .vsp__error { color:#ffb4b4; margin:0; }
    .vsp__days, .vsp__slots { display:flex; gap:.4rem; flex-wrap:wrap; }
    .vsp__days { flex-wrap:nowrap; overflow-x:auto; padding-bottom:.2rem; }
    .vsp__chip { min-height:38px; padding:0 .8rem; border-radius:999px; border:1px solid rgba(96,176,182,.45); background:transparent;
      color:#eafff9; font:inherit; font-weight:700; cursor:pointer; white-space:nowrap; }
    .vsp__chip.is-active { background:#62e6c4; border-color:#62e6c4; color:#04212b; }
    .vsp__court { display:grid; gap:.4rem; }
    .vsp__court-name { font-weight:700; color:#eafff9; }
    .vsp__picked { margin:0; color:#eafff9; }
    .vsp__link { margin-left:.4rem; background:none; border:0; color:#62e6c4; text-decoration:underline; cursor:pointer; font:inherit; }
  `]
})
export class VenueSlotPickerComponent implements OnChanges {
  @Input() venueId: number | null = null;
  @Input() disabled = false;
  /** The pick the parent still holds; null clears the highlight. */
  @Input() selectedStart: string | null = null;
  @Input() selectedCourtId: number | null = null;
  @Output() readonly picked = new EventEmitter<PickedVenueSlot | null>();

  readonly days = nextLisbonDays(30);
  day = this.days[0] ?? '';
  offer: BookingOffer | null = null;
  courts: CourtSlots[] = [];
  loading = false;
  error = '';
  selectedCourtName = '';

  private readonly api = inject(VenueBookingService);
  private readonly cdr = inject(ChangeDetectorRef);
  private version = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['venueId']) {
      this.offer = null;
      this.courts = [];
      this.error = '';
      this.day = this.days[0] ?? '';
      const id = this.venueId;
      const version = ++this.version;
      if (!id) return;
      this.api.offer(id).subscribe({
        next: offer => {
          if (version !== this.version) return;
          this.offer = offer;
          if (offer?.acceptsBookings && offer.courts?.length) this.loadSlots();
          this.cdr.markForCheck();
        },
        error: () => { /* No offer: the venue simply does not take bookings here. */ }
      });
    }
    if (changes['selectedStart'] && !this.selectedStart) this.selectedCourtName = '';
  }

  pickDay(day: string): void {
    this.day = day;
    this.loadSlots();
  }

  pick(court: CourtSlots, start: string, end: string): void {
    if (!this.venueId || !this.offer) return;
    this.selectedCourtName = court.name;
    this.picked.emit({
      venueId: this.venueId, courtId: court.courtId, courtName: court.name, start, end,
      priceCents: court.priceCents, paymentMethod: this.offer.paymentMethod ?? null,
    });
  }

  clear(): void {
    this.selectedCourtName = '';
    this.picked.emit(null);
  }

  free(c: CourtSlots) { return c.slots.filter(s => s.free); }
  freeCount(): number { return this.courts.reduce((n, c) => n + this.free(c).length, 0); }
  time(iso: string): string { return lisbonTime(iso); }
  price(cents: number | null): string | null { return formatPrice(cents, currentLang()); }

  dayLabel(day: string): string {
    if (day === this.days[0]) return t('Hoje');
    if (day === this.days[1]) return t('Amanhã');
    return new Intl.DateTimeFormat(currentLang() === 'en' ? 'en-GB' : 'pt-PT',
      { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
  }

  private loadSlots(): void {
    const id = this.venueId;
    if (!id) return;
    const version = ++this.version;
    const day = this.day;
    this.loading = true;
    this.error = '';
    this.api.slots(id, day).pipe(finalize(() => {
      if (version === this.version) { this.loading = false; this.cdr.markForCheck(); }
    })).subscribe({
      next: result => { if (version === this.version) this.courts = result?.courts ?? []; },
      error: () => { if (version === this.version) { this.courts = []; this.error = t('Não foi possível carregar os horários.'); } }
    });
  }
}
