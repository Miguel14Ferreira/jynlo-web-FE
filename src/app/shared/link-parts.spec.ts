import { linkParts } from './link-parts';

describe('linkParts', () => {
  it('makes web links clickable and keeps the rest as text', () => {
    const parts = linkParts('vê https://jynlosports.com/for-venues, e www.cng.pt.');
    expect(parts.map(p => p.url)).toEqual([null, 'https://jynlosports.com/for-venues', null, 'https://www.cng.pt/', null]);
    expect(parts[1].internal).toBeTrue();
    expect(parts[3].internal).toBeFalse();
    expect(parts.map(p => p.text).join('')).toBe('vê https://jynlosports.com/for-venues, e www.cng.pt.');
  });
  it('never turns other schemes into links', () => {
    expect(linkParts('javascript:alert(1)').every(p => p.url === null)).toBeTrue();
  });
});
