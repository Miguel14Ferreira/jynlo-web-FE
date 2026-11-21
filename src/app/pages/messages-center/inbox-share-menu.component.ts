import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';
@Component({
  selector: 'div[app-inbox-share-menu]', standalone: true, imports: [TranslatePipe],
  templateUrl: './inbox-share-menu.component.html',
  styleUrls: ['./inbox-share-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InboxShareMenuComponent {
  @Input() attachmentControlsReady = false;
  @Output() fileRequested = new EventEmitter<void>();
  @Output() shareRequested = new EventEmitter<void>();
  @Input() callUpAvailable = false;
  @Output() callUpRequested = new EventEmitter<void>();
}
