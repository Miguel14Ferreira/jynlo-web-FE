import { sportMatchesQuery } from '../../shared/venue-catalogue-display';
import { Component, OnInit, Optional } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';

import { VenueService } from '../../services/venue.service';
import { Venue } from '../model/venue';

import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { CreateVenueRequest, VenueEnvironmentType, VenueOwnershipType } from '../model/venue';

@Component({
  selector: 'app-venue-create',
  templateUrl: './venue-create.component.html',
  styleUrls: ['./venue-create.component.css'],
  standalone: false
})
export class VenueCreateComponent implements OnInit {
  readonly sportsCatalog = SPORTS_CATALOG;
  readonly popularSports = ['Futebol', 'Futsal', 'Padel', 'Ténis', 'Basquetebol', 'Natação', 'Voleibol', 'Musculação'];
  sportSearch = '';
  showAllSports = false;

  get visibleSports(): readonly string[] {
    const query = this.normalizeSport(this.sportSearch.trim());
    if (query) {
      return this.sportsCatalog.filter(sport => sportMatchesQuery(sport, query));
    }
    return this.showAllSports
      ? this.sportsCatalog
      : this.popularSports.filter(sport => !this.isSportSelected(sport));
  }

  private normalizeSport(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  }
  name = '';
  city = '';
  district: string | null = null;
  // The current backend validates only continental district names.
  readonly continentalDistricts = [
    'Aveiro', 'Beja', 'Braga', 'Bragança', 'Castelo Branco', 'Coimbra',
    'Évora', 'Faro', 'Guarda', 'Leiria', 'Lisboa', 'Portalegre',
    'Porto', 'Santarém', 'Setúbal', 'Viana do Castelo', 'Vila Real', 'Viseu'
  ] as const;
  address = '';
  selectedSports: string[] = [];
  venueType = '';
  ownershipType: VenueOwnershipType | null = null;
  surfaceType = '';
  environmentType: VenueEnvironmentType | null = null;
  changingRooms = false;
  changingRoomTypes: string[] = [];
  parking = false;
  freeParking: boolean | null = null;
  lighting = false;
  toilets: boolean | null = null;
  lockers: boolean | null = null;
  showers: boolean | null = null;
  stands: boolean | null = null;
  drinkingFountain: boolean | null = null;
  accessible: boolean | null = null;
  firstAid: boolean | null = null;
  aed: boolean | null = null;
  medicalStation: boolean | null = null;
  lifeguard: boolean | null = null;
  staffOnSite: boolean | null = null;
  securitySurveillance: boolean | null = null;
  cafe: boolean | null = null;
  restaurant: boolean | null = null;
  vendingMachines: boolean | null = null;
  sportsShop: boolean | null = null;
  wifi: boolean | null = null;
  phoneCharging: boolean | null = null;
  nearbyRadiusMeters = 500;
  nearbyPharmacy: boolean | null = null;
  nearbyAtm: boolean | null = null;
  services = '';
  transport = '';
  openingHours = '';
  priceInfo = '';
  website = '';
  contact = '';
  latitude: number | null = null;
  longitude: number | null = null;
  saving = false;
  saveError = false;
  submitted = false;
  duplicateVenueError = false;
  validationError = false;
  locating = false;
  locationError = false;
  mapLink = '';
  resolvingMapLink = false;
  mapLinkError = false;
  mapLinkResolved = false;
  // Similar venues are a hint, never an authorization decision or a save blocker.
  checkingSimilarVenues = false;
  similarVenueCheckComplete = false;
  similarVenueCheckError = false;
  similarVenues: Venue[] = [];
  private similarVenueRequestVersion = 0;

  private mapLinkRequestVersion = 0;
  private locationRequestVersion = 0;
  private coordinatesFromResolvedMapLink = false;

  constructor(
    private venueService: VenueService,
    private router: Router,
    @Optional() private route?: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const params = this.route?.snapshot.queryParamMap;
    if (!params) {
      return;
    }

    const requestedSport = (params.get('sport') || '').trim();
    const matchedSport = this.sportsCatalog.find(
      sport => sport.toLocaleLowerCase('pt') === requestedSport.toLocaleLowerCase('pt')
    );
    if (matchedSport) {
      this.selectedSports = [matchedSport];
    }
    this.city = (params.get('city') || '').trim().slice(0, 120);
    const requestedDistrict = (params.get('district') || '').trim();
    this.district = this.continentalDistricts.find(
      district => district.toLocaleLowerCase('pt') === requestedDistrict.toLocaleLowerCase('pt')
    ) ?? null;
  }

  resetSimilarVenueCheck(): void {
    ++this.similarVenueRequestVersion;
    this.checkingSimilarVenues = false;
    this.similarVenueCheckComplete = false;
    this.similarVenueCheckError = false;
    this.similarVenues = [];
  }

  checkSimilarVenues(): void {
    const name = this.name.trim();
    const city = this.city.trim();
    if (!name || !city || this.checkingSimilarVenues || this.saving) return;

    const version = ++this.similarVenueRequestVersion;
    this.checkingSimilarVenues = true;
    this.similarVenueCheckComplete = false;
    this.similarVenueCheckError = false;
    this.similarVenues = [];

    // A single bounded, explicit lookup: never download the whole catalogue
    // or issue a network request on every typed character.
    this.venueService.suggest(name, city, undefined, 0)
      .pipe(
        timeout(8_000),
        finalize(() => {
          if (version === this.similarVenueRequestVersion) {
            this.checkingSimilarVenues = false;
          }
        })
      )
      .subscribe({
        next: result => {
          if (version !== this.similarVenueRequestVersion) return;
          this.similarVenues = result.venues.slice(0, 5);
          this.similarVenueCheckComplete = true;
        },
        error: () => {
          if (version !== this.similarVenueRequestVersion) return;
          this.similarVenueCheckError = true;
        }
      });
  }

  onMapLinkChanged(): void {
    // A Maps edit supersedes a pending browser GPS position.
    ++this.locationRequestVersion;
    this.locating = false;
    // A changed Maps link must never silently retain coordinates from the previous link.
    ++this.mapLinkRequestVersion;
    if (this.coordinatesFromResolvedMapLink) {
      this.latitude = null;
      this.longitude = null;
      this.coordinatesFromResolvedMapLink = false;
    }
    this.mapLinkResolved = false;
    this.mapLinkError = false;
    this.resolvingMapLink = false;
  }

  onManualCoordinatesChanged(): void {
    // Manual coordinates supersede both pending GPS and Maps responses.
    ++this.locationRequestVersion;
    this.locating = false;
    // Explicitly edited coordinates belong to the user, not to a Maps URL.
    ++this.mapLinkRequestVersion;
    this.coordinatesFromResolvedMapLink = false;
    this.mapLinkResolved = false;
    this.resolvingMapLink = false;
  }

  resolveMapLink(): void {
    const url = this.mapLink.trim();
    if (!url || this.resolvingMapLink || this.saving) return;
    const requestVersion = ++this.mapLinkRequestVersion;
    // Explicit Maps resolution takes precedence over a pending browser location.
    ++this.locationRequestVersion;
    this.locating = false;
    this.resolvingMapLink = true;
    this.mapLinkError = false;
    this.mapLinkResolved = false;
    this.venueService.resolveMapLink(url)
      .pipe(
        timeout(10_000),
        finalize(() => {
          if (requestVersion === this.mapLinkRequestVersion) {
            this.resolvingMapLink = false;
          }
        })
      )
      .subscribe({
        next: result => {
          if (requestVersion !== this.mapLinkRequestVersion || url !== this.mapLink.trim()) return;
          if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)
              || Math.abs(result.latitude) > 90 || Math.abs(result.longitude) > 180) {
            this.mapLinkError = true;
            return;
          }
          this.latitude = result.latitude;
          this.longitude = result.longitude;
          this.coordinatesFromResolvedMapLink = true;
          this.mapLinkResolved = true;
        },
        error: () => {
          if (requestVersion === this.mapLinkRequestVersion) this.mapLinkError = true;
        }
      });
  }

  useCurrentLocation(): void {
    if (!navigator.geolocation || this.locating) {
      this.locationError = true;
      return;
    }

    const requestVersion = ++this.locationRequestVersion;
    // A newly requested GPS location supersedes a Maps lookup still in flight.
    ++this.mapLinkRequestVersion;
    this.resolvingMapLink = false;
    this.locating = true;
    this.locationError = false;
    navigator.geolocation.getCurrentPosition(
      position => {
        if (requestVersion !== this.locationRequestVersion) return;
        this.latitude = position.coords.latitude;
        this.longitude = position.coords.longitude;
        this.onManualCoordinatesChanged();
        this.locating = false;
      },
      () => {
        if (requestVersion !== this.locationRequestVersion) return;
        this.locationError = true;
        this.locating = false;
      }
    );
  }

  isChangingRoomTypeSelected(type: string): boolean {
    return this.changingRoomTypes.includes(type);
  }

  toggleChangingRoomType(type: string, selected: boolean): void {
    this.changingRoomTypes = selected
      ? [...this.changingRoomTypes, type]
      : this.changingRoomTypes.filter(item => item !== type);
  }

  isSportSelected(sport: string): boolean {
    return this.selectedSports.includes(sport);
  }

  toggleSport(sport: string, selected: boolean): void {
    this.selectedSports = selected
      ? [...this.selectedSports, sport]
      : this.selectedSports.filter(item => item !== sport);
  }

  /** Only a complete plausible Portugal continental GPS pair can replace a postal address. */
  get hasValidGpsCoordinates(): boolean {
    return this.latitude !== null && this.longitude !== null
      && Number.isFinite(this.latitude) && Number.isFinite(this.longitude)
      && this.latitude >= 36.8 && this.latitude <= 42.3
      && this.longitude >= -9.6 && this.longitude <= -6.0;
  }

  get hasInvalidGpsCoordinates(): boolean {
    return (this.latitude !== null || this.longitude !== null)
      && !this.hasValidGpsCoordinates;
  }

  get locationIsMissing(): boolean {
    return !this.address.trim() && !this.hasValidGpsCoordinates;
  }

  /** Five required inputs as specified in the reviewed venue UX proposal.
   * Postal addresses may be substituted by valid mainland GPS coordinates.
   * District remains optional because its municipality mapping is not yet authoritative.
   */
  get essentialCompletedCount(): number {
    return Number(!!this.name.trim())
      + Number(!!this.city.trim())
      + Number(!this.locationIsMissing && !this.hasInvalidGpsCoordinates)
      + Number(this.selectedSports.length > 0)
      + Number(this.environmentType !== null);
  }

  save(): void {
    if (this.saving) return;

    if (!this.name.trim() || !this.city.trim() || this.locationIsMissing || this.hasInvalidGpsCoordinates || this.selectedSports.length === 0 || this.environmentType === null) {
      this.validationError = true;
      return;
    }

    this.validationError = false;

    const request: CreateVenueRequest = {
      name: this.name.trim(), city: this.city.trim(), district: this.district,
      address: this.address.trim() || null,
      sports: this.selectedSports.join(';'), venueType: this.valueOrNull(this.venueType),
      ownershipType: this.ownershipType, surfaceType: this.valueOrNull(this.surfaceType),
      environmentType: this.environmentType, indoor: this.environmentType !== null && this.environmentType !== 'OUTDOOR', changingRooms: this.changingRooms,
      changingRoomTypes: this.changingRooms && this.changingRoomTypes.length ? this.changingRoomTypes.join(';') : null, toilets: this.toilets,
      lockers: this.lockers, showers: this.showers, stands: this.stands, drinkingFountain: this.drinkingFountain, accessible: this.accessible, firstAid: this.firstAid,
      aed: this.aed, medicalStation: this.medicalStation, lifeguard: this.lifeguard, staffOnSite: this.staffOnSite, securitySurveillance: this.securitySurveillance, cafe: this.cafe, restaurant: this.restaurant, vendingMachines: this.vendingMachines, sportsShop: this.sportsShop, wifi: this.wifi, phoneCharging: this.phoneCharging, nearbyRadiusMeters: this.nearbyRadiusMeters, nearbyPharmacy: this.nearbyPharmacy, nearbyAtm: this.nearbyAtm, services: this.valueOrNull(this.services),
      transport: this.valueOrNull(this.transport), openingHours: this.valueOrNull(this.openingHours),
      priceInfo: this.valueOrNull(this.priceInfo), website: this.valueOrNull(this.website), contact: this.valueOrNull(this.contact), parking: this.parking, freeParking: this.freeParking, lighting: this.lighting,
      latitude: this.latitude, longitude: this.longitude
    };

    this.saving = true;
    this.submitted = false;
    this.saveError = false;
    this.duplicateVenueError = false;
    this.venueService.submitSuggestion(request)
      .pipe(
        timeout(10_000),
        finalize(() => this.saving = false)
      )
      .subscribe({
      next: receipt => {
        this.submitted = receipt.status === 'PENDING';
        if (!this.submitted) this.saveError = true;
      },
      error: (error: HttpErrorResponse) => {
        this.duplicateVenueError = error.status === 409;
        this.saveError = !this.duplicateVenueError;
      }
    });
  }

  private valueOrNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed || null;
  }
}
