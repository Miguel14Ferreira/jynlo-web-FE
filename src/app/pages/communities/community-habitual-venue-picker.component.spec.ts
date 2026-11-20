import { of, Subject, throwError } from 'rxjs';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { VenueService } from '../../services/venue.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { CommunityHabitualVenuePickerComponent } from './community-habitual-venue-picker.component';
import { CommunityGroup } from '../model/community-group';
import { Venue } from '../model/venue';

describe('Community habitual venue picker', () => {
  const group = {id: 42, name: 'ACM', myRole: 'OWNER', sport: 'Futebol',
    sports: ['Futebol'], defaultVenueId: null} as CommunityGroup;
  const venue = {id: 55, name: 'Campo Municipal', city: 'Lisboa',
    district: 'Lisboa', address: 'Rua da Bola', sports: 'Futebol',
    latitude: 38.71, longitude: -9.13} as Venue;

  function setup() {
    const venues = {
      suggest: jasmine.createSpy('suggest').and.returnValue(of({
        venues: [venue], page: 0, hasMore: false
      })),
      get: jasmine.createSpy('get').and.returnValue(of(venue)),
      resolveMapLink: jasmine.createSpy('resolveMapLink').and.returnValue(of({
        latitude: 38.71, longitude: -9.13, resolvedUrl: 'https://www.google.com/maps'
      })),
      reverseLocation: jasmine.createSpy('reverseLocation').and.returnValue(of({
        city: 'Lisboa', address: 'Rua da Bola', distanceMeters: 4, provider: 'OSM'
      }))
    };
    const groups = {
      updateDefaultVenue: jasmine.createSpy('updateDefaultVenue').and.callFake(
        (_id: number, id: number | null) =>
          of({...group, defaultVenueId: id, defaultVenueName: id ? venue.name : null})
      ),
      updateHabitualLocation: jasmine.createSpy('updateHabitualLocation').and.callFake(
        (_id: number, source: 'GPS' | 'MAPS', lat: number, lng: number,
          city: string | null, address: string | null) =>
          of({...group, habitualLocationSource: source,
            habitualLatitude: lat, habitualLongitude: lng,
            habitualCity: city, habitualAddress: address})
      )
    };
    const cdr = { markForCheck: jasmine.createSpy('markForCheck') };
    const zone = { run: jasmine.createSpy('run').and.callFake((callback: () => unknown) => callback()) };
    const sanitizer = {
      bypassSecurityTrustResourceUrl: jasmine.createSpy('bypassSecurityTrustResourceUrl')
        .and.callFake((url: string) => url)
    };
    const component = new CommunityHabitualVenuePickerComponent(
      venues as any, groups as any, cdr as any, zone as any, sanitizer as any);
    component.community = {...group};
    return {component, venues, groups, cdr, zone};
  }

  it('embeds the saved catalogue venue on the community home even while not editing', () => {
    const {component, venues} = setup();
    component.community = {...group, defaultVenueId: 55, defaultVenueName: 'Campo Municipal'};
    component.ngOnChanges({ community: {
      previousValue: null, currentValue: component.community, firstChange: true, isFirstChange: () => true
    } });
    expect(component.editing).toBeFalse();
    expect(venues.get).toHaveBeenCalledWith(55);
    expect(component.savedMapPreviewUrl).toBeTruthy();
    expect(component.savedMapLink).toContain('38.71,-9.13');
  });

  it('embeds saved GPS coordinates without searching for another venue', () => {
    const {component, venues} = setup();
    component.community = {...group, habitualLocationSource: 'GPS',
      habitualLatitude: 38.71, habitualLongitude: -9.13};
    component.ngOnChanges({ community: {
      previousValue: null, currentValue: component.community, firstChange: true, isFirstChange: () => true
    } });
    expect(venues.get).not.toHaveBeenCalled();
    expect(component.savedMapPreviewUrl).toBeTruthy();
  });

  it('opens a catalogue venue detail without silently making it the default', () => {
    const {component, venues, groups} = setup();
    component.query = 'campo';
    component.search();
    expect(venues.suggest).toHaveBeenCalled();
    expect(groups.updateDefaultVenue).not.toHaveBeenCalled();
    component.openDetails(55);
    expect(component.expanded?.id).toBe(55);
    expect(groups.updateDefaultVenue).not.toHaveBeenCalled();
    component.save(55);
    expect(groups.updateDefaultVenue).toHaveBeenCalledWith(42, 55);
    expect(component.community.defaultVenueId).toBe(55);
  });

  it('leaves search mode when the backend responds and displays results', () => {
    const {component, venues, cdr} = setup();
    const pending = new Subject<any>();
    venues.suggest.and.returnValue(pending.asObservable());
    component.query = 'Campo';
    component.search();
    expect(component.searching).toBeTrue();
    pending.next({venues: [venue], page: 0, hasMore: false});
    pending.complete();
    expect(component.searching).toBeFalse();
    expect(component.searchAttempted).toBeTrue();
    expect(component.results.length).toBe(1);
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('cancels a slow search when another query is submitted', () => {
    const {component, venues} = setup();
    const pending = new Subject<any>();
    venues.suggest.and.returnValues(pending.asObservable(), of({
      venues: [venue], page: 0, hasMore: false
    }));
    component.query = 'Campo antigo';
    component.search();
    component.query = 'Campo Municipal';
    component.search();
    pending.next({venues: [], page: 0, hasMore: false});
    pending.complete();
    expect(component.searching).toBeFalse();
    expect(component.results).toEqual([venue]);
  });

  it('stops the search after the timeout and lets the user retry', fakeAsync(() => {
    const {component, venues} = setup();
    venues.suggest.and.returnValue(new Subject<any>().asObservable());
    component.query = 'Recinto difícil';
    component.search();
    tick(8_100);
    expect(component.searching).toBeFalse();
    expect(component.searchAttempted).toBeTrue();
    expect(component.error).toBeTruthy();
    component.ngOnDestroy();
  }));

  it('refreshes the view after Maps resolves, geocoding finishes and saving succeeds', () => {
    const {component, cdr, groups} = setup();
    component.chooseLocationMethod('maps');
    component.mapLink = 'https://www.google.com/maps?q=38.71,-9.13';
    cdr.markForCheck.calls.reset();
    component.resolveMapLink();
    expect(component.locationPoint?.source).toBe('MAPS');
    expect(component.resolvingMap).toBeFalse();
    expect(component.resolvingAddress).toBeFalse();
    expect(cdr.markForCheck).toHaveBeenCalled();
    cdr.markForCheck.calls.reset();
    component.savePoint();
    expect(groups.updateHabitualLocation).toHaveBeenCalled();
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('refreshes the view when opening a venue and after selecting it', () => {
    const {component, cdr} = setup();
    component.query = 'Campo';
    component.search();
    cdr.markForCheck.calls.reset();
    component.openDetails(55);
    expect(component.expanded?.id).toBe(55);
    expect(component.detailLoading).toBeFalse();
    expect(cdr.markForCheck).toHaveBeenCalled();
    cdr.markForCheck.calls.reset();
    component.save(55);
    expect(component.community.defaultVenueId).toBe(55);
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('re-enters Angular after an asynchronous browser GPS success', () => {
    const {component, zone, cdr} = setup();
    if (!navigator.geolocation) {
      pending('Browser geolocation API unavailable in this test environment');
      return;
    }
    const position = {coords: {latitude: 38.71, longitude: -9.13, accuracy: 8}} as GeolocationPosition;
    spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((success: PositionCallback) => {
      success(position);
    });
    component.chooseLocationMethod('gps');
    cdr.markForCheck.calls.reset();
    component.captureCurrentLocation();
    expect(zone.run).toHaveBeenCalled();
    expect(component.locating).toBeFalse();
    expect(component.locationPoint?.source).toBe('GPS');
    expect(component.locationPoint?.city).toBe('Lisboa');
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('re-enters Angular and shows a permission error after GPS failure', () => {
    const {component, zone, cdr} = setup();
    if (!navigator.geolocation) {
      pending('Browser geolocation API unavailable in this test environment');
      return;
    }
    spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((
      _success: PositionCallback, error?: PositionErrorCallback
    ) => { error?.({ code: 1, message: 'denied' } as GeolocationPositionError); });
    component.chooseLocationMethod('gps');
    cdr.markForCheck.calls.reset();
    component.captureCurrentLocation();
    expect(zone.run).toHaveBeenCalled();
    expect(component.locating).toBeFalse();
    expect(component.error).toBeTruthy();
    expect(cdr.markForCheck).toHaveBeenCalled();
  });

  it('builds the same embedded map as game sessions after a GPS fix and clears it on switching', () => {
    const {component} = setup();
    component.chooseLocationMethod('gps');
    component['useCoordinates']('GPS', 38.768168, -9.312765, 1, 10);
    expect(component.pointMapPreviewUrl as string)
      .toBe('https://www.google.com/maps?q=38.768168,-9.312765&z=17&output=embed');
    component.chooseLocationMethod('maps');
    expect(component.pointMapPreviewUrl).toBeNull();
  });

  it('previews Maps coordinates and never trusts invalid catalogue coordinates', () => {
    const {component, venues} = setup();
    component.chooseLocationMethod('maps');
    component.mapLink = 'https://www.google.com/maps?q=38.71,-9.13';
    component.resolveMapLink();
    expect(component.pointMapPreviewUrl as string)
      .toBe('https://www.google.com/maps?q=38.71,-9.13&z=16&output=embed');
    component.chooseLocationMethod('venue');
    component.query = 'campo';
    component.search();
    venues.get.and.returnValue(of({id: 55, latitude: null, longitude: null} as Venue));
    component.openDetails(55);
    expect(component.venueMapPreviewUrl).toBeNull();
  });

  it('previews catalogue venue coordinates and clears them after choosing another source', () => {
    const {component} = setup();
    component.query = 'campo';
    component.search();
    component.openDetails(55);
    expect(component.venueMapPreviewUrl as string)
      .toBe('https://www.google.com/maps?q=38.71,-9.13&z=16&output=embed');
    component.chooseLocationMethod('gps');
    expect(component.venueMapPreviewUrl).toBeNull();
  });

  it('resolves and saves a Google Maps point without creating a fake catalog venue', () => {
    const {component, venues, groups} = setup();
    component.chooseLocationMethod('maps');
    component.mapLink = 'https://www.google.com/maps?q=38.71,-9.13';
    component.resolveMapLink();
    expect(venues.resolveMapLink).toHaveBeenCalled();
    expect(component.locationPoint?.source).toBe('MAPS');
    expect(component.locationPoint?.city).toBe('Lisboa');
    component.savePoint();
    expect(groups.updateHabitualLocation).toHaveBeenCalledWith(
      42, 'MAPS', 38.71, -9.13, 'Lisboa', 'Rua da Bola');
    expect(groups.updateDefaultVenue).not.toHaveBeenCalled();
  });

  it('waits for reverse geocoding before saving a habitual Maps point', () => {
    const {component, venues, groups} = setup();
    const geocode = new Subject<any>();
    venues.reverseLocation.and.returnValue(geocode.asObservable());
    component.chooseLocationMethod('maps');
    component.mapLink = 'https://www.google.com/maps?q=38.71,-9.13';
    component.resolveMapLink();
    expect(component.resolvingAddress).toBeTrue();
    component.savePoint();
    expect(groups.updateHabitualLocation).not.toHaveBeenCalled();
    geocode.next({city: 'Lisboa', address: 'Rua da Bola'});
    geocode.complete();
    expect(component.resolvingAddress).toBeFalse();
    component.savePoint();
    expect(groups.updateHabitualLocation).toHaveBeenCalledWith(
      42, 'MAPS', 38.71, -9.13, 'Lisboa', 'Rua da Bola');
  });

  it('supports a GPS location point without forcing a directory venue', () => {
    const {component, groups} = setup();
    component.chooseLocationMethod('gps');
    component.locationPoint = {source: 'GPS', latitude: 38.7, longitude: -9.2,
      city: '', address: ''};
    component.savePoint();
    expect(groups.updateHabitualLocation).toHaveBeenCalledWith(
      42, 'GPS', 38.7, -9.2, null, null);
  });

  it('collapses the Maps/GPS editor after a successful save and clears its draft', () => {
    const {component} = setup();
    component.chooseLocationMethod('maps');
    component.mapLink = 'https://www.google.com/maps?q=38.71,-9.13';
    component.resolveMapLink();
    expect(component.locationPoint).not.toBeNull();

    component.savePoint();

    expect(component.editing).toBeFalse();
    expect(component.community.habitualLocationSource).toBe('MAPS');
    expect(component.locationMethod).toBe('venue');
    expect(component.locationPoint).toBeNull();
    expect(component.pointMapPreviewUrl).toBeNull();
    expect(component.mapLink).toBe('');
    expect(component.saving).toBeFalse();
    component.openEditor();
    expect(component.editing).toBeTrue();
    expect(component.locationPoint).toBeNull();
    component.cancelEdit();
    expect(component.editing).toBeFalse();
  });

  it('keeps the venue details open if saving fails', () => {
    const {component, groups} = setup();
    component.query = 'Campo';
    component.search();
    component.openDetails(55);
    groups.updateDefaultVenue.and.returnValue(throwError(() => new Error('offline')));
    component.save(55);
    expect(component.editing).toBeTrue();
    expect(component.expanded?.id).toBe(55);
    expect(component.error).toBeTruthy();
    expect(component.saving).toBeFalse();
  });

  it('does not allow an ordinary member to change location preferences', () => {
    const {component, groups} = setup();
    component.community = {...group, myRole: 'MEMBER'};
    component.query = 'campo';
    component.search();
    component.openDetails(55);
    component.chooseLocationMethod('maps');
    component.mapLink = 'https://www.google.com/maps';
    component.resolveMapLink();
    component.savePoint();
    expect(groups.updateDefaultVenue).not.toHaveBeenCalled();
    expect(groups.updateHabitualLocation).not.toHaveBeenCalled();
  });

  it('clears stale catalogue results when switching to Google Maps', () => {
    const {component} = setup();
    component.query = 'campo';
    component.search();
    expect(component.results.length).toBe(1);
    component.chooseLocationMethod('maps');
    expect(component.results).toEqual([]);
    expect(component.expanded).toBeNull();
  });
});

describe('Community habitual venue picker — interactive template', () => {
  const community = {id: 42, name: 'Clube de Futebol', sport: 'Futebol', sports: ['Futebol'],
    myRole: 'OWNER', defaultVenueId: null} as CommunityGroup;
  const venue = {id: 55, name: 'Campo Municipal', city: 'Lisboa', district: 'Lisboa',
    address: 'Rua da Bola', sports: 'Futebol', latitude: 38.71, longitude: -9.13} as Venue;
  const venues = {
    suggest: jasmine.createSpy('suggest').and.returnValue(of({venues: [venue], page: 0, hasMore: false})),
    get: jasmine.createSpy('get').and.returnValue(of(venue)),
    resolveMapLink: jasmine.createSpy('resolveMapLink').and.returnValue(of({
      latitude: 38.71, longitude: -9.13, resolvedUrl: 'https://www.google.com/maps'
    })),
    reverseLocation: jasmine.createSpy('reverseLocation').and.returnValue(of({
      city: 'Lisboa', address: 'Rua da Bola', distanceMeters: 5, provider: 'OSM'
    }))
  };
  const groups = {
    updateDefaultVenue: jasmine.createSpy('updateDefaultVenue').and.returnValue(of({
      ...community, defaultVenueId: 55, defaultVenueName: 'Campo Municipal'
    })),
    updateHabitualLocation: jasmine.createSpy('updateHabitualLocation').and.returnValue(of({
      ...community, habitualLocationSource: 'MAPS', habitualLatitude: 38.71,
      habitualLongitude: -9.13, habitualCity: 'Lisboa', habitualAddress: 'Rua da Bola'
    }))
  };

  beforeEach(async () => {
    venues.suggest.calls.reset();
    venues.resolveMapLink.calls.reset();
    groups.updateHabitualLocation.calls.reset();
    await TestBed.configureTestingModule({
      imports: [CommunityHabitualVenuePickerComponent],
      providers: [
        provideRouter([]),
        {provide: VenueService, useValue: venues},
        {provide: CommunityGroupsService, useValue: groups}
      ]
    }).compileComponents();
  });

  it('lets an admin search a saved venue through the actual form', async () => {
    const fixture = TestBed.createComponent(CommunityHabitualVenuePickerComponent);
    fixture.componentInstance.community = {...community};
    fixture.detectChanges();
    await fixture.whenStable(); // Flush initial template-driven form value initialization.
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[name="habitualVenueQuery"]') as HTMLInputElement;
    input.value = 'Campo';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await fixture.whenStable(); // ngModel synchronizes the view-to-model value asynchronously.
    fixture.detectChanges();
    const submit = fixture.nativeElement.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBeFalse();
    submit.click();
    fixture.detectChanges();
    expect(venues.suggest).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.community-venue-result-name')?.textContent)
      .toContain('Campo Municipal');
    fixture.destroy();
  });

  it('shows only the saved Maps summary after confirmation and allows editing again', () => {
    const fixture = TestBed.createComponent(CommunityHabitualVenuePickerComponent);
    const component = fixture.componentInstance;
    component.community = {...community};
    fixture.detectChanges();
    component.chooseLocationMethod('maps');
    component.mapLink = 'https://www.google.com/maps?q=38.71,-9.13';
    component.resolveMapLink();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.community-venue-map-preview iframe')).toBeTruthy();

    component.savePoint();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.community-venue-current')?.textContent)
      .toContain('Rua da Bola');
    expect(fixture.nativeElement.querySelector('app-location-method-selector')).toBeNull();
    expect(fixture.nativeElement.querySelector('.community-venue-map-preview')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="habitualPointAddress"]')).toBeNull();
    const edit = fixture.nativeElement.querySelector('.community-venue-edit') as HTMLButtonElement;
    expect(edit).toBeTruthy();
    edit.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-location-method-selector')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[name="habitualVenueQuery"]')).toBeTruthy();
    (fixture.nativeElement.querySelector('.community-venue-cancel') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-location-method-selector')).toBeNull();
    fixture.destroy();
  });

  it('starts collapsed with an existing usual venue, then collapses after changing it', () => {
    const fixture = TestBed.createComponent(CommunityHabitualVenuePickerComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('community', {...community, defaultVenueId: 55, defaultVenueName: venue.name});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-location-method-selector')).toBeNull();
    (fixture.nativeElement.querySelector('.community-venue-edit') as HTMLButtonElement).click();
    fixture.detectChanges();
    component.query = 'Campo';
    component.search();
    component.openDetails(55);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.community-venue-detail')).toBeTruthy();

    component.save(55);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.community-venue-detail')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-location-method-selector')).toBeNull();
    expect(fixture.nativeElement.querySelector('.community-venue-current')?.textContent)
      .toContain('Campo Municipal');
    fixture.destroy();
  });

  it('switches to Maps, resolves a point, then switches to GPS without stale coordinates', async () => {
    const fixture = TestBed.createComponent(CommunityHabitualVenuePickerComponent);
    fixture.componentInstance.community = {...community};
    fixture.detectChanges();
    await fixture.whenStable(); // Flush initial template-driven form value initialization.
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('app-location-method-selector button');
    expect(buttons.length).toBe(3);
    (buttons[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable(); // Flush newly mounted Maps ngModel initialization before typing.
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[name="habitualMapLink"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = 'https://www.google.com/maps?q=38.71,-9.13';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    await fixture.whenStable();
    fixture.detectChanges();
    const submit = fixture.nativeElement.querySelector('form button[type="submit"]') as HTMLButtonElement;
    submit.click();
    fixture.detectChanges();
    expect(venues.resolveMapLink).toHaveBeenCalled();
    expect(fixture.componentInstance.locationPoint?.source).toBe('MAPS');
    expect(fixture.nativeElement.querySelector('.community-venue-confirm')).toBeTruthy();
    const frame = fixture.nativeElement.querySelector('.community-venue-map-preview iframe') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.getAttribute('src')).toContain('q=38.71,-9.13');
    expect(frame.getAttribute('src')).toContain('output=embed');
    (buttons[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.locationMethod).toBe('gps');
    expect(fixture.componentInstance.locationPoint).toBeNull();
    expect(fixture.nativeElement.querySelector('.community-venue-map-preview')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="habitualMapLink"]')).toBeNull();
    fixture.destroy();
  });
});
