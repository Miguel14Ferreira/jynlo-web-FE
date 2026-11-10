import { championshipSuggestions } from './community-championship-suggestions';

describe('Championship guided sport suggestions', () => {
  it('offers actionable league and cup setup for team-fixture sports', () => {
    const suggestions = championshipSuggestions('Futebol');
    expect(suggestions.filter(s => s.nextStep === 'OWNED_TEAM').map(s => s.format))
      .toEqual(['LEAGUE', 'CUP']);
    expect(suggestions.some(s => s.nextStep === 'STANDALONE')).toBeTrue();
  });

  it('never treats athletics relays as head-to-head team leagues', () => {
    expect(championshipSuggestions('Atletismo').some(s => s.nextStep === 'OWNED_TEAM')).toBeFalse();
    expect(championshipSuggestions('Atletismo').some(s => s.nextStep === 'STANDALONE')).toBeTrue();
  });

  it('does not suggest automatic scoring for karate or golf', () => {
    for (const sport of ['Karaté', 'Golfe']) {
      expect(championshipSuggestions(sport).length).toBeGreaterThan(0);
      expect(championshipSuggestions(sport).every(s => s.nextStep === 'PLANNED')).toBeTrue();
    }
  });

  it('suggests supported individual swimming tournaments without team fixtures', () => {
    const suggestions = championshipSuggestions('Natação');
    expect(suggestions.some(s => s.nextStep === 'STANDALONE')).toBeTrue();
    expect(suggestions.some(s => s.nextStep === 'OWNED_TEAM')).toBeFalse();
  });

  it('rejects unknown sports', () => {
    expect(championshipSuggestions('Modalidade inexistente')).toEqual([]);
  });
});
