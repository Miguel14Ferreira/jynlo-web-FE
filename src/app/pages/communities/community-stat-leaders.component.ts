import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { CommunityStanding } from '../model/community-group';

export interface StatRecord { label: string; icon: string; who: CommunityStanding; value: number; }

/**
 * Read-only leaderboard snapshot. Sorting and leader selection stay in
 * CommunitiesComponent; categories nobody has scored in yet are left out
 * instead of showing empty "—" cards.
 */
@Component({
  selector: 'app-community-stat-leaders',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './community-stat-leaders.component.html',
  styleUrls: ['./community-stat-leaders.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunityStatLeadersComponent {
  @Input() leader?: CommunityStanding;
  @Input() goals?: CommunityStanding;
  @Input() assists?: CommunityStanding;
  @Input() mvps?: CommunityStanding;
  @Input() cleanSheets?: CommunityStanding;

  get records(): StatRecord[] {
    const all: (StatRecord | null)[] = [
      this.record('communities.stat.goals', '⚽', this.goals, this.goals?.goals),
      this.record('communities.stat.assists', '🎯', this.assists, this.assists?.assists),
      this.record('MVP', '⭐', this.mvps, this.mvps?.mvps),
      this.record('communities.stat.cleanSheets', '🧤', this.cleanSheets, this.cleanSheets?.cleanSheets)
    ];
    return all.filter((r): r is StatRecord => r !== null);
  }

  /** "4V 0E 2D · Jogos: 6" (placeholders use the app's {{name}} syntax). */
  leaderRecord(s: CommunityStanding): string {
    return t('{{w}}V {{d}}E {{l}}D', { w: s.wins, d: s.draws, l: s.losses })
      + ' · ' + t('Jogos: {{n}}', { n: s.games });
  }

  nameOf(s: CommunityStanding): string {
    return s.fullName?.trim() || s.username || '—';
  }

  initial(s: CommunityStanding): string {
    return this.nameOf(s).replace('@', '').charAt(0).toUpperCase();
  }

  private record(label: string, icon: string, who: CommunityStanding | undefined, value: number | undefined): StatRecord | null {
    return who && value && value > 0 ? { label, icon, who, value } : null;
  }
}
