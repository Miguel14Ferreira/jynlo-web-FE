import { venueBookingAction, type VenueBookingAction } from '../../shared/venue-booking-action';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { AuthenticationService } from '../../services/authethication.service';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { finalize, retry, Subject, takeUntil, timeout } from 'rxjs';

import { VenuePhoto, VenueRatingSummary, VenueService, VenueSportCondition } from '../../services/venue.service';
import { Venue } from '../model/venue';
import { venueCatalogueDisplayLabel } from '../../shared/venue-catalogue-display';
import { isVenueGpsOnly, venuePostalAddress } from '../../shared/venue-location';
import { venueEnvironmentTranslationKey } from '../../shared/venue-environment';
import { venueHasPortugueseCoordinates, venueDirectionsUrl, VenueTravelMode, venueOsmEmbedUrl, venueTelephoneUrl } from '../../shared/venue-public-contact';
import { venueOfficialContactPage, venueOfficialContactPageNeedsIdentityCheck } from '../../shared/venue-official-contact-source';
import { SeoService } from '../../shared/seo.service';

@Component({
  selector: 'app-venue-details',
  templateUrl: './venue-details.component.html',
  styleUrls: ['./venue-details.component.css', './venue-details-v3-finish.css'],
  standalone: false
})
export class VenueDetailsComponent implements OnInit, OnDestroy {
  readonly venueEnvironmentTranslationKey = venueEnvironmentTranslationKey;
  readonly venueCatalogueDisplayLabel = venueCatalogueDisplayLabel;
  venue: Venue | null = null;
  photos: VenuePhoto[] = [];
  sportConditions: VenueSportCondition[] = [];
  ratingSummary: VenueRatingSummary | null = null;
  ratingSummaryLoading = true;
  ratingSummaryLoadError = false;
  sportConditionSport = '';
  sportConditionText = '';
  loading = true;
  photosLoading = true;
  sportConditionsLoading = true;
  photoUploading = false;
  photoUploadError = false;
  photosLoadError = false;
  sportConditionsLoadError = false;
  sportConditionSaving = false;
  sportConditionSaveError = false;
  loadError = false;
  private venueLoadVersion = 0;
  private photosLoadVersion = 0;
  private sportConditionsLoadVersion = 0;
  private readonly destroyed = new Subject<void>();
  private currentVenueId: number | null = null;
  private embeddedMapSource = '';
  private trustedMapSource: SafeResourceUrl | null = null;

  /** Public catalogue preview reuses this page but must not call protected APIs. */
  get isPublicView(): boolean {
    return this.route.snapshot?.data?.['publicVenueView'] === true
      || this.route.snapshot?.parent?.data?.['publicVenueView'] === true;
  }

  /** Game a "Reservar na Jynlo" request is for, when the organiser came from a session. */
  get bookingSessionId(): number | null {
    const raw = this.route.snapshot?.queryParamMap?.get('session');
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  adultsOnlySaving = false;
  adultsOnlyError = '';
  get canManageAdultsOnly(): boolean {
    return !this.isPublicView && !!this.auth?.hasAnyRole('ROLE_ADMIN', 'ROLE_SUPER_ADMIN');
  }
  toggleAdultsOnly(): void {
    const venue = this.venue;
    if (!venue?.id || this.adultsOnlySaving) return;
    const next = !venue.adultsOnly;
    this.adultsOnlySaving = true;
    this.adultsOnlyError = '';
    this.venueService.setAdultsOnly(venue.id, next).pipe(timeout(10_000),
      finalize(() => { this.adultsOnlySaving = false; this.changeDetector?.markForCheck(); }))
      .subscribe({
        next: result => { if (this.venue?.id === venue.id) this.venue = { ...this.venue, adultsOnly: result.adultsOnly }; },
        error: () => { this.adultsOnlyError = 'Não foi possível guardar. Tenta novamente.'; }
      });
  }

  constructor(
    private route: ActivatedRoute,
    private venueService: VenueService,
    @Optional() private readonly changeDetector: ChangeDetectorRef | null = null,
    @Optional() private readonly sanitizer: DomSanitizer | null = null,
    @Optional() private readonly seo: SeoService | null = null,
    @Optional() private readonly auth: AuthenticationService | null = null
  ) {}

  /** Names the page after the venue so search results and shared links are meaningful. */
  private applySeo(venue: Venue): void {
    const name = (venue.name ?? '').trim();
    if (!name) return;
    const city = (venue.city ?? '').trim();
    this.seo?.apply({
      title: city ? `${name}, ${city}` : name,
      description: city
        ? `Informação sobre ${name}, em ${city}: morada, localização no mapa e modalidades. Encontra jogos neste local na Jynlo.`
        : `Informação sobre ${name}: morada, localização no mapa e modalidades. Encontra jogos neste local na Jynlo.`,
      // The signed-in copy of this page keeps its own URL and stays noindex.
      path: this.isPublicView ? `/venues/${venue.id}` : undefined
    });
  }

  /** Only whitelisted public filters survive the round-trip back to the directory. */
  get backToDirectoryQueryParams(): Record<string, string | number> {
    const params = this.route.snapshot?.queryParamMap;
    if (!params) return {};
    const query: Record<string, string | number> = {};
    for (const key of ['name', 'city', 'district', 'sport']) {
      const value = params.get(key);
      if (value) query[key] = value;
    }
    const page = Number(params.get('page') ?? '0');
    if (Number.isSafeInteger(page) && page > 0 && page <= 1000) query['page'] = page;
    // Restore optional neighbouring-localities mode only for valid city-only searches.
    if (params.get('nearby') === '1' && query['city'] && !query['name'] && !query['district']) {
      query['nearby'] = 1;
      const radius = Number(params.get('radiusKm') ?? '25');
      if ([10, 25, 50].includes(radius)) query['radiusKm'] = radius;
    }
    return query;
  }

  private updateView(): void {
    this.changeDetector?.markForCheck();
  }

  ngOnInit(): void {
    // Router reuse can keep the component alive while the selected ID changes.
    // Existing tests use route.snapshot only, so support that route shape too.
    if (this.route.paramMap) {
      this.route.paramMap.pipe(takeUntil(this.destroyed))
        .subscribe(params => this.openVenue(Number(params.get('id'))));
    } else {
      this.openVenue(Number(this.route.snapshot.paramMap.get('id')));
    }
  }

  private openVenue(venueId: number): void {
    if (!Number.isSafeInteger(venueId) || venueId <= 0) {
      ++this.venueLoadVersion;
      ++this.photosLoadVersion;
      ++this.sportConditionsLoadVersion;
      this.venue = null;
      this.loading = false;
      this.photosLoading = false;
      this.sportConditionsLoading = false;
      this.ratingSummaryLoading = false;
      this.loadError = true;
      this.updateView();
      return;
    }
    this.currentVenueId = venueId;
    this.photos = [];
    this.sportConditions = [];
    this.ratingSummary = null;
    this.retryVenue();
    if (this.isPublicView) {
      // These endpoints require authentication: guests should never receive 403s
      // or be invited to upload content that the server will reject.
      ++this.photosLoadVersion;
      ++this.sportConditionsLoadVersion;
      this.photosLoading = false;
      this.sportConditionsLoading = false;
      this.photosLoadError = false;
      this.sportConditionsLoadError = false;
    } else {
      this.loadPhotos(venueId);
      this.loadSportConditions(venueId);
    }
    this.loadRatingSummary(venueId);
  }

  ngOnDestroy(): void {
    ++this.venueLoadVersion;
    ++this.photosLoadVersion;
    ++this.sportConditionsLoadVersion;
    this.destroyed.next();
    this.destroyed.complete();
  }

  retryVenue(): void {
    const venueId = this.currentVenueId ?? Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(venueId) || venueId <= 0) {
      this.venue = null;
      this.loading = false;
      this.loadError = true;
      return;
    }
    const version = ++this.venueLoadVersion;
    this.loading = true;
    this.loadError = false;
    this.venue = null;
    // Do not make a person watch two successive 10-second timeouts.
    // If the API is unreachable, show a clear retry action.
    this.venueService.get(venueId)
      .pipe(
        timeout({ first: 12000 }),
        takeUntil(this.destroyed),
        finalize(() => {
          if (version === this.venueLoadVersion) {
            // Always leave the spinner, including on timeout/unsubscribe.
            this.loading = false;
            this.updateView();
          }
        })
      )
      .subscribe({
        next: venue => {
          if (version !== this.venueLoadVersion) return;
          this.venue = venue;
          this.applySeo(venue);
          this.loading = false;
          this.updateView();
        },
        error: () => {
          if (version !== this.venueLoadVersion) return;
          this.loadError = true;
          this.loading = false;
          this.updateView();
        }
      });
  }

  private loadRatingSummary(venueId: number): void {
    this.ratingSummaryLoading = true;
    this.ratingSummaryLoadError = false;
    this.updateView();
    this.venueService.getRatingSummary(venueId)
      .pipe(timeout(10_000), takeUntil(this.destroyed), finalize(() => {
        this.ratingSummaryLoading = false;
        this.updateView();
      }))
      .subscribe({
        next: summary => {
          if (summary && summary.venueId === venueId && summary.ratingCount >= 3
              && summary.averageScore !== null) {
            this.ratingSummary = summary;
          } else {
            // The backend deliberately hides aggregates under three reviewers.
            this.ratingSummary = null;
          }
          this.updateView();
        },
        error: () => {
          // A ratings API outage must never break the venue page.
          this.ratingSummary = null;
          this.ratingSummaryLoadError = true;
          this.updateView();
        }
      });
  }

  get venueSports(): string[] {
    return (this.venue?.sports || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  }

  /** Plausible national site GPS, NOT a certified public entrance. */
  get hasConfirmedMapCoordinates(): boolean {
    return venueHasPortugueseCoordinates(this.venue?.latitude, this.venue?.longitude);
  }

  /** Hide OSM coordinate placeholders instead of calling them postal addresses. */
  get postalAddress(): string | null {
    return this.venue ? venuePostalAddress(this.venue) : null;
  }

  get isGpsOnly(): boolean {
    return this.venue ? isVenueGpsOnly(this.venue) : false;
  }

  /** Only show an explicit HTTPS venue website, never user-provided script URLs. */
  get venueWebsiteUrl(): string | null {
    const value = this.venue?.website?.trim();
    if (!value) return null;
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'https:' || !parsed.hostname
          || parsed.username || parsed.password
          || parsed.port && parsed.port !== '443') return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  get mapUrl(): string | null {
    const venue = this.venue;
    if (!venue) return null;

    if (this.hasConfirmedMapCoordinates) {
      return `https://www.google.com/maps?q=${venue.latitude},${venue.longitude}`;
    }

    // A search link is useful but never claims to pinpoint a venue without GPS.
    const query = [venue.name, this.postalAddress, venue.city, venue.district, 'Portugal']
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(', ');
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
  }

  /** Only offers route planning when a plausible catalogue GPS point exists.
   * A reference point must not be described as a verified public entrance.
   */
  directionsUrl(mode: VenueTravelMode): string | null {
    if (!this.venue) return null;
    return venueDirectionsUrl(this.venue.latitude, this.venue.longitude, mode);
  }

  /** The iframe always points to our own numeric OSM URL, never a submitted link. */
  get embeddedMapUrl(): SafeResourceUrl | null {
    if (!this.hasConfirmedMapCoordinates || !this.sanitizer) return null;
    const source = venueOsmEmbedUrl(this.venue!.latitude!, this.venue!.longitude!);
    if (!source) return null;
    if (source !== this.embeddedMapSource) {
      this.embeddedMapSource = source;
      this.trustedMapSource = this.sanitizer.bypassSecurityTrustResourceUrl(source);
    }
    return this.trustedMapSource;
  }

  /** Main "Reservar" action: booking link, phone/WhatsApp, a search, or "free access". */
  get bookingAction(): VenueBookingAction | null {
    return venueBookingAction(this.venue);
  }

  get publicTelephoneUrl(): string | null {
    return venueTelephoneUrl(this.venue?.contact);
  }

  /** Operator's own contact page for exactly matched venue IDs; never a guessed telephone. */
  get officialContactPageUrl(): string | null {
    return venueOfficialContactPage(this.venue);
  }

  /** Explicit identity caveat for a catalogue entry lacking a confirmed street. */
  get officialContactIdentityUnconfirmed(): boolean {
    return venueOfficialContactPageNeedsIdentityCheck(this.venue);
  }

  /** Opens Google's public business listing, not just an unlabelled GPS pin. */
  get googleVenueContactUrl(): string | null {
    const venue = this.venue;
    if (!venue) return null;
    const search = [venue.name, venue.city, venue.district, 'Portugal']
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(', ');
    return search
      ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(search)
      : null;
  }

  retryPhotos(): void {
    if (!this.venue || this.isPublicView) return;
    this.loadPhotos(this.venue.id);
  }

  retrySportConditions(): void {
    if (!this.venue || this.isPublicView) return;
    this.loadSportConditions(this.venue.id);
  }

  addSportCondition(): void {
    const sport = this.sportConditionSport.trim();
    const conditions = this.sportConditionText.trim();

    if (!this.venue || this.isPublicView || this.sportConditionSaving || !sport || !conditions) {
      this.sportConditionSaveError = true;
      return;
    }

    this.sportConditionSaving = true;
    this.sportConditionSaveError = false;

    this.venueService.addSportCondition(this.venue.id, { sport, conditions })
      .pipe(
        timeout(10_000),
        finalize(() => this.sportConditionSaving = false)
      )
      .subscribe({
        next: condition => {
          // An earlier GET must not wipe the newly saved condition.
          ++this.sportConditionsLoadVersion;
          this.sportConditionsLoading = false;
          this.sportConditionsLoadError = false;
          this.sportConditions = [condition, ...this.sportConditions.filter(item => item.id !== condition.id)];
          this.updateView();
          this.sportConditionSport = '';
          this.sportConditionText = '';
        },
        error: () => this.sportConditionSaveError = true
      });
  }

  private loadSportConditions(venueId: number): void {
    const version = ++this.sportConditionsLoadVersion;
    this.sportConditionsLoading = true;
    this.sportConditionsLoadError = false;

    this.venueService.listSportConditions(venueId)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => {
          if (version === this.sportConditionsLoadVersion) { this.sportConditionsLoading = false; this.updateView(); }
        })
      )
      .subscribe({
        next: conditions => {
          if (version !== this.sportConditionsLoadVersion) return;
          this.sportConditions = conditions;
          this.updateView();
        },
        error: () => {
          if (version !== this.sportConditionsLoadVersion) return;
          this.sportConditions = [];
          this.sportConditionsLoadError = true;
          this.updateView();
        }
      });
  }

  private loadPhotos(venueId: number): void {
    const version = ++this.photosLoadVersion;
    this.photosLoading = true;
    this.photosLoadError = false;

    this.venueService.listPhotos(venueId)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => {
          if (version === this.photosLoadVersion) { this.photosLoading = false; this.updateView(); }
        })
      )
      .subscribe({
        next: photos => {
          if (version !== this.photosLoadVersion) return;
          this.photos = photos;
          this.updateView();
        },
        error: () => {
          if (version !== this.photosLoadVersion) return;
          this.photos = [];
          this.photosLoadError = true;
          this.updateView();
        }
      });
  }

  uploadPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file || !this.venue || this.isPublicView || this.photoUploading) {
      input.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.photoUploadError = true;
      input.value = '';
      return;
    }

    this.photoUploading = true;
    this.photoUploadError = false;

    this.venueService.addPhoto(this.venue.id, file)
      .pipe(
        timeout(10_000),
        finalize(() => this.photoUploading = false)
      )
      .subscribe({
        next: photo => {
          // Preserve the new photo even if an older initial listing finishes later.
          ++this.photosLoadVersion;
          this.photosLoading = false;
          this.photosLoadError = false;
          this.photos = [photo, ...this.photos.filter(item => item.id !== photo.id)];
          this.updateView();
          input.value = '';
        },
        error: () => {
          this.photoUploadError = true;
          input.value = '';
        }
      });
  }
}
