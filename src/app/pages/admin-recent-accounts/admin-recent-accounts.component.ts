import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { AdminPlayersService, RecentAccount } from '../../services/admin-players.service';

const FLAG_LABELS: Record<string, string> = {
  EMAIL_PADRAO_ALEATORIO: 'Email com números aleatórios',
  EMAIL_NAO_CONFIRMADO: 'Email por confirmar',
  SEM_FOTO: 'Sem foto',
  NUNCA_ENTROU: 'Nunca entrou',
  VARIOS_REGISTOS_SEGUIDOS: 'Vários registos seguidos',
  ENTRA_DE_FORA_DE_PORTUGAL: 'Entra de fora de Portugal',
};
/** The signs that matter most; photo/login alone are normal for brand-new people. */
const STRONG = new Set(['EMAIL_PADRAO_ALEATORIO', 'VARIOS_REGISTOS_SEGUIDOS', 'ENTRA_DE_FORA_DE_PORTUGAL']);

/** Admin: recent sign-ups with warning signs, and suspension in one place. */
@Component({
  selector: 'app-admin-recent-accounts',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ara">
      <a class="ara__back" routerLink="/menu/admin">← {{ 'Administração' | t }}</a>
      <header class="ara__header">
        <div>
          <h2>{{ 'Contas novas' | t }}</h2>
          <p class="ara__muted">{{ 'Registos recentes com sinais de alerta. Os sinais são pistas para rever, nunca prova: confirma antes de suspender.' | t }}</p>
        </div>
        <div class="ara__stats">
          <div class="ara__stat"><strong>{{ accounts.length }}</strong><span>{{ 'contas' | t }}</span></div>
          <div class="ara__stat ara__stat--warn"><strong>{{ strongCount }}</strong><span>{{ 'a rever' | t }}</span></div>
          <div class="ara__stat ara__stat--bad"><strong>{{ suspendedCount }}</strong><span>{{ 'suspensas' | t }}</span></div>
        </div>
      </header>
      <div class="ara__filters">
        <div class="ara__seg" role="radiogroup" [attr.aria-label]="'Período' | t">
          @for (o of periods; track o.days) {
            <button type="button" role="radio" class="ara__seg-btn" [class.is-on]="days === o.days" [attr.aria-checked]="days === o.days" (click)="days = o.days; load()">{{ o.label | t }}</button>
          }
        </div>
        <button type="button" class="ara__toggle" [class.is-on]="onlySuspicious" [attr.aria-pressed]="onlySuspicious" (click)="onlySuspicious = !onlySuspicious">
          <span class="ara__switch" aria-hidden="true"></span>{{ 'Só a rever' | t }}
        </button>
      </div>
      @if (loading) { <p class="ara__muted" role="status">{{ 'A carregar…' | t }}</p> }
      @if (error) { <p class="ara__error" role="alert">{{ error }}</p> }
      <div class="ara__list">
        @for (a of visible; track a.id) {
          <article class="ara__item" [class.ara__item--strong]="strong(a)" [class.ara__item--suspended]="!!a.suspendedAt">
            <span class="ara__avatar" [class.ara__avatar--warn]="strong(a)">{{ a.username.charAt(0).toUpperCase() }}</span>
            <div class="ara__who">
              <div class="ara__line">
                <a [routerLink]="['/menu/profiles', a.username]">&#64;{{ a.username }}</a>
                @if (a.suspendedAt) { <span class="ara__badge ara__badge--bad">{{ 'Suspensa' | t }}</span> }
                @else if (strong(a)) { <span class="ara__badge ara__badge--warn">{{ 'A rever' | t }}</span> }
              </div>
              <span class="ara__name">{{ a.fullName || ('Sem nome' | t) }}</span>
              <span class="ara__meta">{{ a.email }}</span>
              @if (a.loginCountry) { <span class="ara__meta ara__place">⌖ {{ a.loginCity ? a.loginCity + ', ' : '' }}{{ a.loginCountry }}</span> }
              <span class="ara__meta">{{ 'Registo' | t }} {{ when(a.joinedAt) }} · {{ a.lastLoginAt ? (('Última entrada' | t) + ' ' + when(a.lastLoginAt)) : ('Nunca entrou' | t) }}</span>
              @if (a.flags.length) {
                <div class="ara__flags">
                  @for (f of a.flags; track f) { <span class="ara__flag" [class.ara__flag--strong]="isStrong(f)">{{ label(f) | t }}</span> }
                </div>
              }
            </div>
            <div class="ara__actions">
              @if (!a.suspendedAt && confirmId !== a.id) {
                <button type="button" class="ara__btn ara__btn--danger-outline" [disabled]="busyId === a.id" (click)="askSuspend(a)">{{ 'Suspender' | t }}</button>
              } @else if (!a.suspendedAt) {
                <input type="text" maxlength="300" [(ngModel)]="reason" [attr.aria-label]="'Motivo da suspensão' | t" [placeholder]="'Motivo da suspensão' | t">
                <div class="ara__row">
                  <button type="button" class="ara__btn" (click)="confirmId = null">{{ 'Cancelar' | t }}</button>
                  <button type="button" class="ara__btn ara__btn--danger" [disabled]="busyId === a.id || !reason.trim()" (click)="moderate(a, 'SUSPEND')">{{ 'Confirmar suspensão' | t }}</button>
                </div>
              } @else {
                <button type="button" class="ara__btn" [disabled]="busyId === a.id" (click)="moderate(a, 'REINSTATE')">{{ 'Reativar' | t }}</button>
              }
            </div>
          </article>
        }
      </div>
      @if (!loading && !visible.length && !error) { <p class="ara__empty">{{ 'Nenhuma conta neste período.' | t }}</p> }
      <p class="ara__credit">{{ 'Localização aproximada de cada início de sessão (guardada 90 dias):' | t }} <a href="https://db-ip.com" target="_blank" rel="noopener">IP Geolocation by DB-IP</a></p>
    </section>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:radial-gradient(circle at top right, rgba(99,102,241,.13), transparent 34rem), linear-gradient(145deg, #07111f, #102f46)}
    .ara{max-width:1000px;margin:0 auto;padding:24px 16px 48px;display:grid;gap:16px;color:#eafffa}
    .ara__back{color:#7ee8d0;text-decoration:none;font-weight:700;font-size:.88rem}
    .ara__header{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end}
    .ara h2{margin:0 0 4px;font-size:2rem;letter-spacing:-.01em}
    .ara__muted{margin:0;color:#9fbfc6;font-size:.86rem;max-width:560px}
    .ara__stats{display:flex;gap:8px}
    .ara__stat{min-width:84px;padding:10px 14px;border-radius:14px;background:#0b2a38;border:1px solid #1f4752;display:grid}
    .ara__stat strong{font-size:1.35rem}.ara__stat span{font-size:.72rem;color:#8fb2ba}
    .ara__stat--warn strong{color:#ffc78a}.ara__stat--bad strong{color:#ff9aa5}
    .ara__filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .ara__seg{display:flex;padding:4px;border-radius:999px;background:#0b2a38;border:1px solid #1f4752}
    .ara__seg-btn{padding:7px 14px;border:0;border-radius:999px;background:transparent;color:#cfeee8;font:inherit;font-size:.82rem;cursor:pointer}
    .ara__seg-btn.is-on{background:#38e0c0;color:#062b2e;font-weight:800}
    .ara__toggle{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;border:1px solid #1f4752;background:#0b2a38;color:#cfeee8;font:inherit;font-size:.82rem;cursor:pointer}
    .ara__switch{position:relative;width:30px;height:18px;border-radius:999px;background:#2b4b55;transition:background .15s}
    .ara__switch::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#eafffa;transition:transform .15s}
    .ara__toggle.is-on .ara__switch{background:#c9874a}.ara__toggle.is-on .ara__switch::after{transform:translateX(12px)}
    .ara__list{display:grid;gap:10px}
    .ara__item{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start;padding:16px;border-radius:16px;border:1px solid #1f4752;background:linear-gradient(160deg,#0c2d3b,#09222d)}
    .ara__item--strong{border-color:#7a5530;background:linear-gradient(160deg,#2b2418,#1b1a15)}
    .ara__item--suspended{opacity:.6}
    .ara__avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#163f4d;color:#bff7e9;font-weight:800;font-size:1.05rem}
    .ara__avatar--warn{background:#5a3a1a;color:#ffd9b0}
    .ara__who{display:grid;gap:3px;min-width:0}
    .ara__line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .ara__line a{color:#eafffa;font-weight:800;font-size:1rem;text-decoration:none}
    .ara__line a:hover{text-decoration:underline}
    .ara__name{color:#d7efea;font-size:.9rem}
    .ara__meta{color:#8fb2ba;font-size:.78rem;overflow:hidden;text-overflow:ellipsis}
    .ara__badge{padding:2px 8px;border-radius:999px;font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
    .ara__badge--warn{background:#6b3d16;color:#ffe2c4}.ara__badge--bad{background:#6b1f2a;color:#ffd2d7}
    .ara__flags{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .ara__flag{font-size:.7rem;padding:3px 9px;border-radius:999px;background:#163f4d;color:#bfe9df}
    .ara__flag--strong{background:#6b3d16;color:#ffe2c4}
    .ara__actions{display:grid;gap:8px;justify-items:end;min-width:0}
    .ara__actions input{width:240px;background:#11303f;color:#f4fffe;border:1px solid #3c6874;border-radius:10px;padding:8px 10px;font:inherit;font-size:.82rem}
    .ara__row{display:flex;gap:6px}
    .ara__btn{padding:7px 14px;border-radius:999px;border:1px solid #3d6f78;background:transparent;color:#dff8f2;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;white-space:nowrap}
    .ara__btn:disabled{opacity:.5;cursor:not-allowed}
    .ara__btn--danger-outline{border-color:#8a4450;color:#ffc2c9}
    .ara__btn--danger-outline:hover:not(:disabled){background:#4a1c25}
    .ara__btn--danger{background:#a8404f;border-color:#a8404f;color:#fff}
    .ara__error{color:#ffb8be}
    .ara__empty{color:#9fbfc6;text-align:center;padding:24px}
    .ara__place{color:#bfe9df}
    .ara__credit{color:#6f939b;font-size:.72rem}.ara__credit a{color:#8fd8c8}
    @media (max-width:640px){.ara__item{grid-template-columns:auto 1fr}.ara__actions{grid-column:1/-1;justify-items:start}.ara__actions input{width:100%}}
  `]
})
export class AdminRecentAccountsComponent implements OnInit {
  private readonly api = inject(AdminPlayersService);
  private readonly cdr = inject(ChangeDetectorRef);
  accounts: RecentAccount[] = [];
  days = 7;
  onlySuspicious = false;
  loading = false;
  busyId: number | null = null;
  /** Account whose suspension is waiting for the in-page confirmation and reason. */
  confirmId: number | null = null;
  reason = '';
  error = '';

  readonly periods = [{ days: 1, label: '24 horas' }, { days: 7, label: '7 dias' }, { days: 14, label: '14 dias' }, { days: 30, label: '30 dias' }];
  get strongCount(): number { return this.accounts.filter(a => this.strong(a) && !a.suspendedAt).length; }
  get suspendedCount(): number { return this.accounts.filter(a => !!a.suspendedAt).length; }
  get visible(): RecentAccount[] {
    return this.onlySuspicious ? this.accounts.filter(a => this.strong(a)) : this.accounts;
  }
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading = true; this.error = '';
    this.api.recentAccounts(this.days).pipe(finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
      .subscribe({ next: list => { this.accounts = list || []; }, error: () => { this.error = t('Não foi possível carregar as contas novas.'); } });
  }
  askSuspend(a: RecentAccount): void { this.confirmId = a.id; this.reason = t('Conta suspeita de ser falsa'); }
  strong(a: RecentAccount): boolean { return a.flags.some(f => STRONG.has(f)); }
  isStrong(f: string): boolean { return STRONG.has(f); }
  label(f: string): string { return FLAG_LABELS[f] || f; }
  when(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  moderate(a: RecentAccount, action: 'SUSPEND' | 'REINSTATE'): void {
    const reason = action === 'SUSPEND' ? this.reason.trim() : t('Revista pela administração');
    if (action === 'SUSPEND' && !reason) return;
    this.confirmId = null;
    this.busyId = a.id; this.error = '';
    this.api.moderate(a.id, action, a.username, !!a.suspendedAt, reason)
      .pipe(finalize(() => { this.busyId = null; this.cdr.markForCheck(); }))
      .subscribe({
        next: r => { this.accounts = this.accounts.map(x => x.id === a.id ? { ...x, suspendedAt: r.moderationSuspendedAt } : x); },
        error: () => { this.error = t('A ação não foi confirmada. Atualiza a lista antes de repetir.'); }
      });
  }
}
