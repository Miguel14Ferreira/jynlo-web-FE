import { TestBed } from '@angular/core/testing';
import { CommunityOverallStandingsComponent } from './community-overall-standings.component';

describe('CommunityOverallStandingsComponent', () => {
  it('lists wins, games and sports for each player across sports', () => {
    TestBed.configureTestingModule({ imports: [CommunityOverallStandingsComponent] });
    const fixture = TestBed.createComponent(CommunityOverallStandingsComponent);
    fixture.componentRef.setInput('rows', [
      { position: 1, profileId: 2, username: 'rui', fullName: 'Rui', profilePicUrl: null,
        games: 10, wins: 5, sports: 2, winRate: 50 }
    ]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Rui');
    expect(text).toContain('@rui');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
  });
});
