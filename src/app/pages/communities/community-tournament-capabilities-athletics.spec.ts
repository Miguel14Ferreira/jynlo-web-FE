import { tournamentCreationModelForEvent } from './community-tournament-capabilities';

describe('Athletics event-specific competition engines', () => {
  it('uses times for individual track races', () => {
    expect(tournamentCreationModelForEvent('Atletismo', false, 'TRACK')).toBe('TRACK_BEST_TIME');
  });

  it('uses measured marks for individual field events', () => {
    expect(tournamentCreationModelForEvent('Atletismo', false, 'JUMP')).toBe('FIELD_BEST_MARK');
    expect(tournamentCreationModelForEvent('Atletismo', false, 'THROW')).toBe('FIELD_BEST_MARK');
  });

  it('only enables the relay engine for team relay events', () => {
    expect(tournamentCreationModelForEvent('Atletismo', true, 'TRACK_RELAY')).toBe('RELAY_BEST_TIME');
    expect(tournamentCreationModelForEvent('Atletismo', true, 'TRACK')).toBe('UNAVAILABLE');
    expect(tournamentCreationModelForEvent('Atletismo', true, 'JUMP')).toBe('UNAVAILABLE');
    expect(tournamentCreationModelForEvent('Atletismo', false, 'TRACK_RELAY')).toBe('UNAVAILABLE');
  });
});
