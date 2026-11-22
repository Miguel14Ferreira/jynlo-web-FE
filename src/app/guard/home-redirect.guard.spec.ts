import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { AuthenticationService } from '../services/authethication.service';
import { homeRedirectGuard } from './home-redirect.guard';

describe('homeRedirectGuard', () => {
  function run(loggedIn: boolean) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthenticationService, useValue: { isLoggedIn: () => loggedIn } }]
    });
    return TestBed.runInInjectionContext(() => homeRedirectGuard({} as any, {} as any));
  }

  it('sends signed-in people to their feed', () => {
    const result = run(true) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/menu/feed');
  });

  it('keeps the public home page for visitors', () => {
    expect(run(false)).toBeTrue();
  });
});
