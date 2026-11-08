import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { formatForSport, SPORTS_BY_RESULT_FORMAT } from './community-round-sport';
import { RACE_CHAMPIONSHIP_SPORTS } from '../../services/community-tournaments.service';
import { tournamentSportCapabilities, tournamentCreationModelForEvent, TournamentCreationModel } from './community-tournament-capabilities';

describe('Tournament capabilities for all 122 modalities', () => {
  it('classifies every registered sport exactly once without inventing result rules', () => {
    const all = Object.values(SPORTS_BY_RESULT_FORMAT).flat();
    expect(SPORTS_CATALOG).toHaveSize(122);
    expect(new Set(all).size).toBe(122);
    expect(new Set(all)).toEqual(new Set(SPORTS_CATALOG));
    for (const sport of SPORTS_CATALOG) {
      const cap = tournamentSportCapabilities(sport);
      expect(cap.family).withContext(sport).toBe(formatForSport(sport));
      expect(cap.family).withContext(sport).not.toBe('unknown');
      expect(cap.fullSportRulesImplemented).withContext(sport).toBeFalse();
      expect(cap.individual).withContext(sport).toBeDefined();
      expect(cap.team).withContext(sport).toBeDefined();
    }
  });

  it('only enables the fourteen race championship sports supported by the backend', () => {
    expect(RACE_CHAMPIONSHIP_SPORTS).toHaveSize(14);
    for (const sport of RACE_CHAMPIONSHIP_SPORTS) {
      expect(tournamentSportCapabilities(sport)).toEqual({
        family: 'race', individual: 'RACE_POINTS', team: 'UNAVAILABLE',
        fullSportRulesImplemented: false
      });
    }
    for (const sport of ['Automobilismo', 'Motociclismo', 'Motocross']) {
      expect(tournamentSportCapabilities(sport).individual).withContext(sport).toBe('RACE_POINTS');
      expect(tournamentSportCapabilities(sport).team).withContext(sport).toBe('UNAVAILABLE');
    }
    for (const sport of ['Corrida', 'Trail Running', 'Corrida de obstáculos', 'Motonáutica']) {
      expect(tournamentSportCapabilities(sport).individual).withContext(sport).toBe('RACE_POINTS');
      expect(tournamentSportCapabilities(sport).team).withContext(sport).toBe('UNAVAILABLE');
    }
    expect(tournamentSportCapabilities('Atletismo').individual).toBe('FIELD_BEST_MARK');
    expect(tournamentSportCapabilities('Atletismo').team).toBe('RELAY_BEST_TIME');
    expect(tournamentSportCapabilities('Natação').individual).toBe('SWIM_BEST_TIME');
    expect(tournamentSportCapabilities('Canoagem Velocidade').individual).toBe('CANOE_BEST_TIME');
    expect(tournamentSportCapabilities('Remo').individual).toBe('ROWING_BEST_TIME');
    expect(tournamentSportCapabilities('Remo').team).toBe('UNAVAILABLE');
    expect(tournamentSportCapabilities('Canoagem Velocidade').team).toBe('UNAVAILABLE');
    expect(tournamentSportCapabilities('Natação').team).toBe('UNAVAILABLE');
    for (const sport of ['Triatlo', 'Canoagem', 'Vela']) {
      expect(tournamentSportCapabilities(sport).individual).withContext(sport).toBe('UNAVAILABLE');
    }
  });

  it('preserves speed-skating and chess special contracts', () => {
    expect(tournamentSportCapabilities('Patinagem de Velocidade').individual).toBe('INLINE_SPEED');
    expect(tournamentSportCapabilities('Patinagem de Velocidade').team).toBe('UNAVAILABLE');
    expect(tournamentSportCapabilities('Xadrez').individual).toBe('NUMERIC_INDIVIDUAL');
    expect(tournamentSportCapabilities('Xadrez').team).toBe('UNAVAILABLE');
  });

  it('retains existing numeric team and individual tournament creation paths', () => {
    const models: readonly TournamentCreationModel[] = [
      'NUMERIC_INDIVIDUAL', 'NUMERIC_TEAM', 'RACE_POINTS', 'INLINE_SPEED', 'SWIM_BEST_TIME', 'CANOE_BEST_TIME', 'ROWING_BEST_TIME', 'FIELD_BEST_MARK', 'TRACK_BEST_TIME', 'RELAY_BEST_TIME', 'UNAVAILABLE'
    ];
    for (const sport of SPORTS_CATALOG) {
      const cap = tournamentSportCapabilities(sport);
      expect(models).withContext(sport).toContain(cap.individual);
      expect(models).withContext(sport).toContain(cap.team);
    }
    for (const sport of ['Futebol', 'Basquetebol', 'Padel', 'Ténis', 'Teqball']) {
      expect(tournamentSportCapabilities(sport).individual).toBe('NUMERIC_INDIVIDUAL');
      expect(tournamentSportCapabilities(sport).team).toBe('NUMERIC_TEAM');
    }
  });

  it('never treats a missing or unknown sport as football', () => {
    const unknown = tournamentSportCapabilities('Modalidade indefinida');
    expect(unknown.family).toBe('unknown');
    expect(unknown.individual).toBe('UNAVAILABLE');
    expect(unknown.team).toBe('UNAVAILABLE');
    expect(tournamentSportCapabilities(null).individual).toBe('UNAVAILABLE');
  });

  it('selects athletics result engines by event and entry type without numeric fallbacks', () => {
    expect(tournamentCreationModelForEvent('Atletismo', false, 'TRACK')).toBe('TRACK_BEST_TIME');
    expect(tournamentCreationModelForEvent('Atletismo', false, 'JUMP')).toBe('FIELD_BEST_MARK');
    expect(tournamentCreationModelForEvent('Atletismo', false, 'THROW')).toBe('FIELD_BEST_MARK');
    expect(tournamentCreationModelForEvent('Atletismo', true, 'TRACK_RELAY')).toBe('RELAY_BEST_TIME');
    expect(tournamentCreationModelForEvent('Atletismo', true, 'TRACK')).toBe('RELAY_BEST_TIME');
    expect(tournamentCreationModelForEvent('Karting', true, 'TRACK')).toBe('UNAVAILABLE');
    expect(tournamentCreationModelForEvent('Natação', false, 'SWIM_LCM')).toBe('SWIM_BEST_TIME');
    expect(tournamentCreationModelForEvent(null, false, 'TRACK')).toBe('UNAVAILABLE');
  });

});
