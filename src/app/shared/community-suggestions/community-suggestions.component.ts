import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { SportNamePipe } from '../../i18n/sport-name.pipe';
import { CommunityGroupsService } from '../../services/community-groups.service';

export interface SuggestedCommunity { id: number; name: string; sport: string | null; visibility: string; }

/** Public communities the person is not in yet, so a new account does not land on an empty home. */
export function pickCommunitySuggestions(found: SuggestedCommunity[], mineIds: number[], limit = 3): SuggestedCommunity[] {
  const mine = new Set(mineIds);
  return found.filter(c => c.visibility === 'PUBLIC' && !mine.has(c.id)).slice(0, limit);
}

/** Shown only to people who are in no community yet. */
@Component({
  selector: 'app-community-suggestions',
  standalone: true,
  imports: [RouterLink, TranslatePipe, SportNamePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (suggestions.length) {
      <section class="cs" [attr.aria-label]="'Comunidades para te juntares' | t">
        <div class="cs__head">
          <h2>{{ 'Comunidades para te juntares' | t }}</h2>
          <a routerLink="/menu/communities">{{ 'Ver todas' | t }} →</a>
        </div>
        <p class="cs__muted">{{ 'Junta-te a um grupo para combinar jogos todas as semanas.' | t }}</p>
        <div class="cs__list">
          @for (c of suggestions; track c.id) {
            <a class="cs__item" [routerLink]="['/menu/communities', c.id]">
              <span class="cs__avatar" aria-hidden="true">{{ initial(c.name) }}</span>
              <span class="cs__text"><strong>{{ c.name }}</strong>@if (c.sport) { <small>{{ c.sport | sportName }}</small> }</span>
              <span aria-hidden="true">↗</span>
            </a>
          }
        </div>
      </section>
    }
  `,
  styles: [`
    .cs { display:grid; gap:.6rem; margin:1rem 0; padding:1.1rem; border-radius:18px; border:1px solid rgba(96,176,182,.3); background:rgba(10,41,55,.65); color:#eafff9; }
    .cs__head { display:flex; justify-content:space-between; align-items:center; gap:.6rem; flex-wrap:wrap; }
    .cs__head h2 { margin:0; font-size:1.15rem; }
    .cs__head a { color:#7ae5c5; font-weight:700; text-decoration:none; min-height:44px; display:inline-flex; align-items:center; }
    .cs__muted { margin:0; color:#b9d4d6; font-size:.9rem; }
    .cs__list { display:grid; gap:.5rem; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); }
    .cs__item { display:flex; align-items:center; gap:.7rem; min-height:56px; padding:.6rem .8rem; border-radius:14px; background:rgba(98,230,196,.08); color:#eafff9; text-decoration:none; }
    .cs__item:hover, .cs__item:focus-visible { background:rgba(98,230,196,.16); }
    .cs__avatar { width:36px; height:36px; border-radius:50%; display:grid; place-items:center; background:rgba(98,230,196,.2); color:#7ae5c5; font-weight:900; }
    .cs__text { flex:1; display:grid; }
    .cs__text small { color:#b9d4d6; }
  `]
})
export class CommunitySuggestionsComponent implements OnInit {
  suggestions: SuggestedCommunity[] = [];
  private readonly groups = inject(CommunityGroupsService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    forkJoin({
      mine: this.groups.mine().pipe(catchError(() => of(null))),
      found: this.groups.search('', '', 0).pipe(catchError(() => of(null)))
    }).subscribe(({ mine, found }) => {
      // Only for people in no community; if we cannot tell, show nothing.
      if (!mine || mine.length || !found) return;
      this.suggestions = pickCommunitySuggestions(found.communities as SuggestedCommunity[], []);
      this.cdr.markForCheck();
    });
  }

  initial(name: string): string { return (name || '?').trim().charAt(0).toUpperCase(); }
}
