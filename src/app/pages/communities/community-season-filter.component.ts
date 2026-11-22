import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommunitySeason } from '../model/community-group';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

/** Shared season filter for sessions, rankings and player statistics; no season selection side effects. */
@Component({
  selector: 'app-community-season-filter',
  standalone: true,
  imports: [SportNamePipe, FormsModule, TranslatePipe],
  templateUrl: './community-season-filter.component.html',
  styleUrls: ['./community-season-filter.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunitySeasonFilterComponent {
  @Input() selectedSeasonId: number | null = null;
  @Input() seasons: readonly CommunitySeason[] = [];
  @Output() selectionChange = new EventEmitter<number | null>();
}
