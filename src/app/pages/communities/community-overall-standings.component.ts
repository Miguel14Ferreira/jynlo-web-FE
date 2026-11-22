import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommunityOverallStanding } from '../model/community-group';

/** "Geral": games and wins across every sport of a shared season. */
@Component({
  selector: 'app-community-overall-standings',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="racket-standings-group overall-standings">
      <div class="racket-standings-group-head">
        <h4>{{ 'communities.overall.title' | t }}</h4>
      </div>
      <p class="overall-standings-hint">{{ 'communities.overall.hint' | t }}</p>
      <div class="racket-standings-scroll">
        <table class="racket-standings-table">
          <thead>
            <tr>
              <th scope="col">{{ 'communities.racket.rank' | t }}</th>
              <th scope="col">{{ 'communities.racket.player' | t }}</th>
              <th scope="col">{{ 'communities.overall.wins' | t }}</th>
              <th scope="col">{{ 'communities.overall.games' | t }}</th>
              <th scope="col">{{ 'communities.overall.sports' | t }}</th>
              <th scope="col">%</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows; track rowKey(row, $index)) {
              <tr>
                <td class="racket-standings-place">{{ row.position }}.º</td>
                <th scope="row" class="racket-standings-player">
                  <strong>{{ row.fullName || row.username }}</strong>
                  @if (row.username) { <small>&#64;{{ row.username }}</small> }
                </th>
                <td class="racket-standings-wins">{{ row.wins }}</td>
                <td>{{ row.games }}</td>
                <td>{{ row.sports }}</td>
                <td>{{ row.winRate }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`.overall-standings-hint { margin: 0 0 8px; font-size: 0.9rem; color: var(--jynlo-text-muted, #5c6470); }`]
})
export class CommunityOverallStandingsComponent {
  @Input() rows: readonly CommunityOverallStanding[] = [];

  rowKey(row: CommunityOverallStanding, index: number): string {
    return row.profileId != null ? 'p' + row.profileId : (row.username || row.fullName || '') + ':' + index;
  }
}
