import { appReturnUrl } from './facebook-callback.component';

describe('appReturnUrl (Facebook login return to the app)', () => {
  it('hands back only results started by the app', () => {
    expect(appReturnUrl('#access_token=abc&state=app.0123456789abcdef0123'))
      .toBe('jynlo://auth/facebook#access_token=abc&state=app.0123456789abcdef0123');
  });

  it('ignores foreign or missing state', () => {
    expect(appReturnUrl('#access_token=abc&state=evil')).toBeNull();
    expect(appReturnUrl('')).toBeNull();
  });
});
