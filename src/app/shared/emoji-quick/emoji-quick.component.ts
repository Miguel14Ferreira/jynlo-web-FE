import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Output, inject } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';

/** Small emoji button for chat composers that have no emoji keyboard (computers). */
@Component({
  selector: 'app-emoji-quick',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="eq__btn" [attr.aria-expanded]="open" [attr.aria-label]="'Emojis' | t" (click)="open = !open">😊</button>
    @if (open) {
      <div class="eq__pop" role="listbox" [attr.aria-label]="'Emojis' | t">
        @for (e of emojis; track e) {
          <button type="button" class="eq__item" role="option" [attr.aria-label]="e" (click)="picked.emit(e)">{{ e }}</button>
        }
      </div>
    }
  `,
  styles: [`
    :host{position:relative;display:inline-flex}
    .eq__btn{width:40px;height:40px;border-radius:50%;border:1px solid #3c6874;background:#11303f;font-size:1.15rem;cursor:pointer;line-height:1}
    .eq__btn:hover{background:#163f4d}
    .eq__pop{position:absolute;bottom:48px;left:0;z-index:20;display:grid;grid-template-columns:repeat(6,36px);gap:4px;padding:8px;
      border-radius:14px;background:#0c283a;border:1px solid #2f6573;box-shadow:0 12px 30px #0008}
    .eq__item{width:36px;height:36px;border:0;border-radius:8px;background:transparent;font-size:1.25rem;cursor:pointer}
    .eq__item:hover{background:#163f4d}
  `]
})
export class EmojiQuickComponent {
  @Output() picked = new EventEmitter<string>();
  open = false;
  readonly emojis = ['😀', '😂', '😊', '😍', '🥳', '😎', '😉', '🙏', '👍', '👏', '🙌', '💪', '🔥', '❤️', '✅', '⚽', '🏀', '🎾',
    '🏓', '🏐', '🏆', '🥅', '🍻', '😅'];
  private readonly host = inject(ElementRef<HTMLElement>);
  @HostListener('document:click', ['$event'])
  close(event: Event): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.open = false;
  }
}
