import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AvailabilityPanelComponent, AvailabilityRequest, bestAvailabilitySlot, localDateTimeValue } from './availability-panel.component';

describe('AvailabilityPanelComponent', () => {
  let http: HttpTestingController;
  let component: AvailabilityPanelComponent;
  let router: jasmine.SpyObj<Router>;
  const request = (): AvailabilityRequest => ({
    id: 9, kind: 'community', targetId: 7, creator: 'ana', note: null, createdAt: '', mine: true, members: 4, answered: 2,
    slots: [
      { id: 1, startsAt: new Date(2030, 0, 5, 10, 0).toISOString(), yes: ['ana'], maybe: ['rui', 'joao'], no: 0, mine: null },
      { id: 2, startsAt: new Date(2030, 0, 6, 18, 30).toISOString(), yes: ['ana', 'rui'], maybe: [], no: 1, mine: 'YES' },
    ],
  });

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.returnValue(Promise.resolve(true));
    TestBed.configureTestingModule({
      imports: [AvailabilityPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: router }],
    });
    http = TestBed.inject(HttpTestingController);
    component = TestBed.createComponent(AvailabilityPanelComponent).componentInstance;
    component.kind = 'community';
    component.targetId = 7;
    component.communityId = 7;
    component.ngOnChanges();
    http.expectOne(r => r.url.endsWith('/api/availability') && r.params.get('kind') === 'community' && r.params.get('targetId') === '7')
      .flush([request()]);
  });

  afterEach(() => http.verify());

  it('picks the option with most yes, then most maybe', () => {
    expect(bestAvailabilitySlot(request())?.id).toBe(2);
    expect(bestAvailabilitySlot({ ...request(), slots: [{ ...request().slots[0], yes: [], maybe: [] }] })).toBeNull();
  });

  it('answers an option and replaces the request with the server copy', () => {
    const current = component.requests[0];
    component.answer(current, current.slots[0], 'MAYBE');
    const put = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/api/availability/9/slots/1/answer'));
    expect(put.request.body).toEqual({ answer: 'MAYBE' });
    put.flush({ ...request(), answered: 3 });
    expect(component.requests[0].answered).toBe(3);
  });

  it('validates options before sending and sends sorted unique instants', () => {
    component.openForm();
    component.when = localDateTimeValue(new Date(Date.now() + 10 * 60_000));
    component.addSlot();
    expect(component.formError).toBeTruthy();
    const later = new Date(Date.now() + 3 * 86_400_000), earlier = new Date(Date.now() + 2 * 86_400_000);
    later.setSeconds(0, 0); earlier.setSeconds(0, 0);
    component.when = localDateTimeValue(later); component.addSlot();
    component.when = localDateTimeValue(earlier); component.addSlot();
    component.when = localDateTimeValue(earlier); component.addSlot();
    expect(component.slots.length).toBe(2);
    component.note = '  Padel  ';
    component.submit();
    const post = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api/availability'));
    expect(post.request.body).toEqual({ kind: 'community', targetId: 7, note: 'Padel', slots: [earlier.toISOString(), later.toISOString()] });
    post.flush(request());
    expect(component.creating).toBeFalse();
  });

  it('creates a game at the best option, in the community', () => {
    component.createGame(component.requests[0]);
    expect(router.navigate).toHaveBeenCalledWith(['/menu/createEvent'], { queryParams: { when: '2030-01-06T18:30', community: '7' } });
  });
});
