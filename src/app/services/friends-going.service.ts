import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, ReplaySubject, catchError, of, take, timeout } from 'rxjs';
import { environment } from 'src/environment/environment';
import { AuthenticationService } from './authethication.service';

export interface FriendGoing { username: string; fullName: string | null; profilePicUrl: string | null; }
export interface SessionFriends { sessionId: number; count: number; friends: FriendGoing[]; }

/**
 * "João e mais 2 amigos vão": which friends are in each game. Cards ask one id at a time; the ids
 * asked in the same moment go in one request, and answers are kept for a few minutes.
 */
@Injectable({ providedIn: 'root' })
export class FriendsGoingService {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly auth = inject(AuthenticationService, { optional: true });
  private readonly cache = new Map<number, { at: number; subject: ReplaySubject<SessionFriends | null> }>();
  private pending: number[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private static readonly TTL_MS = 3 * 60 * 1000;

  forSession(sessionId: number): Observable<SessionFriends | null> {
    if (!this.http || !sessionId || !this.loggedIn()) return of(null);
    const cached = this.cache.get(sessionId);
    if (cached && Date.now() - cached.at < FriendsGoingService.TTL_MS) return cached.subject.pipe(take(1));
    const subject = new ReplaySubject<SessionFriends | null>(1);
    this.cache.set(sessionId, { at: Date.now(), subject });
    this.pending.push(sessionId);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 40);
    return subject.pipe(take(1));
  }

  /** Friends' games first; the original order is kept otherwise. */
  static friendsFirst<T extends { id: number }>(list: T[], known: Map<number, SessionFriends>): T[] {
    return list.map((item, index) => ({ item, index, has: (known.get(item.id)?.count ?? 0) > 0 }))
      .sort((a, b) => (a.has === b.has ? a.index - b.index : a.has ? -1 : 1)).map(x => x.item);
  }

  private flush(): void {
    this.timer = null;
    const batch = [...new Set(this.pending)].slice(0, 100);
    this.pending = this.pending.filter(id => !batch.includes(id));
    if (this.pending.length) this.timer = setTimeout(() => this.flush(), 40);
    if (!batch.length || !this.http) return;
    this.http.get<SessionFriends[]>(environment.apiUrl + '/api/sessions/friends-going?ids=' + batch.join(','))
      .pipe(timeout(12000), catchError(() => of([] as SessionFriends[])))
      .subscribe(list => {
        const byId = new Map((list ?? []).map(x => [x.sessionId, x]));
        for (const id of batch) this.cache.get(id)?.subject.next(byId.get(id) ?? null);
      });
  }

  private loggedIn(): boolean {
    try { return !!this.auth?.isLoggedIn(); } catch { return false; }
  }
}
