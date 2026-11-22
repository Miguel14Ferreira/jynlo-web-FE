import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate } from '../../i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommunityGroup } from '../model/community-group';
import { CommunityDisciplineService, CommunityTournamentSuspension } from '../../services/community-discipline.service';

/** Tournament-only bans; does not affect ordinary sessions, other communities or accounts. */
@Component({
  selector: 'app-community-tournament-suspensions',
  standalone: true,
  imports: [TranslatePipe, CommonModule, FormsModule],
  template: `
    <section class="suspension-panel" aria-labelledby="suspension-title">
      <h3 id="suspension-title">{{ 'Suspensões de torneios' | t }}</h3>
      <p class="suspension-help">
        {{ 'Impedem novas inscrições e entradas em equipas dos torneios desta comunidade. Não afetam a conta Jynlo, outras comunidades ou sessões fora dos torneios. As inscrições existentes não são removidas automaticamente.' | t }}
      </p>

      @if (canManage) {
        <form (ngSubmit)="issue()" class="suspension-form">
          <label for="suspension-member">{{ 'Membro a suspender' | t }}</label>
          <div class="discipline-member-picker">
            <input id="suspension-member" name="suspension-member" type="search" autocomplete="off"
                   [ngModel]="memberQuery" (ngModelChange)="onMemberQueryChange($event)"
                   (focus)="memberSearchOpen = true" [disabled]="saving"
                   [placeholder]="'Escreve o nome ou @username' | t" aria-autocomplete="list"
                   [attr.aria-expanded]="memberSearchOpen && suggestedMembers.length > 0" required>
            @if (memberSearchOpen && suggestedMembers.length > 0) {
              <div class="discipline-member-suggestions" role="listbox">
                @for (member of suggestedMembers; track member.profileId) {
                  <button type="button" role="option" class="discipline-member-option"
                          [attr.aria-selected]="targetProfileId === member.profileId"
                          (click)="selectMember(member.profileId)">
                    {{ member.fullName || member.username }} <small>@{{ member.username }}</small>
                  </button>
                }
              </div>
            }
          </div>
          <label for="suspension-days">{{ 'Duração (dias)' | t }}</label>
          <input id="suspension-days" name="suspension-days" type="number"
                 min="1" max="30" step="1" [(ngModel)]="days" [disabled]="saving" required>
          <label for="suspension-reason">{{ 'Motivo' | t }}</label>
          <textarea id="suspension-reason" name="suspension-reason" rows="3" maxlength="1000"
                    [(ngModel)]="reason" [disabled]="saving" required
                    [placeholder]="'Explica a infração e as circunstâncias' | t"></textarea>
          <button type="submit" class="jynlo-action jynlo-action--primary" [disabled]="saving || !canIssue()">
            {{ saving ? ('A registar…' | t) : ('Aplicar suspensão' | t) }}
          </button>
        </form>
      }

      @if (error) { <p role="alert">{{ error }}</p> }
      @if (feedback) { <p role="status">{{ feedback }}</p> }
      <h4>{{ canManage ? ('Suspensões da comunidade' | t) : ('As minhas suspensões' | t) }}</h4>
      @if (loading) {
        <p role="status">{{ 'A carregar suspensões…' | t }}</p>
      } @else if (suspensions.length === 0) {
        <p>{{ 'Não existem suspensões registadas.' | t }}</p>
      } @else {
        <ul class="suspension-history">
          @for (item of suspensions; track item.id) {
            <li>
              @if (canManage) { <strong>{{ memberName(item.targetProfileId) }}</strong> · }
              <strong>{{ isActive(item) ? ('Ativa' | t) : item.revokedAt ? ('Levantada' | t) : ('Terminada' | t) }}</strong>
              <p>{{ item.reason }}</p>
              <p>{{ item.startsAt | date:('dd/MM/yyyy HH:mm' | t) }} — {{ item.endsAt | date:('dd/MM/yyyy HH:mm' | t) }}</p>
              @if (item.revokedAt) {
                <p>{{ 'Levantada em {{revokedAt}}: {{revocationReason}}' | t:{revokedAt: (item.revokedAt | date:('dd/MM/yyyy HH:mm' | t)), revocationReason: (item.revocationReason)} }}</p>
              } @else if (canManage && isActive(item)) {
                <form class="suspension-form" (ngSubmit)="lift(item.id)">
                  <label [for]="'lift-reason-' + item.id">{{ 'Motivo para levantar a suspensão' | t }}</label>
                  <textarea [id]="'lift-reason-' + item.id" [name]="'lift-reason-' + item.id"
                            rows="2" maxlength="1000" [(ngModel)]="liftReasons[item.id]"
                            [disabled]="saving" required></textarea>
                  <button type="submit" [disabled]="saving || !liftReasons[item.id]?.trim()">
                    {{ 'Levantar suspensão' | t }}
                  </button>
                </form>
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .suspension-panel { margin: 1rem 0; padding: 1.25rem; border: 1px solid var(--border-color,#77889955); border-radius: 16px; }
    .suspension-panel h3,.suspension-panel h4 { margin: 0 0 .75rem; }
    .suspension-help { opacity: .8; margin: 0 0 1rem; }
    .suspension-form { display: grid; gap: .6rem; max-width: 640px; margin-bottom: 1rem; }
    .suspension-form input,.suspension-form textarea { padding: .7rem; width: 100%; border-radius: 8px; }
    .suspension-form button { justify-self: start; padding: .65rem 1rem; border-radius: 8px; }
    .discipline-member-picker { position: relative; width: 100%; }
    .discipline-member-picker input { width: 100%; }
    .discipline-member-suggestions { position: relative; z-index: 3; max-height: 210px; overflow-y: auto; border: 1px solid var(--border-color,#77889955); border-radius: 10px; background: var(--surface,#0b2d36); margin-top: 4px; }
    .discipline-member-suggestions .discipline-member-option { display: flex; gap: .55rem; align-items: baseline; justify-content: space-between; width: 100%; padding: .65rem .75rem; background: transparent; border: 0; border-radius: 0; color: inherit; text-align: left; cursor: pointer; }
    .discipline-member-suggestions .discipline-member-option:hover, .discipline-member-suggestions .discipline-member-option:focus-visible { background: rgba(34,197,154,.16); outline: 2px solid transparent; }
    .discipline-member-option small { opacity: .72; }
    .suspension-history { padding-left: 1.3rem; }
    .suspension-history li { margin-bottom: 1rem; }
    .suspension-history p { margin: .35rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  `]
})
export class CommunityTournamentSuspensionsComponent implements OnChanges {
  @Input({ required: true }) community!: CommunityGroup;
  @Input() canManage = false;

  suspensions: CommunityTournamentSuspension[] = [];
  targetProfileId: number | null = null;
  memberQuery = '';
  memberSearchOpen = false;
  days = 1;
  reason = '';
  liftReasons: Record<number, string> = {};
  saving = false;
  loading = false;
  error = '';
  feedback = '';
  private revision = 0;

  constructor(private readonly api: CommunityDisciplineService,
              private readonly changeDetector: ChangeDetectorRef) {}

  get suggestedMembers() {
    const q = this.memberQuery.trim().replace(/^@/, '').toLocaleLowerCase();
    if (q.length < 1) return [];
    return this.eligibleMembers
      .filter(member => member.username.toLocaleLowerCase().includes(q)
        || (member.fullName || '').toLocaleLowerCase().includes(q))
      .sort((a,b) => Number(!a.username.toLocaleLowerCase().startsWith(q)) - Number(!b.username.toLocaleLowerCase().startsWith(q)))
      .slice(0, 8);
  }

  onMemberQueryChange(query: string): void {
    this.memberQuery = query;
    this.targetProfileId = null;
    this.memberSearchOpen = true;
  }

  selectMember(profileId: number): void {
    const member = this.eligibleMembers.find(item => item.profileId === profileId);
    if (!member) return;
    this.targetProfileId = member.profileId;
    this.memberQuery = (member.fullName || member.username) + ' (@' + member.username + ')';
    this.memberSearchOpen = false;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['community'] || changes['canManage']) {
      this.targetProfileId = null;
      this.memberQuery = '';
      this.memberSearchOpen = false;
      this.days = 1;
      this.reason = '';
      this.liftReasons = {};
      this.feedback = '';
      this.load();
    }
  }

  get eligibleMembers() {
    return this.community?.members?.filter(member => member.role === 'MEMBER') ?? [];
  }

  memberName(profileId: number): string {
    const member = this.community.members.find(entry => entry.profileId === profileId);
    return member?.fullName || member?.username || `#${profileId}`;
  }

  isActive(item: CommunityTournamentSuspension): boolean {
    const now = Date.now();
    return !item.revokedAt && Date.parse(item.startsAt) <= now && Date.parse(item.endsAt) > now;
  }

  canIssue(): boolean {
    return this.canManage && this.targetProfileId !== null
      && this.eligibleMembers.some(member => member.profileId === this.targetProfileId)
      && Number.isInteger(this.days) && this.days >= 1 && this.days <= 30
      && this.reason.trim().length > 0 && this.reason.trim().length <= 1000;
  }

  load(): void {
    const id = this.community?.id;
    const revision = ++this.revision;
    this.suspensions = [];
    this.error = '';
    this.loading = false;
    if (!id) return;
    this.loading = true;
    (this.canManage ? this.api.tournamentSuspensions(id) : this.api.myTournamentSuspensions(id))
      .subscribe({
        next: entries => {
          if (revision !== this.revision) return;
          this.suspensions = entries;
          this.loading = false;
          this.changeDetector.markForCheck();
        },
        error: () => {
          if (revision !== this.revision) return;
          this.loading = false;
          this.error = appTranslate('Não foi possível carregar as suspensões.');
          this.changeDetector.markForCheck();
        }
      });
  }

  issue(): void {
    if (this.saving || !this.canIssue()) return;
    const revision = this.revision;
    this.saving = true;
    this.error = '';
    this.feedback = '';
    this.api.issueTournamentSuspension(this.community.id, this.targetProfileId!,
      this.days, this.reason.trim()).subscribe({
      next: entry => {
        if (revision !== this.revision) return;
        this.saving = false;
        this.suspensions = [entry, ...this.suspensions];
        this.targetProfileId = null;
        this.memberQuery = '';
        this.memberSearchOpen = false;
        this.reason = '';
        this.feedback = appTranslate('Suspensão registada para os torneios desta comunidade.');
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.revision) return;
        this.saving = false;
        this.error = appTranslate('Não foi possível aplicar a suspensão. Verifica as permissões e a existência de outras suspensões.');
        this.changeDetector.markForCheck();
      }
    });
  }

  lift(suspensionId: number): void {
    const entry = this.suspensions.find(item => item.id === suspensionId);
    const reason = this.liftReasons[suspensionId]?.trim() ?? '';
    if (!this.canManage || this.saving || !entry || !this.isActive(entry)
        || !reason || reason.length > 1000) return;
    const revision = this.revision;
    this.saving = true;
    this.error = '';
    this.feedback = '';
    this.api.liftTournamentSuspension(this.community.id, suspensionId, reason).subscribe({
      next: updated => {
        if (revision !== this.revision) return;
        this.saving = false;
        this.suspensions = this.suspensions.map(item => item.id === suspensionId ? updated : item);
        delete this.liftReasons[suspensionId];
        this.feedback = appTranslate('Suspensão levantada e decisão registada.');
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.revision) return;
        this.saving = false;
        this.error = appTranslate('Não foi possível levantar a suspensão.');
        this.changeDetector.markForCheck();
      }
    });
  }
}
