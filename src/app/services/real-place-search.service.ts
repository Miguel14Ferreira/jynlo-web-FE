import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

/** Real map features from Photon/OpenStreetMap, not user-invented labels.
 * The public Photon endpoint supports search-as-you-type. The UI debounces
 * requests and limits results; replace with a hosted service as Jynlo scales.
 */
export interface RealPlace {
  id: string;
  label: string;
  subtitle: string;
  longitude: number;
  latitude: number;
}

interface PhotonResponse {
  features?: Array<{
    geometry?: { coordinates?: number[] };
    properties?: {
      osm_id?: number; osm_type?: string; name?: string; street?: string;
      city?: string; district?: string; county?: string; state?: string;
      country?: string; type?: string;
    };
  }>;
}

@Injectable({providedIn:'root'})
export class RealPlaceSearchService {
  constructor(private readonly http: HttpClient) {}

  search(text: string): Observable<RealPlace[]> {
    const query = text.trim().slice(0,100);
    const params = new HttpParams().set('q',query).set('limit','8')
      .set('lang','pt').set('lat','38.7369').set('lon','-9.1609');
    return this.http.get<PhotonResponse>('https://photon.komoot.io/api/',{params}).pipe(
      map(response => (response.features || []).flatMap(feature => {
        const p=feature.properties, xy=feature.geometry?.coordinates;
        if (!p?.name || !xy || xy.length < 2 ||
            !Number.isFinite(xy[0]) || !Number.isFinite(xy[1])) return [];
        const subtitle = [p.street,p.district,p.city,p.county,p.state,p.country]
          .filter((value,index,parts) => !!value && parts.indexOf(value) === index && value !== p.name)
          .join(', ');
        return [{id:(p.osm_type || 'osm')+':'+String(p.osm_id || '')+':'+xy.join(','),
          label:p.name, subtitle, longitude:xy[0],latitude:xy[1]}];
      }))
    );
  }
}
