import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, timeout } from 'rxjs';
import { environment } from 'src/environment/environment';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { parsePrice } from '../../pages/venue-manage/venue-manage.component';
import { bookingError, currentLang } from '../venue-jynlo-booking/venue-jynlo-booking.component';
import { formatPrice } from '../../services/venue-booking.service';

export interface TournamentPayments {
  entryFeeCents: number | null; method: 'MBWAY' | 'IN_PERSON' | null; mbwayPhone: string | null;
  organiser: boolean; participant: boolean; mine: { claimedAt: string | null; confirmedAt: string | null } | null;
  confirmedCount: number; playerCount: number;
  players: { username: string; fullName: string | null; claimedAt: string | null; confirmedAt: string | null }[];
}

export function phoneLabel(phone: string): string {
  return /^\d{9}$/.test(phone) ? phone.slice(0, 3) + ' ' + phone.slice(3, 6) + ' ' + phone.slice(6) : phone;
}

/** Tournament entry fee: organisers choose MB WAY to their number or in person; players mark it paid. */
@Component({
  selector: 'app-tournament-payments-panel',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data && (data.organiser || data.method)) {
      <section class="tpp" aria-labelledby="tpp-title">
        <div class="tpp__head">
          <h2 id="tpp-title">💶 {{ 'Inscrição' | t }}@if (fee(); as f) { · {{ f }} }</h2>
          @if (data.method && data.playerCount) {
            <span class="tpp__count" role="status">{{ 'payments.confirmedCount' | t:{ done: data.confirmedCount, total: data.playerCount } }}</span>
          }
        </div>
        @if (data.organiser) {
          <div class="tpp__setup">
            <label for="tpp-fee">{{ 'Valor da inscrição por jogador (€)' | t }}</label>
            <input id="tpp-fee" type="text" inputmode="decimal" maxlength="8" placeholder="10" [(ngModel)]="feeDraft" [disabled]="busy">
            <span class="tpp__label">{{ 'Como se paga a inscrição?' | t }}</span>
            <div class="tpp__row" role="radiogroup" [attr.aria-label]="'Como se paga a inscrição?' | t">
              <button type="button" class="jynlo-action" role="radio" [attr.aria-checked]="methodDraft === 'MBWAY'"
                [class.jynlo-action--primary]="methodDraft === 'MBWAY'" [disabled]="busy" (click)="methodDraft = 'MBWAY'">📱 {{ 'payments.methodMbway' | t }}</button>
              <button type="button" class="jynlo-action" role="radio" [attr.aria-checked]="methodDraft === 'IN_PERSON'"
                [class.jynlo-action--primary]="methodDraft === 'IN_PERSON'" [disabled]="busy" (click)="methodDraft = 'IN_PERSON'">🤝 {{ 'No local' | t }}</button>
            </div>
            @if (methodDraft === 'MBWAY') {
              <label for="tpp-phone">{{ 'payments.mbwayLabel' | t }}</label>
              <input id="tpp-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20"
                [placeholder]="'payments.mbwayPlaceholder' | t" [(ngModel)]="phoneDraft" [disabled]="busy">
              <small class="tpp__muted">{{ 'Só os jogadores inscritos no torneio veem este número.' | t }}</small>
            }
            <div class="tpp__row">
              <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy || !methodDraft" (click)="save()">{{ 'payments.save' | t }}</button>
              @if (data.method) {
                <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy" (click)="clear()">{{ 'Sem inscrição paga' | t }}</button>
              }
            </div>
          </div>
          @if (data.method) {
            @if (!data.players.length) {
              <p class="tpp__muted">{{ 'Ainda não há jogadores inscritos.' | t }}</p>
            } @else {
              <ul class="tpp__list">
                @for (p of data.players; track p.username) {
                  <li>
                    <span class="tpp__name">{{ p.fullName || p.username }}</span>
                    <span class="tpp__state" [class.is-paid]="p.confirmedAt" [class.is-claimed]="!p.confirmedAt && p.claimedAt">
                      {{ (p.confirmedAt ? 'payments.stateConfirmed' : p.claimedAt ? 'payments.stateClaimed' : 'payments.stateUnpaid') | t }}</span>
                    <button type="button" class="jynlo-action" [class.jynlo-action--primary]="!p.confirmedAt" [disabled]="busy"
                      (click)="confirm(p.username, !p.confirmedAt)">{{ (p.confirmedAt ? 'payments.undoConfirm' : 'payments.confirm') | t }}</button>
                  </li>
                }
              </ul>
            }
          }
        } @else if (data.participant) {
          @if (data.mine?.confirmedAt) {
            <p class="tpp__ok">✅ {{ 'O organizador confirmou o teu pagamento.' | t }}</p>
          } @else {
            @if (data.method === 'MBWAY' && data.mbwayPhone) {
              <p>{{ 'Paga a inscrição por MB WAY ao organizador:' | t }}</p>
              <div class="tpp__row">
                <strong class="tpp__phone">{{ phone(data.mbwayPhone) }}</strong>
                <button type="button" class="jynlo-action" (click)="copy(data.mbwayPhone)">{{ (copied ? 'payments.copied' : 'payments.copy') | t }}</button>
              </div>
            } @else {
              <p>{{ 'Paga a inscrição ao organizador, no local.' | t }}</p>
            }
            @if (data.mine?.claimedAt) {
              <p class="tpp__muted">⏳ {{ 'payments.youClaimed' | t }}</p>
              <button type="button" class="jynlo-action" [disabled]="busy" (click)="claim(false)">{{ 'payments.undoClaim' | t }}</button>
            } @else {
              <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="claim(true)">{{ 'payments.claim' | t }}</button>
            }
          }
        } @else {
          <p class="tpp__muted">{{ (data.method === 'MBWAY' ? 'Paga-se por MB WAY ao organizador depois de te inscreveres.' : 'Paga-se ao organizador, no local.') | t }}</p>
        }
        <small class="tpp__muted">{{ 'O pagamento é feito diretamente ao organizador. A Jynlo não recebe nem guarda dinheiro.' | t }}</small>
        @if (error) { <p class="tpp__error" role="alert">{{ error }}</p> }
      </section>
    }
  `,
  styles: [`
    .tpp{display:grid;gap:.7rem;padding:1rem 1.1rem;border-radius:18px;border:1px solid rgba(63,216,180,.28);background:rgba(7,40,49,.55);margin:1rem 0}
    .tpp__head{display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap}
    .tpp h2{margin:0;font-size:1.05rem}
    .tpp__count{font-size:.85rem;font-weight:800;color:#6ff0d4}
    .tpp__setup{display:grid;gap:.4rem}
    .tpp__setup label,.tpp__label{font-size:.85rem;font-weight:700}
    .tpp__setup input{min-height:44px;padding:0 .8rem;border-radius:12px;border:1px solid rgba(63,216,180,.35);background:#0a3340;color:#effffb;font:inherit;max-width:20rem}
    .tpp__row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
    .tpp__list{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
    .tpp__list li{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;padding:.5rem .6rem;border-radius:12px;background:rgba(255,255,255,.04)}
    .tpp__name{flex:1 1 8rem;font-weight:700;overflow-wrap:anywhere}
    .tpp__state{font-size:.8rem;opacity:.8}
    .tpp__state.is-paid{color:#6ff0d4;opacity:1;font-weight:800}
    .tpp__state.is-claimed{color:#ffd27a;opacity:1}
    .tpp__phone{font-size:1.2rem;letter-spacing:.04em}
    .tpp__muted{opacity:.75;font-size:.82rem;margin:0}
    .tpp__ok{color:#6ff0d4;font-weight:800;margin:0}
    .tpp__error{color:#ffb4a8;margin:0}
    .tpp p{margin:0}
  `]
})
export class TournamentPaymentsPanelComponent implements OnChanges, OnDestroy {
  @Input() communityId: number | null = null;
  @Input() tournamentId: number | null = null;

  data: TournamentPayments | null = null;
  busy = false;
  error = '';
  copied = false;
  feeDraft = '';
  phoneDraft = '';
  methodDraft: 'MBWAY' | 'IN_PERSON' | null = null;

  // Optional so pages that embed the panel keep working in tests without HttpClient.
  private readonly http = inject(HttpClient, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);
  private load?: Subscription;

  private get base(): string {
    return `${environment.apiUrl}/api/communities/${this.communityId}/tournaments/${this.tournamentId}/payments`;
  }

  ngOnChanges(): void {
    this.load?.unsubscribe();
    this.data = null;
    this.error = '';
    if (!this.http || !this.communityId || !this.tournamentId) return;
    this.load = this.http.get<TournamentPayments>(this.base).pipe(timeout(10000)).subscribe({
      next: data => this.apply(data),
      error: () => { /* optional panel: hidden when it cannot load */ }
    });
  }

  ngOnDestroy(): void { this.load?.unsubscribe(); }

  fee(): string | null { return formatPrice(this.data?.entryFeeCents, currentLang()); }
  phone(value: string): string { return phoneLabel(value); }

  copy(phone: string): void {
    const done = () => { this.copied = true; this.cdr.markForCheck(); setTimeout(() => { this.copied = false; this.cdr.markForCheck(); }, 2000); };
    try { void navigator.clipboard?.writeText(phone).then(done, () => {}); } catch { /* clipboard unavailable */ }
  }

  save(): void {
    const cents = parsePrice(this.feeDraft);
    if (cents === undefined) { this.error = t('Indica o preço em euros, por exemplo 24 ou 24,50.'); return; }
    this.run(this.http!.put<TournamentPayments>(this.base,
      { entryFeeCents: cents, method: this.methodDraft, phone: this.methodDraft === 'MBWAY' ? this.phoneDraft.trim() : null }));
  }
  clear(): void { this.methodDraft = null; this.run(this.http!.put<TournamentPayments>(this.base, { method: null })); }
  claim(paid: boolean): void { this.run(this.http!.post<TournamentPayments>(this.base + '/claim', { paid })); }
  confirm(username: string, paid: boolean): void { this.run(this.http!.post<TournamentPayments>(this.base + '/confirm', { username, paid })); }

  private run(request: Observable<TournamentPayments>): void {
    if (this.busy || !this.http) return;
    this.busy = true;
    this.error = '';
    this.cdr.markForCheck();
    request.pipe(timeout(10000)).subscribe({
      next: data => { this.busy = false; this.apply(data); },
      error: e => { this.busy = false; this.error = bookingError(e, 'Não foi possível guardar. Tenta outra vez.'); this.cdr.markForCheck(); }
    });
  }

  private apply(data: TournamentPayments): void {
    this.data = data;
    if (data.organiser) {
      this.methodDraft = data.method ?? this.methodDraft;
      this.phoneDraft = data.mbwayPhone ? phoneLabel(data.mbwayPhone) : this.phoneDraft;
      this.feeDraft = data.entryFeeCents === null || data.entryFeeCents === undefined ? this.feeDraft
        : (data.entryFeeCents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '');
    }
    this.cdr.markForCheck();
  }
}
