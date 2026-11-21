import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PublicRankingService } from '../../services/public-ranking.service';
import { PublicRankingComponent } from './public-ranking.component';

describe('PublicRankingComponent', () => {
  it('shows the season table and switches season', () => {
    const api = jasmine.createSpyObj<PublicRankingService>('PublicRankingService', ['page']);
    api.page.and.returnValue(of({ communityId: 5, communityName: 'Colégio Pio', sport: 'Futebol', selectedSeasonId: 3,
      seasons: [{ id: 3, name: 'Época 25/26', sport: null, active: true, startsAt: null, endedAt: null },
                { id: 2, name: 'Época 24/25', sport: null, active: false, startsAt: null, endedAt: null }],
      table: [{ position: 1, name: 'rui', games: 10, wins: 7, draws: 1, losses: 2, points: 22, winRate: 70, streak: 'V2' }] }));
    TestBed.configureTestingModule({ imports: [PublicRankingComponent], providers: [provideRouter([]),
      { provide: PublicRankingService, useValue: api },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '5' })),
        snapshot: { queryParamMap: convertToParamMap({}) } } }] });
    const fixture = TestBed.createComponent(PublicRankingComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Colégio Pio');
    expect(el.textContent).toContain('Época 25/26');
    expect(el.textContent).toContain('70%');
    fixture.componentInstance.selectSeason('2');
    expect(api.page).toHaveBeenCalledWith(5, 2);
  });
});
