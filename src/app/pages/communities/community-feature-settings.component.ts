import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/translate.pipe';

export interface CommunityFeatureDraft {
  rankingsEnabled: boolean;
  individualTournamentsEnabled: boolean;
  teamTournamentsEnabled: boolean;
  /** "Destaques do mês" and the "Jogador do mês" vote (saved through its own endpoint). */
  monthHighlightsEnabled?: boolean;
}

/** Only displays feature configuration; CommunitiesComponent retains authorization and persistence. */
@Component({
  selector: 'app-community-feature-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './community-feature-settings.component.html',
  styleUrls: ['./community-feature-settings.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunityFeatureSettingsComponent {
  @Input() editing = false;
  @Input() saving = false;
  @Input() feedback = '';
  @Input() error = '';
  @Input() draft: CommunityFeatureDraft = {
    rankingsEnabled: false,
    individualTournamentsEnabled: false,
    teamTournamentsEnabled: false
  };

  @Output() draftChange = new EventEmitter<CommunityFeatureDraft>();
  @Output() editRequested = new EventEmitter<void>();
  @Output() saveRequested = new EventEmitter<void>();
  @Output() cancelRequested = new EventEmitter<void>();

  setFeature(key: keyof CommunityFeatureDraft, enabled: boolean): void {
    if (this.saving || !this.editing) return;
    this.draftChange.emit({ ...this.draft, [key]: enabled });
  }
}
