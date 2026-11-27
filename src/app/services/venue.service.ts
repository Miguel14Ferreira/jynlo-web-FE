import { appTranslate } from '../i18n/i18n.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, switchMap, throwError } from 'rxjs';

import { environment } from 'src/environment/environment';
import {
  CreateVenueRequest,
  Venue,
  VenueInformationSource
} from '../pages/model/venue';

export interface VenueSuggestionPage {
  venues: Venue[];
  page: number;
  hasMore: boolean;
}

export interface NearbyCityVenuePage {
  referenceCity: string;
  radiusKm: number;
  referenceAvailable: boolean;
  venues: { venue: Venue; distanceKm: number }[];
  page: number;
  hasMore: boolean;
}

/** No public count or average is exposed until three different people rate. */
export interface VenueRatingSummary {
  venueId: number;
  ratingCount: number;
  averageScore: number | null;
}

export interface VenuePhoto {
  id: number;
  photoUrl: string;
  uploadedByUsername: string | null;
  createdAt: string;
}

export interface ResolveVenueMapLinkResponse {
  resolvedUrl: string;
  latitude: number;
  longitude: number;
}

/** Optional reverse lookup; GPS coordinates remain authoritative for the map. */
export interface ReverseVenueLocation {
  city: string | null;
  address: string | null;
  distanceMeters: number | null;
  provider: string;
}

interface PhotonReverseResponse {
  features?: Array<{
    properties?: Record<string, string>;
    geometry?: {coordinates?: number[]};
  }>;
}

interface MyGeocodeReverseResponse {
  result?: {
    components?: Record<string, string>;
    distance_m?: number;
  } | null;
}

export interface VenueSportCondition {
  id: number;
  sport: string;
  conditions: string;
  informationSource: VenueInformationSource;
  createdByUsername: string | null;
  createdAt: string;
}

export interface CreateVenueSportConditionRequest {
  sport: string;
  conditions: string;
}

@Injectable({
  providedIn: 'root'
})
export class VenueService {
  private readonly baseUrl = environment.apiUrl + '/api/venues';

  constructor(private http: HttpClient) {}

  /** Admins only: mark a venue as adults-only (hidden from visitors without an adult account). */
  setAdultsOnly(id: number, adultsOnly: boolean): Observable<{ id: number; adultsOnly: boolean }> {
    return this.http.put<{ id: number; adultsOnly: boolean }>(
      environment.apiUrl + '/api/admin/venues/' + id + '/adults-only', { adultsOnly });
  }

  search(city?: string, sport?: string, latitude?: number, longitude?: number, radiusKm?: number): Observable<Venue[]> {
    let params = new HttpParams();

    if (city?.trim()) {
      params = params.set('city', city.trim());
    }
    if (sport?.trim()) {
      params = params.set('sport', sport.trim());
    }
    if (latitude !== undefined) {
      params = params.set('latitude', String(latitude));
    }
    if (longitude !== undefined) {
      params = params.set('longitude', String(longitude));
    }
    if (radiusKm !== undefined) {
      params = params.set('radiusKm', String(radiusKm));
    }

    return this.http.get<Venue[]>(this.baseUrl, { params });
  }

  /** Bounded server-side autocomplete; keeps the legacy search contract unchanged. */
  suggest(name?: string, city?: string, sport?: string, page = 0, district?: string): Observable<VenueSuggestionPage> {
    let params = new HttpParams().set('page', String(page));
    if (name?.trim()) params = params.set('name', name.trim());
    if (city?.trim()) params = params.set('city', city.trim());
    if (sport?.trim()) params = params.set('sport', sport.trim());
    if (district?.trim()) params = params.set('district', district.trim());
    return this.http.get<VenueSuggestionPage>(this.baseUrl + '/suggest', { params });
  }

  /** Distances from approximate saved venue-GPS reference, not official city centre. */
  nearbyCity(city: string, sport?: string, page = 0, radiusKm = 25): Observable<NearbyCityVenuePage> {
    let params = new HttpParams().set('city', city.trim()).set('page', String(page))
      .set('radiusKm', String(radiusKm));
    if (sport?.trim()) params = params.set('sport', sport.trim());
    return this.http.get<NearbyCityVenuePage>(this.baseUrl + '/nearby-city', { params });
  }

  getRatingSummary(id: number): Observable<VenueRatingSummary> {
    return this.http.get<VenueRatingSummary>(this.baseUrl + '/' + id + '/ratings/summary');
  }

  get(id: number): Observable<Venue> {
    return this.http.get<Venue>(this.baseUrl + '/' + id);
  }

  resolveMapLink(url: string): Observable<ResolveVenueMapLinkResponse> {
    return this.http.post<ResolveVenueMapLinkResponse>(
      this.baseUrl + '/resolve-map-link',
      { url }
    );
  }

  reverseLocation(latitude: number, longitude: number, accuracyMeters?: number): Observable<ReverseVenueLocation> {
    let params = new HttpParams()
      .set('latitude', String(latitude))
      .set('longitude', String(longitude));
    if (accuracyMeters !== undefined && Number.isFinite(accuracyMeters)) {
      params = params.set('accuracyMeters', String(accuracyMeters));
    }
    return this.http.get<ReverseVenueLocation>(this.baseUrl + '/reverse-location', { params }).pipe(
      // The first provider can find only Sintra (municipality) and no road,
      // even at a street in Cacém. Use street-level OSM results if available.
      switchMap(value => value.address ? of(value)
        : this.reverseViaPhoton(latitude, longitude).pipe(
            map(street => street.address ? street : value),
            catchError(() => of(value))
          )),
      catchError(error => {
        if (error?.status === 429) return throwError(() => error);
        return this.reverseViaPhoton(latitude, longitude).pipe(
          switchMap(street => street.address ? of(street)
            : this.reverseViaMyGeocode(latitude, longitude, accuracyMeters)),
          catchError(() => this.reverseViaMyGeocode(latitude, longitude, accuracyMeters))
        );
      })
    );
  }

  private reverseViaPhoton(latitude: number, longitude: number): Observable<ReverseVenueLocation> {
    return this.http.get<PhotonReverseResponse>('https://photon.komoot.io/reverse', {
      params: new HttpParams()
        .set('lat', String(latitude)).set('lon', String(longitude))
        .set('radius', '0.5').set('layer', 'street').set('limit', '1')
    }).pipe(map(data => this.parsePhotonStreet(data, latitude, longitude)));
  }

  private parsePhotonStreet(
    data: PhotonReverseResponse, latitude: number, longitude: number
  ): ReverseVenueLocation {
    const feature = data.features?.[0];
    const p = feature?.properties ?? {};
    const choose = (...keys: string[]) =>
      keys.map(key => p[key]?.trim()).find(v => !!v) ?? null;
    const city = choose('district', 'locality', 'city', 'county');
    const road = choose('street') ?? (p['type'] === 'street' ? choose('name') : null);
    const coords = feature?.geometry?.coordinates;
    let metres: number | null = null;
    if (coords?.length === 2 && coords.every(Number.isFinite)) {
      const dLat = (coords[1] - latitude) * Math.PI / 180;
      const dLon = (coords[0] - longitude) * Math.PI / 180;
      const arc = Math.sin(dLat / 2) ** 2
        + Math.cos(latitude * Math.PI / 180) * Math.cos(coords[1] * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2;
      metres = Math.round(2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(arc))));
    }
    const address = road && metres !== null && metres <= 500
      ? (metres > 160 ? 'Perto de ' : '') + road : null;
    return { city, address, distanceMeters: metres, provider: 'OpenStreetMap / Photon' };
  }

  private reverseViaMyGeocode(latitude: number, longitude: number,
    accuracyMeters?: number): Observable<ReverseVenueLocation> {
    return this.http.get<MyGeocodeReverseResponse>('https://api.mygeocode.com/v1/reverse', {
      params: new HttpParams().set('lat', String(latitude)).set('lon', String(longitude))
        .set('level', 'address').set('radius', '1500').set('lang', 'pt')
    }).pipe(map(value => this.parseReverseGeocode(value, accuracyMeters)));
  }

  private parseReverseGeocode(
    value: MyGeocodeReverseResponse, accuracyMeters?: number
  ): ReverseVenueLocation {
    const address = value.result?.components ?? {};
    const choose = (...names: string[]) =>
      names.map(name => address[name]?.trim()).find(name => !!name) ?? null;
    const city = choose('city', 'town', 'village', 'locality', 'municipality',
      'city_district', 'suburb', 'quarter', 'county');
    const road = choose('road', 'street', 'pedestrian', 'residential');
    const distance = Number.isFinite(value.result?.distance_m)
      ? Math.max(0, Number(value.result!.distance_m)) : null;
    const allowedDistance = accuracyMeters === undefined ? 140
      : Math.max(90, Math.min(220, accuracyMeters + 90));
    const street = road && distance !== null && distance <= allowedDistance
      ? road : null;
    return {city, address: street, distanceMeters: distance, provider:'My Geocode'};
  }

  listPhotos(id: number): Observable<VenuePhoto[]> {
    return this.http.get<VenuePhoto[]>(this.baseUrl + '/' + id + '/photos');
  }

  addPhoto(id: number, file: File): Observable<VenuePhoto> {
    const formData = new FormData();
    formData.append('photo', file);

    return this.http.post<VenuePhoto>(
      this.baseUrl + '/' + id + '/photos',
      formData
    );
  }

  listSportConditions(id: number): Observable<VenueSportCondition[]> {
    return this.http.get<VenueSportCondition[]>(
      this.baseUrl + '/' + id + '/sport-conditions'
    );
  }

  addSportCondition(
    id: number,
    request: CreateVenueSportConditionRequest
  ): Observable<VenueSportCondition> {
    return this.http.post<VenueSportCondition>(
      this.baseUrl + '/' + id + '/sport-conditions',
      request
    );
  }

  /** Submissions are not venues until reviewed and approved by an admin. */
  submitSuggestion(request: CreateVenueRequest): Observable<{ id: number; status: string }> {
    return this.http.post<{ id: number; status: string }>(this.baseUrl, request);
  }

  /** "Criar o meu recinto": the new venue and the request to manage it, reviewed together. */
  submitMine(request: CreateVenueRequest, roleDescription: string, contactPhone: string | null): Observable<{ id: number; status: string }> {
    return this.http.post<{ id: number; status: string }>(this.baseUrl + '/mine', { venue: request, roleDescription, contactPhone });
  }
}
