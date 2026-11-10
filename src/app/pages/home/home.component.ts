import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Subject, takeUntil, timeout } from 'rxjs';

import { SessionSummary } from '../model/session-summary';
import { SessionService } from '../../services/session.service';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.css', './home-concept-one-refresh.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class HomeComponent implements OnInit, OnDestroy {
  dark = true;
  readonly sportsCatalog = SPORTS_CATALOG;
  featuredSessions: SessionSummary[] = [];
  sessionsLoading = true;
  sessionsLoadError = false;

  private readonly destroy$ = new Subject<void>();
  private readonly searchReset$ = new Subject<void>();
  private lastPublicFilters = { sport: '', city: '' };

  constructor(
    private readonly sessionService: SessionService
  ) {}

  ngOnInit(): void {
    this.dark = localStorage.getItem('theme') !== 'claro';
    this.loadPublicDiscovery('', '');
  }

  searchPublic(event: Event, sport: string, city: string): void {
    event.preventDefault();
    this.loadPublicDiscovery(sport.trim(), city.trim());
  }

  retryPublicDiscovery(): void {
    this.loadPublicDiscovery(this.lastPublicFilters.sport, this.lastPublicFilters.city);
  }

  clearPublicSearch(sportInput: HTMLInputElement, cityInput: HTMLInputElement): void {
    sportInput.value = '';
    cityInput.value = '';
    this.loadPublicDiscovery('', '');
  }

  private loadPublicDiscovery(sport: string, city: string): void {
    this.lastPublicFilters = { sport, city };
    // A later search wins: ignore responses from previous filters.
    this.searchReset$.next();
    this.sessionsLoading = true;
    this.sessionsLoadError = false;
    this.featuredSessions = [];

    this.sessionService.discover({
      privateGame: false, from: new Date().toISOString(), sport, city
    })
      .pipe(timeout(8000), takeUntil(this.searchReset$), takeUntil(this.destroy$))
      .subscribe({
        next: sessions => {
          const now = Date.now();
          this.featuredSessions = (Array.isArray(sessions) ? sessions : [])
            .filter(item => item && item.privateGame === false
              && item.audience === 'PUBLIC'
              && (item.status === 'OPEN' || item.status === 'FULL')
              && Number.isFinite(Date.parse(item.gameDate))
              && Date.parse(item.gameDate) > now)
            .sort((first, second) =>
              Date.parse(first.gameDate) - Date.parse(second.gameDate))
            .slice(0, 9);
          this.sessionsLoading = false;
        },
        error: () => {
          this.sessionsLoadError = true;
          this.sessionsLoading = false;
        }
      });

  }

  remainingSpots(session: SessionSummary): number | null {
    // FULL is authoritative even if a participant-count snapshot is delayed.
    if (session.status === 'FULL') {
      return 0;
    }

    const { participantCount, maxParticipants } = session;
    if (!Number.isSafeInteger(participantCount)
        || !Number.isSafeInteger(maxParticipants)
        || participantCount < 0 || maxParticipants <= 0) {
      return null; // Do not invent availability for incomplete public data.
    }

    return Math.max(0, maxParticipants - participantCount);
  }

  ngOnDestroy(): void {
    this.searchReset$.next();
    this.searchReset$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
