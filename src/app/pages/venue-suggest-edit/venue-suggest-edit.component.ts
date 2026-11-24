import { appTranslate } from '../../i18n/i18n.service';
import { sportMatchesQuery } from '../../shared/venue-catalogue-display';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { timeout } from 'rxjs';

import { TranslatePipe } from '../../i18n/translate.pipe';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { VenueService } from '../../services/venue.service';
import {
  VenueEditField, VenueEditSuggestion, VenueEditSuggestionsService
} from '../../services/venue-edit-suggestions.service';
import { Venue } from '../model/venue';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

type Draft = Record<VenueEditField, string>;

@Component({
  selector: 'app-venue-suggest-edit',
  standalone: true,
  imports: [SportNamePipe, CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './venue-suggest-edit.component.html',
  styleUrls: ['./venue-suggest-edit.component.css']
})
export class VenueSuggestEditComponent implements OnInit {
  readonly fields: ReadonlyArray<{ key: VenueEditField; label: string; limit: number }> = [
    { key: 'name', label: 'venue.name', limit: 140 },
    { key: 'city', label: 'venue.detail.city', limit: 120 },
    { key: 'address', label: 'common.address', limit: 255 },
    { key: 'openingHours', label: 'venue.openingHours', limit: 1000 },
    { key: 'website', label: 'Site', limit: 255 },
    { key: 'contact', label: 'Contacto', limit: 255 },
    { key: 'bookingUrl', label: 'Link de reserva (Playtomic, site do clube…)', limit: 500 },
    { key: 'latitude', label: 'venue.edit.field.latitude', limit: 16 },
    { key: 'longitude', label: 'venue.edit.field.longitude', limit: 16 }
  ];
  readonly districts = [
    'Aveiro', 'Beja', 'Braga', 'Bragança', 'Castelo Branco', 'Coimbra',
    'Évora', 'Faro', 'Guarda', 'Leiria', 'Lisboa', 'Portalegre',
    'Porto', 'Santarém', 'Setúbal', appTranslate('Viana do Castelo'), 'Vila Real', 'Viseu'
  ];
  readonly sportsCatalog = SPORTS_CATALOG;
  venue: Venue | null = null;
  draft: Draft = {} as Draft;
  selectedSports: string[] = [];
  sportSearch = '';
  reason = '';
  sourceUrl = '';
  sourceUrlInvalid = false;
  last: VenueEditSuggestion | null = null;
  loading = true;
  loadError = false;
  submitting = false;
  submitted = false;
  submitError = false;
  duplicatePending = false;
  missingChanges = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly venues: VenueService,
    private readonly suggestions: VenueEditSuggestionsService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  get venueId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  ngOnInit(): void {
    const id = this.venueId;
    if (!Number.isSafeInteger(id) || id <= 0) {
      this.loading = false;
      this.loadError = true;
      return;
    }
    this.venues.get(id).pipe(timeout(12000)).subscribe({
      next: venue => {
        this.venue = venue;
        this.draft = {
          name: venue.name || '',
          city: venue.city || '',
          district: venue.district || '',
          address: venue.address || '',
          sports: venue.sports || '',
          openingHours: venue.openingHours || '',
          website: venue.website || '',
          contact: venue.contact || '',
          bookingUrl: venue.bookingUrl || '',
          freeAccess: venue.freeAccess == null ? '' : String(venue.freeAccess),
          latitude: venue.latitude?.toString() || '',
          longitude: venue.longitude?.toString() || ''
        };
        this.selectedSports = (venue.sports || '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loadError = true; this.loading = false; this.cdr.markForCheck(); }
    });
    this.suggestions.mine(id).pipe(timeout(8000)).subscribe({
      next: last => { this.last = last; this.cdr.markForCheck(); },
      error: () => { /* 404 = user has no previous suggestion; not a form error */ }
    });
  }

  get visibleSports(): string[] {
    const query = this.sportSearch.trim().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const candidates = query
      ? this.sportsCatalog.filter(s => sportMatchesQuery(s, query))
      : this.sportsCatalog;
    return candidates.filter(s => !this.selectedSports.includes(s)).slice(0, 12);
  }

  addSport(sport: string): void {
    if (!this.selectedSports.includes(sport)) this.selectedSports.push(sport);
    this.sportSearch = '';
  }

  removeSport(sport: string): void {
    this.selectedSports = this.selectedSports.filter(s => s !== sport);
  }

  private original(field: VenueEditField): string {
    if (!this.venue) return '';
    return (this.venue[field] || '').toString().trim();
  }

  get changes(): Partial<Record<VenueEditField, string>> {
    if (!this.venue) return {};
    const result: Partial<Record<VenueEditField, string>> = {};
    for (const field of this.fields) {
      if (field.key === 'latitude' || field.key === 'longitude') continue;
      const value = (this.draft[field.key] || '').trim();
      if (value !== this.original(field.key)) result[field.key] = value;
    }
    const freeAccess = (this.draft.freeAccess || '').trim();
    if (freeAccess && freeAccess !== this.original('freeAccess')) result.freeAccess = freeAccess;
    // A coordinate correction is always sent as a pair for atomic review.
    const lat = (this.draft.latitude || '').trim();
    const lon = (this.draft.longitude || '').trim();
    if (lat !== this.original('latitude') || lon !== this.original('longitude')) {
      result.latitude = lat;
      result.longitude = lon;
    }
    if (this.draft.district.trim() !== this.original('district')) {
      result.district = this.draft.district.trim();
    }
    const proposedSports = this.selectedSports.join(';');
    const normalized = (v: string) => v.split(/[;,]/).map(s => s.trim())
      .filter(Boolean).sort().join(';');
    if (normalized(proposedSports) !== normalized(this.original('sports'))) {
      result.sports = proposedSports;
    }
    return result;
  }

  /** GPS is always source-backed and reviewed as a complete pair. */
  get gpsEvidenceRequired(): boolean {
    return this.changes.latitude !== undefined || this.changes.longitude !== undefined;
  }

  get gpsInvalid(): boolean {
    if (!this.gpsEvidenceRequired) return false;
    const test = (value: string, min: number, max: number) =>
      /^-?(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,7})?$/.test(value)
      && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
    return !test(this.draft.latitude.trim(), 32, 43)
      || !test(this.draft.longitude.trim(), -32, -6);
  }

  get evidenceRequired(): boolean {
    return this.contactEvidenceRequired || this.gpsEvidenceRequired;
  }

  /** Only a newly submitted nonempty contact needs a source; removals stay possible. */
  get contactEvidenceRequired(): boolean {
    return typeof this.changes.contact === 'string' && !!this.changes.contact.trim();
  }

  get validContactSource(): boolean {
    const value = this.sourceUrl.trim();
    // Source is optional for non-contact edits, but any submitted URL must be
    // syntactically safe. A new public contact still requires a source.
    if (!value) return !this.evidenceRequired;
    if (value.length > 500) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.hostname.includes('.')
        && !parsed.hostname.endsWith('.') && !parsed.username && !parsed.password
        && !parsed.hash && (!parsed.port || parsed.port === '443')
        && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(parsed.hostname)
        && !/^[0-9.]+$/.test(parsed.hostname);
    } catch { return false; }
  }

  get changeCount(): number {
    return Object.keys(this.changes).length;
  }

  submit(): void {
    if (this.submitting || this.last?.status === 'PENDING' || !this.venue) return;
    this.submitError = false;
    this.duplicatePending = false;
    this.missingChanges = false;
    this.sourceUrlInvalid = false;
    const changes = this.changes;
    if (!Object.keys(changes).length) { this.missingChanges = true; return; }
    if (this.reason.trim().length < 10
        || (changes.sports !== undefined && !this.selectedSports.length)
        || !this.draft.name.trim() || !this.draft.city.trim()
        || (changes.address !== undefined && !changes.address.trim())
        || this.gpsInvalid) {
      this.submitError = true;
      return;
    }
    if (!this.validContactSource) {
      this.sourceUrlInvalid = true;
      return;
    }
    this.submitting = true;
    const evidence = this.sourceUrl.trim();
    const request = evidence
      ? this.suggestions.submit(this.venue.id, changes, this.reason.trim(), evidence)
      : this.suggestions.submit(this.venue.id, changes, this.reason.trim());
    request
      .pipe(timeout(12000))
      .subscribe({
        next: proposal => {
          this.last = proposal;
          this.submitted = true;
          this.submitting = false;
          this.cdr.markForCheck();
        },
        error: (error: HttpErrorResponse) => {
          this.duplicatePending = error.status === 409;
          this.submitError = !this.duplicatePending;
          this.submitting = false;
          this.cdr.markForCheck();
        }
      });
  }
}
