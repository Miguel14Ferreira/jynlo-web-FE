import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthenticationService } from '../services/authethication.service';

/**
 * Signed-in people open Jynlo straight in their feed (like the app); visitors
 * and search engines still get the public home page. Only the local session is
 * checked, so the landing page never waits on the network.
 */
export const homeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthenticationService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/menu/feed']) : true;
};
