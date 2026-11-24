import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { AuthenticationService } from '../../services/authethication.service';
import {
  BookingSlot, CourtSlots, VenueAvailability, VenueBooking, VenueBookingService,
  formatPrice, lisbonTime, nextLisbonDays,
} from '../../services/venue-booking.service';
import { bookingError, currentLang } from '../../shared/venue-jynlo-booking/venue-jynlo-booking.component';

export const COURT_SPORTS = ['Padel', 'Ténis', 'Futebol', 'Futsal', 'Basquetebol', 'Voleibol', 'Badminton', 'Squash', 'Pickleball'];

/** "YYYY-MM-DDTHH:mm" in Lisbon, the format the game creation form takes as ?when=. */
export function lisbonLocalDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Lisbon',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Query params that open game creation at the booked venue and time, linked to the booking. */
export function createGameParams(b: Pick<VenueBooking, 'id' | 'venueId' | 'startAt'>, sport: string | null): Record<string, string | number> {
  const params: Record<string, string | number> = { venue: b.venueId, booking: b.id, when: lisbonLocalDateTime(b.startAt) };
  const known = COURT_SPORTS.find(s => s.toLocaleLowerCase('pt') === (sport || '').trim().toLocaleLowerCase('pt'));
  if (known) params['sport'] = known;
  return params;
}

interface PickedSlot { venue: VenueAvailability; court: CourtSlots; slot: BookingSlot; }

/** "Reservar campo": free slots across every venue that takes Jynlo bookings. */
@Component({
  selector: 'app-court-search',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="cs">
      <header>
        <span class="cs__kicker">{{ 'Reservas de campos' | t }}</span>
        <h1>{{ 'Reservar campo' | t }}</h1>
        <p class="cs__muted">{{ 'Escolhe a modalidade, o dia e a zona. Vês os horários livres dos recintos que aceitam reservas na Jynlo.' | t }}</p>
      </header>

      <section class="cs__card cs__filters" [attr.aria-label]="'Filtros' | t">
        <label>{{ 'Modalidade' | t }}
          <select [(ngModel)]="sport" (ngModelChange)="search()">
            <option value="">{{ 'Todas' | t }}</option>
            @for (s of sports; track s) { <option [value]="s">{{ s | t }}</option> }
          </select>
        </label>
        <label>{{ 'Zona' | t }}
          <input type="search" [(ngModel)]="place" (keyup.enter)="search()" (blur)="search()" maxlength="80"
                 [placeholder]="'Cidade ou distrito' | t">
        </label>
        <label>{{ 'A partir das' | t }}
          <select [(ngModel)]="from" (ngModelChange)="search()">
            <option value="">{{ 'Qualquer hora' | t }}</option>
            @for (h of hours; track h) { <option [value]="h">{{ h }}</option> }
          </select>
        </label>
        <div class="cs__days" role="group" [attr.aria-label]="'Dia' | t">
          @for (d of days; track d) {
            <button type="button" class="cs__day" [class.is-active]="d === date" [attr.aria-pressed]="d === date" (click)="pickDay(d)">{{ dayLabel(d) }}</button>
          }
        </div>
      </section>

      @if (done) {
        <section class="cs__card cs__done" role="status">
          <strong>✅ {{ 'Pedido enviado!' | t }}</strong>
          <span>{{ 'O recinto vai confirmar. Avisamos-te nas notificações.' | t }}</span>
          <div class="cs__actions">
            <a class="jynlo-action jynlo-action--primary" routerLink="/menu/createEvent" [queryParams]="gameParams(done)">{{ 'Criar jogo neste campo' | t }}</a>
            <a class="jynlo-action" routerLink="/menu/venue-bookings">{{ 'As minhas reservas' | t }}</a>
          </div>
          <span class="cs__muted">{{ 'Cria o jogo para convidar jogadores: ele fica ligado a esta reserva.' | t }}</span>
        </section>
      }

      @if (loading) { <p class="cs__muted" role="status">{{ 'A procurar horários…' | t }}</p> }
      @if (error) { <p class="cs__error" role="alert">{{ error }}</p> }

      @if (!loading && !error && !results.length) {
        <section class="cs__card">
          <strong>{{ 'Ainda não há horários livres com estes filtros.' | t }}</strong>
          <p class="cs__muted">{{ 'Experimenta outro dia ou outra zona. Os recintos estão a juntar-se à Jynlo aos poucos.' | t }}</p>
          <p class="cs__muted">{{ 'Geres um recinto? Abre a página dele na Jynlo e ativa as reservas: é grátis.' | t }}</p>
          <a class="jynlo-action" routerLink="/menu/venues">{{ 'Ver recintos' | t }}</a>
        </section>
      }

      @for (v of results; track v.venueId) {
        <article class="cs__card cs__venue">
          <div class="cs__venue-head">
            <a [routerLink]="[loggedIn ? '/menu/venues' : '/venues', v.venueId]"><strong>{{ v.name }}</strong></a>
            <span class="cs__muted">{{ v.city }}@if (v.paymentMethod === 'MBWAY') { · {{ 'Aceita MB WAY' | t }} }</span>
          </div>
          @for (c of v.courts; track c.courtId) {
            <div class="cs__court">
              <span class="cs__court-name">{{ c.name }}@if (c.sport) { · {{ c.sport }} }@if (price(c.priceCents); as p) { · {{ p }} }</span>
              <div class="cs__slots">
                @for (s of c.slots; track s.start) {
                  <button type="button" class="cs__slot" [class.is-active]="isPicked(v, c, s)" (click)="pick(v, c, s)">{{ time(s.start) }}</button>
                }
              </div>
              @if (picked && picked.venue.venueId === v.venueId && picked.court.courtId === c.courtId) {
                <div class="cs__confirm">
                  <span><strong>{{ c.name }}</strong> · {{ dayLabel(date) }}, {{ time(picked.slot.start) }}–{{ time(picked.slot.end) }}@if (price(c.priceCents); as p) { · {{ p }} }</span>
                  @if (loggedIn) {
                    <input type="text" [(ngModel)]="note" maxlength="300" [placeholder]="'Mensagem para o recinto (opcional)' | t">
                    <div class="cs__actions">
                      <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="request()">{{ busy ? ('A enviar…' | t) : ('Pedir reserva' | t) }}</button>
                      <button type="button" class="jynlo-action jynlo-action--neutral" (click)="picked = null">{{ 'Cancelar' | t }}</button>
                    </div>
                    <span class="cs__muted">{{ v.paymentMethod === 'MBWAY' ? ('Depois de o recinto confirmar, pagas por MB WAY.' | t) : ('Pagas no recinto.' | t) }}</span>
                  } @else {
                    <a class="jynlo-action jynlo-action--primary" routerLink="/login">{{ 'Entra para pedir a reserva' | t }}</a>
                  }
                </div>
              }
            </div>
          }
        </article>
      }
    </main>
  `,
  styles: [`
    .cs { max-width:900px; margin:0 auto; padding:6.4rem 1rem 4rem; display:grid; gap:1rem; color:#eafff9; }
    .cs h1 { margin:.2rem 0 .4rem; font-size:1.9rem; }
    .cs__kicker { color:#62e6c4; font-size:.78rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .cs__muted { color:#b9d4d6; font-size:.88rem; margin:0; }
    .cs__error { margin:0; color:#ffb4b4; }
    .cs__card { display:grid; gap:.7rem; padding:1.1rem; border-radius:18px; border:1px solid rgba(96,176,182,.3); background:rgba(10,41,55,.65); }
    .cs__filters { grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); align-items:end; }
    .cs__filters label { display:grid; gap:.3rem; font-size:.82rem; font-weight:700; color:#b9d4d6; }
    .cs__filters select, .cs__filters input, .cs__confirm input { min-height:44px; border-radius:12px; border:1px solid rgba(96,176,182,.4);
      background:rgba(4,24,33,.8); color:#eafff9; padding:0 .7rem; font:inherit; width:100%; box-sizing:border-box; min-width:0; }
    .cs__days { grid-column:1 / -1; display:flex; gap:.4rem; overflow-x:auto; padding-bottom:.2rem; }
    .cs__day, .cs__slot { min-height:40px; padding:0 .8rem; border-radius:999px; border:1px solid rgba(96,176,182,.4);
      background:transparent; color:#eafff9; font:inherit; font-weight:700; cursor:pointer; white-space:nowrap; }
    .cs__day.is-active, .cs__slot.is-active { background:#62e6c4; color:#04212b; border-color:#62e6c4; }
    .cs__venue-head { display:grid; gap:.15rem; }
    .cs__venue-head a { color:#eafff9; font-size:1.08rem; }
    .cs__court { display:grid; gap:.45rem; padding-top:.6rem; border-top:1px solid rgba(96,176,182,.2); }
    .cs__court-name { font-weight:700; }
    .cs__slots { display:flex; flex-wrap:wrap; gap:.4rem; }
    .cs__confirm { display:grid; gap:.5rem; padding:.8rem; border-radius:14px; background:rgba(98,230,196,.08); }
    .cs__actions { display:flex; flex-wrap:wrap; gap:.5rem; }
    .cs__done { border-color:rgba(98,230,196,.6); }
  `]
})
export class CourtSearchComponent implements OnInit {
  readonly sports = COURT_SPORTS;
  readonly hours = Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, '0') + ':00');
  readonly days = nextLisbonDays(14);
  date = this.days[0] ?? '';
  sport = '';
  place = '';
  from = '';
  note = '';
  results: VenueAvailability[] = [];
  picked: PickedSlot | null = null;
  done: VenueBooking | null = null;
  doneSport: string | null = null;
  loading = false;
  busy = false;
  error = '';
  loggedIn = false;

  private readonly api = inject(VenueBookingService);
  private readonly auth = inject(AuthenticationService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);
  private lastQuery = '';
  private version = 0;

  ngOnInit(): void {
    try { this.loggedIn = !!this.auth?.isLoggedIn(); } catch { this.loggedIn = false; }
    this.search(true);
  }

  search(force = false): void {
    const query = [this.date, this.sport, this.place.trim(), this.from].join('|');
    if (!force && query === this.lastQuery) return;
    this.lastQuery = query;
    const version = ++this.version;
    this.loading = true;
    this.error = '';
    this.picked = null;
    this.api.search(this.date, this.sport, this.place, this.from, '').pipe(finalize(() => {
      if (version === this.version) { this.loading = false; this.cdr.markForCheck(); }
    })).subscribe({
      next: list => { if (version === this.version) this.results = list; },
      error: e => { if (version === this.version) { this.results = []; this.error = bookingError(e, 'Não foi possível carregar os horários.'); } }
    });
  }

  pickDay(day: string): void { this.date = day; this.search(); }

  pick(venue: VenueAvailability, court: CourtSlots, slot: BookingSlot): void {
    this.picked = { venue, court, slot };
    this.done = null;
    this.error = '';
  }

  isPicked(v: VenueAvailability, c: CourtSlots, s: BookingSlot): boolean {
    return !!this.picked && this.picked.venue.venueId === v.venueId && this.picked.court.courtId === c.courtId
      && this.picked.slot.start === s.start;
  }

  request(): void {
    const p = this.picked;
    if (!p || this.busy) return;
    this.busy = true;
    this.error = '';
    this.api.request(p.venue.venueId, p.court.courtId, p.slot.start, this.note.trim() || null, null)
      .pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: booking => {
          this.done = booking;
          this.doneSport = p.court.sport || this.sport || null;
          this.picked = null;
          this.note = '';
          this.results = this.results.map(v => v.venueId !== p.venue.venueId ? v : {
            ...v, courts: v.courts.map(c => c.courtId !== p.court.courtId ? c : { ...c, slots: c.slots.filter(s => s.start !== p.slot.start) })
              .filter(c => c.slots.length),
          }).filter(v => v.courts.length);
          try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* not in a browser */ }
        },
        error: e => { this.error = bookingError(e, 'Não foi possível enviar o pedido. Tenta outra vez.'); }
      });
  }

  gameParams(b: VenueBooking): Record<string, string | number> { return createGameParams(b, this.doneSport); }
  time(iso: string): string { return lisbonTime(iso); }
  price(cents: number | null): string | null { return formatPrice(cents, currentLang()); }

  dayLabel(day: string): string {
    if (day === this.days[0]) return t('Hoje');
    if (day === this.days[1]) return t('Amanhã');
    const d = new Date(day + 'T12:00:00Z');
    return new Intl.DateTimeFormat(currentLang() === 'en' ? 'en-GB' : 'pt-PT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
  }
}
