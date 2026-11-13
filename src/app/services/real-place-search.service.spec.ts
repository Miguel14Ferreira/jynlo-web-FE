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
    http.expectOne(req=>req.url.includes('geocoding-api.open-meteo.com')).flush(
      {message:'provider unavailable'},{status:503,statusText:'Unavailable'});
    http.expectOne(req=>req.url.includes('photon.komoot.io')).flush(
      {message:'provider unavailable'},{status:503,statusText:'Unavailable'});
    expect(names).toContain('Benfica');
  });

  it('returns cities from GeoNames as well as OSM points of interest', () => {
    let locations:string[]=[];
    service.search('Coimbra').subscribe(results=>locations=results.map(x=>x.label));
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
