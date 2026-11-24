import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthenticationService } from '../../services/authethication.service';
import { ManagedVenue, VenueBookingService } from '../../services/venue-booking.service';
import { DEFAULT_SHORTCUTS, HomeShortcutsComponent, resolveShortcuts } from './home-shortcuts.component';

describe('HomeShortcutsComponent', () => {
  const all = new Set(['create', 'my-games', 'communities', 'tournaments', 'teams', 'messages', 'venues', 'my-venues']);

  it('keeps saved order, drops unknown or unavailable ids and caps at six', () => {
    expect(resolveShortcuts(['teams', 'ghost', 'create', 'teams'], all, false)).toEqual(['teams', 'create']);
    expect(resolveShortcuts(null, all, false)).toEqual(DEFAULT_SHORTCUTS);
    expect(resolveShortcuts(null, all, true)[0]).toBe('my-venues');
    expect(resolveShortcuts(['my-venues', 'create'], new Set(['create']), false)).toEqual(['create']);
    expect(resolveShortcuts([...all], all, false).length).toBe(6);
  });

  function setup(managed: ManagedVenue[]) {
    localStorage.removeItem('jynlo-home-shortcuts:ana');
    const api = jasmine.createSpyObj<VenueBookingService>('VenueBookingService', ['managed', 'accepting']);
    api.managed.and.returnValue(of(managed));
    api.accepting.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [HomeShortcutsComponent],
      providers: [provideRouter([]), { provide: VenueBookingService, useValue: api },
        { provide: AuthenticationService, useValue: { isLoggedIn: () => true, loggedInPerfilname: 'ana' } }],
    });
    const fixture = TestBed.createComponent(HomeShortcutsComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the defaults, and "Os meus recintos" first for venue managers', () => {
    const plain = setup([]);
    expect(plain.el.textContent).toContain('Criar jogo');
    expect(plain.el.textContent).not.toContain('Os meus recintos');
  });

  it('puts the managed venue first with its pending requests', () => {
    const { el } = setup([{ venueId: 5, name: 'Clube', city: 'Lisboa', pendingRequests: 2, acceptsBookings: true }]);
    const first = el.querySelector('.hs__item') as HTMLAnchorElement;
    expect(first.textContent).toContain('Os meus recintos');
    expect(first.textContent).toContain('2');
    expect(first.getAttribute('href')).toBe('/menu/venues/5/manage');
  });

  it('saves a personal order', () => {
    const { fixture, el } = setup([]);
    const c = fixture.componentInstance;
    c.startEdit();
    c.move(0, 1);
    c.remove('tournaments');
    c.add('teams');
    c.save();
    fixture.detectChanges();
    expect(JSON.parse(localStorage.getItem('jynlo-home-shortcuts:ana') || '[]')).toEqual(['my-games', 'create', 'communities', 'teams']);
    expect([...el.querySelectorAll('.hs__item')].map(a => a.textContent?.trim())).toEqual(
      jasmine.arrayContaining([jasmine.stringMatching('Os meus jogos')]));
    localStorage.removeItem('jynlo-home-shortcuts:ana');
  });
});
