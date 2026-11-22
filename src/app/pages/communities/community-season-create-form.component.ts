import { SportNamePipe } from '../../i18n/sport-name.pipe';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/translate.pipe';

/** Season draft UI only. All authorization, validation and actual creation remain in CommunitiesComponent. */
@Component({
  selector: 'app-community-season-create-form',
  standalone: true,
  imports: [SportNamePipe, FormsModule, TranslatePipe],
  templateUrl: './community-season-create-form.component.html',
  styleUrls: ['./community-season-create-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunitySeasonCreateFormComponent {
  @Input() name = '';
  @Input() startsAt = '';
  @Input() sports: readonly string[] = [];
  @Input() sport = '';
  @Output() sportChange = new EventEmitter<string>();
  @Input() saving = false;
  @Output() nameChange = new EventEmitter<string>();
  @Output() startsAtChange = new EventEmitter<string>();
  @Output() createRequested = new EventEmitter<void>();
}
