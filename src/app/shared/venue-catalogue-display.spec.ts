import { SPORTS_CATALOG } from './sports-catalog';
import { venueCatalogueDisplayLabel as display, sportMatchesQuery } from './venue-catalogue-display';

describe('venue catalogue labels PT/EN', () => {
  it('covers every maintained sport without overwriting the original data', () => {
    for (const sport of SPORTS_CATALOG) {
      const rendered = display(sport, 'sport', 'en');
      expect(rendered.trim()).toBeTruthy();
      expect(display(sport, 'sport', 'pt')).toBe(sport);
    }
    expect(display('Canoagem', 'sport', 'en')).toBe('Canoeing');
    expect(display('Windsurf', 'sport', 'en')).toBe('Windsurfing');
    expect(display('Stand Up Paddle', 'sport', 'en')).toBe('Stand-up paddleboarding');
    expect(display('Futebol', 'sport', 'en')).toBe('Football');
  });

  it('translates standard venue types and surfaces, including OSM values', () => {
    expect(display('Equipamento desportivo', 'venueType', 'en')).toBe('Sports facility');
    expect(display('PAVILHÃO', 'venueType', 'en')).toBe('Sports hall');
    expect(display('Madeira', 'surface', 'en')).toBe('Wood');
    expect(display('Relva sintética', 'surface', 'en')).toBe('Artificial grass');
    expect(display('Equipamento desportivo', 'venueType', 'pt')).toBe('Equipamento desportivo');
  });

  it('preserves unknown, custom and user-supplied values without guessing translations', () => {
    expect(display('Campo da Minha Aldeia', 'venueType', 'en')).toBe('Campo da Minha Aldeia');
    expect(display('Piso especial personalizado', 'surface', 'en')).toBe('Piso especial personalizado');
    expect(display('Nova modalidade', 'sport', 'en')).toBe('Nova modalidade');
    expect(display('Canoagem', 'venueType', 'en')).toBe('Canoagem');
    expect(display(null, 'sport', 'en')).toBe('');
  });
});

describe('sportMatchesQuery', () => {
  it('finds catalogue sports by their Portuguese or English name', () => {
    expect(sportMatchesQuery('Futebol', 'foot')).toBeTrue();
    expect(sportMatchesQuery('Futebol', 'fute')).toBeTrue();
    expect(sportMatchesQuery('Natação', 'natacao')).toBeTrue();
    expect(sportMatchesQuery('Natação', 'Swim')).toBeTrue();
    expect(sportMatchesQuery('Padel', 'swim')).toBeFalse();
    expect(sportMatchesQuery('Padel', '')).toBeTrue();
  });
});
