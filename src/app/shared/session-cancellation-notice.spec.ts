import { sessionCancellationNotice } from './session-cancellation-notice';

describe('public session cancellation notices', () => {
  it('identifies the sport, Lisbon time and city without revealing private fields', () => {
    const notice = sessionCancellationNotice({
      sport: 'Futsal', gameDate: '2026-11-20T21:00:00Z', city: 'Lisboa',
      address: 'MORADA-773', password: 'SEGREDO', meetingPointInstructions: 'PORTA-123'
    } as Parameters<typeof sessionCancellationNotice>[0] & {
      address: string; password: string; meetingPointInstructions: string;
    });
    expect(notice).toContain('Futsal');
    expect(notice).toContain('20/11/2026');
    expect(notice).toContain('21:00');
    expect(notice).toContain('Lisboa');
    expect(notice).not.toContain('MORADA-773');
    expect(notice).not.toContain('SEGREDO');
    expect(notice).not.toContain('PORTA-123');
  });

  it('handles missing or malformed dates and does not expose private coordinates', () => {
    const notice = sessionCancellationNotice({
      sport: '', gameDate: 'invalid-date', city: null
    });
    expect(notice).toContain('Jogo cancelado — desporto');
    expect(notice).not.toContain('Invalid Date');
    expect(notice).not.toContain('undefined');
  });

  it('never includes control characters in shareable sport or city labels', () => {
    const notice = sessionCancellationNotice({
      sport: 'Futebol\n7', city: 'Benfica\r\nLisboa'
    });
    expect(notice).not.toMatch(/[\r\n\t]/);
    expect(notice).toContain('Futebol 7');
    expect(notice).toContain('Benfica  Lisboa');
  });
});
