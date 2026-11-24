import { encodeShareMessage, readSharedMessage, shareRoute, ShareChoice } from './share-message';

describe('Jynlo chat entity sharing', () => {
  const profile: ShareChoice={kind:'profile',id:'joao_7',title:'João Silva',subtitle:'@joao_7'};
  it('encodes and decodes a profile link without exposing arbitrary URLs', () => {
    const text=encodeShareMessage(profile,'Bora jogar!');
    expect(readSharedMessage(text)).toEqual({...profile,caption:'Bora jogar!',
      route:'/menu/profiles/joao_7'});
    expect(text).not.toContain('https://');
  });
  it('supports only legitimate session and community routes', () => {
    expect(shareRoute({kind:'session',id:'102'})).toBe('/sessions/102');
    expect(shareRoute({kind:'community',id:'9'})).toBe('/menu/communities/9');
    expect(shareRoute({kind:'session',id:'-1'})).toBeNull();
    expect(shareRoute({kind:'community',id:'../../admin'})).toBeNull();
  });
  it('rejects forged HTML, external redirects, invalid IDs and oversized captions', () => {
    expect(encodeShareMessage({...profile,id:'../logout'},'')).toBe('');
    expect(encodeShareMessage({...profile,title:'Bad\nTitle'},'')).toBe('');
    expect(encodeShareMessage(profile,'x'.repeat(1800))).toBe('');
    const ok=encodeShareMessage(profile,'');
    expect(readSharedMessage(ok.replace('"k":"profile"','"k":"admin"'))).toBeNull();
    expect(readSharedMessage(ok.replace('"i":"joao_7"','"i":"../admin"'))).toBeNull();
    expect(readSharedMessage('[JYNLO:SHARE:1]{"x":"y"}')).toBeNull();
  });
});
