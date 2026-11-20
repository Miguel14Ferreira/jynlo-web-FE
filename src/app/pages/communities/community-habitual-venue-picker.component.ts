import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { finalize, Subscription, take, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommunityGroup } from '../model/community-group';
import { Venue } from '../model/venue';
import { VenueService } from '../../services/venue.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { LocationMethodSelectorComponent } from '../../shared/location-method-selector/location-method-selector.component';
import { VenueSportsBadgesComponent } from '../../shared/venue-sports-badges/venue-sports-badges.component';
import { appTranslate as t } from '../../i18n/i18n.service';

/** Reusable, admin-only venue selector for community setup and settings.
 * Opening a result is read-only. Saving requires a second explicit action. */
@Component({
  selector: 'app-community-habitual-venue-picker',
  templateUrl: './community-habitual-venue-picker.component.html',
  styleUrls: ['./community-habitual-venue-picker.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, LocationMethodSelectorComponent, VenueSportsBadgesComponent]
})
export class CommunityHabitualVenuePickerComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) community!: CommunityGroup;
  @Output() venueSaved = new EventEmitter<CommunityGroup>();

  locationMethod: 'venue' | 'maps' | 'gps' = 'venue';
  mapLink = '';
  resolvingMap = false;
  locating = false;
  resolvingAddress = false;
  locationPoint: {source: 'MAPS' | 'GPS'; latitude: number; longitude: number;
                  city: string; address: string} | null = null;
  pointMapPreviewUrl: SafeResourceUrl | null = null;
  venueMapPreviewUrl: SafeResourceUrl | null = null;
  savedMapPreviewUrl: SafeResourceUrl | null = null;
  savedMapLink: string | null = null;
  private savedMapRequest?: Subscription;
  query = '';
  results: Venue[] = [];
  expanded: Venue | null = null;
  searching = false;
  searchAttempted = false;
  searchQuery = '';
  detailLoading = false;
  saving = false;
  error = '';
  feedback = '';
  editing = true;
  private revision = 0;
  private subs = new Subscription();
  private searchRequest?: Subscription;
  private previousCommunityId: number | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['community']) return;
    const id = this.community?.id ?? null;
    if (this.previousCommunityId !== null && this.previousCommunityId !== id) {
      ++this.revision;
      this.subs.unsubscribe();
      this.subs = new Subscription();
      this.query = '';
      this.mapLink = '';
      this.locationPoint = null;
      this.pointMapPreviewUrl = null;
      this.venueMapPreviewUrl = null;
      this.locationMethod = 'venue';
      this.resolvingMap = false;
      this.locating = false;
      this.resolvingAddress = false;
      this.results = [];
      this.expanded = null;
      this.searchRequest = undefined;
      this.searching = false;
      this.searchAttempted = false;
      this.searchQuery = '';
      this.detailLoading = false;
      this.saving = false;
      this.error = '';
      this.feedback = '';
    }
    if (this.previousCommunityId !== id || changes['community']) this.refreshSavedMap();
    if (this.previousCommunityId !== id) this.editing = !this.hasHabitualVenue;
    this.previousCommunityId = id;
  }

  constructor(private venues: VenueService, private groups: CommunityGroupsService,
              private readonly cdr: ChangeDetectorRef, private readonly ngZone: NgZone,
              private readonly sanitizer: DomSanitizer) {}

  private refreshSavedMap(): void {
    this.savedMapRequest?.unsubscribe();
    this.savedMapPreviewUrl = null;
    this.savedMapLink = null;
    const group = this.community;
    if (!group) return;
    if (this.validPoint(group.habitualLatitude!, group.habitualLongitude!)
        && group.habitualLatitude != null && group.habitualLongitude != null) {
      this.setSavedMap(group.habitualLatitude, group.habitualLongitude);
      return;
    }
    if (!group.defaultVenueId) return;
    const id = group.defaultVenueId;
    this.savedMapRequest = this.venues.get(id).pipe(timeout(10000)).subscribe({
      next: venue => {
        if (this.community?.id !== group.id || this.community?.defaultVenueId !== id) return;
        if (venue.latitude != null && venue.longitude != null
            && this.validPoint(venue.latitude, venue.longitude)) {
          this.setSavedMap(venue.latitude, venue.longitude);
        }
        this.cdr.markForCheck();
      },
      error: () => { /* Retain the address and venue link when coordinates are unavailable. */ }
    });
  }

  private setSavedMap(latitude: number, longitude: number): void {
    this.savedMapPreviewUrl = this.mapPreview(latitude, longitude);
    this.savedMapLink = 'https://www.google.com/maps?q=' + latitude + ',' + longitude;
  }

  get canManage(): boolean {
    return this.community?.myRole === 'OWNER' || this.community?.myRole === 'ADMIN';
  }

  get hasHabitualVenue(): boolean {
    return !!(this.community?.defaultVenueId || this.community?.habitualLocationSource);
  }

  openEditor(): void {
    if (!this.canManage || this.saving || !this.hasHabitualVenue) return;
    this.editing = true;
    this.error = '';
    this.feedback = '';
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    if (!this.canManage || this.saving || !this.hasHabitualVenue) return;
    this.resetDraft();
    this.editing = false;
    this.cdr.markForCheck();
  }

  /** Discard stale search, detail, Maps and GPS state after saving or cancelling. */
  private resetDraft(): void {
    ++this.revision;
    this.searchRequest?.unsubscribe();
    this.searchRequest = undefined;
    this.subs.unsubscribe();
    this.subs = new Subscription();
    this.locationMethod = 'venue';
    this.query = '';
    this.results = [];
    this.expanded = null;
    this.searchQuery = '';
    this.searchAttempted = false;
    this.searching = false;
    this.detailLoading = false;
    this.mapLink = '';
    this.locationPoint = null;
    this.pointMapPreviewUrl = null;
    this.venueMapPreviewUrl = null;
    this.resolvingMap = false;
    this.locating = false;
    this.resolvingAddress = false;
    this.saving = false;
    this.error = '';
    this.feedback = '';
  }

  private finishSave(group: CommunityGroup): void {
    this.community = group;
    this.refreshSavedMap();
    this.resetDraft();
    // Once persisted, show only the usual venue summary until the user selects Change.
    this.editing = !this.hasHabitualVenue;
    this.venueSaved.emit(group);
    this.cdr.markForCheck();
  }

  chooseLocationMethod(method: 'venue' | 'maps' | 'gps'): void {
    if (!this.canManage || !this.editing || this.saving || this.locationMethod === method) return;
    ++this.revision; // stale Maps, GPS and catalogue requests cannot change the new mode.
    this.searchRequest?.unsubscribe();
    this.searchRequest = undefined;
    this.locationMethod = method;
    this.results = [];
    this.expanded = null;
    this.venueMapPreviewUrl = null;
    this.query = '';
    this.mapLink = '';
    this.locationPoint = null;
    this.pointMapPreviewUrl = null;
    this.searching = false;
    this.searchAttempted = false;
    this.searchQuery = '';
    this.detailLoading = false;
    this.resolvingMap = false;
    this.locating = false;
    this.resolvingAddress = false;
    this.error = '';
    this.feedback = '';
    this.cdr.markForCheck();
  }

  resolveMapLink(): void {
    if (!this.canManage || this.saving || this.resolvingMap
        || this.locationMethod !== 'maps' || !this.mapLink.trim()) return;
    const revision = ++this.revision, communityId = this.community.id;
    this.resolvingMap = true;
    this.locationPoint = null;
    this.pointMapPreviewUrl = null;
    this.error = '';
    this.cdr.markForCheck();
    const sub = this.venues.resolveMapLink(this.mapLink.trim())
      .pipe(timeout(12000), finalize(() => {
        if (revision === this.revision) {
          this.resolvingMap = false;
          this.cdr.markForCheck();
        }
      })).subscribe({
        next: point => {
          if (revision !== this.revision || this.community.id !== communityId
              || this.locationMethod !== 'maps') return;
          if (!this.validPoint(point.latitude, point.longitude)) {
            this.error = t('communities.habitualVenue.errorMapPoint');
            this.cdr.markForCheck();
            return;
          }
          this.useCoordinates('MAPS', point.latitude, point.longitude, revision);
          this.cdr.markForCheck();
        },
        error: () => {
          if (revision !== this.revision || this.community.id !== communityId) return;
          this.error = t('communities.habitualVenue.errorMapLink');
          this.cdr.markForCheck();
        }
      });
    this.subs.add(sub);
  }

  captureCurrentLocation(): void {
    if (!this.canManage || this.saving || this.locating || this.locationMethod !== 'gps') return;
    if (!navigator.geolocation) {
      this.error = t('communities.habitualVenue.errorGpsUnsupported');
      this.cdr.markForCheck();
      return;
    }
    const revision = ++this.revision, communityId = this.community.id;
    this.locating = true;
    this.locationPoint = null;
    this.pointMapPreviewUrl = null;
    this.error = '';
    this.cdr.markForCheck();
    navigator.geolocation.getCurrentPosition(
      position => this.ngZone.run(() => {
        if (revision !== this.revision || this.community.id !== communityId
            || this.locationMethod !== 'gps') return;
        this.locating = false;
        const { latitude, longitude } = position.coords;
        if (!this.validPoint(latitude, longitude)) {
          this.error = t('communities.habitualVenue.errorGpsInvalid');
          this.cdr.markForCheck();
          return;
        }
        this.useCoordinates('GPS', latitude, longitude, revision, position.coords.accuracy);
        this.cdr.markForCheck();
      }),
      () => this.ngZone.run(() => {
        if (revision !== this.revision || this.community.id !== communityId) return;
        this.locating = false;
        this.error = t('communities.habitualVenue.errorGpsPermission');
        this.cdr.markForCheck();
      }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  private validPoint(lat: number, lng: number): boolean {
    return Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  /** Mirrors the embed used in game-session creation. Only validated numbers reach the trusted URL. */
  private mapPreview(latitude: number | null, longitude: number | null, zoom = 16): SafeResourceUrl | null {
    if (latitude === null || longitude === null || !this.validPoint(latitude, longitude)) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      'https://www.google.com/maps?q=' + latitude + ',' + longitude
      + '&z=' + zoom + '&output=embed'
    );
  }

  private useCoordinates(source: 'MAPS' | 'GPS', latitude: number,
                         longitude: number, revision: number, accuracy?: number): void {
    this.locationPoint = {source, latitude, longitude, city: '', address: ''};
    this.pointMapPreviewUrl = this.mapPreview(latitude, longitude, source === 'GPS' ? 17 : 16);
    const communityId = this.community.id;
    this.resolvingAddress = true;
    this.cdr.markForCheck();
    const sub = this.venues.reverseLocation(latitude, longitude, accuracy)
      .pipe(timeout(20000), finalize(() => {
        if (revision === this.revision && this.community.id === communityId) {
          this.resolvingAddress = false;
          this.cdr.markForCheck();
        }
      })).subscribe({
        next: result => {
          if (revision !== this.revision || communityId !== this.community.id
              || this.locationPoint?.source !== source) return;
          // Addresses from reverse geocoding are suggestions, not verified postal facts.
          if (!this.locationPoint.city.trim()) this.locationPoint.city = result.city ?? '';
          if (!this.locationPoint.address.trim()) this.locationPoint.address = result.address ?? '';
          this.cdr.markForCheck();
        },
        error: () => {
          // Reverse-geocoding is optional. Keep the pin and allow manual address editing.
          if (revision === this.revision && this.community.id === communityId) {
            this.feedback = t('createSession.gpsAddressUnknown');
            this.cdr.markForCheck();
          }
        }
      });
    this.subs.add(sub);
  }

  savePoint(): void {
    const point = this.locationPoint;
    if (!point || !this.canManage || this.saving || this.resolvingAddress
        || (this.locationMethod === 'maps' && point.source !== 'MAPS')
        || (this.locationMethod === 'gps' && point.source !== 'GPS')) return;
    const communityId = this.community.id, revision = ++this.revision;
    this.saving = true;
    this.error = '';
    this.feedback = '';
    const sub = this.groups.updateHabitualLocation(communityId, point.source,
      point.latitude, point.longitude, point.city.trim() || null,
      point.address.trim() || null)
      .pipe(timeout(10000), finalize(() => {
        if (revision === this.revision) {
          this.saving = false;
          this.cdr.markForCheck();
        }
      })).subscribe({
        next: group => {
          if (revision !== this.revision || this.community.id !== communityId) return;
          this.finishSave(group);
        },
        error: () => {
          if (revision !== this.revision || this.community.id !== communityId) return;
          this.error = t('communities.habitualVenue.errorSavePoint');
          this.cdr.markForCheck();
        }
      });
    this.subs.add(sub);
  }

  get mapPointUrl(): string | null {
    const p = this.locationPoint;
    return p ? 'https://www.google.com/maps?q=' + p.latitude + ',' + p.longitude : null;
  }

  search(): void {
    if (!this.canManage || this.saving || this.locationMethod !== 'venue') return;
    const query = this.query.trim();
    if (!query || (this.searching && query === this.searchQuery)) return;

    // A new query cancels the previous HTTP request immediately. Old responses
    // must never replace newer results or leave the form stuck in loading state.
    const revision = ++this.revision;
    const communityId = this.community.id;
    this.searchRequest?.unsubscribe();
    this.searchRequest = undefined;
    this.searchQuery = query;
    this.searchAttempted = false;
    this.error = '';
    this.feedback = '';
    this.results = [];
    this.expanded = null;
    this.venueMapPreviewUrl = null;
    this.detailLoading = false;
    this.searching = true;

    const sports = this.community.sports?.length ? this.community.sports
      : this.community.sport ? [this.community.sport] : [];
    const request = this.venues.suggest(query, undefined,
      sports.length === 1 ? sports[0] : undefined, 0)
      .pipe(
        timeout({ first: 8000 }),
        take(1),
        finalize(() => {
          if (revision !== this.revision || this.community.id !== communityId) return;
          this.searching = false;
          this.cdr.markForCheck();
        })
      ).subscribe({
        next: result => {
          if (revision !== this.revision || this.community.id !== communityId
              || this.locationMethod !== 'venue') return;
          this.results = Array.isArray(result?.venues) ? result.venues : [];
          this.searchAttempted = true;
          this.cdr.markForCheck();
        },
        error: (reason: unknown) => {
          if (revision !== this.revision || this.community.id !== communityId
              || this.locationMethod !== 'venue') return;
          this.searchAttempted = true;
          this.error = (reason as {name?: string})?.name === 'TimeoutError'
            ? t('communities.habitualVenue.searchTimeout')
            : t('communities.habitualVenue.errorSearch');
          this.cdr.markForCheck();
        }
      });
    this.searchRequest = request;
    this.subs.add(request);
  }

  openDetails(id: number): void {
    if (!this.canManage || this.saving || this.detailLoading) return;
    if (!this.results.some(venue => venue.id === id)) return;
    const revision = ++this.revision;
    const communityId = this.community.id;
    this.searching = false;
    this.detailLoading = true;
    this.expanded = null;
    this.venueMapPreviewUrl = null;
    this.error = '';
    this.feedback = '';
    const sub = this.venues.get(id).pipe(timeout(10000), finalize(() => {
      if (revision === this.revision) {
        this.detailLoading = false;
        this.cdr.markForCheck();
      }
    })).subscribe({
      next: venue => {
        if (revision !== this.revision || this.community.id !== communityId || venue.id !== id) return;
        this.expanded = venue;
        this.venueMapPreviewUrl = this.mapPreview(venue.latitude, venue.longitude);
        this.cdr.markForCheck();
      },
      error: () => {
        if (revision !== this.revision || this.community.id !== communityId) return;
        this.error = t('communities.habitualVenue.errorDetails');
        this.cdr.markForCheck();
      }
    });
    this.subs.add(sub);
  }

  get mapUrl(): string | null {
    const v = this.expanded;
    if (!v || v.latitude === null || v.longitude === null ||
        !Number.isFinite(v.latitude) || !Number.isFinite(v.longitude)
        || Math.abs(v.latitude) > 90 || Math.abs(v.longitude) > 180) return null;
    return 'https://www.google.com/maps?q=' + v.latitude + ',' + v.longitude;
  }

  save(id: number | null): void {
    if (!this.canManage || this.saving
        || (id !== null && this.expanded?.id !== id)) return;
    const communityId = this.community.id;
    const revision = ++this.revision;
    this.saving = true;
    this.error = '';
    this.feedback = '';
    const sub = this.groups.updateDefaultVenue(communityId, id)
      .pipe(timeout(10000), finalize(() => {
        if (revision === this.revision) this.saving = false;
      })).subscribe({
        next: group => {
          if (revision !== this.revision || this.community.id !== communityId) return;
          this.finishSave(group);
          if (id === null) this.feedback = t('communities.habitualVenue.venueRemoved');
        },
        error: () => {
          if (revision !== this.revision || this.community.id !== communityId) return;
          this.error = t('communities.habitualVenue.errorSaveVenue');
          this.cdr.markForCheck();
        }
      });
    this.subs.add(sub);
  }

  ngOnDestroy(): void {
    ++this.revision;
    this.savedMapRequest?.unsubscribe();
    this.searchRequest?.unsubscribe();
    this.subs.unsubscribe();
  }
}
