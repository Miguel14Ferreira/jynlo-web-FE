import { appTranslate as t } from '../../i18n/i18n.service';

describe('Home community banner copy', () => {
  let previousLanguage: string | null;

  beforeEach(() => previousLanguage = localStorage.getItem('d24-language'));
  afterEach(() => {
    if (previousLanguage === null) localStorage.removeItem('d24-language');
    else localStorage.setItem('d24-language', previousLanguage);
  });

  it('explains sessions, community tournaments, results, rankings and statistics in PT/EN', () => {
    const terms = {
      pt: ['jogos', 'torneios', 'resultados', 'classificações', 'estatísticas'],
      en: ['games', 'tournaments', 'results', 'standings', 'statistics']
    };
    for (const language of ['pt', 'en'] as const) {
      localStorage.setItem('d24-language', language);
      expect(t('home.groups.title').trim()).toBeTruthy();
      const copy = t('home.groups.description').toLowerCase();
      for (const term of terms[language]) {
        expect(copy).withContext(language + ': ' + term).toContain(term);
      }
      expect(t('home.groups.cta').trim()).toBeTruthy();
    }
  });
});
