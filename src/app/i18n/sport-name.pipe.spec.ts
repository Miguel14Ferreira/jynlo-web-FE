import { SportNamePipe } from './sport-name.pipe';
import { I18nService } from './i18n.service';

describe('SportNamePipe', () => {
  const pipeFor = (language: 'pt' | 'en') =>
    new SportNamePipe({ currentLanguage: language } as unknown as I18nService);

  it('shows catalogue sports in English when the site is in English', () => {
    expect(pipeFor('en').transform('Futebol')).toBe('Football');
    expect(pipeFor('en').transform('Natação')).toBe('Swimming');
  });

  it('keeps the stored name in Portuguese and for unknown sports', () => {
    expect(pipeFor('pt').transform('Futebol')).toBe('Futebol');
    expect(pipeFor('en').transform('Desporto inventado')).toBe('Desporto inventado');
    expect(pipeFor('en').transform(null)).toBe('');
  });
});
