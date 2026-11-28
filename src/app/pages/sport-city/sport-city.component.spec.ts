import { placeSlug, unslug } from '../../shared/sport-city-slug';

describe('sport and city page addresses', () => {
  it('builds the same address part as the build script', () => {
    expect(placeSlug('São João da Madeira')).toBe('sao-joao-da-madeira');
    expect(placeSlug('Ténis de Mesa')).toBe('tenis-de-mesa');
    expect(placeSlug('  Padel  ')).toBe('padel');
  });
  it('falls back to a readable name', () => {
    expect(unslug('vila-nova-de-gaia')).toBe('Vila Nova De Gaia');
  });
});
