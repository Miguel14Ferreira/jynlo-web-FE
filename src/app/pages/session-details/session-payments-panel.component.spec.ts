import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SessionPayments, SessionPaymentService } from '../../services/session-payment.service';
import { SessionPaymentsPanelComponent } from './session-payments-panel.component';

describe('SessionPaymentsPanelComponent', () => {
  const base: SessionPayments = { priceAmount: 4, organiser: false, method: 'MBWAY', mbwayPhone: '912345678', lastReminderAt: null,
    me: { claimedAt: null, confirmedAt: null }, confirmedCount: 1, playerCount: 3, players: [] };

  function create(data: SessionPayments, after?: SessionPayments) {
    const service = jasmine.createSpyObj<SessionPaymentService>('SessionPaymentService', ['get', 'setMethod', 'claim', 'confirm', 'remind']);
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
});
