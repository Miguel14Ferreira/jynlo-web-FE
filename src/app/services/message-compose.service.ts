import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

/** Opens "new message to @x" inside the Messages window (Instagram style), instead of a separate box. */
@Injectable({ providedIn: 'root' })
export class MessageComposeService {
  readonly target$ = new BehaviorSubject<string | null>(null);
  /** Emitted after a request is sent, so lists of sent requests refresh. */
  readonly changed$ = new Subject<void>();
  open(username: string): void { this.target$.next(username); }
  close(): void { this.target$.next(null); }
}
