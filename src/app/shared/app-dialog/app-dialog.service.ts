import { ApplicationRef, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EnvironmentInjector,
  HostListener, Injectable, ViewChild, createComponent, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/translate.pipe';

export interface AppDialogOptions {
  /** Text of the confirm button (already translated or a translation key). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for deletions and other things that cannot be undone. */
  danger?: boolean;
  /** Smaller text under the question. */
  detail?: string;
}

export interface AppPromptOptions extends AppDialogOptions {
  placeholder?: string;
  maxLength?: number;
}

interface OpenDialog {
  kind: 'confirm' | 'prompt';
  message: string;
  options: AppPromptOptions;
  resolve: (value: boolean | string | null) => void;
}

/**
 * The Jynlo look for "are you sure?" and short text questions, instead of the browser's
 * own confirm()/prompt() boxes ("jynlosports.com diz…").
 */
@Component({
  selector: 'app-dialog-host',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dialog; as d) {
      <div class="app-dialog-backdrop" (click)="answer(false)">
        <section class="app-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-message"
                 (click)="$event.stopPropagation()">
          <p id="app-dialog-message" class="app-dialog__message">{{ d.message }}</p>
          @if (d.options.detail) { <p class="app-dialog__detail">{{ d.options.detail }}</p> }
          @if (d.kind === 'prompt') {
            <textarea #field class="app-dialog__field" rows="3" [(ngModel)]="text"
                      [attr.maxlength]="d.options.maxLength || 500"
                      [placeholder]="d.options.placeholder || ''"></textarea>
          }
          <div class="app-dialog__actions">
            <button type="button" class="jynlo-action jynlo-action--neutral" (click)="answer(false)">
              {{ (d.options.cancelLabel || 'Cancelar') | t }}
            </button>
            <button #ok type="button" class="jynlo-action"
                    [class.jynlo-action--danger]="d.options.danger" [class.jynlo-action--primary]="!d.options.danger"
                    [disabled]="d.kind === 'prompt' && !text.trim()" (click)="answer(true)">
              {{ (d.options.confirmLabel || (d.kind === 'prompt' ? 'Enviar' : 'Confirmar')) | t }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    .app-dialog-backdrop { position:fixed; inset:0; z-index:5000; display:grid; place-items:center; padding:1rem;
      background:rgba(2,10,14,.72); }
    .app-dialog { width:min(420px,100%); display:grid; gap:.8rem; padding:1.3rem; border-radius:20px;
      border:1px solid rgba(140,195,203,.25); background:#0a1d27; color:#eaf6f6; box-shadow:0 20px 60px rgba(0,0,0,.5); }
    .app-dialog__message { margin:0; font-size:1.05rem; font-weight:800; line-height:1.4; white-space:pre-line; }
    .app-dialog__detail { margin:0; color:#a9c7cf; font-size:.9rem; line-height:1.45; white-space:pre-line; }
    .app-dialog__field { width:100%; box-sizing:border-box; padding:.7rem; border-radius:12px; resize:vertical;
      border:1px solid rgba(140,195,203,.3); background:#0f2a35; color:#eaf6f6; font:inherit; }
    .app-dialog__actions { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:.5rem; margin-top:.2rem; }
  `]
})
export class AppDialogHostComponent {
  dialog: OpenDialog | null = null;
  text = '';
  private readonly cdr = inject(ChangeDetectorRef);
  @ViewChild('ok') private okButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('field') private field?: ElementRef<HTMLTextAreaElement>;
  private returnFocus: Element | null = null;

  show(dialog: OpenDialog): void {
    this.returnFocus = typeof document === 'undefined' ? null : document.activeElement;
    this.dialog = dialog;
    this.text = '';
    this.cdr.detectChanges();
    (this.field ?? this.okButton)?.nativeElement.focus();
  }

  answer(ok: boolean): void {
    const d = this.dialog;
    if (!d) return;
    if (ok && d.kind === 'prompt' && !this.text.trim()) return;
    this.dialog = null;
    this.cdr.detectChanges();
    (this.returnFocus as HTMLElement | null)?.focus?.();
    d.resolve(d.kind === 'prompt' ? (ok ? this.text.trim() : null) : ok);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.answer(false); }
}

@Injectable({ providedIn: 'root' })
export class AppDialogService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private host: AppDialogHostComponent | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /** Resolves true when the person confirms, false when they cancel or close it. */
  confirm(message: string, options: AppDialogOptions = {}): Promise<boolean> {
    return this.open('confirm', message, options) as Promise<boolean>;
  }

  /** Resolves the text written, or null when cancelled. */
  prompt(message: string, options: AppPromptOptions = {}): Promise<string | null> {
    return this.open('prompt', message, options) as Promise<string | null>;
  }

  private open(kind: 'confirm' | 'prompt', message: string, options: AppPromptOptions): Promise<boolean | string | null> {
    // One dialog at a time: a second question waits for the first answer.
    const next = this.queue.then(() => new Promise<boolean | string | null>(resolve => {
      const host = this.ensureHost();
      if (!host) { resolve(kind === 'prompt' ? null : false); return; }
      host.show({ kind, message, options, resolve });
    }));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private ensureHost(): AppDialogHostComponent | null {
    if (this.host) return this.host;
    if (typeof document === 'undefined') return null;
    const ref = createComponent(AppDialogHostComponent, { environmentInjector: this.injector });
    this.appRef.attachView(ref.hostView);
    document.body.appendChild(ref.location.nativeElement);
    this.host = ref.instance;
    return this.host;
  }
}

/** Answers right away, like the browser's own boxes did; used only where there is no injector. */
function settled<T>(value: T): Promise<T> {
  return { then: (ok?: (v: T) => unknown) => { ok?.(value); return settled(undefined); } } as unknown as Promise<T>;
}

/**
 * The dialog service for a component, or (when the component was built without Angular's
 * injector, as some unit tests do) the browser's own boxes as a fallback.
 */
export function injectAppDialog(): Pick<AppDialogService, 'confirm' | 'prompt'> {
  try {
    return inject(AppDialogService);
  } catch {
    return {
      confirm: (message: string) => settled(typeof window !== 'undefined' && window.confirm(message)),
      prompt: (message: string) => settled(typeof window !== 'undefined' ? (window.prompt(message)?.trim() || null) : null),
    };
  }
}
