import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, inject } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PlayerHighlightsService, PlayerStats } from './player-highlights.service';

/** A player's numbers from community games (goals, assists, MVP), shown on the profile. */
@Component({
  selector: 'app-player-stats',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stats && stats.games > 0) {
      <section class="pst" [attr.aria-label]="'Estatísticas' | t">
        <div class="pst__cell"><strong>{{ stats.games }}</strong><span>{{ 'Jogos' | t }}</span></div>
        <div class="pst__cell"><strong>{{ stats.wins }}</strong><span>{{ 'Vitórias' | t }}</span></div>
        <div class="pst__cell"><strong>{{ stats.goals }}</strong><span>{{ 'Golos' | t }}</span></div>
        <div class="pst__cell"><strong>{{ stats.assists }}</strong><span>{{ 'Assistências' | t }}</span></div>
        <div class="pst__cell"><strong>{{ stats.mvps }}</strong><span>MVP</span></div>
      </section>
    }
  `,
  styles: [`
    .pst{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:12px 0}
    .pst__cell{display:grid;justify-items:center;gap:2px;padding:10px 6px;border-radius:14px;background:rgba(10,41,55,.65);border:1px solid rgba(96,176,182,.25)}
    .pst__cell strong{font-size:1.25rem;color:#eafffa}
    .pst__cell span{font-size:.72rem;color:#9fd9cb;text-align:center}
  `]
})
export class PlayerStatsComponent implements OnChanges {
  @Input({ required: true }) username = '';
  private readonly api = inject(PlayerHighlightsService);
  private readonly cdr = inject(ChangeDetectorRef);
  stats: PlayerStats | null = null;
  ngOnChanges(): void {
    this.stats = null;
    if (!this.username) return;
    this.api.stats(this.username).subscribe({ next: s => { this.stats = s; this.cdr.markForCheck(); }, error: () => {} });
  }
}
