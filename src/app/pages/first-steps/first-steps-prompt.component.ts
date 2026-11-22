import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthenticationService } from '../../services/authethication.service';
import { FirstStepsService } from '../../services/first-steps.service';
import { TranslatePipe } from '../../i18n/translate.pipe';

/** Small card at the top of the feed until the person picks sports, or says "not now". */
@Component({
  selector: 'app-first-steps-prompt',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    @if (visible) {
      <aside class="first-steps-prompt" role="region" [attr.aria-label]="'firstSteps.title' | t">
        <div>
          <strong>{{ 'firstSteps.promptTitle' | t }}</strong>
          <p>{{ 'firstSteps.promptText' | t }}</p>
        </div>
        <div class="first-steps-prompt__actions">
          <a class="first-steps-prompt__go" routerLink="/menu/first-steps">{{ 'firstSteps.promptAction' | t }}</a>
          <button type="button" class="first-steps-prompt__later" (click)="later()">{{ 'firstSteps.later' | t }}</button>
        </div>
      </aside>
    }`,
  styles: [`
    .first-steps-prompt { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
      margin: 0 0 16px; padding: 16px; border-radius: 16px; border: 1px solid rgba(110,231,200,.45); background: rgba(42,224,202,.08); color: #eef7f5; }
    .first-steps-prompt p { margin: 4px 0 0; color: #b5c9d1; font-size: .9rem; }
    .first-steps-prompt__actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .first-steps-prompt__go, .first-steps-prompt__later { min-height: 44px; padding: 0 16px; border-radius: 999px; display: inline-flex; align-items: center;
      font-weight: 800; text-decoration: none; cursor: pointer; font: inherit; font-weight: 800; }
    .first-steps-prompt__go { background: #2ae0ca; color: #062b31; }
    .first-steps-prompt__later { background: transparent; color: #eef7f5; border: 1px solid rgba(255,255,255,.2); }
  `]
})
export class FirstStepsPromptComponent implements OnInit {
  visible = false;
  constructor(private steps: FirstStepsService, private auth: AuthenticationService, private cd: ChangeDetectorRef,
              private router: Router) {}

  ngOnInit(): void {
    const user = this.auth.loggedInPerfilname;
    if (this.steps.skipped(user)) return;
    this.steps.get().subscribe({
      next: state => {
        this.visible = Boolean(state?.needed);
        this.cd.markForCheck();
        if (this.visible) this.openOncePerSession(user);
      },
      error: () => { this.visible = false; }
    });
  }

  /**
   * Like the app: a new account goes straight to "first steps". Only once per
   * browser session, so going back to the feed shows this card instead of looping.
   */
  private openOncePerSession(user: string | null | undefined): void {
    const key = 'jynlo.firstSteps.opened.' + (user || '').toLowerCase();
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { return; }
    this.router.navigate(['/menu/first-steps']).catch(() => undefined);
  }

  later(): void {
    this.steps.skip(this.auth.loggedInPerfilname);
    this.visible = false;
  }
}
