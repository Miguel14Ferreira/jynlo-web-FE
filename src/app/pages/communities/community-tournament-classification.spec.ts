import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { formatForSport } from './community-round-sport';
import { tournamentClassificationProfile } from './community-tournament-classification';

describe('Sport-aware tournament classification', () => {
  it('reuses every registered sport format instead of defaulting to football', () => {
    expect(SPORTS_CATALOG.length).toBe(122);
    for (const sport of SPORTS_CATALOG) {
      const profile = tournamentClassificationProfile(sport);
      expect(profile.format).toBe(formatForSport(sport));
      expect(profile.heading).toBeTruthy();
      expect(profile.detail).toBeTruthy();
      if (['race', 'measured', 'judged', 'score', 'activity'].includes(profile.format)) {
        expect(profile.isRoundRobinSupported).withContext(sport).toBeFalse();
      }
    }
  });

  it('keeps Airsoft as an activity without inventing tournament points', () => {
    const airsoft = tournamentClassificationProfile('Airsoft');
    expect(airsoft.format).toBe('activity');
    expect(airsoft.isRoundRobinSupported).toBeFalse();
  });

  it('distinguishes karting races from generic numeric head-to-head games', () => {
    const karting = tournamentClassificationProfile('Karting');
    expect(karting.heading).toContain('corridas');
    expect(karting.detail).toContain('jornadas');
    expect(karting.isRoundRobinSupported).toBeFalse();
    expect(tournamentClassificationProfile('Natação').isRoundRobinSupported).toBeFalse();
  });

  it('uses half-point chess scoring and keeps football settings unchanged', () => {
    const chess = tournamentClassificationProfile('Xadrez');
    expect(chess.isRoundRobinSupported).toBeTrue();
    expect(chess.scoringMode).toBe('CHESS_HALF_POINTS');
    expect(chess.pointRules).toEqual({ winPoints: 2, drawPoints: 1, lossPoints: 0 });
    expect(chess.readOnlyPoints).toBeTrue();

    const football = tournamentClassificationProfile('Futebol');
    expect(football.isRoundRobinSupported).toBeTrue();
    expect(football.pointRules).toEqual({ winPoints: 3, drawPoints: 1, lossPoints: 0 });
    expect(football.scoringMode).toBeNull();
  });

  it('does not infer valid scoring rules for uncatalogued sports', () => {
    const unknown = tournamentClassificationProfile('Outra modalidade');
    expect(unknown.format).toBe('unknown');
    expect(unknown.isRoundRobinSupported).toBeFalse();
  });
});
