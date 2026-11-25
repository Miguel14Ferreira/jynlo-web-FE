import { MessageComposeService } from '../../services/message-compose.service';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
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
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="jynlo-action jynlo-action--neutral pma__button" [disabled]="busy" (click)="start()">
      {{ (busy ? 'A verificar…' : 'Mensagem') | t }}
    </button>
    @if (note) { <p class="pma__note" role="status">{{ note }}</p> }
  `,
  styles: [`
    :host{display:contents}
    .pma__button{white-space:nowrap}
    .pma__note{flex-basis:100%;margin:0;font-size:.8rem;color:#9fd9cb;text-align:right}
  `]
})
export class ProfileMessageActionComponent {
  @Input({ required: true }) username = '';
  private readonly api = inject(MessageRequestsService);
  private readonly compose = inject(MessageComposeService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  busy = false; note = '';

  start(): void {
    if (this.busy) return;
    this.busy = true; this.note = '';
    this.api.availability(this.username).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ next: a => this.handle(a), error: () => { this.note = t('Não foi possível verificar. Tenta novamente.'); } });
  }
  private handle(a: MessageAvailability): void {
    if (a.mode === 'DIRECT') { void this.router.navigate(['/menu/messages'], { queryParams: { kind: 'direct', id: this.username } }); return; }
    if (a.mode === 'NOT_ALLOWED') { this.note = t(REASONS[a.reason || ''] || 'Não é possível enviar mensagens a esta pessoa.'); return; }
    // Request, pending or received: open the conversation inside Messages (Instagram style).
    const wide = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (wide) this.compose.open(this.username);
    else void this.router.navigate(['/menu/messages'], { queryParams: { compose: this.username } });
  }
}
