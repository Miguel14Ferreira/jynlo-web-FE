import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NearbyAlertsPanelComponent } from './nearby-alerts-panel.component';

describe('NearbyAlertsPanelComponent', () => {
  let http: HttpTestingController;
  let component: NearbyAlertsPanelComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NearbyAlertsPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    component = TestBed.createComponent(NearbyAlertsPanelComponent).componentInstance;
    component.ngOnInit();
    http.expectOne(r => r.url.endsWith('/api/notifications/me/nearby-sessions') && r.method === 'GET')
      .flush({ enabled: false, latitude: null, longitude: null, placeLabel: null, radiusKm: 25, sports: [] });
  });

  afterEach(() => http.verify());

  it('needs a place before it can be turned on', () => {
    component.patch({ enabled: true });
    expect(component.problem).toBeTruthy();
    component.save();
    http.expectNone(r => r.method === 'PUT');
    component.choosePlace(component.places[0]);
    expect(component.problem).toBe('');
    expect(component.dirty).toBeTrue();
  });

  it('saves the chosen place, radius and sports', () => {
    component.patch({ enabled: true, radiusKm: 10 });
    component.choosePlace(component.places[1]);
    component.toggleSport('Padel');
    component.toggleSport('padel');
    component.toggleSport('Ténis');
    component.save();
    const put = http.expectOne(r => r.method === 'PUT');
    expect(put.request.body).toEqual({ enabled: true, latitude: 41.15, longitude: -8.61, placeLabel: 'Porto', radiusKm: 10, sports: ['Ténis'] });
    put.flush(put.request.body);
    expect(component.dirty).toBeFalse();
    expect(component.success).toBeTruthy();
  });

  it('suggests catalog sports ignoring accents and skips chosen ones', () => {
    component.search = 'tenis';
    expect(component.suggestions).toContain('Ténis');
    component.toggleSport('Ténis');
    component.search = 'tenis';
    expect(component.suggestions).not.toContain('Ténis');
  });

  it('can forget the saved place', () => {
    component.choosePlace(component.places[0]);
    component.forgetPlace();
    expect(component.draft).toEqual(jasmine.objectContaining({ enabled: false, latitude: null, longitude: null, placeLabel: null }));
  });
});
