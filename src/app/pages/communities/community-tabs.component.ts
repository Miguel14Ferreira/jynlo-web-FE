import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';

export type CommunityTabChoice =
  'home' | 'feed' | 'chat' | 'sessions' | 'tournaments' | 'ranking' | 'stats' | 'members';

/** Presentation-only community navigation. The parent retains all tab logic, data access and permissions. */
@Component({
  selector: 'app-community-tabs',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './community-tabs.component.html',
  styleUrls: ['./community-tabs.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommunityTabsComponent {
  @Input() activeTab: CommunityTabChoice = 'home';
  @Input() hasCompetitions = false;
  @Input() canBrowseHistoricalArchives = false;
  @Input() rankingsEnabled = false;
  @Output() tabRequested = new EventEmitter<CommunityTabChoice>();

  /**
   * Arrow keys move focus between the visible navigation buttons without
   * switching sections unexpectedly. Enter/Space retain native button behavior.
   */
  onNavigationKeydown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const nav = event.currentTarget;
    if (!(nav instanceof HTMLElement) || !(event.target instanceof HTMLButtonElement)) return;
    const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)'));
    const current = buttons.indexOf(event.target);
    if (current < 0 || buttons.length === 0) return;
    event.preventDefault();
    const destination = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[destination].focus();
  }
}
