import { Subscription } from 'rxjs';
import { appTranslate as t } from '../i18n/i18n.service';
import { ChatTypingEvent, DirectChatRealtimeService } from './direct-chat-realtime.service';

/**
 * Per-screen ephemeral typing model; no HTTP requests, localStorage or DB.
 * Incoming states expire even on missed STOP or browser/network disconnect.
 */
export class ChatTypingTracker {
  private readonly listeners = new Subscription();
  private readonly visible = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();
  private localKey = '';
  private localKind: ChatTypingEvent['kind'] = 'direct';
  private localId = '';
  private nextAllowed = 0;
  private idle?: ReturnType<typeof setTimeout>;

  constructor(private readonly realtime: DirectChatRealtimeService) {
    this.listeners.add(this.realtime.typing$?.subscribe(event => {
      if (!event || !event.username || !event.conversationId
          || !['direct', 'community', 'session', 'team', 'private'].includes(event.kind)) return;
      const key = this.key(event.kind, event.conversationId);
      let users = this.visible.get(key);
      if (!users) {
        users = new Map();
        this.visible.set(key, users);
      }
      const username = event.username.toLowerCase();
      const previous = users.get(username);
      if (previous) clearTimeout(previous);
      users.delete(username);
      if (event.active) {
        const expire = setTimeout(() => {
          users?.delete(username);
          if (!users?.size) this.visible.delete(key);
        }, 5000);
        users.set(username, expire);
      } else if (!users.size) this.visible.delete(key);
    }));
    this.listeners.add(this.realtime.connected$?.subscribe(connected => {
      if (!connected) {
        this.resetVisible();
        this.localKey = '';
        this.nextAllowed = 0;
        this.clearIdle();
      }
    }));
  }

  input(kind: ChatTypingEvent['kind'], id: string | number, text: string, allowed = true): void {
    if (!allowed || !text.trim()) {
      this.stop();
      return;
    }
    const key = this.key(kind, id);
    if (this.localKey && this.localKey !== key) this.stop();
    this.localKey = key;
    this.localKind = kind;
    this.localId = String(id);
    const now = Date.now();
    if (now >= this.nextAllowed) {
      this.realtime.sendTyping?.(kind, id, true);
      this.nextAllowed = now + 2400;
    }
    this.clearIdle();
    this.idle = setTimeout(() => this.stop(), 3200);
  }

  stop(): void {
    this.clearIdle();
    if (this.localKey) this.realtime.sendTyping?.(this.localKind, this.localId, false);
    this.localKey = '';
    this.nextAllowed = 0;
  }

  label(kind: ChatTypingEvent['kind'], id: string | number): string {
    const users = [...(this.visible.get(this.key(kind, id))?.keys() || [])];
    if (!users.length) return '';
    if (kind === 'direct') return t('chat.typing');
    return users.length === 1
      ? t('chat.typingUser').replace('{name}', users[0])
      : t('chat.typingSeveral');
  }

  destroy(): void {
    this.stop();
    this.resetVisible();
    this.listeners.unsubscribe();
  }

  private key(kind: string, id: string | number): string {
    return kind + ':' + String(id).toLowerCase();
  }
  private clearIdle(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = undefined;
  }
  private resetVisible(): void {
    for (const users of this.visible.values())
      for (const handle of users.values()) clearTimeout(handle);
    this.visible.clear();
  }
}
