import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import {
  BookingOffer, BookingSlot, CourtSlots, DaySlots, ManagementStatus, VenueBookingService,
  formatPrice, lisbonTime, nextLisbonDays
} from '../../services/venue-booking.service';

export function bookingError(e: HttpErrorResponse | unknown, fallback: string): string {
  const err = e as HttpErrorResponse;
  const message = err?.error?.message;
  return typeof message === 'string' && message.trim() && err.status >= 400 && err.status < 500 ? message : t(fallback);
}

export function currentLang(): 'pt' | 'en' {
  try { return localStorage.getItem('d24-language') === 'en' ? 'en' : 'pt'; } catch { return 'pt'; }
}

/**
 * On a venue page: book a free slot on Jynlo when the venue takes bookings, and
 * "Sou o responsável por este recinto" so the person running it can manage it.
 */
@Component({
  selector: 'app-venue-jynlo-booking',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (offer?.acceptsBookings) {
      <section class="vjb" aria-labelledby="vjb-title">
        <div class="vjb__head">
          <h2 id="vjb-title">{{ 'Reservar na Jynlo' | t }}</h2>
          <span class="vjb__badge">✓ {{ 'Aceita reservas na Jynlo' | t }}</span>
        </div>
        <p class="vjb__hint">{{ 'Escolhe o dia e o horário. O recinto confirma o pedido e pagas no local.' | t }}</p>
        <div class="vjb__days" role="tablist" [attr.aria-label]="'Dia da reserva' | t">
          @for (day of days; track day) {
            <button type="button" role="tab" class="vjb__day" [class.is-active]="day === selectedDay"
              [attr.aria-selected]="day === selectedDay" (click)="pickDay(day)">{{ dayLabel(day) }}</button>
          }
        </div>
        @if (loadingSlots) { <p class="vjb__muted" role="status">{{ 'A procurar horários…' | t }}</p> }
        @if (slotsError) { <p class="vjb__error" role="alert">{{ slotsError }}</p> }
        @if (slots && !loadingSlots) {
          @for (court of slots.courts; track court.courtId) {
            <div class="vjb__court">
              <div class="vjb__court-head">
                <strong>{{ court.name }}</strong>
                <span class="vjb__muted">{{ courtMeta(court) }}</span>
              </div>
              @if (freeCount(court) === 0) {
                <p class="vjb__muted">{{ 'Sem horários livres neste dia.' | t }}</p>
              } @else {
                <div class="vjb__slots">
                  @for (slot of court.slots; track slot.start) {
                    <button type="button" class="vjb__slot" [disabled]="!slot.free"
                      [class.is-picked]="picked?.court === court && picked?.slot === slot"
                      [attr.aria-label]="(slot.free ? 'Escolher {{v}}' : '{{v}} ocupado') | t:{ v: time(slot.start) }"
                      (click)="pick(court, slot)">{{ time(slot.start) }}</button>
                  }
                </div>
              }
            </div>
          }
        }
        @if (picked; as p) {
          <div class="vjb__confirm">
            <strong>{{ p.court.name }} · {{ dayLabel(selectedDay) }} · {{ time(p.slot.start) }}–{{ time(p.slot.end) }}</strong>
            <span class="vjb__muted">{{ priceLine(p.court) }}</span>
            @if (loggedIn) {
              <label class="vjb__field">
                <span>{{ 'Mensagem para o recinto (opcional)' | t }}</span>
                <textarea rows="2" maxlength="300" [(ngModel)]="note" [placeholder]="'Ex.: somos 4, precisamos de raquetes' | t"></textarea>
              </label>
              <div class="vjb__actions">
                <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="sending" (click)="send()">
                  {{ (sending ? 'A enviar…' : 'Pedir reserva') | t }}
                </button>
                <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="sending" (click)="picked = null">{{ 'Cancelar' | t }}</button>
              </div>
            } @else {
              <a class="jynlo-action jynlo-action--primary" routerLink="/login">{{ 'Entra para pedir a reserva' | t }}</a>
            }
          </div>
        }
        @if (sent) {
          <p class="vjb__ok" role="status">✓ {{ 'Pedido enviado. O recinto vai confirmar e recebes uma notificação.' | t }}
            <a routerLink="/menu/venue-bookings">{{ 'Ver as minhas reservas' | t }}</a></p>
        }
        @if (sendError) { <p class="vjb__error" role="alert">{{ sendError }}</p> }
      </section>
    }
    @if (loggedIn && status) {
      <div class="vjb__owner">
        @if (status.manager) {
          <a class="jynlo-action jynlo-action--neutral" [routerLink]="['/menu/venues', venueId, 'manage']">
            {{ 'Gerir campos e reservas' | t }}</a>
        } @else if (status.claimStatus === 'PENDING') {
          <p class="vjb__muted">{{ 'O teu pedido para gerir este recinto está a ser analisado.' | t }}</p>
        } @else if (!claimOpen) {
          <button type="button" class="vjb__link" (click)="claimOpen = true">{{ 'Sou o responsável por este recinto' | t }}</button>
          @if (status.claimStatus === 'REJECTED') {
            <p class="vjb__muted">{{ 'O teu último pedido não foi aprovado.' | t }}@if (status.decisionNote) { {{ status.decisionNote }} }</p>
          }
        } @else {
          <form class="vjb__claim" (ngSubmit)="claim()">
            <strong>{{ 'Gerir este recinto na Jynlo' | t }}</strong>
            <p class="vjb__muted">{{ 'Depois de aprovado, podes adicionar os campos e o horário e receber pedidos de reserva.' | t }}</p>
            <label class="vjb__field">
              <span>{{ 'Qual é a tua ligação ao recinto?' | t }}</span>
              <textarea name="role" rows="3" maxlength="300" required [(ngModel)]="claimRole"
                [placeholder]="'Ex.: sou o gerente do clube desde 2020' | t"></textarea>
            </label>
            <label class="vjb__field">
              <span>{{ 'Telefone para confirmarmos (opcional)' | t }}</span>
              <input name="phone" type="tel" maxlength="40" [(ngModel)]="claimPhone">
            </label>
            <div class="vjb__actions">
              <button type="submit" class="jynlo-action jynlo-action--primary" [disabled]="claiming || claimRole.trim().length < 10">
                {{ (claiming ? 'A enviar…' : 'Enviar pedido') | t }}</button>
              <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="claiming" (click)="claimOpen = false">{{ 'Cancelar' | t }}</button>
            </div>
            @if (claimError) { <p class="vjb__error" role="alert">{{ claimError }}</p> }
          </form>
        }
      </div>
    }
  `,
  styles: [`
    .vjb { display:grid; gap:.7rem; margin:1rem 0; padding:1.1rem; border-radius:18px;
      border:1px solid rgba(94,230,200,.45); background:rgba(10,41,55,.72); }
    .vjb__head { display:flex; align-items:center; justify-content:space-between; gap:.6rem; flex-wrap:wrap; }
    .vjb__head h2 { margin:0; font-size:1.15rem; }
    .vjb__badge { font-size:.78rem; font-weight:800; color:#063a35; background:#62e6c4; border-radius:999px; padding:.25rem .65rem; }
    .vjb__hint, .vjb__muted { margin:0; color:#b9d4d6; font-size:.88rem; }
    .vjb__days { display:flex; gap:.4rem; overflow-x:auto; padding-bottom:.2rem; }
    .vjb__day { flex:0 0 auto; min-height:44px; padding:0 .8rem; border-radius:12px; border:1px solid rgba(96,176,182,.35);
      background:transparent; color:#dff7f1; font:inherit; font-weight:700; cursor:pointer; }
    .vjb__day.is-active { background:#62e6c4; color:#063a35; border-color:#62e6c4; }
    .vjb__court { display:grid; gap:.45rem; padding:.7rem 0; border-top:1px solid rgba(96,176,182,.2); }
    .vjb__court-head { display:flex; justify-content:space-between; gap:.5rem; flex-wrap:wrap; }
    .vjb__slots { display:flex; flex-wrap:wrap; gap:.4rem; }
    .vjb__slot { min-width:64px; min-height:44px; border-radius:10px; border:1px solid rgba(94,230,200,.5); background:rgba(98,230,196,.08);
      color:#eafff9; font:inherit; font-weight:800; cursor:pointer; }
    .vjb__slot:disabled { opacity:.35; text-decoration:line-through; cursor:not-allowed; }
    .vjb__slot.is-picked { background:#62e6c4; color:#063a35; }
    .vjb__confirm, .vjb__claim { display:grid; gap:.55rem; padding:.85rem; border-radius:14px; background:rgba(4,24,34,.6); }
    .vjb__field { display:grid; gap:.3rem; font-size:.82rem; font-weight:700; color:#bfe9df; }
    .vjb__field textarea, .vjb__field input { padding:.6rem .8rem; border-radius:10px; border:1px solid rgba(63,216,180,.35);
      background:#0a3340; color:#effffb; font:inherit; font-weight:500; }
    .vjb__field input { min-height:44px; }
    .vjb__actions { display:flex; flex-wrap:wrap; gap:.5rem; }
    .vjb__ok { margin:0; color:#7ae5c5; font-weight:700; }
    .vjb__ok a { color:#a0ffe9; margin-left:.35rem; }
    .vjb__error { margin:0; color:#ffb4b4; }
    .vjb__owner { margin:.6rem 0; display:grid; gap:.5rem; }
    .vjb__link { justify-self:start; min-height:44px; padding:0; border:0; background:none; color:#7ae5c5; font:inherit;
      font-weight:700; text-decoration:underline; cursor:pointer; }
  `]
})
export class VenueJynloBookingComponent implements OnChanges {
  @Input() venueId: number | null = null;
  @Input() loggedIn = false;
  /** Game this booking is for (from "Reservar na Jynlo" on a session). */
  @Input() sessionId: number | null = null;

  offer: BookingOffer | null = null;
  status: ManagementStatus | null = null;
  days: string[] = [];
  selectedDay = '';
  slots: DaySlots | null = null;
  loadingSlots = false;
  slotsError = '';
  picked: { court: CourtSlots; slot: BookingSlot } | null = null;
  note = '';
  sending = false;
  sent = false;
  sendError = '';
  claimOpen = false;
  claimRole = '';
  claimPhone = '';
  claiming = false;
  claimError = '';

  private readonly api = inject(VenueBookingService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnChanges(): void {
    this.offer = null;
    this.status = null;
    this.slots = null;
    this.picked = null;
    if (!this.venueId) return;
    this.days = nextLisbonDays(14);
    this.selectedDay = this.days[0];
    const id = this.venueId;
    this.api.offer(id).subscribe({
      next: offer => {
        if (id !== this.venueId) return;
        this.offer = offer;
        this.cdr.markForCheck();
        if (offer.acceptsBookings) this.loadSlots();
      },
      error: () => { /* optional panel */ }
    });
    if (this.loggedIn) {
      this.api.status(id).subscribe({
        next: status => { if (id === this.venueId) { this.status = status; this.cdr.markForCheck(); } },
        error: () => { /* optional */ }
      });
    }
  }

  pickDay(day: string): void {
    if (day === this.selectedDay) return;
    this.selectedDay = day;
    this.picked = null;
    this.loadSlots();
  }

  pick(court: CourtSlots, slot: BookingSlot): void {
    if (!slot.free) return;
    this.picked = { court, slot };
    this.sent = false;
    this.sendError = '';
  }

  send(): void {
    if (!this.picked || !this.venueId || this.sending) return;
    this.sending = true;
    this.sendError = '';
    const { court, slot } = this.picked;
    this.api.request(this.venueId, court.courtId, slot.start, this.note.trim() || null, this.sessionId)
      .pipe(finalize(() => { this.sending = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.sent = true; this.picked = null; this.note = ''; this.loadSlots(); },
        error: e => { this.sendError = bookingError(e, 'Não foi possível enviar o pedido. Tenta novamente.'); }
      });
  }

  claim(): void {
    if (!this.venueId || this.claiming) return;
    this.claiming = true;
    this.claimError = '';
    this.api.claim(this.venueId, this.claimRole.trim(), this.claimPhone.trim() || null)
      .pipe(finalize(() => { this.claiming = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.claimOpen = false;
          this.status = { ...(this.status ?? { manager: false, decisionNote: null, acceptsBookings: false }), claimStatus: 'PENDING' };
        },
        error: e => { this.claimError = bookingError(e, 'Não foi possível enviar o pedido. Tenta novamente.'); }
      });
  }

  dayLabel(day: string): string {
    if (!day) return '';
    if (day === this.days[0]) return t('Hoje');
    if (day === this.days[1]) return t('Amanhã');
    const date = new Date(day + 'T12:00:00Z');
    return new Intl.DateTimeFormat(currentLang() === 'en' ? 'en-GB' : 'pt-PT',
      { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(date);
  }

  time(iso: string): string { return lisbonTime(iso); }

  freeCount(court: CourtSlots): number { return court.slots.filter(s => s.free).length; }

  courtMeta(court: CourtSlots): string {
    const parts = [court.sport, t('{{n}} min', { n: court.slotMinutes }), formatPrice(court.priceCents, currentLang())];
    return parts.filter(Boolean).join(' · ');
  }

  priceLine(court: CourtSlots): string {
    const price = formatPrice(court.priceCents, currentLang());
    return price ? t('{{price}} · pagas no recinto', { price }) : t('Preço no recinto');
  }

  private loadSlots(): void {
    if (!this.venueId || !this.selectedDay) return;
    const id = this.venueId;
    const day = this.selectedDay;
    this.loadingSlots = true;
    this.slotsError = '';
    this.cdr.markForCheck();
    this.api.slots(id, day)
      .pipe(finalize(() => { this.loadingSlots = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: slots => { if (id === this.venueId && day === this.selectedDay) this.slots = slots; },
        error: e => { this.slotsError = bookingError(e, 'Não foi possível carregar os horários.'); }
      });
  }
}
