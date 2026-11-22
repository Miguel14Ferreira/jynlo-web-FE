import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommunitySwitchComponent } from './community-switch.component';
import { formatForSport } from './community-round-sport';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

/** Display and draft editing only: permission, persistence and official point rules stay in the page. */
@Component({
  selector: 'app-community-competition-settings',
  standalone: true,
  imports: [SportNamePipe, FormsModule, TranslatePipe, CommunitySwitchComponent],
  templateUrl: './community-competition-settings.component.html',
  styleUrls: ['./community-competition-settings.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunityCompetitionSettingsComponent {
  @Input() sports: readonly string[] = [];
  @Input() enabled = false;
  @Input() winPoints = 3;
  @Input() drawPoints = 1;
  @Input() lossPoints = 0;
  @Input() saving = false;
  @Output() enabledChange = new EventEmitter<boolean>();
  @Output() winPointsChange = new EventEmitter<number>();
  @Output() drawPointsChange = new EventEmitter<number>();
  @Output() lossPointsChange = new EventEmitter<number>();
  @Output() saveRequested = new EventEmitter<void>();

  /** Generic W/D/L applies only to head-to-head sports, never to a race by default. */
  get usesMatchPoints(): boolean {
    return this.classifiedSports.length === 0 || this.matchPointSports.length > 0;
  }

  /** Show which selected disciplines use match points in mixed-sport communities. */
  get matchPointSports(): string[] {
    return this.classifiedSports.filter(item => item.family === 'team' || item.family === 'duel')
      .map(item => item.sport.trim());
  }

  /** Every selected sport has an explicit format; no football default for others. */
  get classifiedSports(): { sport: string; family: ReturnType<typeof formatForSport> }[] {
    const unique = new Set<string>();
    return this.sports.filter(sport => {
      const key = sport.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (!key || unique.has(key)) return false;
      unique.add(key);
      return true;
    }).map(sport => ({ sport, family: formatForSport(sport) }));
  }

  classificationHeadingKey(sport: string): string {
    return 'communities.tournaments.classificationUi.' + formatForSport(sport) + '.heading';
  }

  classificationDescriptionKey(sport: string): string {
    const family = formatForSport(sport);
    return family === 'race' ? 'communities.race.metricsEntryHint'
      : 'communities.tournaments.classificationUi.' + family + '.detail';
  }
}
