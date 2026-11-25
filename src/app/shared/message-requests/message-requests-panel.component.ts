import { MessageComposeService } from '../../services/message-compose.service';
import { playerAvatarInitials } from '../player-avatar';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { CommunityService } from '../../services/community.service';
import { IncomingMessageRequest, MessagePolicy, MessageRequestsService } from '../../services/message-requests.service';

/** "Pedidos de mensagem" in the inbox: accept, delete or block, plus who may write to you. */
@Component({
  selector: 'app-message-requests-panel',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mrp">
      <button type="button" class="mrp__toggle" [class.mrp__toggle--has]="requests.length" [attr.aria-expanded]="open" (click)="open = !open">
        <span class="mrp__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 10h8"/></svg>
        </span>
        <span class="mrp__title">{{ 'Pedidos de mensagem' | t }}</span>
        @if (requests.length) { <span class="mrp__count">{{ requests.length }}</span> }
        <svg class="mrp__chev" [class.mrp__chev--open]="open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      @if (open) {
        <div class="mrp__panel">
          @if (!requests.length) {
            <p class="mrp__empty">{{ 'Não tens pedidos de mensagem.' | t }}</p>
          }
          @for (r of requests; track r.id) {
            <article class="mrp__item">
              <a class="mrp__avatar" [routerLink]="['/menu/profiles', r.username]">@if (r.profilePicUrl) { <img [src]="r.profilePicUrl" alt=""> } @else { {{ letter(r) }} }</a>
              <div class="mrp__main">
                <div class="mrp__who"><a [routerLink]="['/menu/profiles', r.username]">&#64;{{ r.username }}</a>@if (r.fullName) { <small>{{ r.fullName }}</small> }</div>
                <p class="mrp__text">{{ r.text }}</p>
                @if (blockConfirm === r.id) {
                  <div class="mrp__actions">
                    <span class="mrp__warn">{{ blockQuestion(r) }}</span>
                    <button type="button" class="mrp__btn mrp__btn--danger" [disabled]="busy" (click)="block(r)">{{ 'Sim, bloquear' | t }}</button>
                    <button type="button" class="mrp__btn" (click)="blockConfirm = null">{{ 'Cancelar' | t }}</button>
                  </div>
                } @else {
                  <div class="mrp__actions">
                    <button type="button" class="mrp__btn mrp__btn--primary" [disabled]="busy" (click)="accept(r)">{{ 'Aceitar' | t }}</button>
                    <button type="button" class="mrp__btn" [disabled]="busy" (click)="decline(r)">{{ 'Apagar' | t }}</button>
                    <button type="button" class="mrp__btn mrp__btn--ghost" [disabled]="busy" (click)="blockConfirm = r.id">{{ 'Bloquear' | t }}</button>
                  </div>
                }
              </div>
            </article>
          }
          <div class="mrp__policy" role="radiogroup" [attr.aria-label]="'Quem te pode enviar pedidos' | t">
            <span class="mrp__policy-label">{{ 'Quem te pode enviar pedidos' | t }}</span>
            <div class="mrp__seg">
              @for (o of policyOptions; track o.value) {
                <button type="button" role="radio" class="mrp__seg-btn" [class.is-on]="policy === o.value" [attr.aria-checked]="policy === o.value"
                  [disabled]="busy" (click)="choose(o.value)">{{ o.label | t }}</button>
              }
            </div>
          </div>
          @if (error) { <p class="mrp__error" role="alert">{{ error }}</p> }
        </div>
      }
    </section>
  `,
  styles: [`
    .mrp{margin:4px 0 10px;display:grid;gap:4px}
    .mrp__toggle{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border-radius:14px;border:1px solid transparent;background:transparent;color:#cfeee8;font:inherit;cursor:pointer;transition:background .15s}
    .mrp__toggle:hover{background:#ffffff0d}
    .mrp__toggle--has{border-color:#2f6b6a;background:#0e3340;color:#eafffa}
    .mrp__icon{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:#123c49;color:#57f2c0}
    .mrp__icon svg{width:17px;height:17px}
    .mrp__title{font-weight:700;font-size:.9rem}
    .mrp__count{min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:grid;place-items:center;background:#38e0c0;color:#062b2e;font-size:.72rem;font-weight:800}
    .mrp__chev{margin-left:auto;width:16px;height:16px;color:#8fd8c8;transition:transform .15s}
    .mrp__chev--open{transform:rotate(180deg)}
    .mrp__panel{display:grid;gap:10px;margin-top:8px;padding:10px;border-radius:14px;background:#09222d;border:1px solid #1f4752}
    .mrp__empty{margin:2px 0;color:#9fbfc6;font-size:.82rem;text-align:center}
    .mrp__item{display:flex;gap:10px;padding:10px;border-radius:12px;background:#0d2f3c}
    .mrp__avatar{flex:0 0 38px;width:38px;height:38px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#163f4d;color:#bff7e9;font-weight:800;text-decoration:none}
    .mrp__avatar img{width:100%;height:100%;object-fit:cover}
    .mrp__main{flex:1;min-width:0;display:grid;gap:6px}
    .mrp__who{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}
    .mrp__who a{color:#eafffa;font-weight:700;text-decoration:none}
    .mrp__who small{color:#8fb2ba;font-size:.75rem}
    .mrp__text{margin:0;padding:8px 10px;border-radius:4px 14px 14px 14px;background:#163f4d;color:#eafffa;font-size:.86rem;white-space:pre-wrap;word-break:break-word}
    .mrp__actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .mrp__btn{padding:6px 12px;border-radius:999px;border:1px solid #3d6f78;background:transparent;color:#dff8f2;font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}
    .mrp__btn:disabled{opacity:.5;cursor:not-allowed}
    .mrp__btn--primary{background:#38e0c0;border-color:#38e0c0;color:#062b2e}
    .mrp__btn--ghost{border-color:transparent;color:#ffb8be}
    .mrp__btn--danger{background:#7a2633;border-color:#a8404f;color:#ffe3e6}
    .mrp__warn{flex-basis:100%;color:#ffd2d7;font-size:.78rem}
    .mrp__policy{display:grid;gap:6px;padding-top:8px;border-top:1px solid #ffffff12}
    .mrp__policy-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#7fa9b1}
    .mrp__seg{display:flex;flex-wrap:wrap;gap:6px}
    .mrp__seg-btn{padding:6px 10px;border-radius:999px;border:1px solid #2f5d68;background:#0d2f3c;color:#cfeee8;font:inherit;font-size:.76rem;cursor:pointer}
    .mrp__seg-btn.is-on{background:#123f4a;border-color:#57f2c0;color:#eafffa;font-weight:700}
    .mrp__error{margin:0;color:#ffb8be;font-size:.8rem}
  `]
})
export class MessageRequestsPanelComponent implements OnInit {
  @Output() accepted = new EventEmitter<string>();
  private readonly api = inject(MessageRequestsService);
  private readonly community = inject(CommunityService);
  readonly compose = inject(MessageComposeService);
  private readonly cdr = inject(ChangeDetectorRef);
  requests: IncomingMessageRequest[] = [];
  policy: MessagePolicy = 'EVERYONE';
  open = false;
  busy = false;
  error = '';
  blockConfirm: number | null = null;
  readonly policyOptions: { value: MessagePolicy; label: string }[] = [
    { value: 'EVERYONE', label: 'Toda a gente' },
    { value: 'COMMUNITIES', label: 'Só das minhas comunidades' },
    { value: 'FOLLOWING', label: 'Só quem eu sigo' },
  ];

  ngOnInit(): void {
    this.api.incoming().subscribe({ next: list => { this.requests = list || []; this.open = this.requests.length > 0; this.cdr.markForCheck(); }, error: () => {} });

    this.api.policy().subscribe({ next: p => { this.policy = p.policy; this.cdr.markForCheck(); }, error: () => {} });
  }
  private run(work: ReturnType<MessageRequestsService['accept']>, done: () => void): void {
    this.busy = true; this.error = '';
    work.pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ next: done, error: () => { this.error = t('A ação não foi confirmada. Atualiza antes de repetir.'); } });
  }
  letter(r: IncomingMessageRequest): string { return playerAvatarInitials(r.fullName || r.username).charAt(0); }
  blockQuestion(r: IncomingMessageRequest): string { return t('Bloquear @{{v}}? Deixa de te poder contactar.', { v: r.username }); }
  accept(r: IncomingMessageRequest): void {
    this.run(this.api.accept(r.id), () => { this.requests = this.requests.filter(x => x.id !== r.id); this.accepted.emit(r.username); });
  }
  decline(r: IncomingMessageRequest): void {
    this.run(this.api.decline(r.id), () => { this.requests = this.requests.filter(x => x.id !== r.id); });
  }
  block(r: IncomingMessageRequest): void {
    this.blockConfirm = null;
    this.busy = true;
    this.community.blockUser(r.username).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ next: () => this.decline(r), error: () => { this.error = t('Não foi possível bloquear.'); } });
  }
  choose(policy: MessagePolicy): void { if (policy === this.policy) return; const before = this.policy; this.policy = policy; this.busy = true; this.error = '';
    this.api.setPolicy(policy).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ error: () => { this.policy = before; this.error = t('Não foi possível guardar.'); } });
  }
  savePolicy(policy: MessagePolicy): void {
    this.run(this.api.setPolicy(policy) as never, () => {});
  }
}
