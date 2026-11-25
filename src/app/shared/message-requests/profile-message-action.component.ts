import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { MessageAvailability, MessageRequestsService } from '../../services/message-requests.service';

const REASONS: Record<string, string> = {
  BLOCKED: 'Não é possível enviar mensagens a esta pessoa.',
  DECLINED: 'Esta pessoa não aceitou o teu pedido de mensagem.',
  ONLY_FOLLOWING: 'Esta pessoa só recebe mensagens de quem segue.',
  ONLY_COMMUNITIES: 'Esta pessoa só recebe mensagens de quem está nas mesmas comunidades.',
};

/** "Mensagem" on someone's profile when you are not friends: opens the chat or sends a request. */
@Component({
  selector: 'app-profile-message-action',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="jynlo-action jynlo-action--neutral pma__button" [disabled]="busy && !composing" (click)="start()">
      {{ (busy && !composing ? 'A verificar…' : 'Mensagem') | t }}
    </button>
    @if (note && !composing) { <p class="pma__note" role="status">{{ note }}</p> }
    @if (composing) {
      <section class="pma__dock" role="dialog" [attr.aria-label]="'Conversa com @' + username">
        <header class="pma__head">
          <span class="pma__avatar">{{ username.charAt(0).toUpperCase() }}</span>
          <strong>&#64;{{ username }}</strong>
          <button type="button" class="pma__close" (click)="composing = false" [attr.aria-label]="'Fechar' | t">✕</button>
        </header>
        <div class="pma__body">
          @if (sentText) {
            <div class="pma__bubble">{{ sentText }}</div>
            <p class="pma__hint">{{ 'Pedido enviado. Quando for aceite, a conversa aparece em Mensagens.' | t }}</p>
          } @else {
            <p class="pma__hint">{{ 'Ainda não são amigos: a tua primeira mensagem chega como pedido de mensagem.' | t }}</p>
          }
          @if (note) { <p class="pma__note pma__note--left" role="status">{{ note }}</p> }
        </div>
        @if (!sentText) {
          <form class="pma__composer" (ngSubmit)="send()">
            <textarea name="text" [(ngModel)]="text" maxlength="1000" rows="1" [placeholder]="'Escreve uma mensagem…' | t" [attr.aria-label]="'Mensagem' | t"
              (keydown.enter)="$event.preventDefault(); send()"></textarea>
            <button type="submit" class="pma__send" [disabled]="busy || !text.trim()" [attr.aria-label]="'Enviar' | t">➤</button>
          </form>
        }
      </section>
    }
  `,
  styles: [`
    :host{display:contents}
    .pma__button{white-space:nowrap}
    .pma__note{flex-basis:100%;margin:0;font-size:.8rem;color:#9fd9cb;text-align:right}
    .pma__note--left{text-align:left}
    .pma__dock{position:fixed;z-index:1000;right:20px;bottom:20px;width:min(340px,calc(100vw - 24px));height:min(420px,70vh);
      display:flex;flex-direction:column;border-radius:16px;border:1px solid #2f5d68;background:#0b2a38;color:#eafffa;box-shadow:0 18px 48px #000b;overflow:hidden}
    .pma__head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0f3442;border-bottom:1px solid #ffffff14}
    .pma__head strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .pma__avatar{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#163f4d;color:#bff7e9;font-weight:800}
    .pma__close{border:0;background:transparent;color:#cfeee8;font-size:1rem;cursor:pointer;width:30px;height:30px;border-radius:50%}
    .pma__close:hover{background:#ffffff14}
    .pma__body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;justify-content:flex-end;gap:8px}
    .pma__hint{margin:0;font-size:.78rem;color:#9fd9cb;text-align:center}
    .pma__bubble{align-self:flex-end;max-width:85%;padding:8px 12px;border-radius:16px 16px 4px 16px;background:#0e5458;white-space:pre-wrap;word-break:break-word}
    .pma__composer{display:flex;gap:8px;align-items:flex-end;padding:10px;border-top:1px solid #ffffff14}
    .pma__composer textarea{flex:1;min-height:40px;max-height:120px;border-radius:20px;border:1px solid #3c6874;background:#11303f;color:#f4fffe;padding:9px 14px;font:inherit;resize:none}
    .pma__send{width:40px;height:40px;border-radius:50%;border:0;background:#38e0c0;color:#062b2e;font-size:1rem;cursor:pointer}
    .pma__send:disabled{opacity:.45;cursor:not-allowed}
  `]
})
export class ProfileMessageActionComponent {
  @Input({ required: true }) username = '';
  private readonly api = inject(MessageRequestsService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  busy = false; composing = false; sent = false; text = ''; note = ''; sentText = '';

  start(): void {
    if (this.composing) return;
    this.busy = true; this.note = '';
    this.api.availability(this.username).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ next: a => this.handle(a), error: () => { this.note = t('Não foi possível verificar. Tenta novamente.'); } });
  }
  private handle(a: MessageAvailability): void {
    if (a.mode === 'DIRECT') { void this.router.navigate(['/menu/messages'], { queryParams: { kind: 'direct', id: this.username } }); return; }
    if (a.mode === 'RECEIVED') { this.note = t('Esta pessoa já te enviou um pedido de mensagem: aceita-o em Mensagens.'); return; }
    if (a.mode === 'PENDING') { this.sent = true; this.composing = true; this.sentText = ''; this.note = t('Já enviaste um pedido. Quando for aceite, a conversa aparece em Mensagens.'); return; }
    if (a.mode === 'REQUEST') { this.composing = true; return; }
    this.note = t(REASONS[a.reason || ''] || 'Não é possível enviar mensagens a esta pessoa.');
  }
  send(): void {
    if (!this.text.trim() || this.busy) return;
    this.busy = true; this.note = '';
    this.api.send(this.username, this.text.trim()).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.sent = true; this.sentText = this.text.trim(); this.text = ''; },
        error: (e: { error?: { message?: string } ; status?: number }) => {
          this.note = e?.status === 429 ? t('Chegaste ao limite de pedidos de mensagem por hoje.') : t('Não foi possível enviar o pedido.');
        }
      });
  }
}
