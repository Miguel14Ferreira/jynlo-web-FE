import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, catchError, of, shareReplay, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate } from '../../i18n/i18n.service';
import { SessionService } from '../../services/session.service';
import { VenueService } from '../../services/venue.service';
import { AuthenticationService } from '../../services/authethication.service';
import { SeoService } from '../../shared/seo.service';
import { SportCityEntry, unslug } from '../../shared/sport-city-slug';
import { SessionSummary } from '../model/session-summary';
import { Venue } from '../model/venue';

let indexCache: ReturnType<typeof loadIndex> | null = null;
function loadIndex(http: HttpClient) {
  return http.get<SportCityEntry[]>('/assets/jogos-index.json').pipe(timeout(15000), catchError(() => of([] as SportCityEntry[])), shareReplay(1));
}

/**
 * Public pages for search engines and visitors: /jogos (every sport and city) and /jogos/<desporto>/<cidade>
 * (games planned there now, venues and nearby links). The build writes a static copy of each page so
 * Google reads it without JavaScript; this component shows the live games.
 */
@Component({
  selector: 'app-sport-city',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './sport-city.component.html',
  styleUrls: ['./sport-city.component.css'],
})
export class SportCityComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly sessionsApi = inject(SessionService);
  private readonly venuesApi = inject(VenueService);
  private readonly auth = inject(AuthenticationService);
  private readonly seo = inject(SeoService);
  private subs = new Subscription();

  index: SportCityEntry[] = [];
  sportSlug = '';
  citySlug = '';
  sport = '';
  city = '';
  sessions: SessionSummary[] = [];
  venues: Venue[] = [];
  loadingSessions = false;
  signedIn = false;

  get hub(): boolean { return !this.sportSlug; }

  /** Hub: sports with their cities, most venues first. */
  get groups(): { sport: string; s: string; cities: SportCityEntry[] }[] {
    const bySport = new Map<string, SportCityEntry[]>();
    for (const e of this.index) bySport.set(e.s, [...(bySport.get(e.s) ?? []), e]);
    return [...bySport.entries()]
      .map(([s, cities]) => ({ s, sport: cities[0].sport, cities: cities.sort((a, b) => b.venues - a.venues) }))
      .sort((a, b) => b.cities.length - a.cities.length);
  }
  get otherCities(): SportCityEntry[] {
    return this.index.filter(e => e.s === this.sportSlug && e.c !== this.citySlug).sort((a, b) => b.venues - a.venues).slice(0, 12);
  }
  get otherSports(): SportCityEntry[] {
    return this.index.filter(e => e.c === this.citySlug && e.s !== this.sportSlug).sort((a, b) => b.venues - a.venues).slice(0, 12);
  }

  ngOnInit(): void {
    try { this.signedIn = this.auth.isLoggedIn(); } catch { this.signedIn = false; }
    indexCache ??= loadIndex(this.http);
    this.subs.add(this.route.paramMap.subscribe(params => {
      this.sportSlug = params.get('sport') ?? '';
      this.citySlug = params.get('city') ?? '';
      this.subs.add(indexCache!.subscribe(list => { this.index = Array.isArray(list) ? list : []; this.show(); }));
    }));
  }

  ngOnDestroy(): void { this.subs.unsubscribe(); }

  sessionLink(id: number): (string | number)[] { return this.signedIn ? ['/menu/events', id] : ['/sessions', id]; }

  vacancies(session: SessionSummary): number { return Math.max(0, (session.maxParticipants ?? 0) - (session.participantCount ?? 0)); }

  private show(): void {
    if (this.hub) {
      this.seo.apply({ title: appTranslate('Jogos por desporto e cidade'), index: true, path: '/jogos',
        description: appTranslate('Encontra jogos de padel, futebol, ténis e outros desportos na tua cidade, e os recintos onde se joga.') });
      return;
    }
    const entry = this.index.find(e => e.s === this.sportSlug && e.c === this.citySlug);
    this.sport = entry?.sport ?? unslug(this.sportSlug);
    this.city = entry?.city ?? unslug(this.citySlug);
    this.seo.apply({
      title: appTranslate('Jogos de {{sport}} em {{city}}', { sport: this.sport, city: this.city }),
      description: appTranslate('Jogos de {{sport}} em {{city}} com vagas, recintos onde se joga e como criar o teu jogo na Jynlo.', { sport: this.sport, city: this.city }),
      index: true, path: `/jogos/${this.sportSlug}/${this.citySlug}`,
    });
    this.loadingSessions = true;
    this.sessions = [];
    this.venues = [];
    this.subs.add(this.sessionsApi.discover({ sport: this.sport, city: this.city }).pipe(timeout(15000), catchError(() => of([] as SessionSummary[])))
      .subscribe(list => { this.sessions = (list ?? []).slice(0, 12); this.loadingSessions = false; }));
    this.subs.add(this.venuesApi.suggest('', this.city, this.sport, 0).pipe(timeout(15000), catchError(() => of(null)))
      .subscribe(page => { this.venues = (page?.venues ?? []).slice(0, 12); }));
  }
}
