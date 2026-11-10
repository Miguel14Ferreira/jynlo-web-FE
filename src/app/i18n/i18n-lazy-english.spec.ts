import {
  appTranslate,
  I18nService,
  preloadEnglishTranslations,
  prepareInitialTranslations
} from './i18n.service';

// Angular Karma unit specs instantiate components without going through src/main.ts.
// Reproduce the normal English bootstrap preload before *all* specs, including
// legacy tests that synchronously set d24-language='en' and use appTranslate().
beforeAll(async () => {
  await preloadEnglishTranslations();
});

describe('Lazy English translations', () => {
  let originalLanguage: string | null;

  beforeEach(() => {
    originalLanguage = localStorage.getItem('d24-language');
    localStorage.setItem('d24-language', 'pt');
  });

  afterEach(() => {
    if (originalLanguage === null) {
      localStorage.removeItem('d24-language');
    } else {
      localStorage.setItem('d24-language', originalLanguage);
    }
  });

  it('renders Portuguese synchronously before loading the English chunk', () => {
    expect(appTranslate('session.join')).toBe('Juntar-me à sessão');
    expect(appTranslate('missing.localization.key')).toBe('missing.localization.key');
  });

  it('preloads the English dictionary before the initial English screen', async () => {
    localStorage.setItem('d24-language', 'en');
    await prepareInitialTranslations();

    expect(appTranslate('session.join')).toBe('Join session');
    expect(appTranslate('missing.localization.key')).toBe('missing.localization.key');
  });

  it('preserves synchronous English lookups and placeholder substitutions', async () => {
    await preloadEnglishTranslations();
    localStorage.setItem('d24-language', 'en');

    const service = new I18nService();
    expect(service.currentLanguage).toBe('en');
    expect(service.translate('session.join')).toBe('Join session');
    expect(appTranslate('session.join')).toBe('Join session');

    service.setLanguage('pt');
    expect(service.currentLanguage).toBe('pt');
    expect(service.translate('session.join')).toBe('Juntar-me à sessão');
  });

  it('activates English after a user changes language at runtime', async () => {
    localStorage.setItem('d24-language', 'pt');
    const service = new I18nService();

    service.setLanguage('en');
    await preloadEnglishTranslations();
    await Promise.resolve();

    expect(service.currentLanguage).toBe('en');
    expect(service.translate('session.join')).toBe('Join session');
    expect(localStorage.getItem('d24-language')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('never directs users to the retired full chat in Portuguese or English', async () => {
    await preloadEnglishTranslations();
    for (const language of ['pt', 'en'] as const) {
      localStorage.setItem('d24-language', language);
      const locked = appTranslate('inbox.cannotWrite');
      expect(locked).toBe(language === 'pt'
        ? 'Não é possível enviar mensagens nesta conversa neste momento.'
        : 'You cannot send messages in this conversation right now.');
      for (const key of ['inbox.openChat', 'inbox.readOnlyHint',
        'inbox.welcomeText', 'inbox.cannotWrite']) {
        expect(appTranslate(key).toLowerCase()).not.toMatch(
          /chat completo|full chat|original chat/
        );
      }
    }
  });

  it('does not preload English for a Portuguese visitor', async () => {
    await prepareInitialTranslations();
    expect(localStorage.getItem('d24-language')).toBe('pt');
    expect(appTranslate('session.join')).toBe('Juntar-me à sessão');
  });

  it('distinguishes a season game from rankings in both languages', async () => {
    await preloadEnglishTranslations();

    for (const language of ['pt', 'en'] as const) {
      const service = new I18nService();
      service.setLanguage(language);

      expect(service.translate('sessionDetail.seasonLabel'))
        .toBe(language === 'pt' ? 'Jogo de época' : 'Season game');
      expect(service.translate('sessionDetail.seasonNo'))
        .toBe(language === 'pt' ? 'Não conta para a época' : 'Does not count towards the season');
      expect(appTranslate('sessionDetail.seasonNo')).toBe(service.translate('sessionDetail.seasonNo'));
      expect(service.translate('sessionDetail.seasonYes'))
        .toBe(language === 'pt' ? 'Conta para a época' : 'Counts towards the season');
      expect(service.translate('sessionDetail.rankingsLabel'))
        .toBe(language === 'pt' ? 'Classificações e estatísticas' : 'Standings and statistics');
      expect(service.translate('sessionDetail.seasonValidationInfo'))
        .toContain(language === 'pt' ? 'após validação' : 'after validation');
    }
  });

  it('localizes session player search and invitation controls in both languages', async () => {
    await preloadEnglishTranslations();
    for (const language of ['pt', 'en'] as const) {
      const service = new I18nService();
      service.setLanguage(language);
      expect(service.translate('sessionDetail.findPlayers.title'))
        .toBe(language === 'pt' ? 'Encontrar jogadores para a sessão' : 'Find players for this session');
      expect(service.translate('sessionDetail.findPlayers.oneMissing'))
        .toContain(language === 'pt' ? '1 jogador' : '1 more player');
      expect(service.translate('sessionDetail.findPlayers.sendInvite'))
        .toBe(language === 'pt' ? 'Enviar convite' : 'Send invite');
      expect(service.translate('sessionDetail.findPlayers.inviteSent'))
        .toBe(language === 'pt' ? 'Convite enviado' : 'Invite sent');
      expect(service.translate('sessionDetail.findPlayers.manyMissing', { count: 2 }))
        .toContain(language === 'pt' ? '2 jogadores' : '2 more players');
    }
  });

  it('keeps pipe-backed and direct translations consistent when the locale preference changes', async () => {
    await preloadEnglishTranslations();
    const service = new I18nService();
    service.setLanguage('pt');
    expect(service.translate('stories.retry')).toBe('Tentar novamente');

    localStorage.setItem('d24-language', 'en');
    expect(appTranslate('stories.retry')).toBe('Try again');
    expect(service.translate('stories.retry')).toBe('Try again');
    expect(service.translate('stories.empty')).toBe('No Stories yet. Share the first moment!');

    service.setLanguage('pt');
    expect(service.translate('stories.retry')).toBe('Tentar novamente');
  });

});
