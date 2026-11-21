import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, Optional, SimpleChanges } from '@angular/core';
import { Subscription, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { ChatPollKind, ChatPollResult, ChatPollService } from '../../services/chat-poll.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { ChatPollContent } from './poll-message';

/**
 * Poll card inside a group chat. Tap an option to vote, tap it again to
 * remove the vote. Counts come from the server; names never do.
 */
@Component({
  selector: 'app-inbox-poll-card',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="poll-card" role="group" [attr.aria-label]="('chat.poll.title' | t) + ': ' + poll.question">
      <span class="poll-kind">📊 {{ 'chat.poll.title' | t }}</span>
      <strong class="poll-question">{{ poll.question }}</strong>
      <ul class="poll-options">
        @for (option of poll.options; track $index) {
          <li>
            <button type="button" class="poll-option" [class.poll-mine]="result?.mine === $index"
              [disabled]="busy || messageId <= 0" [attr.aria-pressed]="result?.mine === $index"
              (click)="choose($index)">
              <span class="poll-bar" [style.width.%]="percent($index)"></span>
              <span class="poll-label">@if (result?.mine === $index) {✓ }{{ option }}</span>
              <span class="poll-count">{{ count($index) }}</span>
            </button>
          </li>
        }
      </ul>
      <span class="poll-meta">
        @if (error) { <span role="alert">{{ 'chat.poll.error' | t }}</span> }
        @else { {{ 'chat.poll.votes' | t:{count: result?.total ?? 0} }} · {{ (result?.mine == null ? 'chat.poll.tapToVote' : 'chat.poll.tapToChange') | t }} }
      </span>
    </div>`,
  styles: [`
    .poll-card{display:flex;flex-direction:column;gap:.45rem;min-width:min(16rem,70vw);max-width:22rem}
    .poll-kind{font-size:.72rem;font-weight:700;letter-spacing:.02em;opacity:.75}
    .poll-question{font-size:.95rem;line-height:1.3}
    .poll-options{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.35rem}
    .poll-option{position:relative;overflow:hidden;width:100%;display:flex;justify-content:space-between;gap:.5rem;
      align-items:center;padding:.55rem .7rem;border-radius:.6rem;border:1px solid rgba(127,127,127,.35);
      background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:2.6rem}
    .poll-option:disabled{cursor:default;opacity:.8}
    .poll-option.poll-mine{border-color:currentColor;font-weight:600}
    .poll-bar{position:absolute;inset:0 auto 0 0;background:rgba(34,197,94,.18);transition:width .25s ease;z-index:0}
    .poll-label,.poll-count{position:relative;z-index:1}
    .poll-count{font-variant-numeric:tabular-nums;opacity:.8}
    .poll-meta{font-size:.75rem;opacity:.75}
  `]
})
export class InboxPollCardComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) poll!: ChatPollContent;
  @Input({ required: true }) kind!: ChatPollKind;
  @Input({ required: true }) conversationId!: string;
  @Input({ required: true }) messageId!: number;

  result: ChatPollResult | null = null;
  busy = false;
  error = false;
  private load?: Subscription;
  private realtime?: Subscription;

  constructor(private readonly polls: ChatPollService, private readonly cdr: ChangeDetectorRef,
              @Optional() private readonly live: DirectChatRealtimeService | null) {}

  ngOnInit(): void {
    this.realtime = this.live?.polls$.subscribe(event => {
      if (event.kind !== this.kind || event.conversationId !== this.conversationId
          || event.messageId !== this.messageId || event.counts.length !== this.poll.options.length) return;
      this.result = { messageId: this.messageId, counts: event.counts, total: event.total, mine: this.result?.mine ?? null };
      this.cdr.markForCheck();
    });
  }

  private loadedKey = '';

  ngOnChanges(_changes: SimpleChanges): void {
    // The parent re-parses the message text on every check, so `poll` is a new
    // object each time. Only a different message means new results to load.
    const key = this.kind + ':' + this.conversationId + ':' + this.messageId;
    if (key === this.loadedKey) return;
    this.loadedKey = key;
    this.load?.unsubscribe();
    this.result = null;
    this.error = false;
    if (!this.messageId || this.messageId <= 0) return;
    this.load = this.polls.results(this.kind, this.conversationId, [this.messageId]).pipe(timeout(10000)).subscribe({
      next: rows => { this.result = rows.find(row => row.messageId === this.messageId) ?? null; this.cdr.markForCheck(); },
      error: () => { this.error = true; this.cdr.markForCheck(); }
    });
  }

  ngOnDestroy(): void { this.load?.unsubscribe(); this.realtime?.unsubscribe(); }

  count(index: number): number { return this.result?.counts?.[index] ?? 0; }
  percent(index: number): number {
    const total = this.result?.total ?? 0;
    return total > 0 ? Math.round(this.count(index) * 100 / total) : 0;
  }

  choose(index: number): void {
    if (this.busy || this.messageId <= 0) return;
    this.busy = true;
    this.error = false;
    const option = this.result?.mine === index ? null : index;
    this.polls.vote(this.kind, this.conversationId, this.messageId, option).pipe(timeout(10000)).subscribe({
      next: result => { this.result = result; this.busy = false; this.cdr.markForCheck(); },
      error: () => { this.busy = false; this.error = true; this.cdr.markForCheck(); }
    });
  }
}
