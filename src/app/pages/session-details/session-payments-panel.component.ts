import { appTranslate } from '../../i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { OnlinePaymentStatus, SessionPayments, SessionPaymentService } from '../../services/session-payment.service';

/**
 * "Quem já pagou?" for a paid session. Players pay the organiser by MB WAY,
 * outside Jynlo; this panel shows where to pay and keeps the list.
 */
@Component({
  selector: 'app-session-payments-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <section class="session-payments" aria-labelledby="session-payments-title">
      <div class="session-payments__head">
        <h2 id="session-payments-title">💶 {{ 'payments.title' | t }}</h2>
        @if (data) {
          <span class="session-payments__count" role="status">
            {{ 'payments.confirmedCount' | t:{ done: data.confirmedCount, total: data.playerCount } }}
          </span>
        }
      </div>

      @if (loading && !data) {
        <p class="session-payments__muted">{{ 'payments.loading' | t }}</p>
      } @else if (data) {
        @if (data.organiser) {
          <div class="session-payments__setup" role="radiogroup" [attr.aria-label]="'payments.howLabel' | t">
            <span class="session-payments__label">{{ 'payments.howLabel' | t }}</span>
            <div class="session-payments__row">
              <button type="button" class="jynlo-action" role="radio" [attr.aria-checked]="methodDraft === 'MBWAY'"
                [class.jynlo-action--primary]="methodDraft === 'MBWAY'" [disabled]="busy" (click)="methodDraft = 'MBWAY'">
                📱 {{ 'payments.methodMbway' | t }}</button>
              <button type="button" class="jynlo-action" role="radio" [attr.aria-checked]="methodDraft === 'IN_PERSON'"
                [class.jynlo-action--primary]="methodDraft === 'IN_PERSON'" [disabled]="busy" (click)="chooseInPerson()">
                🤝 {{ 'payments.methodInPerson' | t }}</button>
              @if (online?.available) {
                <button type="button" class="jynlo-action" role="radio" [attr.aria-checked]="methodDraft === 'ONLINE'"
                  [class.jynlo-action--primary]="methodDraft === 'ONLINE'" [disabled]="busy" (click)="chooseOnline()">
                  {{ 'payments.methodOnline' | t }}</button>
              }
            </div>
            @if (methodDraft === 'ONLINE') {
              @if (online?.chargesEnabled) {
                <small class="session-payments__muted">{{ (data.method === 'ONLINE' ? 'payments.onlineChosen' : 'payments.onlineHint') | t }}</small>
              } @else {
                <small class="session-payments__muted">{{ 'payments.onlineHint' | t }}</small>
                <div class="session-payments__row">
                  <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="activateOnline()">
                    {{ 'payments.onlineActivate' | t }} ↗</button>
                </div>
                <small class="session-payments__muted">{{ 'payments.onlineActivateHint' | t }}</small>
              }
            }
            @if (methodDraft === 'MBWAY') {
              <label for="session-mbway-phone">{{ 'payments.mbwayLabel' | t }}</label>
              <div class="session-payments__row">
                <input id="session-mbway-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20"
                  [placeholder]="'payments.mbwayPlaceholder' | t" [(ngModel)]="phoneDraft" [disabled]="busy">
                <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy || !phoneDraft.trim()"
                  (click)="saveMbway()">{{ 'payments.save' | t }}</button>
              </div>
              <small class="session-payments__muted">{{ 'payments.mbwayHint' | t }}</small>
            }
          </div>
          @if (data.players.length === 0) {
            <p class="session-payments__muted">{{ 'payments.noPlayers' | t }}</p>
          } @else {
            <ul class="session-payments__list">
              @for (player of data.players; track player.username) {
                <li>
                  <span class="session-payments__name">{{ player.username }}</span>
                  <span class="session-payments__state" [class.is-paid]="player.confirmedAt" [class.is-claimed]="!player.confirmedAt && player.claimedAt">
                    {{ (player.confirmedAt ? 'payments.stateConfirmed' : player.claimedAt ? 'payments.stateClaimed' : 'payments.stateUnpaid') | t }}
                  </span>
                  <button type="button" class="jynlo-action" [class.jynlo-action--primary]="!player.confirmedAt" [disabled]="busy"
                    (click)="confirm(player.username, !player.confirmedAt)">
                    {{ (player.confirmedAt ? 'payments.undoConfirm' : 'payments.confirm') | t }}
                  </button>
                </li>
              }
            </ul>
            @if (data.method && data.confirmedCount < data.playerCount) {
              <div class="session-payments__row">
                <button type="button" class="jynlo-action" [disabled]="busy || reminderBlocked()" (click)="remind()">
                  🔔 {{ 'payments.remind' | t:{ count: data.playerCount - data.confirmedCount } }}</button>
                @if (reminderBlocked()) { <small class="session-payments__muted">{{ 'payments.remindedRecently' | t }}</small> }
              </div>
            }
          }
        } @else {
          @if (data.me?.confirmedAt) {
            <p class="session-payments__ok">✅ {{ 'payments.youConfirmed' | t }}</p>
          } @else {
            @if (data.method === 'ONLINE') {
              @if (checking) {
                <p class="session-payments__muted" role="status">⏳ {{ 'payments.onlineChecking' | t }}</p>
              } @else {
                @if (cancelled) { <p class="session-payments__muted">{{ 'payments.onlineCancelled' | t }}</p> }
                <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="payOnline()">
                  💳 {{ 'payments.payOnline' | t:{ amount: amountLabel() } }} ↗</button>
                <small class="session-payments__muted">{{ 'payments.payOnlineHint' | t }}</small>
              }
            } @else if (data.method === 'IN_PERSON') {
              <p>{{ 'payments.payInPerson' | t:{ amount: amountLabel() } }}</p>
            } @else if (data.mbwayPhone) {
              <p>{{ 'payments.payTo' | t:{ amount: amountLabel() } }}</p>
              @if (data.payee?.username || data.payee?.fullName) {
                <p class="session-payments__payee">
                  {{ 'payments.payeeIs' | t }}
                  <strong>{{ data.payee?.fullName || data.payee?.username }}</strong>
                  @if (data.payee?.username && data.payee?.fullName) { <span class="session-payments__muted"> · &#64;{{ data.payee?.username }}</span> }
                </p>
              }
              <div class="session-payments__row">
                <strong class="session-payments__phone">{{ phoneLabel(data.mbwayPhone) }}</strong>
                <button type="button" class="jynlo-action" (click)="copyPhone(data.mbwayPhone)">
                  {{ (copied ? 'payments.copied' : 'payments.copy') | t }}
                </button>
              </div>
            } @else {
              <p class="session-payments__muted">{{ 'payments.noMbway' | t }}</p>
            }
            @if (data.method === 'ONLINE') {
            } @else if (data.me?.claimedAt) {
              <p class="session-payments__muted">⏳ {{ 'payments.youClaimed' | t }}</p>
              <button type="button" class="jynlo-action" [disabled]="busy" (click)="claim(false)">{{ 'payments.undoClaim' | t }}</button>
            } @else {
              <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="claim(true)">{{ 'payments.claim' | t }}</button>
            }
          }
        }
        <small class="session-payments__muted">{{ 'payments.disclaimer' | t }}</small>
      }
      @if (error) { <p class="session-payments__error" role="alert">{{ error }}</p> }
    </section>`,
  styles: [`
    .session-payments{display:grid;gap:.7rem;padding:1rem 1.1rem;border-radius:18px;border:1px solid rgba(63,216,180,.28);background:rgba(7,40,49,.55);margin:1rem 0}
    .session-payments__head{display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap}
    .session-payments h2{margin:0;font-size:1.05rem}
    .session-payments__count{font-size:.85rem;font-weight:800;color:#6ff0d4}
    .session-payments__setup{display:grid;gap:.35rem}
    .session-payments__setup label,.session-payments__label{font-size:.85rem;font-weight:700}
    .session-payments__row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
    .session-payments__row input{flex:1 1 12rem;min-height:44px;padding:0 .8rem;border-radius:12px;border:1px solid rgba(63,216,180,.35);background:#0a3340;color:#effffb;font:inherit}
    .session-payments__list{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
    .session-payments__list li{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;padding:.5rem .6rem;border-radius:12px;background:rgba(255,255,255,.04)}
    .session-payments__name{flex:1 1 8rem;font-weight:700;overflow-wrap:anywhere}
    .session-payments__state{font-size:.8rem;opacity:.8}
    .session-payments__state.is-paid{color:#6ff0d4;opacity:1;font-weight:800}
    .session-payments__state.is-claimed{color:#ffd27a;opacity:1}
    .session-payments__phone{font-size:1.2rem;letter-spacing:.04em}
    .session-payments__muted{opacity:.75;font-size:.82rem;margin:0}
    .session-payments__ok{color:#6ff0d4;font-weight:800;margin:0}
    .session-payments__error{color:#ffb4a8;margin:0}
    .session-payments p{margin:0}
  `]
})
export class SessionPaymentsPanelComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) sessionId!: number;
  @Input() priceAmount: number | null = null;

  data: SessionPayments | null = null;
  loading = false;
  busy = false;
  error = '';
  copied = false;
  phoneDraft = '';
  methodDraft: 'MBWAY' | 'IN_PERSON' | 'ONLINE' | null = null;
  online: OnlinePaymentStatus | null = null;
  checking = false;
  cancelled = false;
  private polls: ReturnType<typeof setTimeout>[] = [];
  private load?: Subscription;
  private loadedId = 0;

  constructor(private readonly payments: SessionPaymentService, private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(_changes: SimpleChanges): void {
    if (!this.sessionId || this.sessionId === this.loadedId) return;
    this.loadedId = this.sessionId;
    this.data = null;
    this.loading = true;
    this.load?.unsubscribe();
    this.load = this.payments.get(this.sessionId).pipe(timeout(10000)).subscribe({
      next: data => { this.apply(data); this.afterReturn(data); },
      error: () => { this.loading = false; this.error = appTranslate('Não foi possível carregar os pagamentos.'); this.cdr.markForCheck(); }
    });
  }

  ngOnDestroy(): void { this.load?.unsubscribe(); this.polls.forEach(clearTimeout); }

  chooseOnline(): void {
    this.methodDraft = 'ONLINE';
    if (this.online?.chargesEnabled && this.data?.method !== 'ONLINE') this.run(this.payments.setMethod(this.sessionId, 'ONLINE', null));
  }

  /** Stripe's own form for the organiser's account; it sends them back to this game. */
  activateOnline(): void {
    if (this.busy) return;
    this.busy = true;
    this.payments.onlineOnboarding('/menu/events/' + this.sessionId).pipe(timeout(20000)).subscribe({
      next: link => { this.busy = false; if (link?.url?.startsWith('https://')) window.location.href = link.url; },
      error: failure => { this.busy = false; this.fail(failure); }
    });
  }

  payOnline(): void {
    if (this.busy) return;
    this.busy = true;
    this.cancelled = false;
    this.payments.checkout(this.sessionId).pipe(timeout(20000)).subscribe({
      next: link => { this.busy = false; if (link?.url?.startsWith('https://')) window.location.href = link.url; },
      error: failure => { this.busy = false; this.fail(failure); }
    });
  }

  /** Back from Stripe: the confirmation arrives a moment later, so check again a few times. */
  private afterReturn(data: SessionPayments): void {
    const result = new URLSearchParams(window.location.search).get('pagamento');
    if (result === 'cancelado') { this.cancelled = true; this.cdr.markForCheck(); return; }
    if (result !== 'ok' || data.organiser || data.me?.confirmedAt || data.method !== 'ONLINE') return;
    this.checking = true;
    for (const wait of [2000, 5000, 10000, 20000]) {
      this.polls.push(setTimeout(() => this.payments.get(this.sessionId).subscribe({
        next: fresh => { this.apply(fresh); if (fresh.me?.confirmedAt || wait === 20000) { this.checking = false; this.cdr.markForCheck(); } },
        error: () => { if (wait === 20000) { this.checking = false; this.cdr.markForCheck(); } }
      }), wait));
    }
  }

  private fail(failure: { error?: { message?: unknown; reason?: unknown } } | null): void {
    const message = failure?.error?.message || failure?.error?.reason;
    this.error = typeof message === 'string' && message.length < 200 ? message : appTranslate('Não foi possível guardar. Tenta outra vez.');
    this.cdr.markForCheck();
  }

  amountLabel(): string {
    const value = Number(this.data?.priceAmount ?? this.priceAmount ?? 0);
    return value.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  phoneLabel(phone: string): string {
    return /^\d{9}$/.test(phone) ? phone.slice(0, 3) + ' ' + phone.slice(3, 6) + ' ' + phone.slice(6) : phone;
  }

  copyPhone(phone: string): void {
    const done = () => { this.copied = true; this.cdr.markForCheck(); setTimeout(() => { this.copied = false; this.cdr.markForCheck(); }, 2000); };
    try { void navigator.clipboard?.writeText(phone).then(done, () => {}); } catch { /* clipboard unavailable */ }
  }

  saveMbway(): void { this.run(this.payments.setMethod(this.sessionId, 'MBWAY', this.phoneDraft.trim())); }
  chooseInPerson(): void {
    this.methodDraft = 'IN_PERSON';
    if (this.data?.method !== 'IN_PERSON') this.run(this.payments.setMethod(this.sessionId, 'IN_PERSON', null));
  }
  remind(): void { this.run(this.payments.remind(this.sessionId)); }
  reminderBlocked(): boolean {
    const last = this.data?.lastReminderAt ? Date.parse(this.data.lastReminderAt) : NaN;
    return Number.isFinite(last) && Date.now() - last < 12 * 3600_000;
  }
  claim(paid: boolean): void { this.run(this.payments.claim(this.sessionId, paid)); }
  confirm(username: string, paid: boolean): void { this.run(this.payments.confirm(this.sessionId, username, paid)); }

  private run(request: ReturnType<SessionPaymentService['get']>): void {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    request.pipe(timeout(10000)).subscribe({
      next: data => { this.busy = false; this.apply(data); },
      error: failure => {
        this.busy = false;
        const message = failure?.error?.message || failure?.error?.reason;
        this.error = typeof message === 'string' && message.length < 200 ? message : appTranslate('Não foi possível guardar. Tenta outra vez.');
        this.cdr.markForCheck();
      }
    });
  }

  private apply(data: SessionPayments): void {
    this.data = data;
    this.loading = false;
    if (data.organiser) {
      this.phoneDraft = data.mbwayPhone ? this.phoneLabel(data.mbwayPhone) : this.phoneDraft;
      this.methodDraft = data.method ?? this.methodDraft;
      if (!this.online) {
        this.payments.onlineStatus().pipe(timeout(10000)).subscribe({
          next: status => { this.online = status; this.cdr.markForCheck(); },
          error: () => { /* in-app payments simply stay hidden */ }
        });
      }
    }
    this.cdr.markForCheck();
  }
}
