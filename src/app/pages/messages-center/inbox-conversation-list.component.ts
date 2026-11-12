import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { InboxConversation, InboxKind } from './inbox.model';

/** All formatting and read/unread decisions are delegated to the existing inbox page. */
export interface InboxListFormatters {
  date(value: string): string;
  time(value: string): string;
  kind(kind: InboxKind): string;
  preview(value: string): string;
  unread(conversation: InboxConversation): string;
}

/** Scrollable read-only conversation list with a single selection intention. */
@Component({
  selector: 'app-inbox-conversation-list',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './inbox-conversation-list.component.html',
  styleUrls: ['./inbox-conversation-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InboxConversationListComponent {
  /** A broken or removed image never hides the conversation's fallback icon. */
  readonly failedAvatars = new Set<string>();
  @Input() conversations: readonly InboxConversation[] = [];
  @Input() selectedKey: string | null = null;
  @Input({ required: true }) formatters!: InboxListFormatters;
  @Output() conversationSelected = new EventEmitter<InboxConversation>();
}
