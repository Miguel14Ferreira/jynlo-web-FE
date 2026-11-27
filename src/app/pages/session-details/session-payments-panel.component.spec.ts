import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SessionPayments, SessionPaymentService } from '../../services/session-payment.service';
import { SessionPaymentsPanelComponent } from './session-payments-panel.component';

describe('SessionPaymentsPanelComponent', () => {
  const base: SessionPayments = { priceAmount: 4, organiser: false, method: 'MBWAY', mbwayPhone: '912345678', lastReminderAt: null,
    me: { claimedAt: null, confirmedAt: null }, confirmedCount: 1, playerCount: 3, players: [] };

  function create(data: SessionPayments, after?: SessionPayments, online = { available: false, connected: false, chargesEnabled: false }) {
    const service = jasmine.createSpyObj<SessionPaymentService>('SessionPaymentService', ['get', 'setMethod', 'claim', 'confirm', 'remind', 'onlineStatus', 'onlineOnboarding', 'checkout']);
    service.onlineStatus.and.returnValue(of(online));
    service.get.and.returnValue(of(data));
    service.claim.and.returnValue(of(after ?? data));
    service.confirm.and.returnValue(of(after ?? data));
    service.setMethod.and.returnValue(of(after ?? data));
    service.remind.and.returnValue(of(after ?? data));
    TestBed.configureTestingModule({ imports: [SessionPaymentsPanelComponent],
      providers: [{ provide: SessionPaymentService, useValue: service }] });
    const fixture = TestBed.createComponent(SessionPaymentsPanelComponent);
    fixture.componentRef.setInput('sessionId', 903);
    fixture.componentRef.setInput('priceAmount', 4);
    fixture.detectChanges();
    return { fixture, service, el: fixture.nativeElement as HTMLElement };
  }

  it('shows a player where to pay and lets them say they paid', () => {
    const { fixture, service, el } = create(base, { ...base, me: { claimedAt: '2026-11-21T10:00:00Z', confirmedAt: null } });
    expect(el.textContent).toContain('912 345 678');
    expect(el.textContent).toContain('1 de 3 pagos');
    const button = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Já paguei'))!;
    button.click();
    fixture.detectChanges();
    expect(service.claim).toHaveBeenCalledWith(903, true);
    expect(el.textContent).toContain('Falta o organizador confirmar');
  });

  it('shows the organiser everyone and confirms one player', () => {
    const organiser: SessionPayments = { ...base, organiser: true, me: null, method: 'IN_PERSON', mbwayPhone: null, players: [
      { username: 'ana', profilePicUrl: null, claimedAt: '2026-11-21T10:00:00Z', confirmedAt: null },
      { username: 'rui', profilePicUrl: null, claimedAt: null, confirmedAt: '2026-11-21T10:00:00Z' }] };
    const { service, el } = create(organiser);
    expect(el.textContent).toContain('Diz que pagou');
    expect(el.textContent).toContain('✅ Pago');
    const mark = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Marcar como pago'))!;
    mark.click();
    expect(service.confirm).toHaveBeenCalledWith(903, 'ana', true);
    const remind = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Lembrar quem falta'))!;
    remind.click();
    expect(service.remind).toHaveBeenCalledWith(903);
  });

  it('tells players to pay in person when the organiser chose that', () => {
    const { el } = create({ ...base, method: 'IN_PERSON', mbwayPhone: null });
    expect(el.textContent).toContain('ao organizador no dia do jogo');
    expect(el.textContent).not.toContain('Copiar número');
  });

  it('loads only once per session even if inputs are set again', () => {
    const { fixture, service } = create(base);
    fixture.componentRef.setInput('priceAmount', 5);
    fixture.detectChanges();
    expect(service.get).toHaveBeenCalledTimes(1);
  });
  it('offers organisers in-app payments only when they are available', () => {
    const organiser: SessionPayments = { ...base, organiser: true, me: null, method: 'IN_PERSON', mbwayPhone: null, players: [] };
    expect(create(organiser).el.textContent).not.toContain('Na app (MB WAY ou cartão)');
    TestBed.resetTestingModule();
    const { fixture, service, el } = create(organiser, { ...organiser, method: 'ONLINE' }, { available: true, connected: true, chargesEnabled: true });
    fixture.detectChanges();
    const online = Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Na app (MB WAY ou cartão)'))!;
    online.click();
    expect(service.setMethod).toHaveBeenCalledWith(903, 'ONLINE', null);
  });

  it('asks organisers without a Stripe account to activate it first', () => {
    const organiser: SessionPayments = { ...base, organiser: true, me: null, method: null, mbwayPhone: null, players: [] };
    const { fixture, service, el } = create(organiser, undefined, { available: true, connected: false, chargesEnabled: false });
    fixture.detectChanges();
    Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Na app (MB WAY ou cartão)'))!.click();
    fixture.detectChanges();
    expect(service.setMethod).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Ativar pagamentos na app');
  });

  it('asks "Já pagaste?" after copying the MB WAY number', () => {
    const { fixture, service, el } = create(base);
    Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Copiar'))!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Já pagaste 4,00 € no MB WAY?');
    Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Sim, já paguei'))!.click();
    expect(service.claim).toHaveBeenCalledWith(903, true);
  });

  it('lets players pay in the app without a "Já paguei" button', () => {
    const { el } = create({ ...base, method: 'ONLINE', mbwayPhone: null });
    expect(el.textContent).toContain('Pagar 4,00 € na app');
    expect(el.textContent).not.toContain('Já paguei');
  });

});

import { PreviousUnpaidWarningComponent } from './previous-unpaid-warning.component';
import { provideRouter } from '@angular/router';

describe('PreviousUnpaidWarningComponent', () => {
  it('lists who still owes the previous game', () => {
    const service = jasmine.createSpyObj<SessionPaymentService>('SessionPaymentService', ['previousUnpaid']);
    service.previousUnpaid.and.returnValue(of({ sessionId: 6, gameDate: null, sport: 'Futsal', unpaid: ['rui', 'bea'] }));
    TestBed.configureTestingModule({ imports: [PreviousUnpaidWarningComponent],
      providers: [{ provide: SessionPaymentService, useValue: service }, provideRouter([])] });
    const fixture = TestBed.createComponent(PreviousUnpaidWarningComponent);
    fixture.componentRef.setInput('sessionId', 7);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('rui, bea');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/menu/events/6');
  });

  it('stays hidden when nobody owes the previous game', () => {
    const service = jasmine.createSpyObj<SessionPaymentService>('SessionPaymentService', ['previousUnpaid']);
    service.previousUnpaid.and.returnValue(of({ sessionId: 6, gameDate: null, sport: 'Futsal', unpaid: [] }));
    TestBed.configureTestingModule({ imports: [PreviousUnpaidWarningComponent],
      providers: [{ provide: SessionPaymentService, useValue: service }, provideRouter([])] });
    const fixture = TestBed.createComponent(PreviousUnpaidWarningComponent);
    fixture.componentRef.setInput('sessionId', 7);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });

});
