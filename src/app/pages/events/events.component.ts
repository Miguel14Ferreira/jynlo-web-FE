import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize, retry, Subscription, timeout } from 'rxjs';

import { SessionSummary } from '../model/session-summary';
import { appTranslate as t } from '../../i18n/i18n.service';
import { SessionService } from '../../services/session.service';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';

@Component({
  selector: 'app-events',
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.css', '../../../styles/jynlo-activities-neon-glass.css', './events-v3-neon-cards.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class EventsComponent implements OnInit, OnDestroy {
  sessions: SessionSummary[] = [];
  citySuggestions: string[] = [];
  loading = false;
  locating = false;
  errorMessage = '';
  locationError = '';

  readonly sportsCatalog = SPORTS_CATALOG;
  discoveredCustomSports: string[] = [];
  get searchableSports(): string[] {
    return [...this.sportsCatalog, ...this.discoveredCustomSports];
  }

  sport = '';
  city = '';
  availableOnly = false;
  freeOnly = false;
  sort = 'date';

  showAdvancedFilters = false;
  quickDate: 'today' | 'week' | 'weekend' | '' = '';
  fromDateTime = '';
  toDateTime = '';
  minPrice: number | null = null;
  maxPrice: number | null = null;

  nearbyActive = false;
  radiusKm = 25;
  latitude: number | null = null;
  longitude: number | null = null;

  private searchRequestId = 0;
  private locationRequestId = 0;
  private currentSearch?: Subscription;
  private destroyed = false;

  constructor(
    private sessionService: SessionService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Reuse Discover's explicit filters without changing the default Sessions entry.
    const params = this.route.snapshot.queryParamMap;
    this.sport = (params.get('sport') || '').trim();
    this.city = (params.get('city') || '').trim();
    this.loadSessions();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.searchRequestId;
    ++this.locationRequestId;
    this.currentSearch?.unsubscribe();
  }

  loadSessions(): void {
    if (this.destroyed) return;
    const requestId = ++this.searchRequestId;
    // Only the most recent filters are allowed to update the screen.
    this.currentSearch?.unsubscribe();
    this.loading = true;
    this.errorMessage = '';

    const from = this.toIsoOrUndefined(this.fromDateTime);
    const to = this.toIsoOrUndefined(this.toDateTime);

    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      this.loading = false;
      this.sessions = [];
      this.citySuggestions = [];
      this.errorMessage = t('feedback.events.invalidDateRange');
      return;
    }

    if (
      this.minPrice !== null
      && this.maxPrice !== null
      && this.minPrice > this.maxPrice
    ) {
      this.loading = false;
      this.sessions = [];
      this.citySuggestions = [];
      this.errorMessage = t('feedback.events.invalidPriceRange');
      return;
    }

    this.currentSearch = this.sessionService.discover({
      sport: this.sport,
      city: this.city,
      availability: this.availableOnly ? 'available' : undefined,
      freeOnly: this.freeOnly ? true : undefined,
      sort: this.sort,
      latitude: this.nearbyActive && this.latitude !== null ? this.latitude : undefined,
      longitude: this.nearbyActive && this.longitude !== null ? this.longitude : undefined,
      radiusKm: this.nearbyActive ? this.radiusKm : undefined,
      from,
      to,
      minPrice: this.freeOnly || this.minPrice === null
        ? undefined
        : Math.max(0, Number(this.minPrice)),
      maxPrice: this.freeOnly || this.maxPrice === null
        ? undefined
        : Math.max(0, Number(this.maxPrice))
    })
    .pipe(
      timeout(10_000),
      retry({ count: 1 }),
      finalize(() => {
        if (requestId === this.searchRequestId && !this.destroyed) {
          this.loading = false;
        }
      })
    )
    .subscribe({
      next: sessions => {
        if (requestId !== this.searchRequestId || this.destroyed) return;
        this.sessions = sessions;
        this.discoveredCustomSports = [...new Set([
          ...this.discoveredCustomSports,
          ...sessions.map(session => session.sport).filter(name =>
            !!name && !this.sportsCatalog.includes(name))
        ])].slice(-40);
        this.updateCitySuggestions();
      },
      error: () => {
        if (requestId !== this.searchRequestId || this.destroyed) return;
        this.sessions = [];
        this.citySuggestions = [];
        this.errorMessage = t('feedback.events.loadError');
      }
    });
  }

  useCurrentLocation(): void {
    if (this.locating || this.destroyed) return;
    this.locationError = '';

    if (!navigator.geolocation) {
      this.locationError = t('feedback.location.unsupported');
      return;
    }

    this.locating = true;
    const requestId = ++this.locationRequestId;

    navigator.geolocation.getCurrentPosition(
      position => {
        if (requestId !== this.locationRequestId || this.destroyed) return;
        this.latitude = position.coords.latitude;
        this.longitude = position.coords.longitude;
        this.nearbyActive = true;
        this.sort = 'distance';
        this.locating = false;
        this.loadSessions();
      },
      () => {
        if (requestId !== this.locationRequestId || this.destroyed) return;
        this.locating = false;
        this.locationError = t('feedback.location.error');
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  }

  disableNearby(): void {
    ++this.locationRequestId;
    this.locating = false;
    this.nearbyActive = false;
    this.latitude = null;
    this.longitude = null;
    this.locationError = '';
    if (this.sort === 'distance') {
      this.sort = 'date';
    }
    this.loadSessions();
  }

  vacancies(session: SessionSummary): number {
    return Math.max(
      0,
      session.maxParticipants - session.participantCount
    );
  }

  canJoin(session: SessionSummary): boolean {
    return !session.privateGame
      && !session.joinedByViewer
      && !session.waitlistedByViewer
      && this.vacancies(session) > 0
      && session.status?.toUpperCase() === 'OPEN'
      && Date.parse(session.gameDate) > Date.now();
  }

  canJoinWaitlist(session: SessionSummary): boolean {
    return !session.privateGame
      && !session.joinedByViewer
      && !session.waitlistedByViewer
      && this.vacancies(session) === 0
      && session.status?.toUpperCase() === 'FULL'
      && Date.parse(session.gameDate) > Date.now();
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  applyQuickSport(value: 'Padel' | 'Futebol'): void {
    this.sport = this.sport === value ? '' : value;
    this.loadSessions();
  }

  applyQuickDate(value: 'today' | 'week' | 'weekend'): void {
    if (this.quickDate === value) {
      this.quickDate = '';
      this.fromDateTime = '';
      this.toDateTime = '';
      this.loadSessions();
      return;
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);

    if (value === 'week') {
      const daysFromMonday = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - daysFromMonday);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
    } else if (value === 'weekend') {
      const daysUntilSaturday = (6 - start.getDay() + 7) % 7;
      if (start.getDay() === 0) {
        start.setDate(start.getDate() - 1);
      } else {
        start.setDate(start.getDate() + daysUntilSaturday);
      }
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 1);
    }

    end.setHours(23, 59, 0, 0);
    this.fromDateTime = this.toLocalDateTime(start);
    this.toDateTime = this.toLocalDateTime(end);
    this.quickDate = value;
    this.loadSessions();
  }

  increaseRadius(): void {
    if (!this.nearbyActive) return;
    const next = [5, 10, 25, 50, 100].find(km => km > this.radiusKm);
    if (next === undefined) return;
    this.radiusKm = next;
    this.loadSessions();
  }

  private toLocalDateTime(value: Date): string {
    const part = (num: number) => String(num).padStart(2, '0');
    return value.getFullYear() + '-' + part(value.getMonth() + 1) + '-' +
      part(value.getDate()) + 'T' + part(value.getHours()) + ':' +
      part(value.getMinutes());
  }

  clearFilters(): void {
    this.quickDate = '';
    this.sport = '';
    this.city = '';
    this.availableOnly = false;
    this.freeOnly = false;
    this.fromDateTime = '';
    this.toDateTime = '';
    this.minPrice = null;
    this.maxPrice = null;
    this.sort = this.nearbyActive ? 'distance' : 'date';
    this.errorMessage = '';
    this.loadSessions();
  }

  private updateCitySuggestions(): void {
    this.citySuggestions = [...new Set(
      this.sessions
        .map(session => session.city?.trim())
        .filter((city): city is string => Boolean(city))
    )].sort((a, b) => a.localeCompare(b, 'pt'));
  }

  private toIsoOrUndefined(value: string): string | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? undefined
      : parsed.toISOString();
  }
}
