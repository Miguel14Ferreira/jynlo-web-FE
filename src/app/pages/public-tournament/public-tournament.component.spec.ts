import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PublicTournamentService } from '../../services/public-tournament.service';
import { PublicTournamentComponent } from './public-tournament.component';
import { TournamentPublicShareComponent } from '../communities/tournament-public-share.component';

describe('PublicTournamentComponent', () => {
  function create(response: any) {
    const api = jasmine.createSpyObj<PublicTournamentService>('PublicTournamentService', ['page']);
    api.page.and.returnValue(response);
    TestBed.configureTestingModule({ imports: [PublicTournamentComponent], providers: [provideRouter([]),
      { provide: PublicTournamentService, useValue: api },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '9' })), snapshot: { paramMap: convertToParamMap({ id: '9' }) } } }] });
    const fixture = TestBed.createComponent(PublicTournamentComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the table, the games grouped by round and the champion', () => {
    const el = create(of({ id: 9, name: 'Liga', sport: 'Futsal', communityName: 'Pio', status: 'COMPLETED', format: 'LEAGUE',
      entryType: 'INDIVIDUAL', startedAt: null, completedAt: null, champion: 'Rui',
      table: [{ position: 1, name: 'Rui', played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 3, goalsAgainst: 1, goalDifference: 2, points: 3 }],
      games: [{ round: 1, group: null, home: 'Rui', away: 'Ana', status: 'COMPLETED', homeScore: 3, awayScore: 1 }] }));
    expect(el.textContent).toContain('Campeão: Rui');
    expect(el.textContent).toContain('Jornada 1');
    expect(el.textContent).toContain('3 – 1');
    expect(el.textContent).toContain('+2');
  });

  it('explains when the page is not available', () => {
    const el = create(throwError(() => ({ status: 404 })));
    expect(el.textContent).toContain('Torneio não disponível');
  });
});

describe('TournamentPublicShareComponent', () => {
  it('lets an admin turn the page on and then offers the link', () => {
    const api = jasmine.createSpyObj<PublicTournamentService>('PublicTournamentService', ['setting', 'update']);
    api.setting.and.returnValue(of({ enabled: false, path: '/tournaments/9' }));
    api.update.and.returnValue(of({ enabled: true, path: '/tournaments/9' }));
    TestBed.configureTestingModule({ imports: [TournamentPublicShareComponent],
      providers: [{ provide: PublicTournamentService, useValue: api }] });
    const fixture = TestBed.createComponent(TournamentPublicShareComponent);
    fixture.componentRef.setInput('communityId', 5);
    fixture.componentRef.setInput('tournamentId', 9);
    fixture.componentRef.setInput('canManage', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('Ativar'))!.click();
    fixture.detectChanges();
    expect(api.update).toHaveBeenCalledWith(5, 9, true);
    expect(el.querySelector('a')?.getAttribute('href')).toContain(encodeURIComponent('/tournaments/9'));
  });

  it('shows nothing to members while the page is off', () => {
    const api = jasmine.createSpyObj<PublicTournamentService>('PublicTournamentService', ['setting', 'update']);
    api.setting.and.returnValue(of({ enabled: false, path: '/tournaments/9' }));
    TestBed.configureTestingModule({ imports: [TournamentPublicShareComponent],
      providers: [{ provide: PublicTournamentService, useValue: api }] });
    const fixture = TestBed.createComponent(TournamentPublicShareComponent);
    fixture.componentRef.setInput('communityId', 5);
    fixture.componentRef.setInput('tournamentId', 9);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });
});
