import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { tournamentSportCapabilities, TournamentCreationModel } from './community-tournament-capabilities';

/** Explains real format support for the selected sport; does not invent a score engine. */
@Component({
  selector: 'app-competition-guide',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './competition-guide.component.html',
  styleUrls: ['./competition-guide.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CompetitionGuideComponent implements OnChanges {
  @Input() canManage = false;
  @Input() individualEnabled = true;
  @Input() teamEnabled = true;
  @Input() sport = '';
  @Output() individualSelected = new EventEmitter<string>();
  @Output() teamSelected = new EventEmitter<string>();
  @Output() closeRequested = new EventEmitter<void>();
  readonly sports = SPORTS_CATALOG;
  selectedSport = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sport'] || !this.selectedSport) {
      this.selectedSport = this.sports.includes(this.sport) ? this.sport : this.sports[0];
    }
  }

  get capabilities() { return tournamentSportCapabilities(this.selectedSport); }
  get individualSupported(): boolean {
    return this.individualEnabled && this.capabilities.individual !== 'UNAVAILABLE';
  }
  get teamSupported(): boolean {
    return this.teamEnabled && this.capabilities.team !== 'UNAVAILABLE';
  }
  formatKey(model: TournamentCreationModel): string {
    return 'communities.competitionGuide.model.' + model;
  }
}
