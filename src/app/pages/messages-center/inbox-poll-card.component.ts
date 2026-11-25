import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, Optional, SimpleChanges } from '@angular/core';
import { Subscription, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { ChatPollKind, ChatPollResult, ChatPollService, ChatPollVoter } from '../../services/chat-poll.service';
import { environment } from 'src/environment/environment';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { ChatPollContent } from './poll-message';

/**
 * Poll card inside a group chat (WhatsApp style). Tap an option to vote, tap it again to
 * remove the vote. Shows who voted for each option (votes cast since 25 Nov 2026).
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
              <span class="poll-right">
                <span class="poll-faces" aria-hidden="true">
                  @for (v of voters($index).slice(0, 3); track v.username) {
                    <span class="poll-face" [title]="'@' + v.username">@if (photo(v); as src) { <img [src]="src" alt=""> } @else { {{ letter(v.username) }} }</span>
                  }
                </span>
                <span class="poll-count">{{ count($index) }}</span>
              </span>
            </button>
          </li>
        }
      </ul>
      @if (hasVoters()) {
        <button type="button" class="poll-see" (click)="showVotes = !showVotes" [attr.aria-expanded]="showVotes">
          {{ (showVotes ? 'Esconder votos' : 'Ver votos') | t }}</button>
        @if (showVotes) {
          <div class="poll-votes">
            @for (option of poll.options; track $index) {
              @if (voters($index).length) {
                <div class="poll-votes-row"><strong>{{ option }}</strong>
                  <span>@for (v of voters($index); track v.username; let last = $last) { &#64;{{ v.username }}@if (!last) {, } }</span></div>
              }
            }
          </div>
        }
      }
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
    .poll-right{position:relative;z-index:1;display:flex;align-items:center;gap:.35rem}
    .poll-faces{display:flex}
    .poll-face{width:1.35rem;height:1.35rem;border-radius:50%;margin-left:-.35rem;border:2px solid #0b2a38;background:#163f4d;color:#bff7e9;
      font-size:.62rem;font-weight:800;display:grid;place-items:center;overflow:hidden}
    .poll-face:first-child{margin-left:0}
    .poll-face img{width:100%;height:100%;object-fit:cover}
    .poll-see{align-self:center;border:0;background:transparent;color:#38e0c0;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;padding:.3rem .6rem}
    .poll-votes{display:grid;gap:.35rem;font-size:.78rem;padding:.4rem .2rem;border-top:1px solid rgba(127,127,127,.25)}
    .poll-votes-row{display:grid;gap:.1rem}
    .poll-votes-row span{opacity:.8}
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
      this.result = { messageId: this.messageId, counts: event.counts, total: event.total, mine: this.result?.mine ?? null,
        voters: event.voters ?? this.result?.voters };
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

  showVotes = false;
  count(index: number): number { return this.result?.counts?.[index] ?? 0; }
  voters(index: number): ChatPollVoter[] { return this.result?.voters?.[index] ?? []; }
  hasVoters(): boolean { return (this.result?.voters ?? []).some(list => list.length > 0); }
  letter(username: string): string { return (username.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase(); }
  photo(v: ChatPollVoter): string | null {
    const p = v.profilePicUrl;
    if (!p) return null;
    if (p.startsWith('http') || p.startsWith('data:')) return p;
    return environment.apiUrl + (p.startsWith('/') ? p : '/' + p);
  }
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
