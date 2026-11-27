import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CommunitySuggestionsComponent, pickCommunitySuggestions } from './community-suggestions.component';

describe('CommunitySuggestionsComponent', () => {
  it('suggests only public communities the person is not in', () => {
    const found = [
      { id: 1, name: 'A', sport: 'Padel', visibility: 'PUBLIC' },
      { id: 2, name: 'B', sport: null, visibility: 'PRIVATE' },
      { id: 3, name: 'C', sport: 'Futebol', visibility: 'PUBLIC' }
    ];
    expect(pickCommunitySuggestions(found, [3]).map(c => c.id)).toEqual([1]);
  });

  function setup() {
    TestBed.configureTestingModule({
      imports: [CommunitySuggestionsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CommunitySuggestionsComponent);
    fixture.detectChanges();
    return { http, fixture };
  }

  it('shows public communities to someone in none', () => {
    const { http, fixture } = setup();
    http.expectOne(r => r.url.includes('/search')).flush({ communities: [{ id: 1, name: 'Padel Lisboa', sport: 'Padel', visibility: 'PUBLIC' }], page: 0, hasMore: false });
    http.expectOne(r => !r.url.includes('/search')).flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Padel Lisboa');
  });

  it('stays hidden for people already in a community', () => {
    const { http, fixture } = setup();
    http.expectOne(r => r.url.includes('/search')).flush({ communities: [{ id: 1, name: 'Padel Lisboa', sport: 'Padel', visibility: 'PUBLIC' }], page: 0, hasMore: false });
    http.expectOne(r => !r.url.includes('/search')).flush([{ id: 9, name: 'Os meus' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.cs')).toBeNull();
  });
});
