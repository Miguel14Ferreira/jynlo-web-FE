import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AppRoutingModule } from './app-routing.module';
import { GuestOnlyGuard } from './guard/guest-only.guard';
import { AuthenticationGuard } from './guard/authentication.guard';
import { CreateaccountComponent } from './pages/createaccount/createaccount.component';
import { GoogleOnboardingComponent } from './pages/google-onboarding/google-onboarding.component';

describe('Account creation route protection', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AppRoutingModule] });
  });

  it('protects both email and Google registration screens with the guest-only guard', () => {
    const routes = TestBed.inject(Router).config;
    const email = routes.find(route => route.path === 'login/registerNewUser');
    const google = routes.find(route => route.path === 'login/google/complete-profile');

    // Both screens are loaded on demand to keep the first download small.
    expect(email?.loadComponent).toBeDefined();
    expect(email?.canActivate).toContain(GuestOnlyGuard);
    expect(google?.loadComponent).toBeDefined();
    expect(google?.canActivate).toContain(GuestOnlyGuard);
  });
  it('loads the public game preview and the account screens on demand', async () => {
    const routes = TestBed.inject(Router).config;
    for (const path of ['sessions/:id', 'menu/dadosPerfil', 'contact', 'about', 'login/MFAauthentication']) {
      const route = routes.find(item => item.path === path);
      expect(route?.component).withContext(path).toBeUndefined();
      expect(route?.loadComponent).withContext(path).toBeDefined();
    }
    const email = routes.find(route => route.path === 'login/registerNewUser');
    expect(await (email!.loadComponent as () => Promise<unknown>)()).toBe(CreateaccountComponent);
    const google = routes.find(route => route.path === 'login/google/complete-profile');
    expect(await (google!.loadComponent as () => Promise<unknown>)()).toBe(GoogleOnboardingComponent);
  });
  it('guards the unified message center and loads its dedicated screen lazily', () => {
    const route = TestBed.inject(Router).config.find(item => item.path === 'menu/messages');
    expect(route?.canActivate).toContain(AuthenticationGuard);
    expect(route?.loadComponent).toBeDefined();
  });
});
