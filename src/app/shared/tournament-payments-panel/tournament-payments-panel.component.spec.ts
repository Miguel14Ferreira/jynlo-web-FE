import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TournamentPaymentsPanelComponent } from './tournament-payments-panel.component';

describe('TournamentPaymentsPanelComponent', () => {
  it('shows the organiser MB WAY number to a player and marks the entry fee paid', () => {
    TestBed.configureTestingModule({ imports: [TournamentPaymentsPanelComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TournamentPaymentsPanelComponent);
    fixture.componentRef.setInput('communityId', 3);
    fixture.componentRef.setInput('tournamentId', 7);
    fixture.detectChanges();
    const base = { entryFeeCents: 1000, method: 'MBWAY', mbwayPhone: '913000111', organiser: false, participant: true,
      confirmedCount: 0, playerCount: 4, players: [] };
    http.expectOne(r => r.url.endsWith('/api/communities/3/tournaments/7/payments')).flush({ ...base, mine: { claimedAt: null, confirmedAt: null } });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('913 000 111');
    expect(el.textContent).toContain('10,00');
    const claim = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Já paguei'))!;
    claim.click();
    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/payments/claim'));
    expect(req.request.body).toEqual({ paid: true });
    req.flush({ ...base, mine: { claimedAt: '2026-11-23T20:00:00Z', confirmedAt: null } });
    fixture.detectChanges();
    expect(el.textContent).toContain('Falta o organizador confirmar');
    http.verify();
  });

  it('stays hidden for people outside a tournament with no paid entry', () => {
    TestBed.configureTestingModule({ imports: [TournamentPaymentsPanelComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TournamentPaymentsPanelComponent);
    fixture.componentRef.setInput('communityId', 3);
    fixture.componentRef.setInput('tournamentId', 7);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/payments')).flush({ entryFeeCents: null, method: null, mbwayPhone: null, organiser: false,
      participant: false, mine: null, confirmedCount: 0, playerCount: 0, players: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tpp')).toBeNull();
  });
});
