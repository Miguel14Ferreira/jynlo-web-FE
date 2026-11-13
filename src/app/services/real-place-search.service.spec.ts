import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RealPlaceSearchService } from './real-place-search.service';

describe('RealPlaceSearchService', () => {
  let service: RealPlaceSearchService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({imports:[HttpClientTestingModule]});
    service=TestBed.inject(RealPlaceSearchService);
    http=TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('offers the verified Benfica locality even when remote services fail', () => {
    let names:string[]=[];
    service.search('benfica').subscribe(locations=>names=locations.map(x=>x.label));
    http.expectOne(req=>req.url.includes('/api/places/suggestions')).flush(
      {},{status:503,statusText:'Places not configured'});
    http.expectOne(req=>req.url.includes('geocoding-api.open-meteo.com')).flush(
      {message:'provider unavailable'},{status:503,statusText:'Unavailable'});
    http.expectOne(req=>req.url.includes('photon.komoot.io')).flush(
      {message:'provider unavailable'},{status:503,statusText:'Unavailable'});
    expect(names).toContain('Benfica');
  });

  it('prefers worldwide Google suggestions when the server has Places configured', () => {
    let results: import('./real-place-search.service').RealPlace[]=[];
    service.search('Cacém','testsession123').subscribe(places=>results=places);
    http.expectOne(req=>req.url.includes('/api/places/suggestions') &&
      req.params.get('sessionToken')==='testsession123').flush({
      provider:'google',places:[{id:'google:ChIJtestid',label:'Agualva-Cacém',
        subtitle:'Sintra, Portugal'}]
    });
    expect(results.length).toBe(1);
    expect(results[0].provider).toBe('google');
    expect(results[0].label).toBe('Agualva-Cacém');
  });

  it('resolves Google Place Details before storing coordinates', () => {
    let verified: import('./real-place-search.service').RealPlace | undefined;
    service.resolve({id:'google:ChIJtestid',label:'Cacém',subtitle:'Portugal',
      latitude:0,longitude:0,provider:'google'},'sessiontoken123')
      .subscribe(place=>verified=place);
    http.expectOne(req=>req.url.includes('/api/places/google/ChIJtestid') &&
      req.params.get('sessionToken')==='sessiontoken123').flush({
      id:'google:ChIJtestid',label:'Agualva-Cacém',subtitle:'Sintra, Portugal',
      latitude:38.77,longitude:-9.30
    });
    expect(verified?.latitude).toBe(38.77);
  });

  it('returns cities from GeoNames as well as OSM points of interest', () => {
    let locations:string[]=[];
    service.search('Coimbra').subscribe(results=>locations=results.map(x=>x.label));
    http.expectOne(req=>req.url.includes('/api/places/suggestions')).flush(
      {places:[],provider:'google'});
    http.expectOne(req=>req.url.includes('geocoding-api.open-meteo.com')).flush({
      results:[{id:2740637,name:'Coimbra',country:'Portugal',country_code:'PT',
        admin1:'Coimbra',latitude:40.21,longitude:-8.42}]
    });
    http.expectOne(req=>req.url.includes('photon.komoot.io')).flush({
      features:[{properties:{name:'Estádio Universitário',city:'Coimbra',country:'Portugal',
        osm_id:42,osm_type:'way'},geometry:{coordinates:[-8.43,40.20]}}]
    });
    expect(locations).toContain('Coimbra');
    expect(locations).toContain('Estádio Universitário');
  });
});
