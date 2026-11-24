import { SimpleChange } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BookingOffer, DaySlots, VenueBookingService } from '../../services/venue-booking.service';
import { PickedVenueSlot, VenueSlotPickerComponent, slotLocalDateTime } from './venue-slot-picker.component';

describe('VenueSlotPickerComponent', () => {
  const offer: BookingOffer = {
    venueId: 5, acceptsBookings: true, paymentMethod: 'MBWAY',
    courts: [{ id: 9, name: 'Campo 1', sport: 'Padel', priceCents: 2400, slotMinutes: 60, active: true }], hours: [],
  };
  const day: DaySlots = { venueId: 5, date: '2030-06-01', courts: [{ courtId: 9, name: 'Campo 1', sport: 'Padel', priceCents: 2400, slotMinutes: 60,
    slots: [{ start: '2030-06-01T17:00:00Z', end: '2030-06-01T18:00:00Z', free: true },
            { start: '2030-06-01T18:00:00Z', end: '2030-06-01T19:00:00Z', free: false }] }] };

  function setup(result: BookingOffer | null) {
    const api = jasmine.createSpyObj<VenueBookingService>('VenueBookingService', ['offer', 'slots']);
    api.offer.and.returnValue(result ? of(result) : throwError(() => new Error('404')));
    api.slots.and.returnValue(of(day));
    TestBed.configureTestingModule({ imports: [VenueSlotPickerComponent], providers: [{ provide: VenueBookingService, useValue: api }] });
    const fixture = TestBed.createComponent(VenueSlotPickerComponent);
    fixture.componentInstance.venueId = 5;
    fixture.componentInstance.ngOnChanges({ venueId: new SimpleChange(null, 5, true) });
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, api };
  }

  it('stays hidden for a venue that does not take Jynlo bookings', () => {
    const { el } = setup(null);
    expect(el.textContent?.trim()).toBe('');
  });

  it('stays hidden while the venue has bookings switched off', () => {
    const { el } = setup({ ...offer, acceptsBookings: false });
    expect(el.textContent?.trim()).toBe('');
  });

  it('shows only free times and emits the picked court slot', () => {
    const { fixture, el } = setup(offer);
    const buttons = [...el.querySelectorAll('.vsp__slots .vsp__chip')];
    expect(buttons.length).toBe(1);
    let picked: PickedVenueSlot | null = null;
    fixture.componentInstance.picked.subscribe(p => picked = p);
    (buttons[0] as HTMLButtonElement).click();
    expect(picked).toEqual(jasmine.objectContaining({ venueId: 5, courtId: 9, start: '2030-06-01T17:00:00Z', paymentMethod: 'MBWAY' }));
  });

  it('turns a slot into the game form local Lisbon time', () => {
    expect(slotLocalDateTime('2030-06-01T17:00:00Z')).toBe('2030-06-01T18:00');
    expect(slotLocalDateTime('2030-01-10T19:30:00Z')).toBe('2030-01-10T19:30');
  });
});
