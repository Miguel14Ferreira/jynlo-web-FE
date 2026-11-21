import { encodeCallUp, isCallUpText, readCallUp } from './callup-message';

describe('callup-message (convocatória)', () => {
  it('round-trips a session id through the server envelope', () => {
    expect(encodeCallUp(42)).toBe('[JYNLO:SESSION:1]42');
    expect(readCallUp('[JYNLO:SESSION:1]42')).toBe(42);
    expect(readCallUp('  [JYNLO:SESSION:1]42  ')).toBe(42);
  });

  it('rejects malformed or forged envelopes', () => {
    for (const text of ['[JYNLO:SESSION:1]', '[JYNLO:SESSION:1]0', '[JYNLO:SESSION:1]abc',
                        '[JYNLO:SESSION:1]42 extra', 'olá', null, undefined]) {
      expect(readCallUp(text as string)).toBeNull();
    }
    expect(encodeCallUp(0)).toBe('');
    expect(encodeCallUp(1.5)).toBe('');
  });

  it('detects the prefix for previews even when malformed', () => {
    expect(isCallUpText('[JYNLO:SESSION:1]abc')).toBeTrue();
    expect(isCallUpText('Vens quinta?')).toBeFalse();
  });
});
