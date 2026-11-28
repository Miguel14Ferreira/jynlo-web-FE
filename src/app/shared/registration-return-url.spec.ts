import {
  rememberRegistrationDestination, takeRegistrationDestination,
  registrationSessionId, registrationSessionReturnUrl, registrationCommunityId, registrationCommunityReturnUrl
} from './registration-return-url';

describe('registration invitation return URLs', () => {
  afterEach(() => localStorage.removeItem('jynlo-registration-destination'));

  it('remembers a WhatsApp group community link for the same browser', () => {
    rememberRegistrationDestination('/menu/communities/42');
    expect(takeRegistrationDestination()).toBe('/menu/communities/42');
    expect(takeRegistrationDestination()).toBeNull();
  });

  it('validates community invitation IDs from emailed confirmation links', () => {
    expect(registrationCommunityId('/menu/communities/42')).toBe(42);
    expect(registrationCommunityReturnUrl('42')).toBe('/menu/communities/42');
    for (const raw of ['0', '../login', '42/invite', '9007199254740993', '%34%32']) {
      expect(registrationCommunityReturnUrl(raw)).withContext(raw).toBeNull();
    }
    expect(registrationCommunityId('/menu/events/42')).toBeNull();
  });

  it('keeps session return IDs for confirmation emails unchanged', () => {
    expect(registrationSessionId('/menu/events/42')).toBe(42);
    expect(registrationSessionId('/menu/communities/42')).toBeNull();
    expect(registrationSessionReturnUrl('42')).toBe('/menu/events/42');
  });

  it('preserves a single validated join hint without weakening session ID checks', () => {
    expect(registrationSessionId('/menu/events/42?join=1')).toBe(42);
    rememberRegistrationDestination('/menu/events/42?join=1');
    expect(takeRegistrationDestination()).toBe('/menu/events/42?join=1');
    expect(takeRegistrationDestination()).toBeNull();

    // Confirmation emails still use canonical positive IDs.
    expect(registrationSessionReturnUrl('42')).toBe('/menu/events/42');
    for (const unsafe of [
      '/menu/events/42?join=0',
      '/menu/events/42?join=1&redirect=//evil.test',
      '/menu/events/42?join=1#redirect',
      '/menu/events/42?JOIN=1',
      '/menu/events/42?join=%31',
      '/menu/events/0?join=1',
      '/menu/events/9007199254740993?join=1'
    ]) {
      expect(registrationSessionId(unsafe)).withContext(unsafe).toBeNull();
      rememberRegistrationDestination(unsafe);
      expect(takeRegistrationDestination()).withContext(unsafe).toBeNull();
    }
  });

  it('preserves only strict organizer guest invitations across account registration', () => {
    const safe='/sessions/42?guest='+'A'.repeat(43);
    expect(registrationSessionId(safe)).toBe(42);
    rememberRegistrationDestination(safe);
    expect(takeRegistrationDestination()).toBe(safe);
    expect(takeRegistrationDestination()).toBeNull();
    for (const malicious of [
      '/sessions/42?guest=short',
      '/sessions/42?guest='+'A'.repeat(43)+'&redirect=https://evil.test',
      '/sessions/0?guest='+'A'.repeat(43),
      'https://evil.test/sessions/42?guest='+'A'.repeat(43),
      '/sessions/42%2fadmin?guest='+'A'.repeat(43)
    ]) {
      rememberRegistrationDestination(malicious);
      expect(takeRegistrationDestination()).withContext(malicious).toBeNull();
    }
  });

  it('rejects malicious, malformed and non-invitation destinations', () => {
    const bad = [
      'https://example.test/menu/communities/42',
      '//example.test/menu/communities/42',
      '/menu/communities/0',
      '/menu/communities/-3',
      '/menu/communities/42/invite',
      '/menu/communities/1/../../login',
      '/menu/communities/%34%32',
      '/menu/communities/9007199254740993',
      '/menu/feed',
      '/menu/events/42?redirect=https://example.test',
    ];
    for (const url of bad) {
      rememberRegistrationDestination(url);
      expect(takeRegistrationDestination()).withContext(url).toBeNull();
    }
  });

  it('rejects tampered or expired persisted destinations', () => {
    localStorage.setItem('jynlo-registration-destination', JSON.stringify({
      url: 'https://evil.test', expiresAt: Date.now() + 3600000
    }));
    expect(takeRegistrationDestination()).toBeNull();

    localStorage.setItem('jynlo-registration-destination', JSON.stringify({
      url: '/menu/communities/42', expiresAt: Date.now() - 1
    }));
    expect(takeRegistrationDestination()).toBeNull();
  });

  it('brings someone who tapped "Criar comunidade" back to the form after signing up', () => {
    rememberRegistrationDestination('/menu/communities/create');
    expect(takeRegistrationDestination()).toBe('/menu/communities/create');
    rememberRegistrationDestination('/menu/communities/create?x=https://evil.example');
    expect(takeRegistrationDestination()).toBeNull();
  });
});
