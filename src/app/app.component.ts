import { AfterViewInit, ChangeDetectionStrategy, Component, Injector, OnDestroy, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, Subscription, take } from 'rxjs';

import { AuthenticationService } from './services/authethication.service';
import type { NativeSelectEnhancementService } from './shared/jynlo-select/native-select-enhancement.service';

import type { OnlinePresenceService } from './services/online-presence.service';
import { appTranslate as t } from './i18n/i18n.service';
import { registrationSessionReturnUrl, registrationCommunityReturnUrl, takeRegistrationDestination } from './shared/registration-return-url';
import { dismissStartupSplash } from './shared/startup-splash';
import { SeoService } from './shared/seo.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('callOverlayOutlet', { read: ViewContainerRef })
  private callOverlayOutlet?: ViewContainerRef;
  private disposed=false;
  private nativeSelectEnhancement?: NativeSelectEnhancementService;
  private onlinePresence?: OnlinePresenceService;
  private splashNavigationSubscription?: Subscription;
  private splashSafetyTimeout?: number;
  title = 'desporto24';

  constructor(
    private router: Router,
    private authenticationService: AuthenticationService,
    private injector: Injector,
    private seo: SeoService
  ) {}

  ngOnInit(): void {
    // Title, description, canonical and share tags follow each route.
    this.seo.start();
    // The static startup screen is visible even before the Angular bundle loads.
    // Keep it until first route resolution + two browser paint frames; never
    // replay it during ordinary SPA navigation.
    if (document.getElementById('jynlo-startup-splash')) {
      this.splashNavigationSubscription = this.router.events.pipe(
        filter(event => event instanceof NavigationEnd || event instanceof NavigationError),
        take(1)
      ).subscribe(() => {
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => this.finishStartupSplash()));
      });
      // Protect against an indefinitely hanging initial route or guard.
      this.splashSafetyTimeout = window.setTimeout(() => this.finishStartupSplash(), 12000);
    }
    const params = new URLSearchParams(window.location.search);
    // Pilot analytics is optional and must not increase the first-load bundle
    // or block login and session navigation. Import it after app bootstrap.
    void import('./services/pilot-analytics.service')
      .then(({PilotAnalyticsService}) => {
        if (!this.disposed) this.injector.get(PilotAnalyticsService).recordFirstAccess(params.get('cohort'));
      })
      .catch(() => { /* Analytics is best-effort; never break navigation. */ });
    // Presence is best-effort; keep its HTTP and router dependencies out of
    // the initial bundle without losing authenticated heartbeat behaviour.
    void import('./services/online-presence.service')
      .then(({OnlinePresenceService}) => {
        if (this.disposed) return;
        this.onlinePresence = this.injector.get(OnlinePresenceService);
        this.onlinePresence.start();
      }).catch(() => { /* App navigation must work without presence telemetry. */ });

    const token = params.get('confirmRegistration');

    if (!token) {
      return;
    }

    window.history.replaceState({}, document.title, window.location.pathname);

    this.authenticationService.confirmRegistration(token).subscribe({
      next: response => {
        sessionStorage.setItem(
          'auth-success-message',
          t('feedback.confirm.successLogin')
        );
        this.navigateToLoginAfterConfirmation(params);
      },
      error: error => {
        const apiMessage = error?.error?.message;
        sessionStorage.setItem(
          'auth-error-message',
          typeof apiMessage === 'string' && apiMessage.trim()
            ? apiMessage
            : t('feedback.confirm.error')
        );
        this.navigateToLoginAfterConfirmation(params);
      }
    });
  }

  ngAfterViewInit(): void {
    // Enhance all native single-select dropdowns, including lazy routed pages.
    // The real select stays in the DOM, preserving ngModel / ngValue / validators.
    void import('./shared/jynlo-select/native-select-enhancement.service')
      .then(({ NativeSelectEnhancementService }) => {
        if (this.disposed) return;
        this.nativeSelectEnhancement = this.injector.get(NativeSelectEnhancementService);
        this.nativeSelectEnhancement.start();
      }).catch(() => {
        // The native control remains usable if the enhancement chunk fails.
      });
    // Do not include the meeting UI and its styles in the initial Angular
    // bundle. Load immediately after boot, so incoming call invitations still
    // have a global route-independent surface.
    void import('./shared/direct-call-overlay.component').then(({DirectCallOverlayComponent}) => {
      if (!this.disposed && this.callOverlayOutlet) {
        this.callOverlayOutlet.createComponent(DirectCallOverlayComponent);
      }
    }).catch(() => {
      // A transient chunk download failure must not crash the rest of Jynlo.
    });
  }

  ngOnDestroy(): void {
    this.disposed=true;
    this.splashNavigationSubscription?.unsubscribe();
    if (this.splashSafetyTimeout !== undefined) {
      window.clearTimeout(this.splashSafetyTimeout);
    }
    this.onlinePresence?.stop();
    this.nativeSelectEnhancement?.stop();
  }

  private finishStartupSplash(): void {
    if (this.disposed) return;
    if (this.splashSafetyTimeout !== undefined) {
      window.clearTimeout(this.splashSafetyTimeout);
      this.splashSafetyTimeout = undefined;
    }
    dismissStartupSplash();
  }

  private navigateToLoginAfterConfirmation(params: URLSearchParams): void {
    const destinationFromEmail = registrationSessionReturnUrl(params.get('returnSessionId'))
      ?? registrationCommunityReturnUrl(params.get('returnCommunityId'));
    const destinationFromBrowser = takeRegistrationDestination();
    const destination = destinationFromEmail ?? destinationFromBrowser;
    if (destination) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: destination } });
    } else {
      this.router.navigateByUrl('/login');
    }
  }
}
