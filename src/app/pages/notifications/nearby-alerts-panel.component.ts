import { sportMatchesQuery } from '../../shared/venue-catalogue-display';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';
import { environment } from '../../../environment/environment';
import { appTranslate as t } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

export interface NearbyAlertPreference {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  placeLabel: string | null;
  radiusKm: number;
  sports: string[];
}

export const NEARBY_RADII_KM = [10, 25, 50, 100] as const;
export const NEARBY_MAX_SPORTS = 12;
export const NEARBY_PLACES: ReadonlyArray<{ label: string; latitude: number; longitude: number }> = [
  { label: 'Lisboa', latitude: 38.72, longitude: -9.14 },
  { label: 'Porto', latitude: 41.15, longitude: -8.61 },
  { label: 'Braga', latitude: 41.55, longitude: -8.42 },
  { label: 'Coimbra', latitude: 40.21, longitude: -8.43 },
  { label: 'Aveiro', latitude: 40.64, longitude: -8.65 },
  { label: 'Leiria', latitude: 39.74, longitude: -8.81 },
  { label: 'Setúbal', latitude: 38.52, longitude: -8.89 },
  { label: 'Évora', latitude: 38.57, longitude: -7.91 },
  { label: 'Faro', latitude: 37.02, longitude: -7.93 },
  { label: 'Viseu', latitude: 40.66, longitude: -7.91 },
  { label: 'Funchal', latitude: 32.65, longitude: -16.91 },
  { label: 'Ponta Delgada', latitude: 37.74, longitude: -25.67 },
];

const round2 = (value: number) => Math.round(value * 100) / 100;
const key = (sport: string) => sport.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function emptyNearbyPreference(): NearbyAlertPreference {
  return { enabled: false, latitude: null, longitude: null, placeLabel: null, radiusKm: 25, sports: [] };
}

/** "Novos jogos perto de ti", the same settings as the app (opt-in, max 2 alerts a day). */
@Component({
  selector: 'app-nearby-alerts-panel',
  standalone: true,
  imports: [SportNamePipe, CommonModule, FormsModule, TranslatePipe],
  templateUrl: './nearby-alerts-panel.component.html',
  styleUrls: ['./nearby-alerts-panel.component.css'],
})
export class NearbyAlertsPanelComponent implements OnInit {
  readonly radii = NEARBY_RADII_KM;
  readonly places = NEARBY_PLACES;
  readonly maxSports = NEARBY_MAX_SPORTS;
  private readonly url = environment.apiUrl + '/api/notifications/me/nearby-sessions';

  saved: NearbyAlertPreference | null = null;
  draft: NearbyAlertPreference | null = null;
  loading = false;
  saving = false;
  locating = false;
  error = '';
  success = '';
  search = '';

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.http.get<NearbyAlertPreference>(this.url).pipe(timeout(10_000), finalize(() => this.loading = false))
      .subscribe({
        next: value => { this.saved = this.normalize(value); this.draft = { ...this.saved, sports: [...this.saved.sports] }; },
        error: () => this.error = t('nearbyAlerts.loadError'),
      });
  }

  get dirty(): boolean {
    return !!this.draft && !!this.saved && JSON.stringify(this.draft) !== JSON.stringify(this.saved);
  }

  get problem(): string {
    return this.draft?.enabled && this.draft.latitude === null ? t('nearbyAlerts.needPlace') : '';
  }

  get suggestions(): string[] {
    if (!this.draft) return [];
    const q = key(this.search.trim());
    if (!q) return [];
    const taken = new Set(this.draft.sports.map(key));
    return SPORTS_CATALOG.filter(s => sportMatchesQuery(s, q) && !taken.has(key(s))).slice(0, 8);
  }

  isPlace(place: { label: string; latitude: number }): boolean {
    return this.draft?.placeLabel === place.label && this.draft.latitude === place.latitude;
  }

  choosePlace(place: { label: string; latitude: number; longitude: number }): void {
    this.patch({ latitude: place.latitude, longitude: place.longitude, placeLabel: place.label });
  }

  /** Turns alerts off and clears the place; saved with the next "Guardar". */
  forgetPlace(): void {
    this.patch({ enabled: false, latitude: null, longitude: null, placeLabel: null });
  }

  /** One reading, only on this explicit click, rounded to about 1 km. */
  useMyPosition(): void {
    if (this.locating || !globalThis.navigator?.geolocation) {
      this.error = t('nearbyAlerts.noLocation');
      return;
    }
    this.locating = true;
    this.error = '';
    navigator.geolocation.getCurrentPosition(
      position => {
        this.locating = false;
        this.patch({ latitude: round2(position.coords.latitude), longitude: round2(position.coords.longitude),
          placeLabel: t('nearbyAlerts.nearMe') });
      },
      () => { this.locating = false; this.error = t('nearbyAlerts.noLocation'); },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 });
  }

  toggleSport(sport: string): void {
    if (!this.draft) return;
    const present = this.draft.sports.some(s => key(s) === key(sport));
    if (!present && this.draft.sports.length >= NEARBY_MAX_SPORTS) return;
    this.patch({ sports: present ? this.draft.sports.filter(s => key(s) !== key(sport)) : [...this.draft.sports, sport] });
    this.search = '';
  }

  patch(change: Partial<NearbyAlertPreference>): void {
    if (!this.draft) return;
    this.success = '';
    this.error = '';
    this.draft = { ...this.draft, ...change };
  }

  discard(): void {
    if (this.saved) this.draft = { ...this.saved, sports: [...this.saved.sports] };
    this.success = '';
    this.error = '';
  }

  save(): void {
    if (!this.draft || this.saving || !this.dirty || this.problem) return;
    this.saving = true;
    this.error = '';
    this.http.put<NearbyAlertPreference>(this.url, this.draft).pipe(timeout(10_000), finalize(() => this.saving = false))
      .subscribe({
        next: value => {
          this.saved = this.normalize(value);
          this.draft = { ...this.saved, sports: [...this.saved.sports] };
          this.success = t(this.saved.enabled ? 'nearbyAlerts.savedOn' : 'nearbyAlerts.savedOff');
        },
        error: () => this.error = t('nearbyAlerts.saveError'),
      });
  }

  private normalize(value: Partial<NearbyAlertPreference> | null | undefined): NearbyAlertPreference {
    const base = emptyNearbyPreference();
    if (!value) return base;
    const hasPoint = typeof value.latitude === 'number' && typeof value.longitude === 'number';
    return {
      enabled: value.enabled === true && hasPoint,
      latitude: hasPoint ? value.latitude as number : null,
      longitude: hasPoint ? value.longitude as number : null,
      placeLabel: typeof value.placeLabel === 'string' && value.placeLabel.trim() ? value.placeLabel.trim() : null,
      radiusKm: (NEARBY_RADII_KM as readonly number[]).includes(value.radiusKm as number) ? value.radiusKm as number : 25,
      sports: Array.isArray(value.sports) ? value.sports.filter(s => typeof s === 'string' && s.trim()).slice(0, NEARBY_MAX_SPORTS) : [],
    };
  }
}
