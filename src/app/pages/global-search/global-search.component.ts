import { venueCatalogueDisplayLabel } from '../../shared/venue-catalogue-display';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, Subject, Subscription, catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap } from 'rxjs';
import { environment } from 'src/environment/environment';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { TranslatePipe } from '../../i18n/translate.pipe';

export interface SearchHit { title: string; subtitle: string; link: any[]; image?: string | null; }
export interface GlobalSearchView { people: SearchHit[]; sessions: SearchHit[]; communities: SearchHit[]; teams: SearchHit[]; venues: SearchHit[]; failed: string[]; }

const LIMIT = 5;
const fold = (s: unknown) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Clean the typed text: no control characters, at least 2 letters, at most 80. */
export function cleanQuery(value: string): string {
  const q = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return q.length >= 2 ? q.slice(0, 80) : '';
}

/** Games are searched by sport when the text names one, otherwise by city. */
export function sessionFilters(query: string, sports: readonly string[]): { sport?: string; city?: string } | null {
  const q = fold(query);
  if (q.length < 2) return null;
  const sport = sports.find(s => fold(s) === q || fold(venueCatalogueDisplayLabel(s, 'sport', 'en')) === q);
  return sport ? { sport } : { city: query.trim() };
}

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './global-search.component.html',
  styleUrls: ['./global-search.component.css']
})
export class GlobalSearchComponent implements OnInit, OnDestroy {
  query = '';
  loading = false;
  view: GlobalSearchView | null = null;
  private readonly input$ = new Subject<string>();
  private sub?: Subscription;
  private readonly api = environment.apiUrl.replace(/\/$/, '');

  constructor(private http: HttpClient, private route: ActivatedRoute, private router: Router, private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.sub = this.input$.pipe(
      map(cleanQuery), debounceTime(300), distinctUntilChanged(),
      switchMap(q => {
        if (!q) { this.loading = false; return of(null); }
        this.loading = true; this.cd.markForCheck();
        return this.search(q);
      })
    ).subscribe(view => { this.view = view; this.loading = false; this.cd.markForCheck(); });
    const initial = this.route.snapshot.queryParamMap?.get('q') ?? '';
    if (initial) { this.query = initial; this.input$.next(initial); }
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  changed(value: string): void {
    this.query = value;
    this.input$.next(value);
    void this.router.navigate([], { queryParams: { q: cleanQuery(value) || null }, replaceUrl: true });
  }

  get cleaned(): string { return cleanQuery(this.query); }
  get total(): number { const v = this.view; return v ? v.people.length + v.sessions.length + v.communities.length + v.teams.length + v.venues.length : 0; }

  private media(url: string | null | undefined): string | null {
    if (!url) return null;
    return /^https?:/i.test(url) ? url : this.api + (url.startsWith('/') ? '' : '/') + url;
  }

  private search(q: string): Observable<GlobalSearchView> {
    const failed: string[] = [];
    const safe = <T>(name: string, source: Observable<T[]>) => source.pipe(
      map(items => Array.isArray(items) ? items.slice(0, LIMIT) : []),
      catchError(() => { failed.push(name); return of([] as T[]); })
    );
    const enc = encodeURIComponent(q);
    const filters = sessionFilters(q, SPORTS_CATALOG);
    const sessionParams = new URLSearchParams({ ...(filters ?? {}), sort: 'date' } as Record<string, string>).toString();
    return forkJoin({
      people: safe<any>('search.people', this.http.get<any[]>(`${this.api}/api/profile/search?name=${enc}`)),
      communities: safe<any>('search.communities', this.http.get<any>(`${this.api}/api/communities/search?name=${enc}&sport=&page=0`).pipe(map(r => r?.communities ?? []))),
      teams: safe<any>('search.teams', this.http.get<any[]>(`${this.api}/api/teams?q=${enc}`)),
      venues: safe<any>('search.venues', this.http.get<any>(`${this.api}/api/venues/suggest?page=0&name=${enc}`).pipe(map(r => r?.venues ?? []))),
      sessions: safe<any>('search.sessions', filters ? this.http.get<any[]>(`${this.api}/api/sessions?${sessionParams}`)
        .pipe(map(list => (list ?? []).filter(s => s?.status === 'OPEN' || s?.status === 'FULL'))) : of([])),
    }).pipe(map(r => ({
      people: r.people.map(p => ({ title: p.nickname || p.fullName || p.username, subtitle: '@' + p.username + (p.location ? ' · ' + p.location : ''), link: ['/menu/perfis', p.username], image: this.media(p.profilePicUrl) })),
      sessions: r.sessions.map(s => ({ title: `${s.sport} · ${s.city}`, subtitle: this.when(s.gameDate) + ` · ${s.participantCount}/${s.maxParticipants}`, link: ['/menu/events', s.id] })),
      communities: r.communities.map(c => ({ title: c.name, subtitle: c.sport || c.description || '', link: ['/menu/communities', c.id], image: this.media(c.photoUrl) })),
      teams: r.teams.map(t => ({ title: t.name, subtitle: [t.sport, t.location].filter(Boolean).join(' · '), link: ['/menu/teams', t.id] })),
      venues: r.venues.map(v => ({ title: v.name, subtitle: v.city || '', link: ['/menu/venues', v.id] })),
      failed,
    })));
  }

  private when(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}
