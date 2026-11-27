import { shareCardUrl } from './share-card-url';

describe('shareCardUrl', () => {
  it('uses the API share page on the production site so previews show the game', () => {
    expect(shareCardUrl('sessions', 12, 'https://jynlosports.com')).toBe('https://api.jynlosports.com/api/share/sessions/12');
    expect(shareCardUrl('communities', 4, 'https://www.jynlosports.com')).toBe('https://api.jynlosports.com/api/share/communities/4');
  });

  it('keeps plain site links elsewhere', () => {
    expect(shareCardUrl('sessions', 12, 'https://desporto24-dev.onrender.com')).toBe('https://desporto24-dev.onrender.com/sessions/12');
    expect(shareCardUrl('communities', 4, 'http://localhost:4200')).toBe('http://localhost:4200/menu/communities/4');
  });
});
