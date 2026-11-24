import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { GlobalSearchComponent, cleanQuery, sessionFilters } from './global-search.component';

describe('GlobalSearchComponent', () => {
  it('cleans queries', () => {
    expect(cleanQuery(' a ')).toBe('');
    expect(cleanQuery('ab\u0000c')).toBe('ab c');
    expect(cleanQuery('z'.repeat(100)).length).toBe(80);
  });

  it('searches games by sport or by city', () => {
    expect(sessionFilters('pádel', ['Padel'])).toEqual({ sport: 'Padel' });
    expect(sessionFilters(' Porto ', ['Padel'])).toEqual({ city: 'Porto' });
    expect(sessionFilters('x', ['Padel'])).toBeNull();
  });

  it('keeps other sections when one area fails', fakeAsync(() => {
    TestBed.configureTestingModule({
      imports: [GlobalSearchComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    const fixture = TestBed.createComponent(GlobalSearchComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    fixture.componentInstance.changed('Porto');
    tick(350);
    http.expectOne(r => r.url.includes('/api/profile/search')).flush([{ username: 'ana', fullName: 'Ana', location: 'Porto' }]);
    http.expectOne(r => r.url.includes('/api/communities/search')).flush('x', { status: 500, statusText: 'err' });
    http.expectOne(r => r.url.includes('/api/teams')).flush([]);
    http.expectOne(r => r.url.includes('/api/venues/suggest')).flush({ venues: [{ id: 1, name: 'Campo', city: 'Porto' }] });
    http.expectOne(r => r.url.includes('/api/sessions?city=Porto')).flush([{ id: 2, sport: 'Padel', city: 'Porto', gameDate: '2026-12-01T10:00:00', participantCount: 1, maxParticipants: 4, status: 'OPEN' }, { id: 3, status: 'CANCELLED' }]);
    const view = fixture.componentInstance.view!;
    expect(view.people[0].link).toEqual(['/menu/profiles', 'ana']);
    expect(view.sessions.length).toBe(1);
    expect(view.venues.length).toBe(1);
    expect(view.failed).toEqual(['search.communities']);
    http.verify();
  }));
});
