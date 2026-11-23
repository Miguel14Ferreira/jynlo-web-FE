import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import {
  BookingHours, BookingOffer, VenueBooking, VenueBookingService, formatPrice, lisbonDateTime, lisbonTime
} from '../../services/venue-booking.service';
import { bookingError, currentLang } from '../../shared/venue-jynlo-booking/venue-jynlo-booking.component';

interface CourtRow { id: number | null; name: string; sport: string; price: string; slotMinutes: number; active: boolean; }
interface DayRow { day: number; ranges: { open: string; close: string }[]; }

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

/** Courts, opening hours and booking requests of a venue the person manages. */
@Component({
  selector: 'app-venue-manage',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="vm">
      <a class="vm__back" [routerLink]="['/menu/venues', venueId]">← {{ 'Voltar ao recinto' | t }}</a>
      <header class="vm__hero">
        <span class="vm__kicker">{{ 'Gestão do recinto' | t }}</span>
        <h1>{{ venueName || ('Recinto' | t) }}</h1>
        @if (offer) {
          @if (offer.acceptsBookings) {
            <p class="vm__state is-on">✓ {{ 'Aceita reservas na Jynlo. Os jogadores já veem os teus horários livres.' | t }}</p>
          } @else {
            <p class="vm__state">{{ 'Ainda não aceita reservas: adiciona pelo menos um campo e o horário de funcionamento.' | t }}</p>
          }
        }
      </header>
      @if (loadError) { <p class="vm__error" role="alert">{{ loadError }}</p> }

      <section class="vm__card" aria-labelledby="vm-requests">
        <h2 id="vm-requests">{{ 'Pedidos de reserva' | t }}</h2>
        @if (!requests.length) { <p class="vm__muted">{{ 'Ainda não há pedidos.' | t }}</p> }
        @for (r of requests; track r.id) {
          <article class="vm__request" [attr.data-status]="r.status">
            <div class="vm__request-main">
              <strong>{{ when(r.startAt) }}–{{ time(r.endAt) }} · {{ r.courtName }}</strong>
              <span class="vm__muted">&#64;{{ r.requesterUsername }}@if (price(r.priceCents); as p) { · {{ p }} }</span>
              @if (r.playerNote) { <span class="vm__note">“{{ r.playerNote }}”</span> }
            </div>
            <span class="vm__chip">{{ statusLabel(r.status) }}</span>
            @if (r.status === 'PENDING') {
              <div class="vm__actions">
                <input type="text" maxlength="300" [placeholder]="'Mensagem (opcional)' | t" [(ngModel)]="notes[r.id]"
                  [attr.aria-label]="'Mensagem para o jogador' | t">
                <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="decide(r, true)">{{ 'Confirmar' | t }}</button>
                <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy" (click)="decide(r, false)">{{ 'Recusar' | t }}</button>
              </div>
            }
          </article>
        }
        @if (requestError) { <p class="vm__error" role="alert">{{ requestError }}</p> }
      </section>

      <section class="vm__card" aria-labelledby="vm-courts">
        <h2 id="vm-courts">{{ 'Campos' | t }}</h2>
        <p class="vm__muted">{{ 'O preço é por reserva e pago no recinto. Deixa em branco se preferires combinar no local.' | t }}</p>
        @for (c of courts; track $index) {
          <div class="vm__court">
            <label><span>{{ 'Nome' | t }}</span><input type="text" maxlength="80" [(ngModel)]="c.name" [placeholder]="'Ex.: Campo 1' | t"></label>
            <label><span>{{ 'Modalidade' | t }}</span><input type="text" maxlength="80" [(ngModel)]="c.sport" [placeholder]="'Ex.: Padel' | t"></label>
            <label><span>{{ 'Preço (€)' | t }}</span><input type="text" inputmode="decimal" maxlength="8" [(ngModel)]="c.price" placeholder="24"></label>
            <label><span>{{ 'Duração' | t }}</span>
              <select [(ngModel)]="c.slotMinutes">
                @for (m of durations; track m) { <option [ngValue]="m">{{ m }} min</option> }
              </select>
            </label>
            <label class="vm__check"><input type="checkbox" [(ngModel)]="c.active"> {{ 'Disponível' | t }}</label>
          </div>
        }
        <div class="vm__actions">
          <button type="button" class="jynlo-action jynlo-action--neutral" (click)="addCourt()">＋ {{ 'Adicionar campo' | t }}</button>
          <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="savingCourts" (click)="saveCourts()">
            {{ (savingCourts ? 'A guardar…' : 'Guardar campos') | t }}</button>
        </div>
        @if (courtsMessage) { <p class="vm__ok" role="status">{{ courtsMessage }}</p> }
        @if (courtsError) { <p class="vm__error" role="alert">{{ courtsError }}</p> }
      </section>

      <section class="vm__card" aria-labelledby="vm-hours">
        <h2 id="vm-hours">{{ 'Horário de funcionamento' | t }}</h2>
        <p class="vm__muted">{{ 'Os horários livres são criados a partir deste horário e da duração de cada campo.' | t }}</p>
        @for (d of week; track d.day) {
          <div class="vm__day">
            <strong>{{ weekday(d.day) | t }}</strong>
            @if (!d.ranges.length) { <span class="vm__muted">{{ 'Fechado' | t }}</span> }
            @for (r of d.ranges; track $index) {
              <span class="vm__range">
                <input type="time" [(ngModel)]="r.open" [attr.aria-label]="'Abre' | t">
                –
                <input type="time" [(ngModel)]="r.close" [attr.aria-label]="'Fecha' | t">
                <button type="button" class="vm__remove" (click)="removeRange(d, $index)" [attr.aria-label]="'Retirar período' | t">×</button>
              </span>
            }
            @if (d.ranges.length < 3) {
              <button type="button" class="vm__add" (click)="addRange(d)">＋ {{ 'Período' | t }}</button>
            }
          </div>
        }
        <div class="vm__actions">
          <button type="button" class="jynlo-action jynlo-action--neutral" (click)="copyMonday()">{{ 'Copiar segunda para todos os dias' | t }}</button>
          <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="savingHours" (click)="saveHours()">
            {{ (savingHours ? 'A guardar…' : 'Guardar horário') | t }}</button>
        </div>
        @if (hoursMessage) { <p class="vm__ok" role="status">{{ hoursMessage }}</p> }
        @if (hoursError) { <p class="vm__error" role="alert">{{ hoursError }}</p> }
      </section>
    </main>
  `,
  styles: [`
    .vm { max-width:900px; margin:0 auto; padding:1.5rem 1rem 4rem; display:grid; gap:1rem; color:#eafff9; }
    .vm__back { color:#7ae5c5; font-weight:700; text-decoration:none; min-height:44px; display:inline-flex; align-items:center; }
    .vm__kicker { color:#62e6c4; font-size:.78rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .vm__hero h1 { margin:.2rem 0 .4rem; font-size:1.9rem; }
    .vm__state { margin:0; color:#fcd34d; font-weight:700; }
    .vm__state.is-on { color:#7ae5c5; }
    .vm__card { display:grid; gap:.7rem; padding:1.1rem; border-radius:18px; border:1px solid rgba(96,176,182,.3); background:rgba(10,41,55,.65); }
    .vm__card h2 { margin:0; font-size:1.15rem; }
    .vm__muted { color:#b9d4d6; font-size:.88rem; margin:0; }
    .vm__request { display:grid; grid-template-columns:1fr auto; gap:.5rem; padding:.75rem 0; border-top:1px solid rgba(96,176,182,.2); }
    .vm__request-main { display:grid; gap:.2rem; }
    .vm__note { color:#dff7f1; font-style:italic; }
    .vm__chip { align-self:start; font-size:.75rem; font-weight:800; padding:.2rem .6rem; border-radius:999px; background:rgba(98,230,196,.15); color:#7ae5c5; }
    .vm__request[data-status=PENDING] .vm__chip { background:rgba(252,211,77,.15); color:#fcd34d; }
    .vm__request[data-status=DECLINED] .vm__chip, .vm__request[data-status=CANCELLED] .vm__chip { background:rgba(255,180,180,.12); color:#ffb4b4; }
    .vm__request .vm__actions { grid-column:1 / -1; }
    .vm__actions { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
    .vm__actions input { flex:1 1 200px; min-height:44px; }
    .vm__court { display:grid; grid-template-columns:2fr 1.5fr 1fr 1fr auto; gap:.5rem; align-items:end; }
    .vm__court label { display:grid; gap:.25rem; font-size:.78rem; font-weight:700; color:#bfe9df; }
    input, select { min-height:44px; padding:0 .7rem; border-radius:10px; border:1px solid rgba(63,216,180,.35); background:#0a3340;
      color:#effffb; font:inherit; color-scheme:dark; }
    .vm__check { display:flex !important; align-items:center; gap:.4rem; min-height:44px; }
    .vm__check input { min-height:auto; }
    .vm__day { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; padding:.45rem 0; border-top:1px solid rgba(96,176,182,.15); }
    .vm__day > strong { width:6.5rem; }
    .vm__range { display:inline-flex; align-items:center; gap:.3rem; }
    .vm__remove, .vm__add { min-height:44px; min-width:44px; border-radius:10px; border:1px solid rgba(96,176,182,.35); background:transparent;
      color:#dff7f1; font:inherit; font-weight:700; cursor:pointer; padding:0 .6rem; }
    .vm__ok { margin:0; color:#7ae5c5; font-weight:700; }
    .vm__error { margin:0; color:#ffb4b4; }
    @media (max-width:700px) { .vm__court { grid-template-columns:1fr 1fr; } }
  `]
})
export class VenueManageComponent implements OnInit {
  venueId = 0;
  venueName = '';
  offer: BookingOffer | null = null;
  requests: VenueBooking[] = [];
  notes: Record<number, string> = {};
  courts: CourtRow[] = [];
  week: DayRow[] = [];
  readonly durations = [30, 60, 90, 120];
  busy = false;
  savingCourts = false;
  savingHours = false;
  loadError = '';
  requestError = '';
  courtsMessage = '';
  courtsError = '';
  hoursMessage = '';
  hoursError = '';

  private readonly api = inject(VenueBookingService);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.venueId = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.applyOffer({ venueId: this.venueId, acceptsBookings: false, courts: [], hours: [] }, false);
    this.api.managed().subscribe({
      next: list => { this.venueName = list.find(v => v.venueId === this.venueId)?.name ?? ''; this.cdr.markForCheck(); },
      error: () => { /* name is optional */ }
    });
    this.api.managerOffer(this.venueId).subscribe({
      next: offer => this.applyOffer(offer, true),
      error: e => { this.loadError = bookingError(e, 'Não foi possível carregar a gestão do recinto.'); this.cdr.markForCheck(); }
    });
    this.loadRequests();
  }

  weekday(day: number): string { return WEEKDAYS[day - 1] ?? ''; }
  when(iso: string): string { return lisbonDateTime(iso); }
  time(iso: string): string { return lisbonTime(iso); }
  price(cents: number | null): string | null { return formatPrice(cents, currentLang()); }

  statusLabel(status: VenueBooking['status']): string {
    return t({ PENDING: 'Por responder', CONFIRMED: 'Confirmada', DECLINED: 'Recusada', CANCELLED: 'Cancelada' }[status]);
  }

  addCourt(): void {
    this.courts.push({ id: null, name: t('Campo {{n}}', { n: this.courts.length + 1 }), sport: '', price: '', slotMinutes: 60, active: true });
  }

  addRange(d: DayRow): void { d.ranges.push({ open: '09:00', close: '22:00' }); }
  removeRange(d: DayRow, index: number): void { d.ranges.splice(index, 1); }

  copyMonday(): void {
    const monday = this.week[0]?.ranges ?? [];
    for (const d of this.week.slice(1)) d.ranges = monday.map(r => ({ ...r }));
  }

  saveCourts(): void {
    const input = [];
    for (const c of this.courts) {
      const price = parsePrice(c.price);
      if (price === undefined) { this.courtsError = t('Indica o preço em euros, por exemplo 24 ou 24,50.'); return; }
      input.push({ id: c.id, name: c.name.trim(), sport: c.sport.trim() || null, priceCents: price, slotMinutes: c.slotMinutes, active: c.active });
    }
    this.savingCourts = true;
    this.courtsError = '';
    this.courtsMessage = '';
    this.api.saveCourts(this.venueId, input)
      .pipe(finalize(() => { this.savingCourts = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: offer => { this.applyOffer(offer, false); this.courtsMessage = t('Campos guardados.'); },
        error: e => { this.courtsError = bookingError(e, 'Não foi possível guardar os campos.'); }
      });
  }

  saveHours(): void {
    const input: BookingHours[] = [];
    for (const d of this.week) {
      for (const r of d.ranges) input.push({ dayOfWeek: d.day, openTime: r.open, closeTime: r.close });
    }
    this.savingHours = true;
    this.hoursError = '';
    this.hoursMessage = '';
    this.api.saveHours(this.venueId, input)
      .pipe(finalize(() => { this.savingHours = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: offer => { this.applyOffer(offer, true); this.hoursMessage = t('Horário guardado.'); },
        error: e => { this.hoursError = bookingError(e, 'Não foi possível guardar o horário.'); }
      });
  }

  decide(r: VenueBooking, confirm: boolean): void {
    if (this.busy) return;
    this.busy = true;
    this.requestError = '';
    const note = (this.notes[r.id] ?? '').trim() || null;
    (confirm ? this.api.confirm(r.id, note) : this.api.decline(r.id, note))
      .pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: updated => { this.requests = this.requests.map(x => x.id === updated.id ? updated : x); },
        error: e => { this.requestError = bookingError(e, 'Não foi possível responder ao pedido.'); }
      });
  }

  private loadRequests(): void {
    this.api.venueRequests(this.venueId).subscribe({
      next: list => { this.requests = list; this.cdr.markForCheck(); },
      error: e => { this.requestError = bookingError(e, 'Não foi possível carregar os pedidos.'); this.cdr.markForCheck(); }
    });
  }

  private applyOffer(offer: BookingOffer, withHours: boolean): void {
    this.offer = offer;
    this.courts = offer.courts.map(c => ({
      id: c.id, name: c.name, sport: c.sport ?? '', slotMinutes: c.slotMinutes, active: c.active,
      price: c.priceCents === null || c.priceCents === undefined ? '' : (c.priceCents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '')
    }));
    if (withHours || !this.week.length) {
      this.week = [1, 2, 3, 4, 5, 6, 7].map(day => ({
        day, ranges: offer.hours.filter(h => h.dayOfWeek === day).map(h => ({ open: h.openTime, close: h.closeTime }))
      }));
    }
    this.cdr.markForCheck();
  }
}

/** "24", "24,5" or "24.50" → cents; '' → null (price at the venue); invalid → undefined. */
export function parsePrice(value: string): number | null | undefined {
  const raw = (value ?? '').trim().replace('€', '').trim();
  if (!raw) return null;
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(raw)) return undefined;
  return Math.round(Number(raw.replace(',', '.')) * 100);
}
