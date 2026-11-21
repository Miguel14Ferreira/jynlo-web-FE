import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { preloadEnglishTranslations } from '../../i18n/i18n.service';
import { CommunityTournamentsService } from '../../services/community-tournaments.service';
import { EventRankingOverview, EventRankingService } from '../../services/event-ranking.service';
import { tournamentCreationModelForEvent } from './community-tournament-capabilities';
import { EventRankingPanelComponent, formatEventValue, parseEventValue } from './event-ranking-panel.component';

describe('EventRankingPanelComponent', () => {
  let fixture: ComponentFixture<EventRankingPanelComponent>;
  let api: jasmine.SpyObj<EventRankingService>;
  const overview: EventRankingOverview = {
    tournamentId: 9, status: 'IN_PROGRESS', valueKind: 'TIME', pointsByPlace: [25, 18, 15], canManage: true,
    participants: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Rui' }],
    events: [{ id: 5, name: 'Prova 1', heldOn: '2026-11-20', results: [
      { participantId: 1, name: 'Ana', value: 62.4, place: 1, points: 25, didNotFinish: false },
      { participantId: 2, name: 'Rui', value: null, place: null, points: 0, didNotFinish: true }] }],
    table: [{ position: 1, participantId: 1, name: 'Ana', points: 25, events: 1, wins: 1, podiums: 1, best: 62.4 },
      { position: 2, participantId: 2, name: 'Rui', points: 0, events: 1, wins: 0, podiums: 0, best: null }]
  };

  beforeAll(async () => { await preloadEnglishTranslations(); });

  beforeEach(async () => {
    api = jasmine.createSpyObj<EventRankingService>('EventRankingService', ['overview', 'setKind', 'setPoints', 'saveEvent', 'deleteEvent', 'complete']);
    api.overview.and.returnValue(of(overview));
    api.saveEvent.and.returnValue(of(overview));
    const tournaments = jasmine.createSpyObj<CommunityTournamentsService>('CommunityTournamentsService', ['participants', 'join', 'leave', 'confirm']);
    tournaments.participants.and.returnValue(of({ participants: [], page: 0, hasMore: false }));
    await TestBed.configureTestingModule({
      imports: [EventRankingPanelComponent],
      providers: [{ provide: EventRankingService, useValue: api }, { provide: CommunityTournamentsService, useValue: tournaments }]
    }).compileComponents();
    fixture = TestBed.createComponent(EventRankingPanelComponent);
    fixture.componentInstance.communityId = 3;
    fixture.componentInstance.tournament = { id: 9, status: 'IN_PROGRESS', scoringMode: 'EVENT_RANKING' } as any;
    fixture.componentInstance.canManage = true;
    fixture.componentInstance.isMember = true;
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
  });

  it('shows the points table', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(api.overview).toHaveBeenCalledOnceWith(3, 9);
    expect(text).toContain('Ana');
    expect(text).toContain('25');
    expect(text).toContain('1:02,40');
  });

  it('parses times and sends a new event with DNF', () => {
    const c = fixture.componentInstance;
    c.newEvent();
    c.rows[0].raw = '1:01,5';
    c.rows[1].dnf = true;
    c.saveEvent();
    expect(api.saveEvent).toHaveBeenCalledOnceWith(3, 9, null, jasmine.objectContaining({ results: [
      { participantId: 1, didNotFinish: false, value: 61.5, position: null },
      { participantId: 2, value: null, position: null, didNotFinish: true }] }));
  });

  it('rejects an invalid value without calling the server', () => {
    const c = fixture.componentInstance;
    c.newEvent();
    c.rows[0].raw = 'abc';
    c.saveEvent();
    expect(api.saveEvent).not.toHaveBeenCalled();
    expect(c.error).toContain('Ana');
  });
});

describe('event ranking helpers', () => {
  it('parses and formats values', () => {
    expect(parseEventValue('1:02:03', 'TIME')).toBe(3723);
    expect(parseEventValue('87,5', 'SCORE')).toBe(87.5);
    expect(parseEventValue('', 'SCORE')).toBeNull();
    expect(parseEventValue('2.5', 'POSITION')).toBeNaN();
    expect(formatEventValue(3723, 'TIME')).toBe('1:02:03,00');
    expect(formatEventValue(9.5, 'TIME')).toBe('9,5');
  });

  it('offers event series to individual competitive sports without a dedicated engine only', () => {
    expect(tournamentCreationModelForEvent('Ténis', false, null)).not.toBe('EVENT_RANKING');
    expect(tournamentCreationModelForEvent('Karting', false, null)).toBe('RACE_POINTS');
    expect(tournamentCreationModelForEvent('Yoga', false, null)).toBe('UNAVAILABLE');
    expect(tournamentCreationModelForEvent('Golfe', false, null)).toBe('EVENT_RANKING');
    expect(tournamentCreationModelForEvent('Ginástica', false, null)).toBe('EVENT_RANKING');
    expect(tournamentCreationModelForEvent('Golfe', true, null)).not.toBe('EVENT_RANKING');
  });
});
