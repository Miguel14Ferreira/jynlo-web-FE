import { SessionDiscoveryMapComponent } from './session-discovery-map.component';
import { SessionSummary } from '../model/session-summary';

describe('SessionDiscoveryMapComponent', () => {
  const game = (id: number, changes: Partial<SessionSummary> = {}): SessionSummary => ({
    id, sport: 'Padel', city: 'Lisboa', gameDate: '2026-12-10T20:00:00Z',
    distanceKm: null, participantCount: 2, maxParticipants: 4,
    priceAmount: 0, privateGame: false, audience: 'PUBLIC', status: 'OPEN',
    latitude: 38.725, longitude: -9.155, ...changes
  });

  it('renders only finite public map positions from the session API', () => {
    const map = new SessionDiscoveryMapComponent();
    map.sessions = [
      game(1),
      game(2, {privateGame: true}),
      game(3, {audience: 'COMMUNITY_ONLY'}),
      game(4, {latitude: null}),
      game(5, {longitude: Number.NaN}),
      game(6, {latitude: 93}),
      game(7, {longitude: -185})
    ];
    map.ngOnChanges();
    expect(map.pins.map(pin => pin.session.id)).toEqual([1]);
    expect(map.tiles.length).toBeGreaterThan(0);
  });

  it('retains the same input sessions and supports Portugal, Azores and Madeira', () => {
    const map = new SessionDiscoveryMapComponent();
    map.sessions = [
      game(1, {latitude: 38.725, longitude: -9.155}),
      game(2, {latitude: 38.65, longitude: -28.2, city: 'Horta'}),
      game(3, {latitude: 32.72, longitude: -16.9, city: 'Funchal'})
    ];
    map.ngOnChanges();
    expect(map.pins.map(pin => pin.session.id)).toContain(1);
    map.showArea('azores');
    expect(map.pins.map(pin => pin.session.id)).toContain(2);
    map.showArea('madeira');
    expect(map.pins.map(pin => pin.session.id)).toContain(3);
    expect(map.sessions.length).toBe(3);
  });

  it('clears selection when the shared filters remove the session', () => {
    const map = new SessionDiscoveryMapComponent();
    const selected = game(9);
    map.sessions = [selected];
    map.ngOnChanges();
    map.select(selected);
    expect(map.selected?.id).toBe(9);
    map.sessions = [];
    map.ngOnChanges();
    expect(map.selected).toBeNull();
  });

  it('bounds zoom while allowing map controls', () => {
    const map = new SessionDiscoveryMapComponent();
    map.zoomBy(100);
    const tile = map.tiles[0];
    expect(tile.url).toContain('/13/');
    map.zoomBy(-100);
    expect(map.tiles[0].url).toContain('/4/');
  });
});
