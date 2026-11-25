import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';

const SOUND_KEY = 'jynlo-message-sound';

/**
 * New-message alert on the website: a short chime and, when the Jynlo tab is
 * in the background, a computer notification (only after the person allows it).
 * Nothing is sent anywhere; the preference lives in this browser.
 */
@Injectable({ providedIn: 'root' })
export class MessageAlertService {
  private audio?: AudioContext;
  private lastSound = 0;

  constructor(private readonly router: Router, private readonly zone: NgZone) {}

  get soundEnabled(): boolean {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  }
  set soundEnabled(on: boolean) {
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  }

  get desktopSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }
  get desktopPermission(): NotificationPermission | 'unsupported' {
    return this.desktopSupported ? Notification.permission : 'unsupported';
  }

  async enableDesktop(): Promise<NotificationPermission | 'unsupported'> {
    if (!this.desktopSupported) return 'unsupported';
    try { return await Notification.requestPermission(); } catch { return Notification.permission; }
  }

  /** Chime always (if on); computer notification only when the tab is not being looked at. */
  alert(title: string, body: string, url = '/menu/messages', tag?: string): void {
    this.playSound();
    this.showDesktop(title, body, url, tag);
  }

  playSound(): void {
    if (!this.soundEnabled) return;
    const now = Date.now();
    if (now - this.lastSound < 1500) return;
    this.lastSound = now;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      this.audio = this.audio || new Ctx();
      const ctx = this.audio!;
      if (ctx.state === 'suspended') void ctx.resume();
      const start = ctx.currentTime + 0.01;
      for (const [offset, freq] of [[0, 880], [0.12, 1320]] as const) {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start + offset);
        osc.stop(start + offset + 0.25);
      }
    } catch { /* sound is a bonus */ }
  }

  private showDesktop(title: string, body: string, url: string, tag?: string): void {
    if (!this.desktopSupported || Notification.permission !== 'granted') return;
    if (typeof document !== 'undefined' && !document.hidden && document.hasFocus?.()) return;
    try {
      const note = new Notification(title, {
        body: body.slice(0, 160), tag, icon: '/assets/jynlo-icon-approved.webp', silent: true
      });
      note.onclick = () => {
        window.focus();
        note.close();
        this.zone.run(() => { void this.router.navigateByUrl(url); });
      };
    } catch { /* some browsers only allow notifications from a service worker */ }
  }
}
