import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';

/**
 * Top of "Jogar": one search box and the three ways to find somewhere to play
 * (Jogos, Recintos, Mapa). Shared by the three pages so they feel like one place.
 */
@Component({
  selector: 'app-play-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <header class="play-head">
      <div class="play-head__row">
        <h1>{{ 'Jogar' | t }}</h1>
        <ng-content></ng-content>
      </div>
      <form class="play-search" role="search" (ngSubmit)="search()">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input type="search" name="q" [(ngModel)]="query" autocomplete="off"
          [placeholder]="'Desporto, cidade, recinto ou pessoa' | t" [attr.aria-label]="'Procurar' | t">
      </form>
      <nav class="play-tabs" [attr.aria-label]="'Jogar' | t">
        <a routerLink="/menu/events" [class.is-on]="active === 'games'" [attr.aria-current]="active === 'games' ? 'page' : null">{{ 'Jogos' | t }}</a>
        <a routerLink="/menu/venues" [class.is-on]="active === 'venues'" [attr.aria-current]="active === 'venues' ? 'page' : null">{{ 'Recintos' | t }}</a>
        <a routerLink="/menu/jogar/mapa" [class.is-on]="active === 'map'" [attr.aria-current]="active === 'map' ? 'page' : null">{{ 'Mapa' | t }}</a>
      </nav>
    </header>
  `,
  styles: [`
    :host { display: block; }
    .play-head { display: grid; gap: 12px; margin: 0 0 16px; }
    .play-head__row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; justify-content: space-between; }
    .play-head h1 { margin: 0; color: #f3fffc; font-size: clamp(1.5rem, 2vw, 1.9rem); font-weight: 900; line-height: 1.2; }
    .play-search { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 14px; border-radius: 14px;
      border: 1px solid rgba(96, 176, 182, .35); background: rgba(10, 41, 55, .7); color: #9fb8c0; }
    .play-search:focus-within { border-color: #5ee6c8; }
    .play-search input { flex: 1; min-width: 0; min-height: 0 !important; padding: 0 !important; border: 0 !important; background: none !important; box-shadow: none !important; color: #f3fffc; font: inherit; font-size: 1rem; outline: none; }
    .play-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 14px; background: rgba(10, 41, 55, .7); max-width: 520px; }
    .play-tabs a { display: flex; align-items: center; justify-content: center; min-height: 42px; border-radius: 10px; color: #e7f4f5;
      font-size: .95rem; font-weight: 800; text-decoration: none; }
    .play-tabs a:hover { background: rgba(94, 230, 200, .08); }
    .play-tabs a.is-on { background: #2ee6d0; color: #04212a; }
    .play-tabs a:focus-visible { outline: 2px solid #5ee6c8; outline-offset: 2px; }
  `],
})
export class PlayTabsComponent {
  @Input() active: 'games' | 'venues' | 'map' = 'games';
  query = '';
  private readonly router = inject(Router);

  search(): void {
    const q = this.query.trim();
    void this.router.navigate(['/menu/search'], { queryParams: q ? { q } : {} });
  }
}
