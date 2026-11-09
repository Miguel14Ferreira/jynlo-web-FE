import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessionSummary } from '../model/session-summary';
import { CommunitySessionCardComponent } from './community-session-card.component';

describe('CommunitySessionCardComponent', () => {
  const session: SessionSummary = {
    id: 218,
    sport: 'Futebol',
    city: 'Lisboa',
    gameDate: '2026-11-04T19:00:00',
    distanceKm: null,
    participantCount: 8,
    maxParticipants: 10,
    priceAmount: 0,
    privateGame: false,
    audience: 'COMMUNITY_ONLY',
    status: 'OPEN'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommunitySessionCardComponent],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  function render(overrides: Partial<SessionSummary> = {}) {
    const fixture = TestBed.createComponent(CommunitySessionCardComponent);
    fixture.componentRef.setInput('session', { ...session, ...overrides });
    fixture.componentRef.setInput('formattedDate', '04/11/2026 19:00');
    fixture.detectChanges();
    return fixture;
  }

  it('preserves the exact session route, sport, city and formatted date', () => {
    const root = render().nativeElement as HTMLElement;
    const link = root.querySelector<HTMLAnchorElement>('a.community-session-card');
    expect(link?.getAttribute('href')).toBe('/menu/events/218');
    expect(root.querySelector('.community-session-main strong')?.textContent).toContain('Futebol');
    expect(root.querySelector('.community-session-main span')?.textContent).toContain('Lisboa');
    expect(root.querySelector('.community-session-main span')?.textContent).toContain('04/11/2026 19:00');
    expect(root.querySelector('.community-session-meta')?.textContent).toContain('8/10');
  });

  it('labels a season game inside its own session card without changing the route', () => {
    const fixture = render({ seasonCommunityId: 7 });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="community-season-game"]')).toBeNull();
    fixture.componentRef.setInput('seasonGame', true);
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="community-season-game"]')?.textContent)
      .toContain('Jogo de época');
    expect(root.querySelector('a.community-session-card')?.getAttribute('href'))
      .toBe('/menu/events/218');
    fixture.componentRef.setInput('seasonGame', false);
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="community-season-game"]')).toBeNull();
  });

  it('shows a recurring badge and available spaces without changing the audience', () => {
    const root = render({ recurrenceSeriesId: 'weekly-32' }).nativeElement as HTMLElement;
    expect(root.querySelector('.competition-badge')).not.toBeNull();
    expect(root.querySelector('.session-open-spots')).not.toBeNull();
    expect(root.querySelector('.session-full')).toBeNull();
  });

  it('shows full status and paid price while hiding available spaces', () => {
    const root = render({ participantCount: 10, maxParticipants: 10, priceAmount: 5 }).nativeElement as HTMLElement;
    expect(root.querySelector('.session-open-spots')).toBeNull();
    expect(root.querySelector('.session-full')).not.toBeNull();
    expect(root.querySelector('.community-session-meta')?.textContent).toContain('5 €');
  });

  it('is presentation-only and never renders enrollment or moderation controls', () => {
    const root = render({ joinedByViewer: true, waitlistedByViewer: true }).nativeElement as HTMLElement;
    expect(root.querySelectorAll('button').length).toBe(0);
    expect(root.querySelectorAll('a.community-session-card').length).toBe(1);
  });
});
