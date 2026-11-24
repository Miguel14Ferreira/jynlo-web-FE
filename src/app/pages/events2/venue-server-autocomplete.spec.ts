import { VenueSlotPickerComponent } from '../../shared/venue-slot-picker/venue-slot-picker.component';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { Events2Component } from './events2.component';
import { LocationMethodSelectorComponent } from '../../shared/location-method-selector/location-method-selector.component';
import { Venue } from '../model/venue';
import { VenueService, VenueSuggestionPage } from '../../services/venue.service';
import { SessionService } from '../../services/session.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('Create session venue server autocomplete', () => {
  let component: Events2Component;
  let fixture: ComponentFixture<Events2Component>;
  let venues: jasmine.SpyObj<VenueService>;
  const venue = (id: number, name: string, city = 'Porto'): Venue => ({
    id, name, city, address: 'Rua A', sports: 'Padel',
    latitude: null, longitude: null
  } as Venue);
  const page = (items: Venue[], n = 0, more = false): VenueSuggestionPage => ({
    venues: items, page: n, hasMore: more
  });

  beforeEach(async () => {
    venues = jasmine.createSpyObj<VenueService>('VenueService', [
      'suggest', 'search', 'submitSuggestion', 'listPhotos', 'resolveMapLink'
    ]);
    venues.suggest.and.returnValue(of(page([])));
    venues.listPhotos.and.returnValue(of([]));
    await TestBed.configureTestingModule({
      declarations: [Events2Component],
      imports: [...TEST_IMPORTS, LocationMethodSelectorComponent, VenueSlotPickerComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: VenueService, useValue: venues },
        { provide: SessionService, useValue: jasmine.createSpyObj<SessionService>('SessionService', ['create']) }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(Events2Component);
    component = fixture.componentInstance;
    component.venueDistrict = 'Porto';
    spyOn(TestBed.inject(Router), 'navigate').and.returnValue(Promise.resolve(true));
    fixture.detectChanges();
  });

  it('waits for district selection before requesting venues', () => {
    component.venueDistrict = '';
    component.sport = 'Padel';
    component.confirmSportSelection();
    expect(venues.suggest).not.toHaveBeenCalled();
    component.onDistrictChanged('Porto');
    expect(venues.suggest).toHaveBeenCalledWith('', '', 'Padel', 0, 'Porto');
  });

  it('clears previous selections and ignores stale district responses', () => {
    const pending = new Subject<VenueSuggestionPage>();
    venues.suggest.and.returnValues(pending.asObservable(), of(page([venue(2,'Campo Setúbal','Setúbal')])));
    component.sport = 'Padel';
    component.loadVenues();
    component.venues = [venue(1, 'Campo Porto')];
    component.selectVenue(1);
    component.onDistrictChanged('Setúbal');
    expect(component.selectedVenueId).toBeNull();
    expect(component.venueDistrict).toBe('Setúbal');
    expect(venues.suggest).toHaveBeenCalledWith('', '', 'Padel', 0, 'Setúbal');
    pending.next(page([venue(1,'Campo Porto')]));
    pending.complete();
    expect(component.venues.map(v => v.id)).toEqual([2]);
  });

  it('requires a three-letter name for unclassified nationwide search', fakeAsync(() => {
    component.sport = 'Padel';
    component.onDistrictChanged('ALL');
    expect(venues.suggest).not.toHaveBeenCalled();
    component.onVenueSearchChanged('Ca');
    tick(300);
    expect(venues.suggest).not.toHaveBeenCalled();
    component.onVenueSearchChanged('Campo');
    tick(300);
    expect(venues.suggest).toHaveBeenCalledWith('Campo', '', 'Padel', 0, undefined);
  }));

  it('does not download all venues before the user picks a sport', () => {
    expect(venues.search).not.toHaveBeenCalled();
    expect(venues.suggest).not.toHaveBeenCalled();
    component.sport = 'Padel';
    component.confirmSportSelection();
    expect(venues.suggest).toHaveBeenCalledWith('', '', 'Padel', 0, 'Porto');
    expect(venues.search).not.toHaveBeenCalled();
  });

  it('debounces typing and keeps the search editable while loading', fakeAsync(() => {
    const pending = new Subject<VenueSuggestionPage>();
    venues.suggest.and.returnValue(pending.asObservable());
    component.sport = 'Padel';
    fixture.detectChanges();
    tick();
    expect(component.sportSelected).toBeTrue();
    component.onVenueSearchChanged('Pavilhão');
    tick(299);
    expect(venues.suggest).not.toHaveBeenCalled();
    tick(1);
    expect(venues.suggest).toHaveBeenCalledWith('Pavilhão', '', 'Padel', 0, 'Porto');
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('app-jynlo-select[name="venueSearch"]') as HTMLElement;
    expect((host.querySelector('button[role="combobox"]') as HTMLButtonElement).disabled)
      .toBeFalse();
    (host.querySelector('button[role="combobox"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();
    expect((host.querySelector('input[type="search"]') as HTMLInputElement).disabled).toBeFalse();
    pending.next(page([venue(4, 'Pavilhão')]));
    pending.complete();
    expect(component.venueOptions.map(v => v.id)).toEqual([4]);
  }));

  it('can load a later page and select a venue not found on the first 40', () => {
    const first = Array.from({ length: 40 }, (_, i) => venue(i + 1, 'Campo ' + i));
    venues.suggest.and.returnValues(of(page(first, 0, true)), of(page([venue(101, 'Campo Porto')], 1)));
    component.sport = 'Padel';
    component.loadVenues();
    expect(component.venueOptions.length).toBe(40);
    fixture.detectChanges();
    const more = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((item: any) => item.textContent.includes('Mostrar mais recintos')) as HTMLButtonElement;
    expect(more).toBeDefined();
    more.click();
    expect(venues.suggest).toHaveBeenCalledWith('', '', 'Padel', 1, 'Porto');
    expect(component.venueOptions.some(v => v.id === 101)).toBeTrue();
    component.venueSearch = 'Campo Porto · Porto';
    component.confirmVenueSelection();
    expect(component.selectedVenueId).toBe(101);
  });

  it('ignores stale responses and keeps newest suggestion results', fakeAsync(() => {
    const old = new Subject<VenueSuggestionPage>();
    const latest = new Subject<VenueSuggestionPage>();
    venues.suggest.and.returnValues(old.asObservable(), latest.asObservable());
    component.sport = 'Padel';
    component.onVenueSearchChanged('Antigo');
    tick(300);
    component.onVenueSearchChanged('Novo');
    tick(300);
    latest.next(page([venue(2, 'Novo')]));
    latest.complete();
    old.next(page([venue(1, 'Antigo')]));
    old.complete();
    expect(component.venues.map(v => v.id)).toEqual([2]);
    expect(component.venuesLoading).toBeFalse();
  }));

  it('queries the chosen city field separately from the venue name', fakeAsync(() => {
    component.sport = 'Padel';
    component.onCityChanged('Porto');
    tick(300);
    expect(venues.suggest).toHaveBeenCalledWith('', 'Porto', 'Padel', 0, 'Porto');
  }));

  it('separates a selected datalist label into venue name and city', fakeAsync(() => {
    component.sport = 'Padel';
    component.onVenueSearchChanged('Pavilhão Municipal · Évora');
    tick(300);
    expect(venues.suggest).toHaveBeenCalledWith('Pavilhão Municipal', 'Évora', 'Padel', 0, 'Porto');
  }));

  it('does not select a name-only result if more matches may be on later pages', () => {
    venues.suggest.and.returnValue(of(page([venue(1, 'Pavilhão')], 0, true)));
    component.sport = 'Padel';
    component.venueSearch = 'Pavilhão';
    component.loadVenues();
    component.confirmVenueSelection();
    expect(component.selectedVenueId).toBeNull();
  });

  it('renders two same-name venues as separate clickable results with stable IDs', fakeAsync(() => {
    venues.suggest.and.returnValue(of(page([
      venue(501, 'Pavilhão Municipal', 'Porto'),
      venue(777, 'Pavilhão Municipal', 'Porto')
    ])));
    component.sport = 'Padel';
    component.loadVenues();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('app-jynlo-select[name="venueSearch"]') as HTMLElement;
    (host.querySelector('.jynlo-select__trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const results = host.querySelectorAll(
      'button[role="option"]'
    ) as NodeListOf<HTMLButtonElement>;
    expect(results.length).toBe(2);
    expect(results[0].textContent).toContain('Pavilhão Municipal');
    expect(results[1].textContent).toContain('Pavilhão Municipal');
    results[1].click();

    expect(component.selectedVenueId).toBe(777);
    expect(component.venueSearch).toBe('Pavilhão Municipal · Porto');
  }));

  it('shows the unverified OSM source and GPS-only address without inventing a street', fakeAsync(() => {
    const gpsOnly = {
      ...venue(2026, 'Campo Desportivo da Fonte'),
      address: null,
      latitude: 41.15,
      longitude: -8.6,
      informationSource: 'OPENSTREETMAP'
    } as unknown as Venue;
    venues.suggest.and.returnValue(of(page([gpsOnly])));
    component.sport = 'Padel';
    component.loadVenues();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('app-jynlo-select[name="venueSearch"]') as HTMLElement;
    (host.querySelector('.jynlo-select__trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const result = host.querySelector('button[role="option"]') as HTMLButtonElement;
    expect(result).not.toBeNull();
    expect(result.textContent).toContain('morada por confirmar');
    expect(result.textContent).toContain('OpenStreetMap');
    expect(result.textContent).not.toContain('null');
    result.click();
    fixture.detectChanges();
    expect(component.selectedVenueId).toBe(2026);
    expect(host.querySelector('button[role="option"]')).toBeNull();
  }));

  it('does not leave outdated search-result buttons active during debounce', fakeAsync(() => {
    venues.suggest.and.returnValues(
      of(page([venue(10, 'Campo Antigo')])),
      of(page([venue(11, 'Campo Novo')]))
    );
    component.sport = 'Padel';
    component.loadVenues();
    expect(component.venues.map(v => v.id)).toEqual([10]);
    component.onVenueSearchChanged('Campo Novo');
    expect(component.venues).toEqual([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector(
      'app-jynlo-select[name="venueSearch"] button[role="option"]')).toBeNull();
    tick(300);
    expect(component.venues.map(v => v.id)).toEqual([11]);
  }));
});
