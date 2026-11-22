import { appTranslate } from '../../i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { Subscription, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PublicTournamentService, PublicTournamentSetting } from '../../services/public-tournament.service';

/** Owner/Admin turns the public page on; everyone then gets a link to share. */
@Component({
  selector: 'app-tournament-public-share',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    @if (setting && (canManage || setting.enabled)) {
      <div class="tps">
        <div class="tps__text">
          <strong>🔗 {{ 'publicTournament.shareTitle' | t }}</strong>
          <small>{{ (setting.enabled ? 'publicTournament.shareOn' : 'publicTournament.shareOff') | t }}</small>
        </div>
        <div class="tps__actions">
          @if (setting.enabled) {
            <a class="t-btn t-btn-secondary" [href]="whatsapp()" target="_blank" rel="noopener">{{ 'WhatsApp' | t }}</a>
            <button type="button" class="t-btn t-btn-secondary" (click)="copy()">
              {{ (copied ? 'publicTournament.copied' : 'publicTournament.copyLink') | t }}</button>
          }
          @if (canManage) {
            <button type="button" class="t-btn" [class.t-btn-secondary]="setting.enabled" [disabled]="busy" (click)="toggle()">
              {{ (setting.enabled ? 'publicTournament.disable' : 'publicTournament.enable') | t }}</button>
          }
        </div>
        @if (error) { <small class="tps__error" role="alert">{{ error }}</small> }
      </div>
    }`,
  styles: [`.tps{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:10px 0;padding:12px 14px;border-radius:14px;border:1px dashed rgba(63,216,180,.4);background:rgba(63,216,180,.06)}
    .tps__text{display:grid;gap:2px;min-width:12rem;flex:1}.tps__text small{opacity:.8}
    .tps__actions{display:flex;gap:8px;flex-wrap:wrap}.tps__error{color:#ffb4a8;width:100%}`]
})
export class TournamentPublicShareComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) communityId!: number;
  @Input({ required: true }) tournamentId!: number;
  @Input() canManage = false;
  setting: PublicTournamentSetting | null = null;
  busy = false;
  copied = false;
  error = '';
  private sub?: Subscription;
  private loadedKey = '';

  constructor(private readonly api: PublicTournamentService, private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    const key = this.communityId + ':' + this.tournamentId;
    if (!this.communityId || !this.tournamentId || key === this.loadedKey) return;
    this.loadedKey = key;
    this.setting = null;
    this.sub?.unsubscribe();
    this.sub = this.api.setting(this.communityId, this.tournamentId).pipe(timeout(10000)).subscribe({
      next: setting => { this.setting = setting; this.cdr.markForCheck(); },
      error: () => { this.setting = null; }
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  link(): string {
    return (typeof location !== 'undefined' ? location.origin : 'https://d24sports.com') + (this.setting?.path ?? '');
  }

  whatsapp(): string {
    return 'https://wa.me/?text=' + encodeURIComponent(appTranslate('Classificação e resultados do torneio: {{link}}', {link: this.link()}));
  }

  copy(): void {
    try {
      void navigator.clipboard?.writeText(this.link()).then(() => {
        this.copied = true; this.cdr.markForCheck();
        setTimeout(() => { this.copied = false; this.cdr.markForCheck(); }, 2000);
      }, () => {});
    } catch { /* clipboard unavailable */ }
  }

  toggle(): void {
    if (!this.setting || this.busy) return;
    this.busy = true; this.error = '';
    this.api.update(this.communityId, this.tournamentId, !this.setting.enabled).pipe(timeout(10000)).subscribe({
      next: setting => { this.setting = setting; this.busy = false; this.cdr.markForCheck(); },
      error: () => { this.busy = false; this.error = appTranslate('Não foi possível alterar. Tenta outra vez.'); this.cdr.markForCheck(); }
    });
  }
}
