import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Which conversations are open on screen right now (full Messages page, a team or
 * community tab, or the floating window). Alerts for an open chat are not shown,
 * and the bell refreshes as soon as a chat is marked read.
 */
@Injectable({ providedIn: 'root' })
export class ActiveChatService {
  private readonly sources = new Map<object, () => string | null>();
  /** Emits after a conversation was marked read on the server. */
  readonly read$ = new Subject<void>();

  register(owner: object, openKey: () => string | null): void { this.sources.set(owner, openKey); }
  unregister(owner: object): void { this.sources.delete(owner); }

  /** key like "direct:bea", "community:7", "session:8", "team:3". */
  isOpen(key: string): boolean {
    const wanted = key.toLowerCase();
    for (const current of this.sources.values()) {
      if (current()?.toLowerCase() === wanted) return true;
    }
    return false;
  }
}
