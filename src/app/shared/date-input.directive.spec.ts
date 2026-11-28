import { displayToIso, isoToDisplay, maskDigits } from './date-input.directive';

describe('dd/mm/aaaa date fields', () => {
  it('shows stored values in Portuguese order', () => {
    expect(isoToDisplay('2026-12-05', 'date')).toBe('05/12/2026');
    expect(isoToDisplay('2026-12-05T18:30:00', 'datetime-local')).toBe('05/12/2026 18:30');
    expect(isoToDisplay('', 'date')).toBe('');
  });
  it('adds the separators while typing digits', () => {
    expect(maskDigits('0512', 'date')).toBe('05/12');
    expect(maskDigits('051220261830', 'datetime-local')).toBe('05/12/2026 18:30');
    expect(maskDigits('05/12/2026 18:3', 'datetime-local')).toBe('05/12/2026 18:3');
  });
  it('only gives a value for a complete, real date', () => {
    expect(displayToIso('05/12/2026', 'date')).toBe('2026-12-05');
    expect(displayToIso('05/12/2026 18:30', 'datetime-local')).toBe('2026-12-05T18:30');
    expect(displayToIso('31/02/2026', 'date')).toBe('');
    expect(displayToIso('05/12/2026 25:00', 'datetime-local')).toBe('');
    expect(displayToIso('05/12', 'date')).toBe('');
    expect(displayToIso('2026-12-05T09:15', 'datetime-local')).toBe('2026-12-05T09:15');
  });
});
