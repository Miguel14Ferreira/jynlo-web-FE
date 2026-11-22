import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommunityStatLeadersComponent } from './community-stat-leaders.component';
import { CommunityStanding } from '../model/community-group';

const standing = (over: Partial<CommunityStanding>): CommunityStanding => ({
  position: 1, profileId: 1, username: 'mestre', fullName: 'Mestre', profilePicUrl: null,
  games: 6, wins: 4, draws: 0, losses: 2, points: 12, goals: 0, assists: 0, mvps: 0,
  cleanSheets: 0, winRate: 66, currentStreak: '', bestWinStreak: 2, ...over
});

describe('CommunityStatLeadersComponent', () => {
  let fixture: ComponentFixture<CommunityStatLeadersComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CommunityStatLeadersComponent] });
    fixture = TestBed.createComponent(CommunityStatLeadersComponent);
  });

  it('shows the leader and hides categories nobody has scored in', () => {
    fixture.componentRef.setInput('leader', standing({}));
    fixture.componentRef.setInput('goals', standing({ goals: 0 }));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.leader-card')?.textContent).toContain('Mestre');
    expect(el.querySelector('.leader-card')?.textContent).toContain('4V 0E 2D · Jogos: 6');
    expect(el.textContent).not.toContain('{');
    expect(el.querySelectorAll('.record-card').length).toBe(0);
    expect(el.querySelector('.records-empty')).not.toBeNull();
    expect(el.textContent).not.toContain('—');
  });

  it('lists only categories with values', () => {
    fixture.componentRef.setInput('leader', standing({}));
    fixture.componentRef.setInput('goals', standing({ fullName: 'Rui', goals: 7 }));
    fixture.componentRef.setInput('mvps', standing({ fullName: 'Ana', mvps: 2 }));
    fixture.componentRef.setInput('assists', standing({ assists: 0 }));
    fixture.detectChanges();
    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.record-card'));
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Rui');
    expect(cards[0].textContent).toContain('7');
  });

  it('falls back to the username and stays read-only when there are no results', () => {
    fixture.componentRef.setInput('leader', standing({ fullName: null, username: 'ana' }));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.leader-card strong')?.textContent?.trim()).toBe('ana');
    const empty = TestBed.createComponent(CommunityStatLeadersComponent);
    empty.detectChanges();
    const el = empty.nativeElement as HTMLElement;
    expect(el.querySelector('.leader-card')).toBeNull();
    expect(el.querySelector('.records-empty')).not.toBeNull();
    expect(el.querySelector('button, input, a')).toBeNull();
  });
});
