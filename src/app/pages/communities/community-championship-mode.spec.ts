import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { championshipModeAvailability } from './community-championship-mode';

describe('universal championship mode availability', () => {
  it('allows organizing championships for all catalogue sports without inventing scoring', () => {
    expect(SPORTS_CATALOG.length).toBe(122);
    for (const sport of SPORTS_CATALOG) {
      const result = championshipModeAvailability(sport);
      expect(result.canOrganize).withContext(sport).toBeTrue();
      expect(result.scoringOptions).withContext(sport).toContain('CUSTOM_PENDING');
      if (!result.automaticIndividual && !result.automaticTeam) {
        expect(result.scoringOptions).withContext(sport).not.toContain('AUTOMATIC');
      }
    }
  });

  it('never treats Airsoft as football or enables automatic mission scores', () => {
    const result = championshipModeAvailability('Airsoft');
    expect(result.canOrganize).toBeTrue();
    expect(result.automaticIndividual).toBeFalse();
    expect(result.automaticTeam).toBeFalse();
    expect(result.scoringOptions).toEqual(['CUSTOM_PENDING']);
  });

  it('reuses compatible league engines for football', () => {
    const result = championshipModeAvailability('Futebol');
    expect(result.automaticIndividual).toBeTrue();
    expect(result.automaticTeam).toBeTrue();
    expect(result.scoringOptions).toContain('AUTOMATIC');
  });

  it('rejects unknown or missing sports rather than silently assigning a scoring engine', () => {
    for (const sport of [null, undefined, '', 'Modalidade inexistente']) {
      const result = championshipModeAvailability(sport);
      expect(result.canOrganize).toBeFalse();
      expect(result.scoringOptions).toEqual([]);
      expect(result.automaticIndividual).toBeFalse();
      expect(result.automaticTeam).toBeFalse();
    }
  });
});
