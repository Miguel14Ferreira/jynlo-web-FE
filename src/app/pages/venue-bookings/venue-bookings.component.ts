import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ManagedVenue, VenueBooking, VenueBookingService, formatPrice, lisbonDateTime, lisbonTime } from '../../services/venue-booking.service';
import { bookingError, currentLang } from '../../shared/venue-jynlo-booking/venue-jynlo-booking.component';
import { createGameParams } from '../court-search/court-search.component';
import { phoneLabel } from '../../shared/tournament-payments-panel/tournament-payments-panel.component';

/** "As minhas reservas": court requests the person made and the venues they manage. */
@Component({
  selector: 'app-venue-bookings',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="vb">
      <header>
        <span class="vb__kicker">{{ 'Reservas de campos' | t }}</span>
        <h1>{{ 'As minhas reservas' | t }}</h1>
        <p class="vb__muted">{{ 'Pedidos feitos na Jynlo. Recintos com o selo “Aceita reservas na Jynlo” confirmam aqui.' | t }}</p>
      </header>

      @if (managed.length) {
        <section class="vb__card" aria-labelledby="vb-managed">
          <h2 id="vb-managed">{{ 'Recintos que geres' | t }}</h2>
          @for (v of managed; track v.venueId) {
            <a class="vb__venue" [routerLink]="['/menu/venues', v.venueId, 'manage']">
              <span><strong>{{ v.name }}</strong>@if (v.city) { <span class="vb__muted"> · {{ v.city }}</span> }</span>
              <span class="vb__chip" [class.is-alert]="v.pendingRequests > 0">
                {{ (v.pendingRequests === 1 ? '1 pedido por responder' : '{{n}} pedidos por responder') | t:{ n: v.pendingRequests } }}</span>
            </a>
          }
        </section>
      }

      <section class="vb__card" aria-labelledby="vb-mine">
        <h2 id="vb-mine">{{ 'Os meus pedidos' | t }}</h2>
        @if (loading) { <p class="vb__muted" role="status">{{ 'A carregar…' | t }}</p> }
        @if (!loading && !bookings.length) {
          @if (bookingsOpen) {
            <p class="vb__muted">{{ 'Ainda não pediste nenhuma reserva. Vê os horários livres em “Reservar campo”.' | t }}</p>
            <a class="jynlo-action jynlo-action--primary" routerLink="/menu/book-court">{{ 'Reservar campo' | t }}</a>
          } @else {
            <p class="vb__muted">{{ 'Ainda não pediste nenhuma reserva. Procura um recinto com o selo “Aceita reservas na Jynlo”.' | t }}</p>
            <a class="jynlo-action jynlo-action--primary" routerLink="/menu/venues">{{ 'Ver recintos' | t }}</a>
          }
        }
        @for (b of bookings; track b.id) {
          <article class="vb__booking" [attr.data-status]="b.status">
            <div class="vb__main">
              <a [routerLink]="['/menu/venues', b.venueId]"><strong>{{ b.venueName }}</strong></a>
              <span>{{ when(b.startAt) }}–{{ time(b.endAt) }} · {{ b.courtName }}@if (price(b.priceCents); as p) { · {{ p }} }</span>
              @if (b.ownerNote) { <span class="vb__note">{{ 'Recinto' | t }}: “{{ b.ownerNote }}”</span> }
            </div>
            <span class="vb__chip">{{ statusLabel(b.status) }}</span>
            @if (b.status === 'CONFIRMED') {
              <div class="vb__pay">
                @if (b.paidConfirmedAt) {
                  <span class="vb__ok">✅ {{ 'O recinto confirmou o teu pagamento.' | t }}</span>
                } @else {
                  @if (b.paymentMethod === 'ONLINE') {
                    @if (confirming === b.id) {
                      <span class="vb__muted" role="status">⏳ {{ 'A confirmar o pagamento…' | t }}</span>
                    } @else {
                      <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="pay(b)">
                        {{ 'Pagar agora (MB WAY ou cartão)' | t }}@if (price(b.priceCents); as p) { · {{ p }} }</button>
                      <span class="vb__muted">{{ 'Fica pago automaticamente, sem teres de avisar o recinto.' | t }}</span>
                    }
                  } @else {
                    @if (b.paymentMethod === 'MBWAY' && b.mbwayPhone) {
                      <span>{{ 'Paga por MB WAY ao recinto:' | t }} <strong>{{ phone(b.mbwayPhone) }}</strong>@if (price(b.priceCents); as p) { · {{ p }} }</span>
                      <button type="button" class="jynlo-action" (click)="copy(b)">{{ (copied === b.id ? 'payments.copied' : 'payments.copy') | t }}</button>
                    } @else {
                      <span class="vb__muted">{{ 'Pagas no recinto.' | t }}</span>
                    }
                    @if (b.paidClaimedAt) {
                      <span class="vb__muted">⏳ {{ 'Disseste que já pagaste. Falta o recinto confirmar.' | t }}</span>
                      <button type="button" class="jynlo-action" [disabled]="busy" (click)="markPaid(b, false)">{{ 'payments.undoClaim' | t }}</button>
                    } @else if (askPaid === b.id) {
                      <span class="vb__ask" role="status">{{ 'payments.askPaid' | t:{ amount: price(b.priceCents) ?? '' } }}</span>
                      <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="markPaid(b, true)">{{ 'payments.askPaidYes' | t }}</button>
                      <button type="button" class="jynlo-action" (click)="askPaid = 0">{{ 'payments.askPaidNo' | t }}</button>
                    } @else {
                      <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="markPaid(b, true)">{{ 'payments.claim' | t }}</button>
                    }
                  }
                }
              </div>
            }
            @if (canCancel(b) && !b.sessionId) {
              <a class="jynlo-action jynlo-action--primary" routerLink="/menu/createEvent" [queryParams]="gameParams(b)">{{ 'Criar jogo neste campo' | t }}</a>
            }
            @if (b.sessionId) {
              <a class="jynlo-action" [routerLink]="['/menu/events', b.sessionId]">{{ 'Ver o jogo' | t }}</a>
            }
            @if (canCancel(b)) {
              <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy" (click)="cancel(b)">{{ 'Cancelar pedido' | t }}</button>
            }
          </article>
        }
        @if (error) { <p class="vb__error" role="alert">{{ error }}</p> }
      </section>
    </main>
  `,
  styles: [`
    :host { display:block; min-height:100vh; background:radial-gradient(circle at top right, rgba(99,102,241,.13), transparent 34rem), linear-gradient(145deg, #07111f, #102f46); }
    .vb { max-width:860px; margin:0 auto; padding:6.4rem 1rem 4rem; display:grid; gap:1rem; color:#eafff9; }
    .vb h1 { margin:.2rem 0 .4rem; font-size:1.9rem; }
    .vb__kicker { color:#62e6c4; font-size:.78rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
    .vb__muted { color:#b9d4d6; font-size:.88rem; margin:0; }
    .vb__card { display:grid; gap:.7rem; padding:1.1rem; border-radius:18px; border:1px solid rgba(96,176,182,.3); background:rgba(10,41,55,.65); }
    .vb__card h2 { margin:0; font-size:1.15rem; }
    .vb__venue { display:flex; justify-content:space-between; align-items:center; gap:.6rem; min-height:44px; color:inherit; text-decoration:none;
      padding:.5rem 0; border-top:1px solid rgba(96,176,182,.2); }
    .vb__booking { display:grid; grid-template-columns:1fr auto; gap:.5rem; align-items:center; padding:.7rem 0; border-top:1px solid rgba(96,176,182,.2); }
    .vb__booking > button, .vb__booking > a.jynlo-action { grid-column:1 / -1; justify-self:start; }
    .vb__main { display:grid; gap:.2rem; }
    .vb__main a { color:#eafff9; }
    .vb__note { color:#dff7f1; font-style:italic; }
    .vb__chip { font-size:.75rem; font-weight:800; padding:.2rem .6rem; border-radius:999px; background:rgba(98,230,196,.15); color:#7ae5c5; white-space:nowrap; }
    .vb__chip.is-alert, .vb__booking[data-status=PENDING] .vb__chip { background:rgba(252,211,77,.15); color:#fcd34d; }
    .vb__booking[data-status=DECLINED] .vb__chip, .vb__booking[data-status=CANCELLED] .vb__chip { background:rgba(255,180,180,.12); color:#ffb4b4; }
    .vb__error { margin:0; color:#ffb4b4; }
    .vb__pay { grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; }
    .vb__ok { color:#7ae5c5; font-weight:800; }
    .vb__ask { font-weight:700; color:#fde68a; }
  `]
})
export class VenueBookingsComponent implements OnInit {
  bookings: VenueBooking[] = [];
  managed: ManagedVenue[] = [];
  loading = true;
  busy = false;
  error = '';
  copied = 0;
  /** Booking whose MB WAY number was just copied: ask "Já pagaste?" instead of a plain button. */
  askPaid = 0;
  /** Booking paid online that we are waiting on Stripe to confirm. */
  confirming = 0;

  private readonly api = inject(VenueBookingService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);

  bookingsOpen = false;

  ngOnInit(): void {
    this.api.accepting().subscribe(ids => { this.bookingsOpen = ids.length > 0; this.cdr.markForCheck(); });
    this.load();
    if (this.route.snapshot.queryParamMap.get('pagamento') === 'ok') this.waitForOnlinePayment(0);
    this.api.managed().subscribe({
      next: list => { this.managed = list; this.cdr.markForCheck(); },
      error: () => { /* optional section */ }
    });
  }

  private load(): void {
    this.api.mine().pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({
      next: list => { this.bookings = list; },
      error: e => { this.error = bookingError(e, 'Não foi possível carregar as tuas reservas.'); }
    });
  }

  /** Back from Stripe: the webhook may take a few seconds, so look again a handful of times. */
  private waitForOnlinePayment(attempt: number): void {
    const unpaid = this.bookings.find(b => b.status === 'CONFIRMED' && b.paymentMethod === 'ONLINE' && !b.paidConfirmedAt);
    if (attempt > 0 && this.bookings.length && !unpaid) { this.confirming = 0; this.cdr.markForCheck(); return; }
    if (attempt >= 6) { this.confirming = 0; this.cdr.markForCheck(); return; }
    this.confirming = unpaid?.id ?? -1;
    setTimeout(() => {
      this.api.mine().subscribe({
        next: list => { this.bookings = list; this.cdr.markForCheck(); this.waitForOnlinePayment(attempt + 1); },
        error: () => this.waitForOnlinePayment(attempt + 1)
      });
    }, 2500);
  }

  pay(b: VenueBooking): void {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.api.checkout(b.id).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); })).subscribe({
      next: link => { if (link?.url?.startsWith('https://')) window.location.href = link.url; },
      error: e => { this.error = bookingError(e, 'Não foi possível abrir o pagamento. Tenta outra vez.'); }
    });
  }

  when(iso: string): string { return lisbonDateTime(iso); }
  time(iso: string): string { return lisbonTime(iso); }
  price(cents: number | null): string | null { return formatPrice(cents, currentLang()); }

  statusLabel(status: VenueBooking['status']): string {
    return t({ PENDING: 'À espera do recinto', CONFIRMED: 'Confirmada', DECLINED: 'Recusada', CANCELLED: 'Cancelada' }[status]);
  }

  gameParams(b: VenueBooking): Record<string, string | number> { return createGameParams(b, null); }

  phone(value: string): string { return phoneLabel(value); }

  copy(b: VenueBooking): void {
    const phone = b.mbwayPhone;
    if (!phone) return;
    const id = b.id;
    this.askPaid = id;
    try {
      void navigator.clipboard?.writeText(phone).then(() => {
        this.copied = id; this.cdr.markForCheck();
        setTimeout(() => { this.copied = 0; this.cdr.markForCheck(); }, 2000);
      }, () => {});
    } catch { /* clipboard unavailable */ }
  }

  markPaid(b: VenueBooking, paid: boolean): void {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.api.markPaid(b.id, paid).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); })).subscribe({
      next: updated => { this.askPaid = 0; this.bookings = this.bookings.map(x => x.id === updated.id ? updated : x); },
      error: e => { this.error = bookingError(e, 'Não foi possível guardar. Tenta outra vez.'); }
    });
  }

  canCancel(b: VenueBooking): boolean {
    return (b.status === 'PENDING' || b.status === 'CONFIRMED') && new Date(b.startAt).getTime() > Date.now();
  }

  cancel(b: VenueBooking): void {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.api.cancel(b.id).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); })).subscribe({
      next: updated => { this.bookings = this.bookings.map(x => x.id === updated.id ? updated : x); },
      error: e => { this.error = bookingError(e, 'Não foi possível cancelar. Tenta novamente.'); }
    });
  }
}
