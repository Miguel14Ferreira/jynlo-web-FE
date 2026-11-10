import { championshipSportGuidance } from './community-championship-sport-guidance';

describe('Championship sport guidance', () => {
  it('separates karate kata/kumite without implying a supported scoring engine', () => {
    const guidance = championshipSportGuidance('Karaté');
    expect(guidance.title).toContain('kata');
    expect(guidance.detail).toContain('não existe ainda');
  });

  it('describes the limited implemented swimming and athletics engines', () => {
    expect(championshipSportGuidance('Natação').detail).toContain('piscina de 50 m');
    expect(championshipSportGuidance('Atletismo').detail).toContain('estafetas');
  });

  it('does not promise automatic golf scoring', () => {
    expect(championshipSportGuidance('Golfe').detail).toContain('ainda não está validada');
  });

  it('handles an unknown sport without suggesting a fallback league', () => {
    expect(championshipSportGuidance('Modalidade inexistente').title).toBe('Modalidade não reconhecida');
  });
});
