import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommunityRaceStandingGroup } from '../model/community-group';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

/** API-backed, sport-specific statistics. Never infer football metrics or race results. */
@Component({
  selector: 'app-community-specialized-stats',
  standalone: true,
  imports: [SportNamePipe, TranslatePipe],
  templateUrl: './community-specialized-stats.component.html',
  styleUrls: ['./community-specialized-stats.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunitySpecializedStatsComponent {
  @Input() raceGroups: readonly CommunityRaceStandingGroup[] = [];
  @Input() unsupportedSports: readonly string[] = [];
}
