import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, Inject,
  OnDestroy, OnInit, PLATFORM_ID, ViewChild
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '../i18n/translate.pipe';

/** Any image marked with this attribute opens enlarged when clicked. */
export const ZOOMABLE_IMAGE_SELECTOR = 'img[data-zoomable]';

export interface ZoomedImage { src: string; alt: string; }

/** Finds the zoomable image a click landed on, if any. */
export function zoomTarget(target: EventTarget | null): ZoomedImage | null {
  const element = target instanceof Element ? target.closest(ZOOMABLE_IMAGE_SELECTOR) : null;
  if (!(element instanceof HTMLImageElement)) return null;
  const src = element.currentSrc || element.src;
  if (!src) return null;
  return { src, alt: element.alt || '' };
}

/** One full-screen viewer for every zoomable photo (community covers, profile and game photos). */
@Component({
  selector: 'app-image-zoom',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (image) {
      <div class="image-zoom-backdrop" role="dialog" aria-modal="true"
        [attr.aria-label]="image.alt || ('Fotografia' | t)" (click)="close()">
        <button #closeButton type="button" class="image-zoom-close" [attr.aria-label]="'Fechar' | t"
          (click)="close(); $event.stopPropagation()">✕</button>
        <img class="image-zoom-image" [src]="image.src" [alt]="image.alt" (click)="$event.stopPropagation()">
      </div>
    }
  `,
  styles: [`
    .image-zoom-backdrop {
      position: fixed; inset: 0; z-index: 2100; display: grid; place-items: center; padding: 56px 16px 24px;
      background: rgba(2, 10, 16, .88); backdrop-filter: blur(4px); cursor: zoom-out;
      animation: image-zoom-fade .14s ease-out;
    }
    .image-zoom-image {
      max-width: min(1100px, 100%); max-height: 100%; object-fit: contain; border-radius: 14px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, .55); cursor: default;
    }
    .image-zoom-close {
      position: absolute; top: 14px; right: 14px; width: 42px; height: 42px; border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, .25); background: rgba(13, 44, 60, .9); color: #fff;
      font-size: 1.1rem; cursor: pointer;
    }
    .image-zoom-close:focus-visible { outline: 2px solid #5ee6c8; outline-offset: 2px; }
    @keyframes image-zoom-fade { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .image-zoom-backdrop { animation: none; } }
  `]
})
export class ImageZoomComponent implements OnInit, OnDestroy {
  image: ZoomedImage | null = null;
  @ViewChild('closeButton') private closeButton?: ElementRef<HTMLButtonElement>;
  private readonly browser: boolean;
  private readonly onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.defaultPrevented) return;
    const found = zoomTarget(event.target);
    if (!found) return;
    // The photo may sit inside a card or button: the zoom replaces that click.
    event.preventDefault();
    event.stopPropagation();
    this.open(found);
  };

  constructor(@Inject(PLATFORM_ID) platformId: object, @Inject(DOCUMENT) private document: Document,
              private cdr: ChangeDetectorRef) {
    this.browser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (this.browser) this.document.addEventListener('click', this.onClick, true);
  }

  ngOnDestroy(): void {
    if (this.browser) this.document.removeEventListener('click', this.onClick, true);
  }

  open(image: ZoomedImage): void {
    this.image = image;
    this.cdr.markForCheck();
    setTimeout(() => this.closeButton?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (!this.image) return;
    this.image = null;
    this.cdr.markForCheck();
  }
}
