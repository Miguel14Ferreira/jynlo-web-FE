import { detectInitialLanguage } from './i18n.service';

describe('detectInitialLanguage (same rule as the app)', () => {
  const karma = (window as any).__karma__;
  let languages: string[] = ['pt-PT'];
  let agent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/150';

  beforeEach(() => {
    localStorage.removeItem('d24-language');
    (window as any).__karma__ = undefined;
    spyOnProperty(navigator, 'languages', 'get').and.callFake(() => languages);
    spyOnProperty(navigator, 'userAgent', 'get').and.callFake(() => agent);
  });
  afterEach(() => {
    (window as any).__karma__ = karma;
    localStorage.removeItem('d24-language');
    languages = ['pt-PT'];
    agent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/150';
  });

  it('keeps a saved choice', () => {
    languages = ['en-GB'];
    localStorage.setItem('d24-language', 'pt');
    expect(detectInitialLanguage()).toBe('pt');
  });

  it('uses Portuguese for Portuguese and Brazilian browsers', () => {
    languages = ['pt-PT']; expect(detectInitialLanguage()).toBe('pt');
    languages = ['pt-BR', 'en']; expect(detectInitialLanguage()).toBe('pt');
  });

  it('uses English for any other browser language', () => {
    languages = ['en-GB']; expect(detectInitialLanguage()).toBe('en');
    languages = ['es-ES']; expect(detectInitialLanguage()).toBe('en');
  });

  it('keeps search engine crawlers in Portuguese', () => {
    languages = ['en-US'];
    agent = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    expect(detectInitialLanguage()).toBe('pt');
  });
});
