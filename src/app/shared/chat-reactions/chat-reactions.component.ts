import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { skip, Subscription } from 'rxjs';
import {
  CHAT_REACTION_EMOJIS, ChatReactionKind,
  ChatReactionStoreService, ChatReactionSummary, ChatReactionParticipant
} from '../../services/chat-reaction-store.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { ProfileQuickViewService } from '../../services/profile-quick-view.service';
import { Optional } from '@angular/core';

let reactionPickerSequence = 0;

/** Reusable compact emoji reactions; the store coalesces sibling messages into one GET. */
@Component({
  selector: 'app-chat-reactions',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  // The bubble can reserve room only when reaction badges exist.
  host: {
    '[class.has-reactions]': 'entries.length > 0',
    '[class.is-picker-open]': 'expanded',
    '[class.is-details-open]': 'detailsOpen'
  },
  template: `
    <div class="chat-reactions" (keydown.escape)="dismissPicker($event)" (focusout)="onFocusOut($event)">
      <div class="reaction-badges">
        @for (entry of entries; track entry.emoji) {
          <button type="button" class="reaction-count"
              [class.mine]="summary?.myEmoji === entry.emoji"
              [disabled]="store.isBusy(kind, conversationId, messageId)"
              [attr.aria-label]="summary?.myEmoji === entry.emoji && !disabled
                ? ('chat.removeReaction' | t) + ': ' + entry.emoji
                : ('chat.reactionDetails' | t) + ': ' + entry.emoji + ' · ' + entry.count"
              [attr.title]="summary?.myEmoji === entry.emoji && !disabled
                ? ('chat.removeReaction' | t) : ('chat.reactionDetails' | t)"
              [attr.aria-expanded]="summary?.myEmoji !== entry.emoji || disabled ? detailsOpen : null"
              [attr.aria-controls]="summary?.myEmoji !== entry.emoji || disabled ? detailsId : null"
              (click)="onBadgeClick(entry.emoji, $event)">
            {{ entry.emoji }}
            @if (entry.count > 1) { <span>{{ entry.count }}</span> }
          </button>
        }
        @if (summary?.myEmoji && !disabled && entries.length > 0) {
          <button type="button" class="reaction-details-trigger"
              [attr.aria-label]="'chat.reactionDetails' | t"
              [attr.title]="'chat.reactionDetails' | t"
              [attr.aria-expanded]="detailsOpen" [attr.aria-controls]="detailsId"
              (click)="openDetails($event)">
            <span aria-hidden="true">ⓘ</span>
          </button>
        }
        @if (!disabled && entries.length > 0) {
          <button type="button" class="reaction-add-compact"
              [attr.aria-expanded]="expanded" [attr.aria-controls]="pickerId"
              [attr.aria-label]="'chat.changeReaction' | t"
              [disabled]="store.isBusy(kind, conversationId, messageId)"
              (click)="togglePicker($event)">
            <span aria-hidden="true">＋</span>
          </button>
        }
        @if (!disabled && entries.length === 0) {
          <button #reactionToggle type="button" class="reaction-open"
              [attr.aria-expanded]="expanded" [attr.aria-controls]="pickerId"
              [attr.aria-label]="'chat.react' | t"
              [disabled]="store.isBusy(kind, conversationId, messageId)"
              (click)="togglePicker($event)">
            <span aria-hidden="true">☺</span><span class="sr-only">{{ 'chat.react' | t }}</span>
          </button>
        }
      </div>
      @if (expanded && !disabled) {
        <div [id]="pickerId" class="reaction-picker" role="group" [attr.aria-label]="'chat.react' | t">
          @if (summary; as state) {
            <div class="reaction-choices">
              @for (emoji of emojis; track emoji) {
                <button type="button" class="reaction-choice" [attr.aria-label]="emoji"
                  [attr.aria-pressed]="state.myEmoji === emoji"
                  [attr.title]="state.myEmoji === emoji ? ('chat.removeReaction' | t) : ('chat.react' | t)"
                  [disabled]="store.isBusy(kind, conversationId, messageId)"
                  (click)="pick(emoji)">{{ emoji }}</button>
              }
            </div>
            @if (state.myEmoji) {
              <div class="reaction-picker-footer">
                <button type="button" class="reaction-remove"
                  [disabled]="store.isBusy(kind, conversationId, messageId)"
                  (click)="remove()"><span aria-hidden="true">×</span>{{ 'chat.removeReaction' | t }}</button>
              </div>
            }
          } @else if (store.hasFailed(kind, conversationId, messageId)) {
            <span class="reaction-load-error" role="alert">{{ 'chat.reactionError' | t }}</span>
            <button type="button" class="reaction-retry" (click)="retry()">{{ 'common.retry' | t }}</button>
          } @else {
            <span class="reaction-loading" role="status">{{ 'chat.shareLoading' | t }}</span>
          }
        </div>
      }
      @if (detailsOpen) {
        <div class="reaction-details-backdrop" (click)="closeDetails()">
          <section [id]="detailsId" class="reaction-details-dialog" role="dialog" aria-modal="true"
              [attr.aria-labelledby]="detailsTitleId" (click)="$event.stopPropagation()"
              (keydown)="onDetailsKeydown($event)" tabindex="-1">
            <header class="reaction-details-header">
              <div class="reaction-details-heading">
                <h3 [id]="detailsTitleId">{{ totalCount }} {{ (totalCount === 1 ? 'chat.oneReaction' : 'chat.manyReactions') | t }}</h3>
                <span class="reaction-details-subtitle">{{ 'chat.reactionPeople' | t }}</span>
              </div>
              <div class="reaction-details-actions">
                @if (!disabled) {
                  <button type="button" class="reaction-details-add"
                      [attr.aria-label]="'chat.changeReaction' | t"
                      (click)="openPickerFromDetails()">☺+</button>
                }
                <button #detailsClose type="button" class="reaction-details-close"
                    [attr.aria-label]="'chat.closeReactions' | t"
                    (click)="closeDetails()">×</button>
              </div>
            </header>
            @if (detailsPickerOpen) {
              <div class="reaction-details-chooser" role="group" [attr.aria-label]="'chat.react' | t">
                <div class="reaction-choices">
                  @for (emoji of emojis; track emoji) {
                    <button #reactionChoice type="button" class="reaction-choice"
                        [attr.aria-label]="emoji" [attr.aria-pressed]="summary?.myEmoji === emoji"
                        [attr.title]="summary?.myEmoji === emoji ? ('chat.removeReaction' | t) : ('chat.react' | t)"
                        [disabled]="store.isBusy(kind, conversationId, messageId)"
                        (click)="pick(emoji)">{{ emoji }}</button>
                  }
                </div>
              </div>
            }
            <div class="reaction-details-filters" role="group" [attr.aria-label]="'chat.reactionFilter' | t">
              <button type="button" class="reaction-filter" [class.active]="!detailFilter"
                  [attr.aria-pressed]="!detailFilter"
                  (click)="detailFilter = null">{{ 'chat.allReactions' | t }}</button>
              @for (entry of entries; track entry.emoji) {
                <button type="button" class="reaction-filter"
                    [class.active]="detailFilter === entry.emoji"
                    [attr.aria-pressed]="detailFilter === entry.emoji"
                    (click)="detailFilter = entry.emoji">
                  {{ entry.emoji }} @if (entry.count > 1) { <span>{{ entry.count }}</span> }
                </button>
              }
            </div>
            <div class="reaction-details-list">
              @if (detailsLoading) {
                <p role="status" class="reaction-details-state">{{ 'chat.shareLoading' | t }}</p>
              } @else if (detailsError) {
                <div class="reaction-details-state" role="alert">
                  <p>{{ 'chat.reactionPeopleError' | t }}</p>
                  <button type="button" class="reaction-retry" (click)="loadDetails()">{{ 'common.retry' | t }}</button>
                </div>
              } @else {
                @for (person of filteredParticipants; track person.username) {
                  <div class="reaction-person">
                    <button type="button" class="reaction-person-contact"
                      (click)="openParticipantProfile(person.username)"
                      [attr.aria-label]="('chat.viewProfile' | t) + ': ' + person.displayName">
                    <span class="reaction-avatar">
                      {{ person.displayName.slice(0,1).toUpperCase() }}
                      @if (person.profilePicUrl && !brokenAvatars.has(person.username)) {
                        <img [src]="person.profilePicUrl" alt="" loading="lazy"
                          (error)="brokenAvatars.add(person.username)" />
                      }
                    </span>
                    <div class="reaction-person-name">
                      <strong>{{ person.mine ? ('chat.you' | t) : person.displayName }}</strong>
                      @if (person.mine) { <small>{{ person.displayName }}</small> }
                    </div>
                    </button>
                    <span class="reaction-person-emoji">{{ person.emoji }}</span>
                  </div>
                } @empty {
                  <p class="reaction-details-state">{{ 'chat.noReactionsHere' | t }}</p>
                }
              }
            </div>
            @if (summary?.myEmoji && !disabled) {
              <footer class="reaction-details-footer">
                <button type="button" class="reaction-details-remove"
                    [disabled]="store.isBusy(kind, conversationId, messageId)"
                    (click)="remove()">{{ 'chat.removeReaction' | t }}</button>
              </footer>
            }
          </section>
        </div>
      }
      @if (error) {
        <small role="alert" class="reaction-error">{{ 'chat.reactionError' | t }}</small>
      }
    </div>
  `,
  styles: [`
    :host {display:block;min-width:0;}
    .chat-reactions {display:flex;flex-direction:column;align-items:flex-start;
      gap:7px;width:max-content;max-width:100%;font:inherit;}
    :host(.own-reaction) .chat-reactions {align-items:flex-end;}
    .reaction-badges {display:flex;flex-wrap:wrap;align-items:center;gap:5px;}
    button {font:inherit;cursor:pointer;}
    .reaction-count {display:inline-flex;align-items:center;gap:4px;white-space:nowrap;
      min-width:29px;min-height:27px;padding:3px 8px;border-radius:999px;
      background:#1b424a;color:#f1fffc;border:1px solid #5fa99a;
      font-size:.79rem;box-shadow:0 2px 10px rgba(0,12,19,.32);}
    .reaction-count.mine {background:#245d55;border-color:#69eac5;}
    .reaction-details-trigger {display:grid;place-items:center;
      width:25px;height:25px;padding:0;border-radius:50%;border:1px solid #467b77;
      background:#15313a;color:#bcdad4;font-size:.82rem;
      box-shadow:0 2px 8px rgba(0,12,19,.18);}
    .reaction-details-trigger:hover {background:#24534c;color:#f1fffc;}
    .reaction-add-compact{display:grid;place-items:center;width:27px;height:27px;padding:0;
      border-radius:999px;border:1px solid #4b8f86;background:#153e46;
      color:#a8f9e4;font-size:1rem;font-weight:850;line-height:1;
      opacity:.85;transition:opacity .15s,background .15s,transform .15s}
    .reaction-add-compact:hover,.reaction-add-compact:focus-visible{
      opacity:1;background:#226055;transform:translateY(-1px);outline:2px solid #7cebd8}
    .reaction-add-compact:disabled{opacity:.45;cursor:wait}
    .reaction-open {display:grid;place-items:center;width:29px;height:29px;
      border:1px solid #467b77;border-radius:50%;background:#173c46;
      color:#daf9ed;font-size:.92rem;}
    .reaction-picker {position:relative;z-index:1;display:flex;
      flex-direction:column;gap:5px;width:max-content;max-width:100%;
      padding:6px;border:1px solid #487d7b;border-radius:15px;
      background:#183a46;box-shadow:0 5px 18px rgba(0,10,20,.26);}
    .reaction-choices {display:grid;grid-template-columns:repeat(6,36px);
      gap:3px;max-width:100%;}
    .reaction-choice {display:grid;place-items:center;width:36px;height:36px;
      padding:0;border:0;border-radius:10px;background:transparent;font-size:1.13rem;line-height:1;}
    .reaction-choice[aria-pressed="true"] {background:#276a5d;}
    .reaction-choice:hover {background:#316b65;}
    .reaction-picker-footer {display:flex;justify-content:flex-end;align-items:center;
      border-top:1px solid rgba(146,217,205,.16);padding-top:4px;}
    .reaction-remove {display:inline-flex;align-items:center;gap:5px;
      min-height:29px;padding:3px 8px;border:0;border-radius:8px;
      background:transparent;color:#cce8e3;font-size:.72rem;line-height:1.2;}
    .reaction-remove span {font-size:1.15rem;line-height:1;}
    .reaction-remove:hover {background:#244e56;color:#fff;}
    .reaction-details-backdrop {position:fixed;inset:0;z-index:9000;
      display:grid;place-items:center;padding:16px;
      background:rgba(0,13,22,.78);backdrop-filter:blur(5px);}
    .reaction-details-dialog {width:min(100%,420px);max-height:min(78dvh,550px);
      min-height:210px;display:flex;flex-direction:column;overflow:hidden;
      background:#182d34;color:#f1faf7;border:1px solid #456c70;
      border-radius:20px;box-shadow:0 24px 65px rgba(0,0,0,.52);}
    .reaction-details-header {display:flex;align-items:center;justify-content:space-between;
      gap:10px;padding:18px 18px 11px;}
    .reaction-details-heading h3 {margin:0;font-size:1rem;font-weight:750;}
    .reaction-details-subtitle {display:block;margin-top:4px;color:#a3bec1;font-size:.72rem;}
    .reaction-details-actions {display:flex;align-items:center;gap:8px;}
    .reaction-details-actions button {display:grid;place-items:center;
      width:36px;height:36px;background:#203f47;color:#d9fff3;
      border:1px solid #4e7576;border-radius:50%;}
    .reaction-details-actions .reaction-details-close {font-size:1.45rem;line-height:1;}
    .reaction-details-chooser {display:flex;justify-content:center;padding:8px 14px 13px;
      border-bottom:1px solid rgba(133,173,172,.16);}
    .reaction-details-filters {display:flex;align-items:center;gap:7px;
      overflow-x:auto;flex:0 0 auto;padding:3px 18px 13px;
      scrollbar-width:thin;border-bottom:1px solid #344c50;}
    .reaction-filter {display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;
      min-height:32px;padding:5px 11px;border-radius:999px;
      color:#d8ebe6;background:#1a3239;border:1px solid #436267;}
    .reaction-filter.active {background:#265951;border-color:#61d6b8;color:#fff;}
    .reaction-details-list {min-height:84px;overflow:auto;padding:5px 13px;
      flex:1;scrollbar-width:thin;}
    .reaction-person {display:flex;align-items:center;gap:12px;
      min-height:62px;padding:9px 5px;border-bottom:1px solid rgba(133,173,172,.11);}
    .reaction-person:last-child {border-bottom:0;}
    .reaction-person-contact{display:flex;flex:1;min-width:0;align-items:center;gap:12px;
      padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;}
    .reaction-person-contact:hover strong{text-decoration:underline;}
    .reaction-person-contact:focus-visible{outline:2px solid #9cffdb;outline-offset:3px;border-radius:8px}
    .reaction-avatar {position:relative;display:grid;place-items:center;flex:0 0 42px;
      width:42px;height:42px;border-radius:50%;background:#275852;
      color:#dbfff4;font-size:1.13rem;font-weight:700;overflow:hidden;}
    .reaction-avatar img {position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
    .reaction-person-name {display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;}
    .reaction-person-name strong {font-size:.85rem;overflow-wrap:anywhere;}
    .reaction-person-name small {color:#9dbbb9;font-size:.7rem;}
    .reaction-person-emoji {font-size:1.4rem;padding:4px 8px;}
    .reaction-details-state {margin:12px;font-size:.8rem;color:#c8e4e0;}
    .reaction-details-footer {display:flex;justify-content:flex-end;
      padding:10px 16px;border-top:1px solid #344c50;}
    .reaction-details-remove {border:1px solid #7b6267;border-radius:10px;
      background:#49343c;color:#fff3ef;padding:9px 13px;font-size:.8rem;}
    .reaction-details-remove:hover {background:#69434a;}
    .reaction-retry {border:1px solid #628e8a;border-radius:9px;
      background:#25505a;color:#e5f7f4;padding:6px 9px;font-size:.75rem;}
    .reaction-loading,.reaction-load-error {color:#d6f8ee;font-size:.75rem;padding:5px;}
    button:focus-visible {outline:2px solid #61edce;outline-offset:2px;}
    button:disabled {opacity:.45;cursor:not-allowed;}
    .reaction-error {color:#ffd2cd;font-size:.75rem;width:100%;}
    .sr-only {position:absolute;width:1px;height:1px;padding:0;margin:-1px;
      overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}
    @media(max-width:380px) {
      .reaction-picker {padding:5px;}
      .reaction-choices {grid-template-columns:repeat(6,34px);gap:2px;}
      .reaction-choice {width:34px;height:36px;}
      .reaction-details-backdrop {padding:10px;}
      .reaction-details-header {padding:14px 13px 10px;}
      .reaction-details-filters {padding:4px 13px 12px;}
    }
  `]
})
export class ChatReactionsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() kind!: ChatReactionKind;
  @Input() conversationId!: string | number;
  @Input() messageId!: number;
  @Input() disabled = false;
  @ViewChild('reactionToggle') private reactionToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('detailsClose') private detailsClose?: ElementRef<HTMLButtonElement>;
  @ViewChild('reactionChoice') private reactionChoice?: ElementRef<HTMLButtonElement>;
  readonly emojis = CHAT_REACTION_EMOJIS;
  // Instance-local ID avoids duplicate aria-controls even for repeated messages.
  readonly pickerId = 'chat-reactions-' + ++reactionPickerSequence;
  expanded = false;
  detailsOpen = false;
  detailsPickerOpen = false;
  detailsLoading = false;
  detailsError = false;
  detailFilter: string | null = null;
  participants: ChatReactionParticipant[] = [];
  readonly brokenAvatars = new Set<string>();
  error = false;
  private detailsSubscription?: Subscription;
  private detailsTrigger?: HTMLElement;
  private watching?: { kind: ChatReactionKind; id: string | number; messageId: number };
  private reactionUpdates?: Subscription;
  private pickerTrigger?: HTMLElement;

  constructor(
    public readonly store: ChatReactionStoreService,
    private readonly cdr: ChangeDetectorRef,
    @Optional() private readonly profilePeek: ProfileQuickViewService | null = null
  ) {}

  openParticipantProfile(username:string):void {
    this.closeDetails(false);
    this.profilePeek?.open(username);
  }

  ngOnInit(): void {
    // The store uses ordinary mutable Maps, not Angular signals. Without a
    // notification, the host can know that counts exist while its @for template
    // stays stuck displaying only the empty reaction button (Chromium QA).
    // Render immediately on each HTTP / WebSocket state change. The first
    // BehaviorSubject emission happens during ngOnInit and is ignored to avoid
    // re-entrant initial template rendering.
    this.reactionUpdates = this.store.changed.pipe(skip(1))
      .subscribe(() => this.cdr.detectChanges());
    this.watchCurrent();
  }
  ngOnChanges(): void { this.watchCurrent(); }
  ngOnDestroy(): void {
    this.detailsSubscription?.unsubscribe();
    this.reactionUpdates?.unsubscribe();
    this.stopWatching();
  }

  get summary(): ChatReactionSummary | undefined {
    return this.store.get(this.kind, this.conversationId, this.messageId);
  }
  get entries(): { emoji: string; count: number }[] {
    return this.emojis.filter(emoji => (this.summary?.counts?.[emoji] || 0) > 0)
      .map(emoji => ({ emoji, count: this.summary?.counts[emoji] || 0 }));
  }

  get totalCount(): number {
    return this.entries.reduce((sum, entry) => sum + entry.count, 0);
  }
  get filteredParticipants(): ChatReactionParticipant[] {
    return this.detailFilter
      ? this.participants.filter(person => person.emoji === this.detailFilter)
      : this.participants;
  }
  readonly detailsId = this.pickerId + '-details';
  readonly detailsTitleId = this.pickerId + '-title';

  /** Tap your own displayed emoji to remove it directly; other people's
   * emojis open the list. The separate ⓘ button always opens the list for
   * messages with your own reaction, so that feature stays reachable. */
  onBadgeClick(emoji: string, event: Event): void {
    if (!this.disabled && this.summary?.myEmoji === emoji) {
      this.remove();
      return;
    }
    this.openDetails(event);
  }

  openDetails(event?: Event): void {
    if (this.totalCount === 0 || this.detailsOpen) return;
    this.expanded = false;
    this.detailsTrigger = (event?.currentTarget as HTMLElement | null) ?? undefined;
    this.detailsOpen = true;
    this.detailFilter = null;
    this.loadDetails();
    this.cdr.detectChanges();
    this.detailsClose?.nativeElement.focus({ preventScroll: true });
  }

  loadDetails(): void {
    this.detailsSubscription?.unsubscribe();
    this.detailsLoading = true;
    this.detailsError = false;
    this.participants = [];
    this.detailsSubscription = this.store.participants(this.kind, this.conversationId, this.messageId)
      .subscribe({
        next: people => {
          this.participants = people;
          this.detailsLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.detailsLoading = false;
          this.detailsError = true;
          this.cdr.detectChanges();
        }
      });
  }

  closeDetails(restoreFocus = true): void {
    this.detailsSubscription?.unsubscribe();
    this.detailsSubscription = undefined;
    this.detailsOpen = false;
    this.detailsPickerOpen = false;
    this.detailsLoading = false;
    this.detailsError = false;
    this.detailFilter = null;
    if (restoreFocus) {
      this.cdr.detectChanges();
      this.detailsTrigger?.focus({ preventScroll: true });
    }
  }

  openPickerFromDetails(): void {
    // Keep the people dialog mounted while choosing another emoji. Removing
    // its focused button and opening an unrelated picker caused focusout to
    // close that picker immediately in real Chromium.
    this.detailsPickerOpen = !this.detailsPickerOpen;
    this.cdr.detectChanges();
    if (this.detailsPickerOpen) this.reactionChoice?.nativeElement.focus({ preventScroll: true });
    else this.detailsClose?.nativeElement.focus({ preventScroll: true });
  }

  onDetailsKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget as HTMLElement;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!buttons.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  /** Close by Escape and return keyboard users to the same action. */
  dismissPicker(event: Event): void {
    if (this.detailsOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.closeDetails();
      return;
    }
    if (!this.expanded) return;
    event.preventDefault();
    event.stopPropagation();
    this.expanded = false;
    (this.pickerTrigger ?? this.reactionToggle?.nativeElement)?.focus({ preventScroll: true });
  }

  /** Tab or click outside leaves no lingering open picker in another chat. */
  onFocusOut(event: FocusEvent): void {
    if (!this.expanded) return;
    const wrapper = event.currentTarget as HTMLElement | null;
    const next = event.relatedTarget as Node | null;
    if (!wrapper || !next || !wrapper.contains(next)) this.expanded = false;
  }

  togglePicker(event?: Event): void {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.pickerTrigger = (event?.currentTarget as HTMLElement | null)
        ?? this.reactionToggle?.nativeElement;
    }
    if (this.expanded && this.store.hasFailed(this.kind, this.conversationId, this.messageId)) {
      this.retry();
    }
  }

  retry(): void {
    this.store.retry(this.kind, this.conversationId, this.messageId);
  }

  pick(emoji: string): void {
    if (this.disabled || !this.summary
        || this.store.isBusy(this.kind, this.conversationId, this.messageId)) return;
    // WhatsApp-style toggle: choosing the same emoji again removes ONLY my
    // reaction (DELETE); choosing a different one replaces it (PUT).
    // The authoritative store already implements both operations safely.
    this.error = false;
    this.closeDetails(false);
    this.expanded = false;
    this.store.toggle(this.kind, this.conversationId, this.messageId, emoji,
      () => { this.error = true; });
  }

  remove(): void {
    const selected = this.summary?.myEmoji;
    if (this.disabled || !selected) return;
    this.error = false;
    this.closeDetails(false);
    this.expanded = false;
    this.store.toggle(this.kind, this.conversationId, this.messageId, selected,
      () => { this.error = true; });
  }

  private watchCurrent(): void {
    if (!this.kind || this.conversationId === undefined || !this.messageId) return;
    if (this.watching?.kind === this.kind
        && String(this.watching.id).toLowerCase() === String(this.conversationId).toLowerCase()
        && this.watching.messageId === this.messageId) return;
    this.closeDetails(false);
    this.stopWatching();
    this.watching = { kind: this.kind, id: this.conversationId, messageId: this.messageId };
    this.store.watch(this.kind, this.conversationId, this.messageId);
    this.expanded = false;
    this.pickerTrigger = undefined;
    this.error = false;
  }

  private stopWatching(): void {
    if (this.watching) {
      this.store.unwatch(this.watching.kind, this.watching.id, this.watching.messageId);
      this.watching = undefined;
    }
  }
}
