import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { VenuePosterComponent, venuePosterUrl } from './venue-poster.component';

describe('VenuePosterComponent', () => {
  it('points the QR code at the public venue page', () => {
    expect(venuePosterUrl(42)).toBe('https://jynlosports.com/venues/42?utm_source=cartaz&utm_medium=qr');
  });

  it('shows the venue name, a QR code and mentions bookings only when the venue takes them', async () => {
    TestBed.configureTestingModule({
      imports: [VenuePosterComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '5' }) } } }]
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(VenuePosterComponent);
    fixture.detectChanges();
    http.expectOne(r => /\/venues\/5$/.test(r.url)).flush({ id: 5, name: 'Clube Padel Lisboa' });
    http.expectOne(r => r.url.endsWith('/venues/5/booking-offer')).flush({ venueId: 5, acceptsBookings: false, courts: [], hours: [] });
    await fixture.whenStable();
    await new Promise(r => setTimeout(r, 50));
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Clube Padel Lisboa');
    expect(el.textContent).toContain('Encontra com quem jogar aqui');
    expect(el.textContent).not.toContain('pede a reserva');
    expect(el.querySelector<HTMLImageElement>('.vp__qr')?.src).toContain('data:image/png');
  });
});
