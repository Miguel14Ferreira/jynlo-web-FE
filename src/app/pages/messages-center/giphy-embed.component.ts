import { TranslatePipe } from '../../i18n/translate.pipe';
import { Component, Input, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/** Provider-hosted GIPHY player. Jynlo does not cache, rehost or proxy GIF assets. */
@Component({
  selector: 'app-giphy-embed',
  standalone: true, imports: [TranslatePipe],
  template: `
    @if (safeEmbedUrl; as url) {
      <div class="giphy-embed" [class.compact]="compact">
        <iframe [src]="url" [title]="'GIPHY GIF' | t" loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups"
          referrerpolicy="no-referrer" allowfullscreen></iframe>
        @if (!compact) {
          @if (caption) { <p>{{ caption }}</p> }
          <a [href]="pageUrl" rel="noopener noreferrer" target="_blank">
            via GIPHY · {{ creator }}
          </a>
        }
      </div>
    }
  `,
  styles: [`
    .giphy-embed { display:flex;flex-direction:column;gap:5px;width:min(300px,65vw);margin-top:8px; }
    .giphy-embed iframe { width:100%;aspect-ratio:4/3;min-height:160px;border:0;
      border-radius:12px;background:#102a36; }
    .giphy-embed.compact { display:block;width:100%;height:100%;margin:0;overflow:hidden; }
    .giphy-embed.compact iframe { display:block;width:100%;height:100%;min-height:0;aspect-ratio:auto;
      border-radius:7px;pointer-events:none; }
    .giphy-embed p { margin:2px 0;color:#eafaf7;overflow-wrap:anywhere; }
    .giphy-embed a { align-self:flex-end;font-size:.69rem;color:#b0e4d8;text-decoration:none; }
  `]
})
export class GiphyEmbedComponent {
  @Input() compact = false;
  @Input() id = '';
  @Input() pageUrl = '';
  @Input() caption = '';
  @Input() creator = 'GIPHY';
  private readonly sanitizer = inject(DomSanitizer);

  get safeEmbedUrl(): SafeResourceUrl | null {
    // An iframe requires SafeResourceUrl; bypass only for an allowlisted ID.
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(this.id)) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      'https://giphy.com/embed/' + this.id
    );
  }
}
