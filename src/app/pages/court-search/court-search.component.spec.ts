import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthenticationService } from '../../services/authethication.service';
import { VenueAvailability, VenueBooking, VenueBookingService } from '../../services/venue-booking.service';
import { CourtSearchComponent, createGameParams, lisbonLocalDateTime } from './court-search.component';

describe('CourtSearchComponent', () => {
  const venue: VenueAvailability = {
    venueId: 5, name: 'Clube Padel Lisboa', city: 'Lisboa', district: 'Lisboa', latitude: null, longitude: null,
    paymentMethod: 'MBWAY',
    courts: [{ courtId: 9, name: 'Campo 1', sport: 'Padel', priceCents: 2400, slotMinutes: 60,
      slots: [{ start: '2030-06-01T17:00:00Z', end: '2030-06-01T18:00:00Z', free: true }] }],
  };

  function setup(loggedIn: boolean, results: VenueAvailability[]) {
    const api = jasmine.createSpyObj<VenueBookingService>('VenueBookingService', ['search', 'request']);
    api.search.and.returnValue(of(results));
    api.request.and.returnValue(of({ id: 77, venueId: 5, startAt: '2030-06-01T17:00:00Z' } as unknown as VenueBooking));
    TestBed.configureTestingModule({
      imports: [CourtSearchComponent],
      providers: [provideRouter([]),
        { provide: VenueBookingService, useValue: api },
        { provide: AuthenticationService, useValue: { isLoggedIn: () => loggedIn } }],
    });
    const fixture = TestBed.createComponent(CourtSearchComponent);
    fixture.detectChanges();
    return { fixture, api, el: fixture.nativeElement as HTMLElement };
  }

  it('turns a booking into game creation params in Lisbon time', () => {
    expect(lisbonLocalDateTime('2030-06-01T17:00:00Z')).toBe('2030-06-01T18:00');
    expect(createGameParams({ id: 77, venueId: 5, startAt: '2030-01-10T19:30:00Z' }, 'padel'))
      .toEqual({ venue: 5, booking: 77, when: '2030-01-10T19:30', sport: 'Padel' });
    expect(createGameParams({ id: 1, venueId: 2, startAt: '2030-01-10T19:30:00Z' }, 'Xadrez')['sport']).toBeUndefined();
  });

  it('shows an inviting empty state when no venue has free slots', () => {
    const { el } = setup(true, []);
    expect(el.textContent).toContain('Ainda não há horários livres');
  });

  it('lists free slots and sends a request, then offers to create the game', () => {
    const { fixture, api, el } = setup(true, [venue]);
    expect(el.textContent).toContain('Clube Padel Lisboa');
    (el.querySelector('.cs__slot') as HTMLButtonElement).click();
    fixture.detectChanges();
    const send = [...el.querySelectorAll('button')].find(b => b.textContent?.includes('Pedir reserva')) as HTMLButtonElement;
    send.click();
    fixture.detectChanges();
    expect(api.request).toHaveBeenCalledWith(5, 9, '2030-06-01T17:00:00Z', null, null);
    expect(el.textContent).toContain('Criar jogo neste campo');
  });

  it('asks visitors to sign in before requesting', () => {
    const { fixture, el } = setup(false, [venue]);
    (el.querySelector('.cs__slot') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Entra para pedir a reserva');
  });
});
