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
      <button type="button" class="mrp__toggle" [attr.aria-expanded]="open" (click)="open = !open">
        <span>{{ 'Pedidos de mensagem' | t }}</span>
        @if (requests.length) { <span class="mrp__count">{{ requests.length }}</span> }
        <span class="mrp__chev" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
      </button>
      @if (open) {
        <label class="mrp__policy">{{ 'Quem te pode enviar pedidos' | t }}
          <select [(ngModel)]="policy" (ngModelChange)="savePolicy($event)" [disabled]="busy">
            <option value="EVERYONE">{{ 'Toda a gente' | t }}</option>
            <option value="COMMUNITIES">{{ 'Só pessoas das minhas comunidades' | t }}</option>
            <option value="FOLLOWING">{{ 'Só quem eu sigo' | t }}</option>
          </select>
        </label>
        @if (!requests.length) { <p class="mrp__muted">{{ 'Não tens pedidos de mensagem.' | t }}</p> }
        @for (r of requests; track r.id) {
          <article class="mrp__item">
            <div class="mrp__head">
              <span class="mrp__avatar">@if (r.profilePicUrl) { <img [src]="r.profilePicUrl" alt=""> } @else { {{ r.username.charAt(0).toUpperCase() }} }</span>
              <div><a [routerLink]="['/menu/profiles', r.username]"><strong>&#64;{{ r.username }}</strong></a><small>{{ r.fullName || '' }}</small></div>
            </div>
            <p class="mrp__text">{{ r.text }}</p>
            @if (blockConfirm === r.id) {
              <div class="mrp__actions">
                <span class="mrp__muted">{{ blockQuestion(r) }}</span>
                <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="block(r)">{{ 'Sim, bloquear' | t }}</button>
                <button type="button" class="jynlo-action jynlo-action--neutral" (click)="blockConfirm = null">{{ 'Cancelar' | t }}</button>
              </div>
            } @else {
              <div class="mrp__actions">
                <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy" (click)="accept(r)">{{ 'Aceitar' | t }}</button>
                <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy" (click)="decline(r)">{{ 'Apagar' | t }}</button>
                <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy" (click)="blockConfirm = r.id">{{ 'Bloquear' | t }}</button>
              </div>
            }
          </article>
        }
        @if (error) { <p class="mrp__error" role="alert">{{ error }}</p> }
      }
    </section>
  `,
  styles: [`
    .mrp{display:grid;gap:8px;margin:6px 0 10px}
    .mrp__toggle{display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border-radius:12px;border:1px solid #2c5560;background:#0b2a38;color:#eafffa;font:inherit;font-weight:700;cursor:pointer}
    .mrp__count{min-width:22px;padding:1px 7px;border-radius:999px;background:#38e0c0;color:#062b2e;font-size:.75rem}
    .mrp__chev{margin-left:auto;color:#8fd8c8}
    .mrp__policy{display:grid;gap:4px;font-size:.75rem;color:#9fbfc6}
    .mrp__policy select{background:#11303f;color:#f4fffe;border:1px solid #3c6874;border-radius:10px;padding:8px}
    .mrp__muted{color:#9fbfc6;font-size:.8rem;margin:0}
    .mrp__error{color:#ffb8be;font-size:.8rem}
    .mrp__item{display:grid;gap:8px;padding:10px;border-radius:12px;border:1px solid #2c5560;background:#0a2431}
    .mrp__head{display:flex;gap:10px;align-items:center}
    .mrp__head a{color:#eafffa}.mrp__head small{display:block;color:#9fbfc6}
    .mrp__avatar{width:36px;height:36px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#163f4d;color:#bff7e9;font-weight:800}
    .mrp__avatar img{width:100%;height:100%;object-fit:cover}
    .mrp__text{margin:0;color:#eafffa;white-space:pre-wrap;word-break:break-word}
    .mrp__actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  `]
})
export class MessageRequestsPanelComponent implements OnInit {
  @Output() accepted = new EventEmitter<string>();
  private readonly api = inject(MessageRequestsService);
  private readonly community = inject(CommunityService);
  private readonly cdr = inject(ChangeDetectorRef);
  requests: IncomingMessageRequest[] = [];
  policy: MessagePolicy = 'EVERYONE';
  open = false;
  busy = false;
  error = '';
  blockConfirm: number | null = null;

  ngOnInit(): void {
    this.api.incoming().subscribe({ next: list => { this.requests = list || []; this.open = this.requests.length > 0; this.cdr.markForCheck(); }, error: () => {} });
    this.api.policy().subscribe({ next: p => { this.policy = p.policy; this.cdr.markForCheck(); }, error: () => {} });
  }
  private run(work: ReturnType<MessageRequestsService['accept']>, done: () => void): void {
    this.busy = true; this.error = '';
    work.pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ next: done, error: () => { this.error = t('A ação não foi confirmada. Atualiza antes de repetir.'); } });
  }
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
  savePolicy(policy: MessagePolicy): void {
    this.run(this.api.setPolicy(policy) as never, () => {});
  }
}
