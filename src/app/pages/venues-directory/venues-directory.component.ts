import { VenueBookingService } from '../../services/venue-booking.service';
import { SportNamePipe } from '../../i18n/sport-name.pipe';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, takeUntil, timeout } from 'rxjs';

import { TranslatePipe } from '../../i18n/translate.pipe';
import { VenueService } from '../../services/venue.service';
import { isVenueGpsOnly, venuePostalAddress } from '../../shared/venue-location';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { PORTUGAL_VENUE_REGIONS } from '../../shared/portugal-districts';
import { Venue } from '../model/venue';
import { VenueSportsBadgesComponent } from '../../shared/venue-sports-badges/venue-sports-badges.component';

@Component({
  selector: 'app-venues-directory',
  standalone: true,
  imports: [SportNamePipe, CommonModule, FormsModule, RouterLink, TranslatePipe, VenueSportsBadgesComponent],
  templateUrl: './venues-directory.component.html',
  styleUrls: ['./venues-directory.component.css', './venues-directory-v3-finish.css']
})
export class VenuesDirectoryComponent implements OnInit, OnDestroy {
  readonly sportsCatalog = SPORTS_CATALOG;
  readonly districts = PORTUGAL_VENUE_REGIONS;

  name = '';
  city = '';
  district = '';
  sport = '';
  venues: Venue[] = [];
  nearbyMode = false;
  nearbyReferenceAvailable = true;
  nearbyRadiusKm = 25;
  nearbyDistanceById: Record<number, number> = {};
  page = 0;
  hasMore = false;
  loading = false;
  loadError = false;
  private requestVersion = 0;
  private readonly destroyed = new Subject<void>();

  /** Signed-out visitors open the public venue page. */
  readonly visitor = typeof localStorage === 'undefined' || !localStorage.getItem('t');

  constructor(
    private readonly venuesApi: VenueService,
    private readonly route: ActivatedRoute,
    private readonly changeDetector: ChangeDetectorRef,
    @Optional() private readonly bookingsApi: VenueBookingService | null = null
  ) {}

  /** Venues that take bookings on Jynlo get the "Aceita reservas na Jynlo" badge. */
  acceptingIds = new Set<number>();

  ngOnInit(): void {
    this.bookingsApi?.accepting().pipe(takeUntil(this.destroyed)).subscribe(ids => {
      this.acceptingIds = new Set(ids);
      this.changeDetector.markForCheck();
    });
    const params = this.route.snapshot.queryParamMap;
    this.name = params.get('name') || '';
    this.city = params.get('city') || '';
    this.district = params.get('district') || '';
    this.sport = params.get('sport') || '';
    const requestedPage = Number(params.get('page') ?? '0');
    const safePage = Number.isSafeInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 1000
      ? requestedPage : 0;
    const restoredRadius = Number(params.get('radiusKm') ?? '25');
    if ([10, 25, 50].includes(restoredRadius)) this.nearbyRadiusKm = restoredRadius;
    if (params.get('nearby') === '1' && this.city.trim().length >= 2
        && !this.name.trim() && !this.district.trim()) this.searchNearby(safePage);
    else this.search(safePage);
  }

  search(page = 0): void {
    if (!Number.isInteger(page) || page < 0) return;
    const request = ++this.requestVersion;
    this.nearbyMode = false;
    this.nearbyReferenceAvailable = true;
    this.nearbyDistanceById = {};
    this.page = page;
    this.loading = true;
    this.loadError = false;
    this.venuesApi.suggest(this.name, this.city, this.sport, page, this.district)
      .pipe(timeout({ first: 12000 }), takeUntil(this.destroyed))
      .subscribe({
        next: response => {
          if (request !== this.requestVersion) return;
          this.venues = response.venues || [];
          this.hasMore = response.hasMore === true;
          this.loading = false;
          this.changeDetector.markForCheck();
        },
        error: () => {
          if (request !== this.requestVersion) return;
          this.venues = [];
          this.hasMore = false;
          this.loading = false;
          this.loadError = true;
          this.changeDetector.markForCheck();
        }
      });
  }

  get canSearchNearby(): boolean {
    // Never discard name/district filters; the user chooses the fallback.
    return !this.loading && !this.loadError && !this.nearbyMode && this.page === 0
      && !this.hasMore && this.venues.length < 4 && this.city.trim().length >= 2
      && !this.name.trim() && !this.district.trim();
  }

  searchNearby(page = 0): void {
    if (!Number.isInteger(page) || page < 0 || page > 1000
        || this.city.trim().length < 2 || this.name.trim() || this.district.trim()) return;
    const request = ++this.requestVersion;
    this.nearbyMode = true;
    this.nearbyReferenceAvailable = true;
    this.nearbyDistanceById = {};
    this.page = page;
    this.loading = true;
    this.loadError = false;
    this.venuesApi.nearbyCity(this.city, this.sport, page, this.nearbyRadiusKm)
      .pipe(timeout({ first: 12000 }), takeUntil(this.destroyed))
      .subscribe({
        next: response => {
          if (request !== this.requestVersion) return;
          this.nearbyReferenceAvailable = response.referenceAvailable === true;
          this.venues = (response.venues || []).map(entry => entry.venue);
          this.nearbyDistanceById = Object.fromEntries(
            (response.venues || []).map(entry => [entry.venue.id, entry.distanceKm]));
          this.hasMore = response.hasMore === true;
          this.loading = false;
          this.changeDetector.markForCheck();
        },
        error: () => {
          if (request !== this.requestVersion) return;
          this.loading = false;
          this.loadError = true;
          this.venues = [];
          this.hasMore = false;
          this.nearbyDistanceById = {};
          this.changeDetector.markForCheck();
        }
      });
  }

  setNearbyRadius(radiusKm: number): void {
    if (![10, 25, 50].includes(radiusKm) || this.loading) return;
    this.nearbyRadiusKm = radiusKm;
    if (this.nearbyMode) this.searchNearby(0);
  }

  browsePage(page: number): void {
    if (this.nearbyMode) this.searchNearby(page);
    else this.search(page);
  }

  reset(): void {
    this.name = '';
    this.city = '';
    this.district = '';
    this.sport = '';
    this.search(0);
  }

  get showReset(): boolean {
    return !!(this.name || this.city || this.district || this.sport);
  }

  venueAddress(venue: Venue): string {
    return venuePostalAddress(venue) || (isVenueGpsOnly(venue)
      ? '' : (venue.address || '').trim());
  }

  sports(venue: Venue): string[] {
    return (venue.sports || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean).slice(0, 4);
  }

  ngOnDestroy(): void {
    ++this.requestVersion;
    this.destroyed.next();
    this.destroyed.complete();
  }
}
