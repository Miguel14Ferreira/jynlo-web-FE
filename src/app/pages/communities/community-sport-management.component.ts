import { SportNamePipe } from '../../i18n/sport-name.pipe';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Presentation-only community sports editor. Parent retains permissions, filtering and API writes. */
@Component({
  selector: 'app-community-sport-management',
  standalone: true,
  imports: [SportNamePipe, FormsModule],
  templateUrl: './community-sport-management.component.html',
  styleUrls: ['./community-sport-management.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunitySportManagementComponent {
  @Input() sports: readonly string[] = [];
  @Input() canManage = false;
  @Input() editing = false;
  @Input() saving = false;
  @Input() message = '';
  @Input() draft: readonly string[] = [];
  @Input() search = '';
  @Input() suggestions: readonly string[] = [];
  @Output() editRequested = new EventEmitter<void>();
  @Output() removeRequested = new EventEmitter<string>();
  @Output() addRequested = new EventEmitter<string>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() saveRequested = new EventEmitter<void>();
  @Output() cancelRequested = new EventEmitter<void>();
}
