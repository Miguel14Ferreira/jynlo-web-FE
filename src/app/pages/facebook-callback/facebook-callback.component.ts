import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';

/** Return address for the Facebook login started in the Android/iPhone app: hands the result back to the app. */
export function appReturnUrl(hash: string): string | null {
  const raw = (hash || '').replace(/^#/, '');
  const state = new URLSearchParams(raw).get('state') || '';
  return /^app\.[a-f0-9]{16,64}$/.test(state) ? `jynlo://auth/facebook#${raw}` : null;
}

@Component({
  selector: 'app-facebook-callback',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main class="fb-return"><p>{{ 'A voltar à app Jynlo…' | t }}</p>
    @if (appUrl) { <a [href]="appUrl">{{ 'Abrir a app Jynlo' | t }}</a> }</main>`,
  styles: [`.fb-return{min-height:60vh;display:grid;place-content:center;gap:12px;text-align:center;color:#e8f1fb}
    .fb-return a{color:#7cc4ff;font-weight:600}`]
})
export class FacebookCallbackComponent implements OnInit {
  appUrl: string | null = null;

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.appUrl = appReturnUrl(window.location.hash);
    if (this.appUrl) {
      window.location.replace(this.appUrl);
      return;
    }
    void this.router.navigateByUrl('/login');
  }
}
