import { appTranslate } from '../../i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { Subscription, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PublicRankingService, PublicRankingSetting } from '../../services/public-ranking.service';

/** Owner/Admin turns the public season ranking on; everyone then gets a link to share. */
@Component({
  selector: 'app-community-public-ranking-share',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    @if (setting && (canManage || setting.enabled)) {
      <div class="tps">
        <div class="tps__text">
          <strong>🔗 {{ 'publicRanking.shareTitle' | t }}</strong>
          <small>{{ (setting.enabled ? 'publicRanking.shareOn' : 'publicRanking.shareOff') | t }}</small>
        </div>
        <div class="tps__actions">
          @if (setting.enabled) {
            <a class="secondary-action jynlo-action jynlo-action--neutral jynlo-action--compact" [href]="whatsapp()" target="_blank" rel="noopener">{{ 'WhatsApp' | t }}</a>
            <button type="button" class="secondary-action jynlo-action jynlo-action--neutral jynlo-action--compact" (click)="copy()">
              {{ (copied ? 'publicTournament.copied' : 'publicTournament.copyLink') | t }}</button>
          }
          @if (canManage) {
            <button type="button" class="jynlo-action jynlo-action--compact" [class.jynlo-action--primary]="!setting.enabled"
              [class.jynlo-action--neutral]="setting.enabled" [disabled]="busy" (click)="toggle()">
              {{ (setting.enabled ? 'publicTournament.disable' : 'publicRanking.enable') | t }}</button>
          }
        </div>
        @if (error) { <small class="tps__error" role="alert">{{ error }}</small> }
      </div>
    }`,
  styles: [`.tps{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:10px 0;padding:12px 14px;border-radius:14px;border:1px dashed rgba(63,216,180,.4);background:rgba(63,216,180,.06)}
    .tps__text{display:grid;gap:2px;min-width:12rem;flex:1}.tps__text small{opacity:.8}
    .tps__actions{display:flex;gap:8px;flex-wrap:wrap}.tps__error{color:#ffb4a8;width:100%}`]
})
export class CommunityPublicRankingShareComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) communityId!: number;
  @Input() canManage = false;
  setting: PublicRankingSetting | null = null;
  busy = false;
  copied = false;
  error = '';
  private sub?: Subscription;
  private loadedId = 0;

  constructor(private readonly api: PublicRankingService, private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    if (!this.communityId || this.communityId === this.loadedId) return;
    this.loadedId = this.communityId;
    this.setting = null;
    this.sub?.unsubscribe();
    this.sub = this.api.setting(this.communityId).pipe(timeout(10000)).subscribe({
      next: setting => { this.setting = setting; this.cdr.markForCheck(); },
      error: () => { this.setting = null; }
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  link(): string {
    return (typeof location !== 'undefined' ? location.origin : 'https://d24sports.com') + (this.setting?.path ?? '');
  }

  whatsapp(): string {
    return 'https://wa.me/?text=' + encodeURIComponent(appTranslate('Classificação da época: {{link}}', {link: this.link()}));
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
    this.api.update(this.communityId, !this.setting.enabled).pipe(timeout(10000)).subscribe({
      next: setting => { this.setting = setting; this.busy = false; this.cdr.markForCheck(); },
      error: () => { this.busy = false; this.error = appTranslate('Não foi possível alterar. Tenta outra vez.'); this.cdr.markForCheck(); }
    });
  }
}
