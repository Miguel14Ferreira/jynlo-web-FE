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
};
/** The signs that matter most; photo/login alone are normal for brand-new people. */
const STRONG = new Set(['EMAIL_PADRAO_ALEATORIO', 'VARIOS_REGISTOS_SEGUIDOS']);

/** Admin: recent sign-ups with warning signs, and suspension in one place. */
@Component({
  selector: 'app-admin-recent-accounts',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ara">
      <a class="ara__back" routerLink="/menu/admin">← {{ 'Administração' | t }}</a>
      <h2>{{ 'Contas novas' | t }}</h2>
      <p class="ara__muted">{{ 'Registos recentes com sinais de alerta. Os sinais são pistas para rever, nunca prova: confirma antes de suspender.' | t }}</p>
      <div class="ara__filters">
        <select [(ngModel)]="days" (ngModelChange)="load()" [attr.aria-label]="'Período' | t">
          <option [ngValue]="1">{{ 'Últimas 24 horas' | t }}</option>
          <option [ngValue]="7">{{ 'Últimos 7 dias' | t }}</option>
          <option [ngValue]="14">{{ 'Últimos 14 dias' | t }}</option>
          <option [ngValue]="30">{{ 'Últimos 30 dias' | t }}</option>
        </select>
        <label><input type="checkbox" [(ngModel)]="onlySuspicious"> {{ 'Só com sinais fortes' | t }}</label>
        <span class="ara__muted">{{ visible.length }} / {{ accounts.length }}</span>
      </div>
      @if (loading) { <p class="ara__muted" role="status">{{ 'A carregar…' | t }}</p> }
      @if (error) { <p class="ara__error" role="alert">{{ error }}</p> }
      @for (a of visible; track a.id) {
        <article class="ara__item" [class.ara__item--strong]="strong(a)" [class.ara__item--suspended]="!!a.suspendedAt">
          <div class="ara__who">
            <strong><a [routerLink]="['/menu/profiles', a.username]">&#64;{{ a.username }}</a></strong>
            <span>{{ a.fullName || '—' }}</span>
            <span class="ara__muted">{{ a.email }} · {{ 'registo' | t }} {{ when(a.joinedAt) }}@if (a.lastLoginAt) { · {{ 'última entrada' | t }} {{ when(a.lastLoginAt) }} }</span>
          </div>
          <div class="ara__flags">
            @for (f of a.flags; track f) { <span class="ara__flag" [class.ara__flag--strong]="isStrong(f)">{{ label(f) | t }}</span> }
            @if (a.suspendedAt) { <span class="ara__flag ara__flag--suspended">{{ 'Suspensa' | t }}</span> }
          </div>
          <div class="ara__actions">
            @if (!a.suspendedAt && confirmId !== a.id) {
              <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busyId === a.id" (click)="askSuspend(a)">{{ 'Suspender' | t }}</button>
            } @else if (!a.suspendedAt) {
              <input type="text" maxlength="300" [(ngModel)]="reason" [attr.aria-label]="'Motivo da suspensão' | t" [placeholder]="'Motivo da suspensão' | t">
              <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busyId === a.id || !reason.trim()" (click)="moderate(a, 'SUSPEND')">{{ 'Confirmar suspensão' | t }}</button>
              <button type="button" class="jynlo-action jynlo-action--neutral" (click)="confirmId = null">{{ 'Cancelar' | t }}</button>
            } @else {
              <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busyId === a.id" (click)="moderate(a, 'REINSTATE')">{{ 'Reativar' | t }}</button>
            }
          </div>
        </article>
      }
      @if (!loading && !visible.length && !error) { <p class="ara__muted">{{ 'Nenhuma conta neste período.' | t }}</p> }
    </section>
  `,
  styles: [`
    .ara{max-width:980px;margin:0 auto;padding:24px 16px;display:grid;gap:12px;color:#eafffa}
    .ara__back{color:#7ee8d0;text-decoration:none;font-weight:700}
    .ara h2{margin:0;font-size:1.8rem}
    .ara__muted{color:#9fbfc6;font-size:.85rem}
    .ara__error{color:#ffb8be}
    .ara__filters{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .ara__filters select{background:#11303f;color:#f4fffe;border:1px solid #3c6874;border-radius:10px;padding:8px 10px}
    .ara__item{display:grid;grid-template-columns:1fr auto;gap:8px 16px;padding:14px;border-radius:14px;border:1px solid #2c5560;background:#0b2a38}
    .ara__item--strong{border-color:#c9874a;background:#2a2219}
    .ara__item--suspended{opacity:.65}
    .ara__who{display:grid;gap:2px;min-width:0}
    .ara__who a{color:#eafffa}
    .ara__flags{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px}
    .ara__flag{font-size:.72rem;padding:4px 8px;border-radius:999px;background:#163f4d;color:#bfe9df}
    .ara__flag--strong{background:#6b3d16;color:#ffe2c4}
    .ara__flag--suspended{background:#6b1f2a;color:#ffd2d7}
    .ara__actions{grid-row:1;grid-column:2;display:flex;gap:8px;align-items:start;flex-wrap:wrap;justify-content:flex-end}
    .ara__actions input{background:#11303f;color:#f4fffe;border:1px solid #3c6874;border-radius:10px;padding:8px 10px;min-width:220px}
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
