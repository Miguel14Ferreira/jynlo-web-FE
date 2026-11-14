import { Directive, ElementRef, Input, OnChanges, OnDestroy, Renderer2, inject } from '@angular/core';
import { PrivateProfileMediaService } from '../services/private-profile-media.service';

/**
 * Works for both ordinary CDN assets and authenticated private post/story media.
 * Never set a protected /api/profile-media URL as a raw <img>/<video> src:
 * browser media elements cannot send the required bearer token.
 */
@Directive({ selector: 'img[jynloProtectedSrc],video[jynloProtectedSrc]', standalone: true })
export class ProtectedMediaDirective implements OnChanges, OnDestroy {
  @Input() jynloProtectedSrc: string | null | undefined;
  private readonly element = inject(ElementRef<HTMLImageElement | HTMLVideoElement>);
  private readonly renderer = inject(Renderer2);
  private readonly media = inject(PrivateProfileMediaService);
  private activeUrl: string | null = null;
  private revision = 0;

  ngOnChanges(): void {
    const revision = ++this.revision;
    const source = this.jynloProtectedSrc || '';
    this.clear();
    if (!source) return;
    if (!source.startsWith('/api/profile-media/')) {
      this.renderer.setAttribute(this.element.nativeElement,'src',source);
      return;
    }
    void this.media.authorizedObjectUrl(source).then(url => {
      if (revision !== this.revision) {
        this.media.revoke(url);
        return;
      }
      this.activeUrl=url;
      this.renderer.setAttribute(this.element.nativeElement,'src',url);
      if (this.element.nativeElement instanceof HTMLVideoElement) this.element.nativeElement.load();
    }).catch(() => {
      if (revision === this.revision) this.clear();
    });
  }

  private clear(): void {
    this.renderer.removeAttribute(this.element.nativeElement,'src');
    if (this.activeUrl) this.media.revoke(this.activeUrl);
    this.activeUrl=null;
  }

  ngOnDestroy(): void {
    ++this.revision;
    this.clear();
  }
}
