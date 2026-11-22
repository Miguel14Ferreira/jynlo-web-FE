import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of, catchError, finalize } from 'rxjs';
import { RouterLink } from '@angular/router';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { AuthenticationService } from '../../services/authethication.service';
import { FIRST_STEPS_MAX_SPORTS, FirstStepsService, firstStepsChoices } from '../../services/first-steps.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

@Component({
  selector: 'app-first-steps',
  standalone: true,
  imports: [SportNamePipe, CommonModule, FormsModule, TranslatePipe, RouterLink],
  templateUrl: './first-steps.component.html',
  styleUrls: ['./first-steps.component.css']
})
export class FirstStepsComponent implements OnInit {
  readonly max = FIRST_STEPS_MAX_SPORTS;
  catalog: string[] = [];
  selected: string[] = [];
  city = '';
  filter = '';
  loading = true;
  busy = false;
  error = '';

  /** Second step: public communities in the chosen sports, so day one is not empty. */
  suggestions: Array<{ id: number; name: string; sport: string | null; description: string | null }> | null = null;
  followed: number[] = [];
  followBusy: number | null = null;

  constructor(private steps: FirstStepsService, private auth: AuthenticationService, private router: Router, private cd: ChangeDetectorRef,
              private communities: CommunityGroupsService) {}

  ngOnInit(): void {
    forkJoin({ catalog: this.steps.catalog(), state: this.steps.get() }).subscribe({
      next: ({ catalog, state }) => {
        this.catalog = catalog ?? [];
        this.selected = (state?.favoriteSports ?? []).filter(s => this.catalog.includes(s));
        this.city = state?.location ?? '';
        this.loading = false; this.cd.markForCheck();
      },
      error: () => { this.error = 'firstSteps.loadError'; this.loading = false; this.cd.markForCheck(); }
    });
  }

  get choices(): string[] { return firstStepsChoices(this.catalog, this.filter, this.selected); }
  isOn(sport: string): boolean { return this.selected.includes(sport); }

  toggle(sport: string): void {
    if (this.isOn(sport)) this.selected = this.selected.filter(s => s !== sport);
    else if (this.selected.length < this.max) this.selected = [...this.selected, sport];
  }

  save(): void {
    if (this.busy) return;
    if (!this.selected.length) { this.error = 'firstSteps.pickOne'; return; }
    this.busy = true; this.error = '';
    const city = this.city.trim().slice(0, 120);
    this.steps.save(this.selected, city).subscribe({
      next: () => this.loadSuggestions(),
      error: () => { this.busy = false; this.error = 'firstSteps.saveError'; this.cd.markForCheck(); }
    });
  }

  private loadSuggestions(): void {
    const empty = { communities: [], page: 0, hasMore: false };
    forkJoin({
      mine: this.communities.mine().pipe(catchError(() => of([]))),
      pages: forkJoin(this.selected.slice(0, 3).map(sport => this.communities.search('', sport, 0).pipe(catchError(() => of(empty)))))
    }).pipe(finalize(() => { this.busy = false; this.cd.markForCheck(); })).subscribe(({ mine, pages }) => {
      const found = suggestedCommunities(pages.map(page => (page?.communities ?? []) as any[]), (mine ?? []).map(group => group.id), 8);
      if (found.length) this.suggestions = found;
      else this.finish();
    });
  }

  finish(): void {
    const city = this.city.trim().slice(0, 120);
    void this.router.navigate(['/menu/discover'], { queryParams: { sport: this.selected[0], city: city || null } });
  }

  isFollowed(id: number): boolean { return this.followed.includes(id); }

  toggleFollow(id: number): void {
    if (this.followBusy !== null) return;
    const next = !this.isFollowed(id);
    this.followBusy = id; this.error = '';
    (next ? this.communities.followCommunity(id) : this.communities.unfollowCommunity(id))
      .pipe(finalize(() => { this.followBusy = null; this.cd.markForCheck(); }))
      .subscribe({
        next: () => { this.followed = next ? [...this.followed, id] : this.followed.filter(item => item !== id); },
        error: () => { this.error = 'Não foi possível seguir a comunidade. Tenta novamente.'; }
      });
  }

  later(): void {
    this.steps.skip(this.auth.loggedInPerfilname);
    void this.router.navigate(['/menu/feed']);
  }
}

/**
 * Public communities for the chosen sports (one list per sport), without the ones
 * the person already belongs to, interleaved so every sport shows up.
 */
export function suggestedCommunities<T extends { id: number; visibility?: string }>(lists: T[][], memberIds: number[], limit: number): T[] {
  const mine = new Set(memberIds);
  const seen = new Set<number>();
  const out: T[] = [];
  const queues = lists.map(list => (list ?? []).filter(group => group && group.visibility === 'PUBLIC'
    && Number.isSafeInteger(group.id) && group.id > 0 && !mine.has(group.id)));
  for (let round = 0; out.length < limit && queues.some(queue => queue.length > round); round++) {
    for (const queue of queues) {
      const group = queue[round];
      if (group && !seen.has(group.id) && out.length < limit) { seen.add(group.id); out.push(group); }
    }
  }
  return out;
}
