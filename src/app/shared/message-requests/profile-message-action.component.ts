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
    <div class="pma">
      @if (!composing) {
        <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy" (click)="start()">
          {{ (busy ? 'A verificar…' : sent ? 'Pedido de mensagem enviado' : 'Mensagem') | t }}
        </button>
      } @else {
        <p class="pma__hint">{{ 'Ainda não são amigos: a tua mensagem chega como pedido e só depois de aceite podes enviar mais.' | t }}</p>
        <textarea [(ngModel)]="text" maxlength="1000" rows="3" [placeholder]="'Escreve a tua mensagem…' | t" [attr.aria-label]="'Mensagem' | t"></textarea>
        <div class="pma__actions">
          <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy || !text.trim()" (click)="send()">{{ (busy ? 'A enviar…' : 'Enviar pedido') | t }}</button>
          <button type="button" class="jynlo-action jynlo-action--neutral" [disabled]="busy" (click)="composing = false">{{ 'Cancelar' | t }}</button>
        </div>
      }
      @if (note) { <p class="pma__note" role="status">{{ note }}</p> }
    </div>
  `,
  styles: [`
    .pma{display:grid;gap:8px;min-width:0}
    .pma textarea{width:100%;min-height:80px;border-radius:12px;border:1px solid #3c6874;background:#11303f;color:#f4fffe;padding:10px;font:inherit;resize:vertical}
    .pma__actions{display:flex;gap:8px;flex-wrap:wrap}
    .pma__hint,.pma__note{margin:0;font-size:.8rem;color:#9fd9cb}
  `]
})
export class ProfileMessageActionComponent {
  @Input({ required: true }) username = '';
  private readonly api = inject(MessageRequestsService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  busy = false; composing = false; sent = false; text = ''; note = '';

  start(): void {
    if (this.sent) return;
    this.busy = true; this.note = '';
    this.api.availability(this.username).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ next: a => this.handle(a), error: () => { this.note = t('Não foi possível verificar. Tenta novamente.'); } });
  }
  private handle(a: MessageAvailability): void {
    if (a.mode === 'DIRECT') { void this.router.navigate(['/menu/messages'], { queryParams: { kind: 'direct', id: this.username } }); return; }
    if (a.mode === 'RECEIVED') { this.note = t('Esta pessoa já te enviou um pedido de mensagem: aceita-o em Mensagens.'); return; }
    if (a.mode === 'PENDING') { this.sent = true; this.note = t('Já enviaste um pedido. Quando for aceite, a conversa aparece em Mensagens.'); return; }
    if (a.mode === 'REQUEST') { this.composing = true; return; }
    this.note = t(REASONS[a.reason || ''] || 'Não é possível enviar mensagens a esta pessoa.');
  }
  send(): void {
    if (!this.text.trim()) return;
    this.busy = true; this.note = '';
    this.api.send(this.username, this.text.trim()).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => { this.composing = false; this.sent = true; this.text = ''; this.note = t('Pedido enviado. Quando for aceite, a conversa aparece em Mensagens.'); },
        error: (e: { error?: { message?: string } ; status?: number }) => {
          this.note = e?.status === 429 ? t('Chegaste ao limite de pedidos de mensagem por hoje.') : t('Não foi possível enviar o pedido.');
        }
      });
  }
}
