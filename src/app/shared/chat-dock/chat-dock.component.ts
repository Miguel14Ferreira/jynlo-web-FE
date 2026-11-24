import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { AuthenticationService } from '../../services/authethication.service';
import { MessagesCenterComponent } from '../../pages/messages-center/messages-center.component';

const OPEN_KEY = 'jynlo-chat-dock-open';
const MIN_WIDTH = 1024;

/**
 * A small Messages window in the bottom-right corner (desktop only), so a chat
 * can be used without leaving the page. It is the same inbox, in a compact mode.
 */
@Component({
  selector: 'app-chat-dock',
  standalone: true,
  imports: [TranslatePipe, RouterLink, MessagesCenterComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    @if (available) {
      @if (!open) {
        <button type="button" class="chat-dock-pill" (click)="toggle(true)" [attr.aria-label]="'Abrir mensagens' | t">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2v-6.3A7.5 7.5 0 1 1 20 11.5Z"/></svg>
          <span>{{ 'Mensagens' | t }}</span>
        </button>
      }
      @if (started) {
        <section class="chat-dock" [hidden]="!open" role="dialog" [attr.aria-label]="'Mensagens' | t">
          <header class="chat-dock__head">
            <strong>{{ 'Mensagens' | t }}</strong>
            <a class="chat-dock__icon" routerLink="/menu/messages" (click)="toggle(false)"
              [attr.aria-label]="'Abrir em ecrã inteiro' | t" [title]="'Abrir em ecrã inteiro' | t">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></a>
            <button type="button" class="chat-dock__icon" (click)="toggle(false)"
              [attr.aria-label]="'Minimizar' | t" [title]="'Minimizar' | t">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18"/></svg></button>
          </header>
          <div class="chat-dock__body"><app-messages-center [dock]="true" [dockHidden]="!open"></app-messages-center></div>
        </section>
      }
    }
  `,
  styles: [`
    :host{position:fixed;right:20px;bottom:20px;z-index:900;display:block}
    .chat-dock-pill{display:inline-flex;align-items:center;gap:9px;padding:11px 18px;border-radius:999px;cursor:pointer;
      border:1px solid #3fc6b0;background:#0d3b47;color:#e8fffa;font-weight:800;font-size:.92rem;
      box-shadow:0 10px 28px #00121a88}
    .chat-dock-pill:hover{background:#145564}
    .chat-dock-pill svg{width:20px;height:20px;color:#5ee6c8}
    .chat-dock{width:380px;height:min(600px,calc(100vh - 110px));display:flex;flex-direction:column;overflow:hidden;
      border:1px solid #2f7380;border-radius:18px;background:#0a2734;box-shadow:0 18px 48px #00101899}
    .chat-dock[hidden]{display:none}
    .chat-dock__head{display:flex;align-items:center;gap:6px;padding:10px 10px 10px 16px;border-bottom:1px solid #24525e}
    .chat-dock__head strong{flex:1;color:#f2fdff;font-size:1rem}
    .chat-dock__icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;border:0;background:transparent;
      color:#d5f3ef;cursor:pointer}
    .chat-dock__icon:hover{background:#174b56}
    .chat-dock__icon svg{width:19px;height:19px}
    .chat-dock__body{position:relative;flex:1;min-height:0;overflow:hidden}
    .chat-dock__body > app-messages-center{position:absolute;inset:0;display:block;overflow:hidden}
  `]
})
export class ChatDockComponent implements OnInit, OnDestroy {
  open = false;
  /** The inbox is created on first open, and then kept so drafts and the chosen chat survive. */
  started = false;
  available = false;
  private url = '';
  private sub?: Subscription;

  constructor(private readonly router: Router, private readonly auth: AuthenticationService) {}

  ngOnInit(): void {
    this.url = this.router.url;
    this.sub = this.router.events.pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(event => { this.url = (event as NavigationEnd).urlAfterRedirects; this.refresh(); });
    let remembered = false;
    try { remembered = sessionStorage.getItem(OPEN_KEY) === '1'; } catch { /* private mode */ }
    this.refresh();
    if (remembered && this.available) this.toggle(true);
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  @HostListener('window:resize')
  refresh(): void {
    const wide = typeof window !== 'undefined' && window.innerWidth >= MIN_WIDTH;
    const onMessages = /^\/menu\/messages(\/|\?|$)/.test(this.url);
    const guestPage = /^\/(login|register|welcome)(\/|\?|$)/.test(this.url);
    const signedIn = this.auth.isLoggedIn();
    this.available = wide && signedIn && !onMessages && !guestPage;
    // Leaving the page for the full Messages screen ends this copy of the inbox.
    if (!this.available) { this.started = false; this.open = false; }
  }

  toggle(open: boolean): void {
    this.open = open;
    if (open) this.started = true;
    try { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* ignore */ }
  }
}
