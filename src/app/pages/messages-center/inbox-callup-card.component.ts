import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, timeout } from 'rxjs';
import { SessionDetail } from '../model/session-detail';
import { SessionService } from '../../services/session.service';
import { TranslatePipe } from '../../i18n/translate.pipe';

/**
 * Convocatória card inside a chat. Everything shown comes from the session
 * API (never from the message text), and "Vou" uses the normal join endpoint,
 * so capacity, waitlist and privacy rules stay on the server.
 */
@Component({
  selector: 'app-inbox-callup-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    <div class="callup-card" [attr.aria-label]="'chat.callUp.title' | t">
      <span class="callup-kind">📣 {{ 'chat.callUp.title' | t }}</span>
      @if (session) {
        <strong class="callup-title">{{ session.sport }} · {{ session.city }}</strong>
        <span class="callup-meta">{{ session.gameDate | date:'dd/MM · HH:mm' }}</span>
        <div class="callup-progress" role="img"
          [attr.aria-label]="('chat.callUp.going' | t:{count: session.participantCount, max: session.maxParticipants})">
          <span [style.width.%]="progress()"></span>
        </div>
        <span class="callup-meta">{{ 'chat.callUp.going' | t:{count: session.participantCount, max: session.maxParticipants} }}</span>

        @if (closed()) {
          <p class="callup-state">{{ 'chat.callUp.closed' | t }}</p>
        } @else if (isOrganiser()) {
          <p class="callup-state">{{ 'chat.callUp.organiser' | t }}</p>
        } @else if (session.joined) {
          <p class="callup-state callup-yes">✓ {{ 'chat.callUp.youAreIn' | t }}</p>
        } @else if (session.waitlisted) {
          <p class="callup-state">{{ 'chat.callUp.waitlisted' | t }}</p>
        } @else if (session.privateGame) {
          <p class="callup-state">{{ 'chat.callUp.private' | t }}</p>
        } @else {
          <button type="button" class="callup-join" [disabled]="joining" (click)="join()">
            {{ (joining ? 'chat.callUp.joining' : session.status === 'FULL' ? 'chat.callUp.joinWaitlist' : 'chat.callUp.join') | t }}
          </button>
        }
        @if (error) { <p class="callup-error" role="alert">{{ error | t }}</p> }
        <a class="callup-link" [routerLink]="['/menu/events', session.id]">{{ 'chat.callUp.open' | t }} ↗</a>
      } @else if (loading) {
        <span class="callup-meta" role="status">{{ 'chat.callUp.loading' | t }}</span>
      } @else {
        <span class="callup-meta" role="status">{{ 'chat.callUp.unavailable' | t }}</span>
      }
    </div>
  `,
  styles: [`
    .callup-card{display:grid;gap:6px;width:min(100%,320px);padding:13px 14px;border:1px solid #3fd8b46e;
      border-radius:14px;background:linear-gradient(135deg,#0a3b44,#082a35);color:#e8fff7;box-sizing:border-box}
    .callup-kind{font-size:.74rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#6ff0d4}
    .callup-title{font-size:1.05rem;overflow-wrap:anywhere}
    .callup-meta{font-size:.84rem;color:#bfe0dc}
    .callup-progress{height:6px;border-radius:99px;background:#ffffff1f;overflow:hidden}
    .callup-progress span{display:block;height:100%;border-radius:99px;background:#2ee6c6}
    .callup-state{margin:4px 0 0;font-size:.88rem;font-weight:800;color:#dff8f2}
    .callup-yes{color:#6ff0d4}
    .callup-join{margin-top:4px;min-height:44px;border:0;border-radius:999px;background:#2ee6c6;color:#05202a;
      font-weight:900;font-size:.95rem;cursor:pointer}
    .callup-join:disabled{opacity:.6;cursor:default}
    .callup-join:focus-visible,.callup-link:focus-visible{outline:3px solid #93ffe5;outline-offset:2px}
    .callup-link{justify-self:start;color:#88f5dc;font-weight:800;text-decoration:none;font-size:.86rem}
    .callup-error{margin:0;color:#ffb4c0;font-size:.84rem}
  `]
})
export class InboxCallUpCardComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) sessionId = 0;
  /** Signed-in username; the organiser sees a summary instead of "Vou". */
  @Input() viewer = '';
  session: SessionDetail | null = null;
  loading = false;
  joining = false;
  error = '';
  private request?: Subscription;
  private version = 0;

  constructor(private readonly sessions: SessionService, private readonly cd: ChangeDetectorRef) {}

  ngOnChanges(): void { this.load(); }
  ngOnDestroy(): void { this.version++; this.request?.unsubscribe(); }

  load(): void {
    this.request?.unsubscribe();
    const version = ++this.version;
    if (!Number.isSafeInteger(this.sessionId) || this.sessionId <= 0) { this.session = null; return; }
    this.loading = true;
    this.request = this.sessions.detail(this.sessionId).pipe(timeout(10000)).subscribe({
      next: detail => { if (version !== this.version) return; this.session = detail; this.loading = false; this.cd.markForCheck(); },
      error: () => { if (version !== this.version) return; this.session = null; this.loading = false; this.cd.markForCheck(); }
    });
  }

  isOrganiser(): boolean {
    const creator = this.session?.creatorUsername?.toLowerCase();
    return !!creator && creator === this.viewer.toLowerCase();
  }

  closed(): boolean {
    const s = this.session;
    if (!s) return true;
    return !['OPEN', 'FULL'].includes(s.status) || !(Date.parse(s.gameDate) > Date.now());
  }

  progress(): number {
    const s = this.session;
    if (!s || !s.maxParticipants) return 0;
    return Math.min(100, Math.round((s.participantCount / s.maxParticipants) * 100));
  }

  join(): void {
    const s = this.session;
    if (!s || this.joining || this.closed() || s.joined || s.waitlisted || s.privateGame) return;
    this.joining = true;
    this.error = '';
    this.sessions.join(s.id).pipe(timeout(10000)).subscribe({
      next: () => { this.joining = false; this.load(); },
      error: () => { this.joining = false; this.error = 'chat.callUp.joinError'; this.cd.markForCheck(); }
    });
  }
}
