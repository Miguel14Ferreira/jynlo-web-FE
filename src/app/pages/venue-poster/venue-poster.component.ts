import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toDataURL } from 'qrcode';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { VenueService } from '../../services/venue.service';
import { VenueBookingService } from '../../services/venue-booking.service';

export const PUBLIC_SITE = 'https://jynlosports.com';

/** Public address of a venue page, as printed on its poster. */
export function venuePosterUrl(venueId: number): string {
  return `${PUBLIC_SITE}/venues/${venueId}?utm_source=cartaz&utm_medium=qr`;
}

/** A printable A4 poster with a QR code to the venue's page, for the front desk. */
@Component({
  selector: 'app-venue-poster',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="vp-tools no-print">
      <a [routerLink]="['/venues', venueId]">← {{ 'Voltar ao recinto' | t }}</a>
      <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="!qr" (click)="print()">{{ 'Imprimir cartaz' | t }}</button>
    </div>
    @if (error) { <p class="vp-error no-print" role="alert">{{ error | t }}</p> }
    <article class="vp" aria-labelledby="vp-title">
      <p class="vp__brand">Jynlo</p>
      <h1 id="vp-title">{{ (acceptsBookings ? 'Marca aqui o teu próximo jogo' : 'Encontra com quem jogar aqui') | t }}</h1>
      <p class="vp__venue">{{ venueName }}</p>
      @if (qr) { <img class="vp__qr" [src]="qr" [alt]="'Código QR para a página do recinto na Jynlo' | t" width="320" height="320"> }
      <p class="vp__hint">{{ 'Aponta a câmara do telemóvel para o código.' | t }}</p>
      <ul class="vp__list">
        @if (acceptsBookings) { <li>{{ 'Vê os horários livres e pede a reserva do campo' | t }}</li> }
        <li>{{ 'Junta-te a jogos abertos ou cria o teu' | t }}</li>
        <li>{{ 'Encontra parceiros do teu nível' | t }}</li>
      </ul>
      <p class="vp__url">jynlosports.com</p>
    </article>
  `,
  styles: [`
    :host { display:block; min-height:100vh; background:#eef3f5; padding:5.5rem 1rem 2rem; }
    .vp-tools { max-width:210mm; margin:0 auto 1rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; }
    .vp-tools a { color:#0f5c4c; font-weight:700; text-decoration:none; min-height:44px; display:inline-flex; align-items:center; }
    .vp-error { max-width:210mm; margin:0 auto 1rem; color:#b42318; font-weight:700; }
    .vp { box-sizing:border-box; width:210mm; max-width:100%; min-height:297mm; margin:0 auto; padding:18mm 16mm;
      background:#fff; color:#0b1f2a; display:flex; flex-direction:column; align-items:center; text-align:center; gap:6mm;
      box-shadow:0 10px 30px rgba(0,0,0,.12); border-radius:6px; }
    .vp__brand { margin:0; font-size:2.4rem; font-weight:900; letter-spacing:-.02em; color:#0f8f73; }
    .vp h1 { margin:0; font-size:2.6rem; line-height:1.1; }
    .vp__venue { margin:0; font-size:1.6rem; font-weight:700; color:#33505c; }
    .vp__qr { width:95mm; height:95mm; image-rendering:pixelated; }
    .vp__hint { margin:0; font-size:1.3rem; font-weight:700; }
    .vp__list { margin:0; padding:0; list-style:none; display:grid; gap:3mm; font-size:1.25rem; }
    .vp__list li::before { content:'✓ '; color:#0f8f73; font-weight:900; }
    .vp__url { margin-top:auto; font-size:1.2rem; font-weight:800; color:#0f8f73; }
    @media print {
      :host { padding:0; background:#fff; }
      .no-print { display:none !important; }
      .vp { box-shadow:none; border-radius:0; width:auto; min-height:auto; }
      @page { size:A4; margin:10mm; }
    }
  `]
})
export class VenuePosterComponent implements OnInit {
  venueId = 0;
  venueName = '';
  acceptsBookings = false;
  qr = '';
  error = '';

  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly bookings = inject(VenueBookingService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.venueId = Number(this.route.snapshot.paramMap.get('id')) || 0;
    this.venues.get(this.venueId).subscribe({
      next: v => { this.venueName = v?.name ?? ''; this.cdr.markForCheck(); },
      error: () => { this.error = 'Não foi possível carregar o recinto.'; this.cdr.markForCheck(); }
    });
    this.bookings.offer(this.venueId).subscribe({
      next: o => { this.acceptsBookings = !!o?.acceptsBookings; this.cdr.markForCheck(); },
      error: () => { /* the poster still works without bookings */ }
    });
    toDataURL(venuePosterUrl(this.venueId), { width: 640, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => { this.qr = url; this.cdr.markForCheck(); })
      .catch(() => { this.error = 'Não foi possível gerar o código QR.'; this.cdr.markForCheck(); });
  }

  print(): void { window.print(); }
}
