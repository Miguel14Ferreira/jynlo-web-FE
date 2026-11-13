import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of, switchMap, timeout } from 'rxjs';
import { environment } from 'src/environment/environment';

/** Actual geographic results from GeoNames/Open-Meteo and OpenStreetMap/Photon.
 * Do not accept arbitrary text as a verified location. */
export interface RealPlace {
  id:string; label:string; subtitle:string; latitude:number; longitude:number;
  provider?:'google'|'open';
}
interface GeoResponse {
  results?: Array<{ id:number; name:string; latitude:number; longitude:number;
    country?:string; country_code?:string; admin1?:string; admin2?:string; admin3?:string }>;
}
interface PhotonResponse {
  features?: Array<{ geometry?:{coordinates?:number[]};
    properties?:{osm_id?:number;osm_type?:string;name?:string;street?:string;
      city?:string;district?:string;county?:string;state?:string;country?:string} }>;
}
@Injectable({providedIn:'root'})
export class RealPlaceSearchService {
  constructor(private readonly http:HttpClient) {}

  /** One token per editor session; never reuse across unrelated selections. */
  newSessionToken():string {
    return crypto.randomUUID();
  }

  resolve(place:RealPlace,sessionToken?:string):Observable<RealPlace> {
    if(place.provider!=='google' || !place.id.startsWith('google:')) return of(place);
    const params=sessionToken?new HttpParams().set('sessionToken',sessionToken):new HttpParams();
    const placeId=encodeURIComponent(place.id.substring(7));
    return this.http.get<RealPlace>(environment.apiUrl+'/api/places/google/'+placeId,{params}).pipe(
      timeout(10000),map(location=>({...location,provider:'google' as const}))
    );
  }

  search(text:string,sessionToken?:string):Observable<RealPlace[]> {
    const query=text.trim().slice(0,100);
    if(query.length<2)return of([]);
    // Google is primary when configured on the backend; no browser key.
    // Older deployments and API outages fall back to the worldwide providers.
    if(query.length>=3) {
      let params=new HttpParams().set('q',query);
      if(sessionToken) params=params.set('sessionToken',sessionToken);
      return this.http.get<{provider:string;places:Array<{id:string;label:string;subtitle:string}>}>(
        environment.apiUrl+'/api/places/suggestions',{params}).pipe(
        timeout(8000),
        map(data=>(data.places||[]).map(place=>({...place,latitude:0,longitude:0,
          provider:'google' as const}))),
        switchMap(places=>places.length?of(places):this.fallback(query)),
        catchError(()=>this.fallback(query))
      );
    }
    return this.fallback(query);
  }

  private fallback(query:string):Observable<RealPlace[]> {
    // A small, verified geographic seed for locations the search API
    // does not reliably index as cities (e.g. Lisbon administrative parishes).
    // Benfica: OpenStreetMap node 1493246250, place=suburb.
    const known:RealPlace[] = [
      {id:'osm:node:1493246250',label:'Benfica',subtitle:'Lisboa, Portugal',
        latitude:38.7482,longitude:-9.1995}
    ].filter(place=>place.label.toLocaleLowerCase().startsWith(query.toLocaleLowerCase()));
    // GeoNames indexes cities, towns and neighbourhoods. Photon adds POIs
    // and sports venues. Each source can fail independently without breaking
    // suggestions from the other provider.
    const meteoParams=new HttpParams().set('name',query).set('count','18').set('language','pt');
    const photonParams=new HttpParams().set('q',query).set('limit','12').set('lang','pt')
      .set('lat','38.7369').set('lon','-9.1609');
    const localities=this.http.get<GeoResponse>(
      'https://geocoding-api.open-meteo.com/v1/search',{params:meteoParams}).pipe(
      timeout(6500),map(data=>(data.results||[]).flatMap(entry=>{
        if(!entry.name||!Number.isFinite(entry.latitude)||!Number.isFinite(entry.longitude))return [];
        const components=[entry.admin3,entry.admin2,entry.admin1,entry.country]
          .filter((v,i,a):v is string=>!!v&&a.indexOf(v)===i&&v!==entry.name);
        return [{id:'geonames:'+entry.id,label:entry.name,subtitle:components.join(', '),
          latitude:entry.latitude,longitude:entry.longitude} as RealPlace];
      })),catchError(()=>of([] as RealPlace[])));
    const places=this.http.get<PhotonResponse>('https://photon.komoot.io/api/',
      {params:photonParams}).pipe(timeout(6500),map(data=>(data.features||[]).flatMap(feature=>{
      const p=feature.properties,point=feature.geometry?.coordinates;
      if(!p?.name||!point||point.length<2||!Number.isFinite(point[0])||
          !Number.isFinite(point[1]))return [];
      const subtitle=[p.street,p.district,p.city,p.county,p.state,p.country]
        .filter((v,i,a):v is string=>!!v&&a.indexOf(v)===i&&v!==p.name).join(', ');
      return [{id:'osm:'+p.osm_type+':'+p.osm_id,label:p.name,subtitle,
        latitude:point[1],longitude:point[0]} as RealPlace];
    })),catchError(()=>of([] as RealPlace[])));
    return forkJoin([localities,places]).pipe(map(([cities,points])=>{
      const found=new Set<string>();
      return [...known,...cities,...points]
        .filter(item=>{
          const key=(item.label+'|'+item.subtitle).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
            .toLocaleLowerCase();
          if(found.has(key))return false;
          found.add(key);
          return true;
        })
        .sort((a,b)=>{
          const score=(p:RealPlace)=>{
            const name=p.label.toLocaleLowerCase(),lower=query.toLocaleLowerCase();
            return (name===lower?0:name.startsWith(lower)?1:2)
              +(p.subtitle.toLowerCase().includes('portugal')?0:4)
              +(p.subtitle.toLowerCase().includes('lisboa')?0:1);
          };
          return score(a)-score(b);
        }).slice(0,12);
    }));
  }
}
