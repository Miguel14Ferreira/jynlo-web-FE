import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { MessageRequestsService } from '../../services/message-requests.service';
import { MessageComposeService } from '../../services/message-compose.service';
import { playerAvatarInitials } from '../player-avatar';

/** New conversation with someone who is not a friend: the first message goes as a request. */
@Component({
  selector: 'app-request-compose-pane',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rcp">
      <header class="rcp__head">
        <button type="button" class="rcp__back" (click)="closed.emit()" [attr.aria-label]="'Voltar às conversas' | t">←</button>
        <a class="rcp__who" [routerLink]="['/menu/profiles', username]">
          <span class="rcp__avatar">{{ initial }}</span>
          <strong>&#64;{{ username }}</strong>
        </a>
      </header>
      <div class="rcp__body">
        <div class="rcp__intro">
          <span class="rcp__avatar rcp__avatar--big">{{ initial }}</span>
          <strong>&#64;{{ username }}</strong>
          @if (!sentText && !note) { <p>{{ 'Ainda não são amigos: a tua primeira mensagem chega como pedido de mensagem.' | t }}</p> }
        </div>
        @if (sentText) {
          <div class="rcp__bubble">{{ sentText }}</div>
          <p class="rcp__status">{{ 'Pedido enviado. Quando for aceite, a conversa aparece em Mensagens.' | t }}</p>
        }
        @if (note) { <p class="rcp__status rcp__status--warn" role="status">{{ note }}</p> }
      </div>
      @if (!sentText && !note) {
        <form class="rcp__composer" (ngSubmit)="send()">
          <textarea name="text" [(ngModel)]="text" maxlength="1000" rows="1" [placeholder]="'Escreve uma mensagem…' | t" [attr.aria-label]="'Mensagem' | t"
            (keydown.enter)="$event.preventDefault(); send()"></textarea>
          <button type="submit" class="rcp__send" [disabled]="busy || !text.trim()" [attr.aria-label]="'Enviar' | t">➤</button>
        </form>
      }
    </div>
  `,
  styles: [`
    :host{display:flex;flex:1;min-height:0;height:100%}
    .rcp{display:flex;flex-direction:column;flex:1;min-height:0;color:#eafffa}
    .rcp__head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #ffffff14}
    .rcp__back{width:32px;height:32px;border-radius:50%;border:0;background:transparent;color:#cfeee8;font-size:1.1rem;cursor:pointer}
    .rcp__back:hover{background:#ffffff14}
    .rcp__who{display:flex;align-items:center;gap:10px;color:#eafffa;text-decoration:none}
    .rcp__avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#163f4d;color:#bff7e9;font-weight:800}
    .rcp__avatar--big{width:72px;height:72px;font-size:1.6rem}
    .rcp__body{flex:1;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
    .rcp__intro{display:grid;justify-items:center;gap:6px;text-align:center;margin:auto 0 8px}
    .rcp__intro p{margin:0;max-width:280px;color:#9fd9cb;font-size:.82rem}
    .rcp__bubble{align-self:flex-end;max-width:80%;padding:9px 13px;border-radius:18px 18px 4px 18px;background:#0e5458;white-space:pre-wrap;word-break:break-word}
    .rcp__status{margin:0;align-self:flex-end;font-size:.74rem;color:#8fb2ba}
    .rcp__status--warn{align-self:center;color:#ffd2a8;text-align:center}
    .rcp__composer{display:flex;gap:8px;align-items:flex-end;padding:10px 12px;border-top:1px solid #ffffff14}
    .rcp__composer textarea{flex:1;min-height:40px;max-height:120px;border-radius:20px;border:1px solid #3c6874;background:#11303f;color:#f4fffe;padding:9px 14px;font:inherit;resize:none}
    .rcp__send{width:40px;height:40px;border-radius:50%;border:0;background:#38e0c0;color:#062b2e;cursor:pointer}
    .rcp__send:disabled{opacity:.45;cursor:not-allowed}
  `]
})
export class RequestComposePaneComponent implements OnChanges {
  @Input({ required: true }) username = '';
  @Output() closed = new EventEmitter<void>();
  private readonly api = inject(MessageRequestsService);
  private readonly compose = inject(MessageComposeService);
  private readonly cdr = inject(ChangeDetectorRef);
  text = ''; sentText = ''; note = ''; busy = false;
  get initial(): string { return playerAvatarInitials(this.username).charAt(0); }

  ngOnChanges(): void {
    this.text = ''; this.sentText = ''; this.note = '';
    if (!this.username) return;
    this.api.availability(this.username).subscribe({
      next: a => {
        // Already sent: show what was sent, like a waiting conversation (no second message).
        if (a.mode === 'PENDING') this.api.sent().subscribe({ next: list => {
          const mine = (list || []).find(r => r.username.toLowerCase() === this.username.toLowerCase());
          if (mine) this.sentText = mine.text;
          else this.note = t('Já enviaste um pedido. Quando for aceite, a conversa aparece em Mensagens.');
          this.cdr.markForCheck();
        }, error: () => { this.note = t('Já enviaste um pedido. Quando for aceite, a conversa aparece em Mensagens.'); this.cdr.markForCheck(); } });
        else if (a.mode === 'RECEIVED') this.note = t('Esta pessoa já te enviou um pedido de mensagem: aceita-o em Pedidos de mensagem.');
        else if (a.mode === 'NOT_ALLOWED') this.note = t('Não é possível enviar mensagens a esta pessoa.');
        this.cdr.markForCheck();
      },
      error: () => {}
    });
  }
  send(): void {
    const body = this.text.trim();
    if (!body || this.busy || this.note) return;
    this.busy = true;
    this.api.send(this.username, body).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.sentText = body; this.text = ''; this.compose.changed$.next(); },
        error: (e: { status?: number }) => {
          this.note = e?.status === 429 ? t('Chegaste ao limite de pedidos de mensagem por hoje.') : t('Não foi possível enviar o pedido.');
        }
      });
  }
}
