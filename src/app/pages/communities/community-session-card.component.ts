import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { SessionSummary } from '../model/session-summary';

/**
 * A read-only community session summary. The parent remains responsible for
 * session listing, enrollment, waitlists, access and date formatting.
 */
@Component({
  selector: 'app-community-session-card',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './community-session-card.component.html',
  styleUrls: ['./community-session-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunitySessionCardComponent {
  @Input() session!: SessionSummary;
  @Input() formattedDate = '';
  @Input() seasonGame = false;
}
