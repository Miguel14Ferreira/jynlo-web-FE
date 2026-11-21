import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthenticationService } from '../../services/authethication.service';
import { FIRST_STEPS_MAX_SPORTS, FirstStepsService, firstStepsChoices } from '../../services/first-steps.service';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
  selector: 'app-first-steps',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './first-steps.component.html',
  styleUrls: ['./first-steps.component.css']
})
export class FirstStepsComponent implements OnInit {
  readonly max = FIRST_STEPS_MAX_SPORTS;
  catalog: string[] = [];
  selected: string[] = [];
  city = '';
  filter = '';
  loading = true;
  busy = false;
  error = '';

  constructor(private steps: FirstStepsService, private auth: AuthenticationService, private router: Router, private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    forkJoin({ catalog: this.steps.catalog(), state: this.steps.get() }).subscribe({
      next: ({ catalog, state }) => {
        this.catalog = catalog ?? [];
        this.selected = (state?.favoriteSports ?? []).filter(s => this.catalog.includes(s));
        this.city = state?.location ?? '';
        this.loading = false; this.cd.markForCheck();
      },
      error: () => { this.error = 'firstSteps.loadError'; this.loading = false; this.cd.markForCheck(); }
    });
  }

  get choices(): string[] { return firstStepsChoices(this.catalog, this.filter, this.selected); }
  isOn(sport: string): boolean { return this.selected.includes(sport); }

  toggle(sport: string): void {
    if (this.isOn(sport)) this.selected = this.selected.filter(s => s !== sport);
    else if (this.selected.length < this.max) this.selected = [...this.selected, sport];
  }

  save(): void {
    if (this.busy) return;
    if (!this.selected.length) { this.error = 'firstSteps.pickOne'; return; }
    this.busy = true; this.error = '';
    const city = this.city.trim().slice(0, 120);
    this.steps.save(this.selected, city).subscribe({
      next: () => {
        this.busy = false;
        void this.router.navigate(['/menu/discover'], { queryParams: { sport: this.selected[0], city: city || null } });
      },
      error: () => { this.busy = false; this.error = 'firstSteps.saveError'; this.cd.markForCheck(); }
    });
  }

  later(): void {
    this.steps.skip(this.auth.loggedInPerfilname);
    void this.router.navigate(['/menu/feed']);
  }
}
