import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { Subscription, TimeoutError, forkJoin, finalize, retry, timeout } from 'rxjs';

import { DirectChatInfo, DirectChatMessage } from '../model/direct-chat';
import { DirectChatService } from '../../services/direct-chat.service';
import { CommunityService } from '../../services/community.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { ChatTypingTracker } from '../../services/chat-typing-tracker';
import { chatContinuesGroup, chatDaySeparator } from '../../shared/chat-thread-presentation';
import { ChatReadSyncService } from '../../services/chat-read-sync.service';
import { readPastedChatImage } from '../../shared/chat-clipboard-image';

@Component({
  selector: 'app-direct-chat',
  templateUrl: './direct-chat.component.html',
  styleUrls: ['./direct-chat.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class DirectChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageList') messageList?: ElementRef<HTMLElement>;
  @ViewChild('composerTextarea') composerTextarea?: ElementRef<HTMLTextAreaElement>;
  // Search stays inside the authorized conversation already loaded in memory.
  searchOpen = false;
  searchQuery = '';
  searchMatchIndex = 0;
  private pendingSearchScrollId: number | null = null;
  private pendingSearchFocus = false;
  searchError = '';

  get searchMatches(): DirectChatMessage[] {
    const term = this.searchQuery.trim().toLocaleLowerCase();
    if (!term) return [];
    return this.messages.filter(message =>
      [message.text, message.attachmentName, message.replyToText,
       ...(message.attachments || []).map(asset => asset.filename)]
        .some(value => typeof value === 'string' && value.toLocaleLowerCase().includes(term)));
  }

  toggleMessageSearch(): void {
    this.searchOpen = !this.searchOpen;
    this.searchError = '';
    if (!this.searchOpen) {
      this.searchQuery = '';
      this.pendingSearchScrollId = null;
      this.searchMatchIndex = 0;
    } else {
      this.pendingSearchFocus = true;
    }
  }

  onMessageSearchChange(): void {
    this.searchMatchIndex = 0;
    this.searchError = '';
    this.queueCurrentSearchResult();
  }

  navigateSearch(direction: -1 | 1): void {
    const matches = this.searchMatches;
    if (!matches.length) return;
    this.searchMatchIndex = (this.searchMatchIndex + direction + matches.length) % matches.length;
    this.queueCurrentSearchResult();
  }

  onMessageSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.navigateSearch(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.toggleMessageSearch();
    }
  }

  private queueCurrentSearchResult(): void {
    const matches = this.searchMatches;
    if (!matches.length) return;
    const selected = matches[Math.min(this.searchMatchIndex, matches.length - 1)];
    this.pendingSearchScrollId = selected.id;
  }

  isActiveSearchMatch(message: DirectChatMessage): boolean {
    const matches = this.searchMatches;
    return this.searchOpen && matches.length > 0
      && matches[Math.min(this.searchMatchIndex, matches.length - 1)] === message;
  }

  jumpToQuotedMessage(message: DirectChatMessage): void {
    if (!message.replyToMessageId) return;
    const previous = this.messages.find(item => item.id === message.replyToMessageId);
    if (!previous) {
      this.searchOpen = true;
      this.searchQuery = message.replyToText || '';
      this.onMessageSearchChange();
      this.searchError = 'A mensagem original pode estar no histórico anterior. Carrega mensagens antigas para a encontrar.';
      return;
    }
    this.searchOpen = true;
    this.searchQuery = message.replyToText || previous.text || '';
    this.onMessageSearchChange();
    const matches = this.searchMatches;
    const index = matches.findIndex(item => item.id === previous.id);
    if (index >= 0) {
      this.searchMatchIndex = index;
      this.queueCurrentSearchResult();
    } else {
      this.pendingSearchScrollId = previous.id;
    }
  }

  recipientUsername = '';
  currentUsername: string | null = null;
  messages: DirectChatMessage[] = [];
  chatInfo?: DirectChatInfo;

  loading = false;
  loadingOlder = false;
  hasOlderMessages = false;
  historyPage = 0;
  sending = false;
  friendshipActionLoading = false;
  errorMessage = '';
  actionError = '';
  actionSuccess = '';
  messageBody = '';
  attachmentReady = false;
  selectedAttachment: File | null = null;
  extraSelectedAttachments: File[] = [];
  get selectedFiles(): File[] {
    return [...(this.selectedAttachment ? [this.selectedAttachment] : []), ...this.extraSelectedAttachments];
  }
  readonly extraAttachmentPreviews = new Map<string, string>();
  readonly extraAttachmentLoading = new Set<string>();
  readonly attachmentPreviews = new Map<number, string>();
  readonly attachmentLoading = new Set<number>();
  private attachmentRequestVersion = 0;
  replyingTo: DirectChatMessage | null = null;
  showEmojiPicker = false;
  realtimeConnected = false;
  realtimeEverConnected = false;
  deliveryUncertain = false;
  deliveryChecking = false;
  private pendingDelivery?: { text: string; replyToMessageId: number | null; knownIds: Set<number>; startedAt: number };
  private scrollToBottomRequested = false;
  newMessagesPending = 0;
  private restoreScroll?: { top: number; height: number };

  readonly emojis = ['😀', '😂', '😊', '😍', '🥳', '😎', '😉', '👍', '👏', '🙌', '🔥', '⚽', '🏀', '🎾', '🏓', '💪', '❤️', '✅'];

  private readonly jwtHelper = new JwtHelperService();
  private readonly readSync = inject(ChatReadSyncService);
  private readonly dateTimeFormatter = new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
  private readonly realtimeSubscriptions = new Subscription();
  readonly typing: ChatTypingTracker;
  private initialRealtimeConnection = true;

  constructor(
    private route: ActivatedRoute,
    private chatService: DirectChatService,
    private communityService: CommunityService,
    private realtimeService: DirectChatRealtimeService
  ) {
    this.typing = new ChatTypingTracker(realtimeService);
  }

  ngOnInit(): void {
    this.currentUsername = this.readCurrentUsername();
    this.recipientUsername = this.resolveRecipient();

    if (!this.recipientUsername) {
      this.errorMessage = t('feedback.chat.invalid');
      return;
    }

    this.load();
    this.checkAttachmentAvailability();
    this.realtimeService.connect();

    this.realtimeSubscriptions.add(
      this.realtimeService.messages$.subscribe(message => {
        if (!this.belongsToCurrentConversation(message)) {
          return;
        }

        const alreadyPresent = message.id !== null
          && this.messages.some(existing => existing.id === message.id);

        if (!alreadyPresent) {
          const follow = this.isNearBottom() || this.isOwnMessage(message);
          this.messages = this.sorted([...this.messages, message]);
          if (follow) {
            this.newMessagesPending = 0;
            this.scrollToBottomRequested = true;
          } else {
            this.newMessagesPending++;
          }
        }
        if (this.deliveryUncertain && this.matchesPendingDelivery(message)) {
          this.confirmPendingDelivery();
        }
      })
    );

    this.realtimeSubscriptions.add(
      this.realtimeService.connected$.subscribe(connected => {
        this.realtimeConnected = connected;
        if (!connected) return;
        this.realtimeEverConnected = true;

        if (this.initialRealtimeConnection) {
          this.initialRealtimeConnection = false;
          return;
        }

        this.refreshMessages();
      })
    );
  }

  ngOnDestroy(): void {
    ++this.attachmentRequestVersion;
    for (const url of this.attachmentPreviews.values()) URL.revokeObjectURL(url);
    this.attachmentPreviews.clear();
    for (const url of this.extraAttachmentPreviews.values()) URL.revokeObjectURL(url);
    this.extraAttachmentPreviews.clear();
    this.typing.destroy();
    this.realtimeSubscriptions.unsubscribe();
  }

  ngAfterViewChecked(): void {
    const el = this.messageList?.nativeElement;
    if (this.pendingSearchFocus) {
      const input = document.getElementById('direct-chat-search-input') as HTMLInputElement | null;
      if (input) {
        input.focus({ preventScroll: true });
        this.pendingSearchFocus = false;
      }
    }
    if (!el) return;
    if (this.pendingSearchScrollId !== null) {
      const id = this.pendingSearchScrollId;
      const target = el.querySelector('[data-direct-message-id="' + id + '"]') as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'auto' });
        this.pendingSearchScrollId = null;
        this.restoreScroll = undefined;
        this.scrollToBottomRequested = false;
        return;
      }
    }
    if (this.restoreScroll) {
      el.scrollTop = this.restoreScroll.top + el.scrollHeight - this.restoreScroll.height;
      this.restoreScroll = undefined;
      return;
    }
    if (this.scrollToBottomRequested) {
      el.scrollTop = el.scrollHeight;
      this.scrollToBottomRequested = false;
      this.newMessagesPending = 0;
    }
    this.markVisibleMessagesRead();
  }

  @HostListener('window:scroll')
  @HostListener('window:focus')
  @HostListener('document:visibilitychange')
  onMessageLogScroll(): void {
    if (this.isNearBottom()) this.newMessagesPending = 0;
    this.markVisibleMessagesRead();
  }

  jumpToLatestMessages(): void {
    const log = this.messageList?.nativeElement;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
    this.newMessagesPending = 0;
    this.markVisibleMessagesRead();
  }

  private markVisibleMessagesRead(): void {
    if (this.loading || this.errorMessage || !this.chatInfo || !this.currentUsername
        || !this.recipientUsername || this.messages.length === 0) return;
    const highestId = this.messages.reduce((max, message) => Math.max(max, message.id || 0), 0);
    this.readSync.markVisible('direct', this.recipientUsername,
      highestId, this.messageList?.nativeElement);
  }

  private isNearBottom(): boolean {
    const el = this.messageList?.nativeElement;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  load(): void {
    if (!this.recipientUsername) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      messages: this.chatService.recentHistory(this.recipientUsername),
      info: this.chatService.info(this.recipientUsername)
    })
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: result => {
          // A WebSocket message can arrive before this HTTP request finishes.
          // Merge instead of overwriting it with a potentially older snapshot.
          this.messages = this.sorted([
            ...this.messages.filter(existing => !result.messages.content.some(incoming =>
              existing.id !== null && incoming.id === existing.id)),
            ...result.messages.content
          ]);
          this.chatInfo = result.info;
          this.historyPage = 0;
          this.hasOlderMessages = !result.messages.last;
          this.newMessagesPending = 0;
          this.scrollToBottomRequested = true;
        },
        error: error => {
          this.messages = [];
          this.errorMessage = this.errorFrom(error, t('feedback.chat.loadError'));
        }
      });
  }

  refreshMessages(): void {
    if (!this.recipientUsername) {
      return;
    }

    this.chatService.recentHistory(this.recipientUsername)
      .pipe(
        timeout(10_000),
        retry({ count: 1 })
      )
      .subscribe({
        next: page => {
          const follow = this.isNearBottom();
          this.messages = this.sorted([...this.messages.filter(message => !page.content.some(recent => recent.id === message.id)), ...page.content]);
          if (follow) {
            this.newMessagesPending = 0;
            this.scrollToBottomRequested = true;
          }
          const confirmed = this.messages.find(message => this.matchesPendingDelivery(message));
          if (confirmed) this.confirmPendingDelivery();
        }
      });
  }

  loadOlderMessages(): void {
    if (!this.recipientUsername || this.loadingOlder || !this.hasOlderMessages) {
      return;
    }

    this.loadingOlder = true;
    const el = this.messageList?.nativeElement;
    const before = el ? { top: el.scrollTop, height: el.scrollHeight } : undefined;
    const nextPage = this.historyPage + 1;
    this.chatService.recentHistory(this.recipientUsername, nextPage)
      .pipe(timeout(10_000), finalize(() => this.loadingOlder = false))
      .subscribe({
        next: page => {
          this.messages = this.sorted([...this.messages.filter(message => !page.content.some(older => older.id === message.id)), ...page.content]);
          this.historyPage = nextPage;
          this.hasOlderMessages = !page.last;
          if (before) this.restoreScroll = before;
          if (this.searchOpen && this.searchQuery.trim()) {
            const matches = this.searchMatches;
            if (matches.length) {
              this.searchMatchIndex = Math.min(this.searchMatchIndex, matches.length - 1);
            }
          }
        },
        error: error => {
          this.actionError = this.errorFrom(error, t('feedback.chat.loadError'));
        }
      });
  }

  replyTo(message: DirectChatMessage): void {
    if (!message.id || this.sending || this.deliveryUncertain || this.chatInfo?.chatBlocked) return;
    this.replyingTo = message;
    this.composerTextarea?.nativeElement.focus({ preventScroll: true });
  }

  cancelReply(): void {
    if (!this.sending && !this.deliveryUncertain) this.replyingTo = null;
  }

  private checkAttachmentAvailability(): void {
    const version = ++this.attachmentRequestVersion;
    this.attachmentReady = false;
    if (typeof this.chatService.attachmentsAvailable !== 'function') return;
    this.chatService.attachmentsAvailable(this.recipientUsername)
      .pipe(timeout(10_000))
      .subscribe({
        next: result => {
          if (version === this.attachmentRequestVersion) this.attachmentReady = result.available === true;
        },
        error: () => { if (version === this.attachmentRequestVersion) this.attachmentReady = false; }
      });
  }

  onImagePaste(event: ClipboardEvent): void {
    const image = readPastedChatImage(event.clipboardData);
    if (!image) return;
    event.preventDefault();
    if (!this.attachmentReady || this.sending || this.deliveryUncertain || this.chatInfo?.chatBlocked) {
      this.actionError = 'O envio de imagens não está disponível nesta conversa.';
      return;
    }
    this.stageAttachment(image);
  }

  onAttachmentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) this.stageAttachments(files);
  }

  stageAttachment(file: File): void {
    this.stageAttachments([file]);
  }

  stageAttachments(incoming: File[]): void {
    const all = [...this.selectedFiles, ...incoming];
    const accepted = ['image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4',
      'audio/ogg', 'audio/webm'];
    if (all.length > 4 || all.reduce((sum, item) => sum + item.size, 0) > 40 * 1024 * 1024
        || all.some(file => !accepted.includes(file.type.toLowerCase()) || !file.size
          || file.size > (file.type.startsWith('video/') ? 20 : file.type.startsWith('audio/') ? 12 : 5) * 1024 * 1024)) {
      this.actionError = 'Até 4 ficheiros (40 MB no total): imagens/PDF 5 MB, áudio 12 MB, vídeo 20 MB.';
      return;
    }
    const pending = [...incoming];
    if (!this.selectedAttachment) this.selectedAttachment = pending.shift() || null;
    this.extraSelectedAttachments.push(...pending);
    this.actionError = '';
  }

  removeAttachment(index = 0): void {
    if (this.sending) return;
    if (index === 0) {
      this.selectedAttachment = this.extraSelectedAttachments.shift() || null;
    } else this.extraSelectedAttachments.splice(index - 1, 1);
  }

  private clearSelectedAttachments(): void {
    this.selectedAttachment = null;
    this.extraSelectedAttachments = [];
  }

  extraAttachmentKey(message: DirectChatMessage, index: number): string {
    return message.id + ':' + index;
  }

  openExtraAttachment(message: DirectChatMessage, asset: {index: number; filename: string; mimeType: string}): void {
    if (!message.id || asset.index <= 0 || asset.index >= 4 || this.chatInfo?.chatBlocked) return;
    const key = this.extraAttachmentKey(message, asset.index);
    const existing = this.extraAttachmentPreviews.get(key);
    if (existing) {
      URL.revokeObjectURL(existing);
      this.extraAttachmentPreviews.delete(key);
      return;
    }
    if (this.extraAttachmentLoading.has(key)) return;
    const version = this.attachmentRequestVersion;
    this.extraAttachmentLoading.add(key);
    this.chatService.downloadAttachmentAt(this.recipientUsername, message.id, asset.index)
      .pipe(timeout(30_000), finalize(() => this.extraAttachmentLoading.delete(key)))
      .subscribe({
        next: blob => {
          if (version !== this.attachmentRequestVersion || blob.type !== asset.mimeType) return;
          const url = URL.createObjectURL(blob);
          if (blob.type.startsWith('image/') || blob.type.startsWith('video/') || blob.type.startsWith('audio/')) {
            this.extraAttachmentPreviews.set(key, url);
          } else {
            const link = document.createElement('a');
            link.href = url;
            link.download = asset.filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }
        },
        error: () => this.actionError = 'Não foi possível abrir o anexo.'
      });
  }

  openAttachment(message: DirectChatMessage): void {
    if (!message.id || !message.attachmentName || this.attachmentLoading.has(message.id)) return;
    const id = message.id;
    const existing = this.attachmentPreviews.get(id);
    if (existing) {
      URL.revokeObjectURL(existing);
      this.attachmentPreviews.delete(id);
      return;
    }
    const version = this.attachmentRequestVersion;
    this.attachmentLoading.add(id);
    this.chatService.downloadAttachment(this.recipientUsername, id)
      .pipe(timeout(15_000), finalize(() => this.attachmentLoading.delete(id)))
      .subscribe({
        next: blob => {
          if (version !== this.attachmentRequestVersion) return;
          if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
            'audio/webm', 'application/pdf'].includes(blob.type.toLowerCase())) {
            this.actionError = 'O formato deste anexo não é suportado.';
            return;
          }
          if (blob.type === 'application/pdf') {
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = message.attachmentName || 'documento.pdf';
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            return;
          }
          this.attachmentPreviews.set(id, URL.createObjectURL(blob));
        },
        error: () => this.actionError = 'Não foi possível abrir a imagem.'
      });
  }

  onEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.shiftKey || keyboardEvent.isComposing || keyboardEvent.keyCode === 229) {
      return;
    }

    keyboardEvent.preventDefault();
    this.sendMessage();
  }

  sendMessage(): void {
    this.typing.stop();
    const text = this.messageBody.trim();

    if (!this.recipientUsername || this.sending || this.deliveryUncertain || this.chatInfo?.chatBlocked) {
      return;
    }

    if (!text && !this.selectedAttachment) {
      this.actionError = t('feedback.chat.writeFirst');
      return;
    }

    if (text.length > 2000) {
      this.actionError = t('feedback.chat.messageLong');
      return;
    }

    this.sending = true;
    this.actionError = '';
    this.actionSuccess = '';
    // Keep the text field focused after Enter or clicking Send. Read-only
    // during this request avoids edits that would otherwise be cleared on ACK.
    this.composerTextarea?.nativeElement.focus({ preventScroll: true });
    const replyId = this.replyingTo?.id || null;
    const pending = {
      text,
      replyToMessageId: replyId,
      knownIds: new Set(this.messages.filter(message => message.id !== null).map(message => message.id as number)),
      startedAt: Date.now()
    };

    const attachment = this.selectedAttachment;
    const attachments = this.selectedFiles;
    const send = attachments.length > 1
      ? this.chatService.sendAttachments(this.recipientUsername, attachments, text, replyId ?? undefined)
      : attachment
      ? this.chatService.sendAttachment(this.recipientUsername, attachment, text, replyId ?? undefined)
      : replyId
        ? this.chatService.send(this.recipientUsername, text, replyId)
        : this.chatService.send(this.recipientUsername, text);
    send.pipe(
        timeout(attachments.length ? 120_000 : 10_000),
        finalize(() => this.sending = false)
      )
      .subscribe({
        next: message => {
          const alreadyPresent = message.id !== null
            && this.messages.some(existing => existing.id === message.id);

          if (!alreadyPresent) {
            this.messages = this.sorted([...this.messages, message]);
          }

          this.messageBody = '';
          this.clearSelectedAttachments();
          this.replyingTo = null;
          this.showEmojiPicker = false;
          this.scrollToBottomRequested = true;
          this.deliveryUncertain = false;
          this.pendingDelivery = undefined;
        },
        error: error => {
          if (!attachment && this.isUncertainSendError(error)) {
            // A timeout can happen *after* the server committed the message.
            // Never automatically retry a POST that could have succeeded.
            this.pendingDelivery = pending;
            this.deliveryUncertain = true;
            this.actionError = t('chat.sendUncertain');
            this.verifyDelivery();
          } else {
            this.actionError = attachment && this.isUncertainSendError(error)
              ? 'Não foi possível confirmar o envio da imagem. Verifica a conversa antes de tentar novamente.'
              : this.errorFrom(error, t('feedback.chat.sendError'));
          }
        }
      });
  }

  verifyDelivery(): void {
    if (!this.deliveryUncertain || this.deliveryChecking || !this.pendingDelivery) return;
    const alreadyDelivered = this.messages.find(message => this.matchesPendingDelivery(message));
    if (alreadyDelivered) {
      this.confirmPendingDelivery();
      return;
    }
    this.deliveryChecking = true;
    this.chatService.recentHistory(this.recipientUsername)
      .pipe(timeout(10_000), finalize(() => this.deliveryChecking = false))
      .subscribe({
        next: page => {
          const found = page.content.find(message => this.matchesPendingDelivery(message));
          if (found) {
            this.messages = this.sorted([...this.messages.filter(m => m.id !== found.id), found]);
            this.confirmPendingDelivery();
          } else {
            this.actionError = t('chat.sendUnconfirmed');
          }
        },
        error: () => this.actionError = t('chat.verifyUnavailable')
      });
  }

  /**
   * Deliberately opt out of the ambiguous-send guard. The original text stays
   * in the composer; the user is warned it may already have been delivered.
   */
  resumeAfterUncertainSend(): void {
    if (this.deliveryChecking) return;
    this.deliveryUncertain = false;
    this.pendingDelivery = undefined;
    this.actionError = t('chat.sendRetryWarning');
  }

  private confirmPendingDelivery(): void {
    this.deliveryUncertain = false;
    this.pendingDelivery = undefined;
    this.messageBody = '';
    this.replyingTo = null;
    this.actionError = '';
    this.actionSuccess = t('chat.sendConfirmed');
    this.scrollToBottomRequested = true;
  }

  private matchesPendingDelivery(message: DirectChatMessage): boolean {
    const pending = this.pendingDelivery;
    if (!pending || message.id === null || pending.knownIds.has(message.id)) return false;
    if (!this.currentUsername || !this.isOwnMessage(message)) return false;
    if (message.username2.toLowerCase() !== this.recipientUsername.toLowerCase()) return false;
    const sentAt = this.timestamp(message);
    // Unreliable or absent timestamps should not be treated as proof of delivery.
    return sentAt >= pending.startedAt - 60_000 && message.text === pending.text
      && (message.replyToMessageId ?? null) === pending.replyToMessageId;
  }

  private isUncertainSendError(error: unknown): boolean {
    return error instanceof TimeoutError
      || error instanceof HttpErrorResponse
         && (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500);
  }

  onTypingInput(): void {
    this.typing.input('direct', this.recipientUsername, this.messageBody,
      !this.chatInfo?.chatBlocked && !this.sending && !this.deliveryUncertain);
  }

  toggleEmojiPicker(): void {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  addEmoji(emoji: string): void {
    if (this.messageBody.length + emoji.length <= 2000) {
      this.messageBody += emoji;
      this.showEmojiPicker = false;
    }
  }

  isOwnMessage(message: DirectChatMessage): boolean {
    return Boolean(
      this.currentUsername
      && message.username1.toLowerCase() === this.currentUsername.toLowerCase()
    );
  }

  isBlockedByMe(): boolean {
    return Boolean(
      this.chatInfo?.chatBlocked
      && this.currentUsername
      && this.chatInfo.whoBlocked?.toLowerCase() === this.currentUsername.toLowerCase()
    );
  }

  toggleChatBlock(): void {
    if (!this.recipientUsername || this.friendshipActionLoading) {
      return;
    }

    if (this.chatInfo?.chatBlocked && !this.isBlockedByMe()) {
      this.actionError = t('feedback.chat.blockedOther');
      this.actionSuccess = '';
      return;
    }

    const shouldUnblock = this.isBlockedByMe();
    const request$ = shouldUnblock
      ? this.communityService.unblockFriend(this.recipientUsername)
      : this.communityService.blockFriend(this.recipientUsername);

    this.friendshipActionLoading = true;
    this.actionError = '';
    this.actionSuccess = '';

    request$
      .pipe(
        timeout(10_000),
        finalize(() => this.friendshipActionLoading = false)
      )
      .subscribe({
        next: () => {
          this.chatInfo = shouldUnblock
            ? { chatBlocked: false, whoBlocked: null }
            : { chatBlocked: true, whoBlocked: this.currentUsername };
          this.actionSuccess = shouldUnblock
            ? t('feedback.chat.unblocked')
            : t('feedback.chat.blocked');
        },
        error: error => {
          this.actionError = this.errorFrom(
            error,
            shouldUnblock ? t('feedback.chat.unblockError') : t('feedback.chat.blockError')
          );
        }
      });
  }

  blockedMessage(): string {
    if (!this.chatInfo?.chatBlocked) {
      return '';
    }

    if (this.isBlockedByMe()) {
      return t('feedback.chat.blockedByMe');
    }

    return t('feedback.chat.blockedGeneric');
  }

  dayLabelAt(index: number): string {
    const item = this.messages[index];
    return item ? chatDaySeparator(item.date || item.dataDisplay,
      index > 0 ? (this.messages[index - 1].date || this.messages[index - 1].dataDisplay) : null) : '';
  }

  continuesGroupAt(index: number): boolean {
    if (index <= 0) return false;
    const current = this.messages[index], previous = this.messages[index - 1];
    return chatContinuesGroup(current.username1, current.date || current.dataDisplay,
      previous.username1, previous.date || previous.dataDisplay);
  }

  messageDate(message: DirectChatMessage): string {
    const raw = message.date || message.dataDisplay;
    if (!raw) {
      return '';
    }

    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      return raw;
    }

    return this.dateTimeFormatter.format(new Date(parsed));
  }

  private sorted(messages: DirectChatMessage[]): DirectChatMessage[] {
    // The database assigns increasing IDs. In particular, an event whose date
    // was omitted by the socket must not be sorted before the full history.
    return [...messages].sort((a, b) =>
      a.id !== null && b.id !== null ? a.id - b.id : this.timestamp(a) - this.timestamp(b));
  }

  private belongsToCurrentConversation(message: DirectChatMessage): boolean {
    if (!this.currentUsername || !this.recipientUsername) {
      return false;
    }

    const current = this.currentUsername.toLowerCase();
    const recipient = this.recipientUsername.toLowerCase();
    const sender = message.username1.toLowerCase();
    const receiver = message.username2.toLowerCase();

    return (sender === current && receiver === recipient)
      || (sender === recipient && receiver === current);
  }

  private resolveRecipient(): string {
    const direct = this.route.snapshot.paramMap.get('username');
    if (direct) {
      return direct;
    }

    const username1 = this.route.snapshot.paramMap.get('username1');
    const username2 = this.route.snapshot.paramMap.get('username2');

    if (!username1 || !username2) {
      return '';
    }

    if (this.currentUsername?.toLowerCase() === username1.toLowerCase()) {
      return username2;
    }

    if (this.currentUsername?.toLowerCase() === username2.toLowerCase()) {
      return username1;
    }

    return username2;
  }

  private timestamp(message: DirectChatMessage): number {
    const raw = message.date || message.dataDisplay;
    if (!raw) {
      return 0;
    }

    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private readCurrentUsername(): string | null {
    const token = localStorage.getItem('t');
    if (!token) {
      return null;
    }

    try {
      return this.jwtHelper.decodeToken(token)?.sub ?? null;
    } catch {
      return null;
    }
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim() ? apiMessage : fallback;
  }
}
