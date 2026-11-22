import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef,
  HostListener, Inject, NgZone, OnDestroy, PLATFORM_ID, ViewChild
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '../i18n/translate.pipe';

/** Page-level notices shown as a centred pop-up instead of a banner lost on the page. */
export const PAGE_NOTICE_SELECTOR = '.feedback.error-feedback, .feedback.success-feedback';

export interface PageNotice { tone: 'error' | 'success'; text: string; }

/** Reads new notice banners, so every page gets the pop-up without its own code. */
export function noticesToShow(root: ParentNode, seen: WeakMap<Element, string>): PageNotice[] {
  const found: PageNotice[] = [];
  root.querySelectorAll(PAGE_NOTICE_SELECTOR).forEach(element => {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text || seen.get(element) === text) return;
    seen.set(element, text);
    found.push({ tone: element.classList.contains('error-feedback') ? 'error' : 'success', text });
  });
  return found;
}

@Component({
  selector: 'app-page-notice-popup',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notice) {
      <div class="page-notice-backdrop" (click)="close()">
        <div class="page-notice" [class.page-notice--error]="notice.tone === 'error'"
          [class.page-notice--success]="notice.tone === 'success'"
          [attr.role]="notice.tone === 'error' ? 'alertdialog' : 'dialog'" aria-modal="true"
          aria-labelledby="page-notice-title" aria-describedby="page-notice-text"
          (click)="$event.stopPropagation()">
          <span class="page-notice__icon" aria-hidden="true">{{ notice.tone === 'error' ? '!' : '✓' }}</span>
          <h2 id="page-notice-title">{{ (notice.tone === 'error' ? 'Algo correu mal' : 'Feito') | t }}</h2>
          <p id="page-notice-text">{{ notice.text }}</p>
          <button #okButton type="button" class="jynlo-action jynlo-action--primary" (click)="close()">
            {{ 'OK' | t }}
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .page-notice-backdrop {
      position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 20px;
      background: rgba(2, 12, 20, .62); backdrop-filter: blur(3px);
      animation: page-notice-fade .14s ease-out;
    }
    .page-notice {
      width: min(420px, 100%); display: grid; justify-items: center; gap: 12px; text-align: center;
      padding: 28px 24px 22px; border-radius: 20px; color: #eaf6f5;
      background: #0d2c3c; border: 1px solid rgba(83, 188, 180, .4);
      box-shadow: 0 24px 60px rgba(0, 0, 0, .45);
    }
    .page-notice--error { border-color: rgba(248, 113, 113, .55); }
    .page-notice__icon {
      width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center;
      font-size: 1.5rem; font-weight: 900; background: rgba(83, 188, 180, .18); color: #5ee6c8;
    }
    .page-notice--error .page-notice__icon { background: rgba(248, 113, 113, .16); color: #fca5a5; }
    h2 { margin: 0; font-size: 1.2rem; }
    p { margin: 0; line-height: 1.5; overflow-wrap: anywhere; }
    button { min-width: 140px; margin-top: 6px; }
    @keyframes page-notice-fade { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .page-notice-backdrop { animation: none; } }
  `]
})
export class PageNoticePopupComponent implements AfterViewInit, OnDestroy {
  notice: PageNotice | null = null;
  @ViewChild('okButton') private okButton?: ElementRef<HTMLButtonElement>;
  private observer?: MutationObserver;
  private readonly seen = new WeakMap<Element, string>();
  private scheduled = false;
  private autoClose?: ReturnType<typeof setTimeout>;
  private previousFocus: HTMLElement | null = null;

  constructor(private readonly zone: NgZone, private readonly cdr: ChangeDetectorRef,
              @Inject(PLATFORM_ID) private readonly platformId: object) {}

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId) || typeof MutationObserver === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    if (this.autoClose) clearTimeout(this.autoClose);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.notice) this.close(); }

  close(): void {
    if (this.autoClose) clearTimeout(this.autoClose);
    this.notice = null;
    this.cdr.markForCheck();
    this.previousFocus?.focus?.();
    this.previousFocus = null;
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      const found = noticesToShow(document, this.seen);
      if (!found.length) return;
      // Errors win over a success shown at the same time.
      const next = found.find(item => item.tone === 'error') ?? found[found.length - 1];
      this.zone.run(() => this.show(next));
    });
  }

  private show(notice: PageNotice): void {
    if (this.autoClose) clearTimeout(this.autoClose);
    if (!this.notice) this.previousFocus = document.activeElement as HTMLElement | null;
    this.notice = notice;
    this.cdr.detectChanges();
    this.okButton?.nativeElement.focus();
    if (notice.tone === 'success') {
      this.autoClose = setTimeout(() => this.zone.run(() => this.close()), 3500);
    }
  }
}
