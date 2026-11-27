import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/** WhatsApp-style "is typing": a small incoming bubble with three bouncing dots (and who, in groups). */
@Component({
  selector: 'app-typing-bubble',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tb" role="status" [attr.aria-label]="label">
      <span class="tb__bubble" aria-hidden="true"><i></i><i></i><i></i></span>
      @if (showName && label) { <span class="tb__who">{{ label }}</span> }
    </div>
  `,
  styles: [`
    :host { display:block; }
    .tb { display:flex; align-items:center; gap:8px; margin:4px 16px; min-height:30px; }
    .tb__bubble { display:inline-flex; align-items:center; gap:4px; padding:9px 12px; border-radius:16px 16px 16px 4px;
      background:rgba(36,74,90,.92); border:1px solid rgba(96,176,182,.25); }
    .tb__bubble i { width:7px; height:7px; border-radius:50%; background:#9fe8d6; opacity:.4; animation:tb-bounce 1.2s infinite ease-in-out; }
    .tb__bubble i:nth-child(2) { animation-delay:.15s; }
    .tb__bubble i:nth-child(3) { animation-delay:.3s; }
    .tb__who { color:#8fd9c8; font-size:.78rem; font-weight:600; }
    @keyframes tb-bounce { 0%,60%,100% { transform:translateY(0); opacity:.4; } 30% { transform:translateY(-4px); opacity:1; } }
    @media (prefers-reduced-motion: reduce) { .tb__bubble i { animation:none; opacity:.8; } }
  `]
})
export class TypingBubbleComponent {
  /** "Miguel está a escrever…" — read by screen readers; shown next to the dots in group chats. */
  @Input() label = '';
  @Input() showName = false;
}
