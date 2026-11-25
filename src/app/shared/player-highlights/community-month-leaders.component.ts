import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { MonthLeader, PlayerHighlightsService } from './player-highlights.service';

/** "Destaques do mês": the community's top players this month and the "Jogador do mês" vote. */
@Component({
  selector: 'app-community-month-leaders',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (enabled && (leaders.length || manager)) {
      <section class="cml">
        <header class="cml__head">
          <h3>🏆 {{ 'Destaques do mês' | t }}</h3>
          @if (manager) {
            <span class="cml__actions">
              @if (leaders.length >= 2) {
                <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy || created" (click)="createPoll()">
                  {{ (created ? 'Votação criada no chat' : busy ? 'A criar…' : 'Votar o jogador do mês') | t }}</button>
              }
            </span>
          }
        </header>
        @if (!leaders.length) { <p class="cml__note">{{ 'Ainda não há resultados registados este mês.' | t }}</p> }
        <ol class="cml__list">
          @for (l of leaders; track $index; let i = $index) {
            <li class="cml__row">
              <span class="cml__pos">{{ i + 1 }}</span>
              @if (l.username) { <a class="cml__name" [routerLink]="['/menu/profiles', l.username]">{{ l.name }}</a> }
              @else { <span class="cml__name">{{ l.name }}</span> }
              <span class="cml__nums">⚽ {{ l.goals }} · 🅰️ {{ l.assists }} · ⭐ {{ l.mvps }}</span>
            </li>
          }
        </ol>
        @if (note) { <p class="cml__note" role="status">{{ note }}</p> }
      </section>
    }
  `,
  styles: [`
    .cml{display:grid;gap:10px;padding:14px;border-radius:18px;border:1px solid rgba(96,176,182,.3);background:rgba(10,41,55,.65);margin:12px 0}
    .cml__head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .cml__head h3{margin:0;font-size:1.05rem;color:#eafffa}
    .cml__list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
    .cml__row{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:#0b2a38}
    .cml__pos{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#163f4d;color:#bff7e9;font-weight:800;font-size:.8rem}
    .cml__row:first-child .cml__pos{background:#fcd34d;color:#3b2a00}
    .cml__name{color:#eafffa;font-weight:700;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cml__nums{color:#9fd9cb;font-size:.8rem;white-space:nowrap}
    .cml__note{margin:0;color:#9fd9cb;font-size:.82rem}
    .cml__actions{display:flex;gap:8px;flex-wrap:wrap}
    .cml--off{border-style:dashed}
  `]
})
export class CommunityMonthLeadersComponent implements OnChanges {
  @Input({ required: true }) communityId = 0;
  @Input() canManage = false;
  /** Bumped by the page after the switch changes, to reload. */
  @Input() version = 0;
  private readonly api = inject(PlayerHighlightsService);
  private readonly cdr = inject(ChangeDetectorRef);
  leaders: MonthLeader[] = [];
  enabled = false; manager = false;
  busy = false; created = false; note = '';
  ngOnChanges(): void {
    this.leaders = []; this.created = false; this.note = '';
    if (!this.communityId) return;
    this.api.monthLeaders(this.communityId).subscribe({ next: r => this.apply(r), error: () => {} });
  }
  private apply(r: { leaders: MonthLeader[]; enabled?: boolean; canManage?: boolean }): void {
    this.leaders = r?.leaders || [];
    this.enabled = r?.enabled !== false;
    this.manager = r?.canManage ?? this.canManage;
    this.cdr.markForCheck();
  }
  toggle(on: boolean): void {
    if (this.busy) return;
    this.busy = true; this.note = '';
    this.api.setEnabled(this.communityId, on).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ next: r => this.apply(r), error: () => { this.note = t('Não foi possível guardar. Tenta outra vez.'); } });
  }
  createPoll(): void {
    if (this.busy) return;
    this.busy = true; this.note = '';
    this.api.playerOfMonthPoll(this.communityId).pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); })).subscribe({
      next: () => { this.created = true; this.note = t('A votação está no chat da comunidade.'); },
      error: (e: { error?: { message?: string } }) => { this.note = e?.error?.message || t('Não foi possível criar a votação.'); }
    });
  }
}
