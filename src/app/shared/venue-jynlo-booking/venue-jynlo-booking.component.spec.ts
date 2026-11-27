import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { VenueJynloBookingComponent } from './venue-jynlo-booking.component';
import { parsePrice } from '../../pages/venue-manage/venue-manage.component';
import { nextLisbonDays } from '../../services/venue-booking.service';

describe('VenueJynloBookingComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VenueJynloBookingComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    http = TestBed.inject(HttpTestingController);
  });

  function render(loggedIn: boolean) {
    const fixture = TestBed.createComponent(VenueJynloBookingComponent);
    fixture.componentRef.setInput('venueId', 5);
    fixture.componentRef.setInput('loggedIn', loggedIn);
    fixture.detectChanges();
    return fixture;
  }

  it('shows free slots and sends a booking request for the picked one', () => {
    const fixture = render(true);
    http.expectOne(r => r.url.endsWith('/api/venues/5/booking-offer')).flush({
      venueId: 5, acceptsBookings: true,
      courts: [{ id: 9, name: 'Campo 1', sport: 'Padel', priceCents: 2400, slotMinutes: 60, active: true }],
      hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '11:00' }]
    });
    http.expectOne(r => r.url.endsWith('/api/venues/5/management'))
      .flush({ manager: false, claimStatus: null, decisionNote: null, acceptsBookings: true });
    const day = nextLisbonDays(1)[0];
    http.expectOne(r => r.url.includes('/api/venues/5/booking-slots?date=' + day)).flush({
      venueId: 5, date: day, courts: [{ courtId: 9, name: 'Campo 1', sport: 'Padel', priceCents: 2400, slotMinutes: 60,
        slots: [{ start: '2030-01-07T09:00:00Z', end: '2030-01-07T10:00:00Z', free: false },
                { start: '2030-01-07T10:00:00Z', end: '2030-01-07T11:00:00Z', free: true }] }]
    });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const slots = el.querySelectorAll<HTMLButtonElement>('.vjb__slot');
    expect(slots.length).toBe(2);
    expect(slots[0].disabled).toBeTrue();
    slots[1].click();
    fixture.detectChanges();
    expect(el.textContent).toContain('pagas no recinto');
    const send = Array.from(el.querySelectorAll<HTMLButtonElement>('.vjb__confirm button')).find(b => b.textContent?.includes('Pedir reserva'))!;
    send.click();
    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/api/venues/5/booking-requests'));
    expect(req.request.body.courtId).toBe(9);
    expect(req.request.body.startAt).toBe('2030-01-07T10:00:00Z');
    req.flush({ id: 1, status: 'PENDING' });
    http.expectOne(r => r.url.includes('/booking-slots')).flush({ venueId: 5, date: day, courts: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Pedido enviado');
  });

  it('hides the booking panel when the venue does not take bookings but offers the claim to signed-in people', () => {
    const fixture = render(true);
    http.expectOne(r => r.url.endsWith('/booking-offer')).flush({ venueId: 5, acceptsBookings: false, courts: [], hours: [] });
    http.expectOne(r => r.url.endsWith('/management'))
      .flush({ manager: false, claimStatus: null, decisionNote: null, acceptsBookings: false });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.vjb')).toBeNull();
    expect(el.textContent).toContain('Sou o responsável por este recinto');
    http.verify();
  });

  it('offers Jynlo admins the venue set-up and the QR poster', () => {
    const fixture = render(true);
    http.expectOne(r => r.url.endsWith('/booking-offer')).flush({ venueId: 5, acceptsBookings: false, courts: [], hours: [] });
    http.expectOne(r => r.url.endsWith('/management'))
      .flush({ manager: false, claimStatus: null, decisionNote: null, acceptsBookings: false, adminSetup: true });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Configurar campos e horário (administração)');
    expect(el.textContent).toContain('Cartaz com código QR');
    expect(el.textContent).not.toContain('Sou o responsável por este recinto');
  });

  it('never asks for the management status of signed-out visitors', () => {
    render(false);
    http.expectOne(r => r.url.endsWith('/booking-offer')).flush({ venueId: 5, acceptsBookings: false, courts: [], hours: [] });
    http.expectNone(r => r.url.endsWith('/management'));
  });

  it('reads prices in euros', () => {
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('24')).toBe(2400);
    expect(parsePrice('24,5')).toBe(2450);
    expect(parsePrice('24.50 €')).toBe(2450);
    expect(parsePrice('abc')).toBeUndefined();
  });
});
