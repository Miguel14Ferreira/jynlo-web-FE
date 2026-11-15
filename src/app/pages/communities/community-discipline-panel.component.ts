import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommunityGroup } from '../model/community-group';
import { CommunityDisciplineService, CommunityDisciplinaryWarning, CommunityWarningAppeal, CommunityWarningAppealDecision } from '../../services/community-discipline.service';

/** Community-only warnings. Suspensions and competition eligibility are not part of this phase. */
@Component({
  selector: 'app-community-discipline-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="discipline-panel" aria-labelledby="discipline-title">
      <h3 id="discipline-title">Disciplina e Fair Play</h3>
      <p class="discipline-description">
        Advertências da comunidade. Não suspendem a conta nem impedem a participação em jogos.
      </p>
      @if (canManage) {
        <form (ngSubmit)="issueWarning()" class="discipline-form">
          <label for="discipline-member">Membro</label>
          <div class="discipline-member-picker">
            <input id="discipline-member" name="discipline-member" type="search" autocomplete="off"
                   [ngModel]="memberQuery" (ngModelChange)="onMemberQueryChange($event)"
                   (focus)="memberSearchOpen = true" [disabled]="saving"
                   placeholder="Escreve o nome ou @username" aria-autocomplete="list"
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
          <label for="discipline-reason">Motivo da advertência</label>
          <textarea id="discipline-reason" name="disciplineReason"
                    [(ngModel)]="reason" maxlength="1000" rows="3"
                    [disabled]="saving" required
                    placeholder="Descreve objetivamente a ocorrência"></textarea>
          <button type="submit" class="jynlo-action jynlo-action--primary" [disabled]="saving || targetProfileId === null || !reason.trim()">
            {{ saving ? 'A registar…' : 'Registar advertência' }}
          </button>
        </form>
      }
      @if (error) { <p role="alert">{{ error }}</p> }
      @if (feedback) { <p role="status">{{ feedback }}</p> }
      <h4>{{ canManage ? 'Histórico recente da comunidade' : 'As minhas advertências' }}</h4>
      @if (loading) {
        <p role="status">A carregar advertências…</p>
      } @else if (warnings.length === 0) {
        <p>Não existem advertências registadas.</p>
      } @else {
        <ul class="discipline-history">
          @for (warning of warnings; track warning.id) {
            <li>
              @if (canManage) {
                <strong>{{ memberName(warning.targetProfileId) }}</strong>
                <span> · </span>
              }
              <span>{{ warning.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
              <p>{{ warning.reason }}</p>
              @if (appealFor(warning.id); as appeal) {
                <p class="appeal-response"><strong>Contestação apresentada:</strong> {{ appeal.statement }}</p>
                @if (decisionFor(appeal.id); as decision) {
                  <p class="appeal-response">
                    <strong>{{ decision.outcome === 'OVERTURNED' ? 'Advertência anulada após revisão' : 'Advertência mantida após revisão' }}</strong>
                    · {{ decision.reason }}
                  </p>
                } @else if (canManage) {
                  <form class="discipline-form" (ngSubmit)="decideAppeal(appeal.id)">
                    <label [for]="'appeal-outcome-' + appeal.id">Decisão da contestação</label>
                    <select [id]="'appeal-outcome-' + appeal.id" [name]="'appeal-outcome-' + appeal.id"
                            [(ngModel)]="decisionOutcomes[appeal.id]"
                            [disabled]="decisionSavingId !== null" required>
                      <option value="UPHELD">Manter advertência</option>
                      <option value="OVERTURNED">Anular advertência</option>
                    </select>
                    <label [for]="'appeal-review-reason-' + appeal.id">Fundamentação da decisão</label>
                    <textarea [id]="'appeal-review-reason-' + appeal.id"
                              [name]="'appeal-review-reason-' + appeal.id"
                              [(ngModel)]="decisionReasons[appeal.id]" rows="3"
                              maxlength="1000" [disabled]="decisionSavingId !== null"
                              placeholder="A decisão deve ser tomada por um responsável diferente do emissor."
                              required></textarea>
                    <button type="submit" [disabled]="decisionSavingId !== null || !decisionReasons[appeal.id]?.trim()">
                      {{ decisionSavingId === appeal.id ? 'A guardar…' : 'Registar decisão' }}
                    </button>
                  </form>
                }
              } @else if (!canManage) {
                <form class="discipline-form" (ngSubmit)="submitAppeal(warning.id)">
                  <label [for]="'appeal-statement-' + warning.id">A tua versão dos factos</label>
                  <textarea [id]="'appeal-statement-' + warning.id"
                            [name]="'appeal-statement-' + warning.id"
                            [(ngModel)]="appealDrafts[warning.id]" rows="3" maxlength="2000"
                            [disabled]="appealSavingId !== null" required
                            placeholder="Explica o que aconteceu. A resposta ficará registada."></textarea>
                  <button type="submit"
                          [disabled]="appealSavingId !== null || !appealDrafts[warning.id]?.trim()">
                    {{ appealSavingId === warning.id ? 'A enviar…' : 'Apresentar contestação' }}
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
    .discipline-panel { margin: 1rem 0; padding: 1.25rem; border: 1px solid var(--border-color, #77889955); border-radius: 16px; }
    .discipline-panel h3, .discipline-panel h4 { margin: 0 0 .75rem; }
    .discipline-description { opacity: .8; margin: 0 0 1rem; }
    .discipline-form { display: grid; gap: .6rem; max-width: 640px; margin-bottom: 1.3rem; }
    .discipline-form input, .discipline-form textarea { width: 100%; padding: .7rem; border-radius: 8px; }
    .discipline-form button { justify-self: start; padding: .65rem 1rem; border-radius: 8px; }
    .discipline-member-picker { position: relative; width: 100%; }
    .discipline-member-picker input { width: 100%; }
    .discipline-member-suggestions { position: relative; z-index: 3; max-height: 210px; overflow-y: auto; border: 1px solid var(--border-color,#77889955); border-radius: 10px; background: var(--surface,#0b2d36); margin-top: 4px; }
    .discipline-member-suggestions .discipline-member-option { display: flex; gap: .55rem; align-items: baseline; justify-content: space-between; width: 100%; padding: .65rem .75rem; background: transparent; border: 0; border-radius: 0; color: inherit; text-align: left; cursor: pointer; }
    .discipline-member-suggestions .discipline-member-option:hover, .discipline-member-suggestions .discipline-member-option:focus-visible { background: rgba(34,197,154,.16); outline: 2px solid transparent; }
    .discipline-member-option small { opacity: .72; }
    .discipline-history { margin: .5rem 0 0; padding-left: 1.3rem; }
    .discipline-history li { margin-bottom: .8rem; }
    .discipline-history p { margin: .3rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .appeal-response { padding: .7rem; background: var(--surface-muted, #77889918); border-radius: 8px; }
  `]
})
export class CommunityDisciplinePanelComponent implements OnChanges {
  @Input({ required: true }) community!: CommunityGroup;
  @Input() canManage = false;

  targetProfileId: number | null = null;
  memberQuery = '';
  memberSearchOpen = false;
  reason = '';
  warnings: CommunityDisciplinaryWarning[] = [];
  appeals: CommunityWarningAppeal[] = [];
  decisions: CommunityWarningAppealDecision[] = [];
  decisionOutcomes: Record<number, CommunityWarningAppealDecision['outcome']> = {};
  decisionReasons: Record<number, string> = {};
  decisionSavingId: number | null = null;
  appealDrafts: Record<number, string> = {};
  appealSavingId: number | null = null;
  loading = false;
  saving = false;
  error = '';
  feedback = '';
  private revision = 0;

  constructor(private readonly api: CommunityDisciplineService,
              private readonly changeDetector: ChangeDetectorRef) {}

  get eligibleMembers() {
    return this.community?.members?.filter(member => member.role === 'MEMBER') ?? [];
  }

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
      this.reason = '';
      this.appealDrafts = {};
      this.decisionReasons = {};
      this.decisionOutcomes = {};
      this.feedback = '';
      this.load();
    }
  }

  decisionFor(appealId: number): CommunityWarningAppealDecision | undefined {
    return this.decisions.find(decision => decision.appealId === appealId);
  }

  appealFor(warningId: number): CommunityWarningAppeal | undefined {
    return this.appeals.find(appeal => appeal.warningId === warningId);
  }

  memberName(profileId: number): string {
    const member = this.community.members.find(item => item.profileId === profileId);
    return member?.fullName || member?.username || `#${profileId}`;
  }

  load(): void {
    const communityId = this.community?.id;
    const revision = ++this.revision;
    this.warnings = [];
    this.appeals = [];
    this.decisions = [];
    this.appealSavingId = null;
    this.decisionSavingId = null;
    this.error = '';
    if (!communityId) return;
    this.loading = true;
    const decisionsRequest = this.canManage ? this.api.listDecisions(communityId) : this.api.myDecisions(communityId);
    decisionsRequest.subscribe({
      next: decisions => {
        if (revision !== this.revision) return;
        this.decisions = decisions;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.revision) return;
        this.error = 'Não foi possível carregar as decisões das contestações.';
        this.changeDetector.markForCheck();
      }
    });
    const appealRequest = this.canManage ? this.api.listAppeals(communityId) : this.api.myAppeals(communityId);
    appealRequest.subscribe({
      next: appeals => {
        if (revision !== this.revision) return;
        this.appeals = appeals;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.revision) return;
        this.error = 'Não foi possível carregar as contestações.';
        this.changeDetector.markForCheck();
      }
    });
    const request = this.canManage ? this.api.list(communityId) : this.api.mine(communityId);
    request.subscribe({
      next: warnings => {
        if (revision !== this.revision) return;
        this.warnings = warnings;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.revision) return;
        this.error = 'Não foi possível carregar o histórico disciplinar.';
        this.loading = false;
        this.changeDetector.markForCheck();
      }
    });
  }

  issueWarning(): void {
    if (!this.canManage || this.saving || !this.community?.id
        || this.targetProfileId === null || !this.reason.trim()
        || this.reason.trim().length > 1000
        || !this.eligibleMembers.some(member => member.profileId === this.targetProfileId)) return;
    const communityId = this.community.id;
    const revision = this.revision;
    this.saving = true;
    this.error = '';
    this.feedback = '';
    this.api.warn(communityId, this.targetProfileId, this.reason.trim()).subscribe({
      next: () => {
        if (revision !== this.revision) return;
        this.saving = false;
        this.targetProfileId = null;
        this.memberQuery = '';
        this.memberSearchOpen = false;
        this.reason = '';
        this.feedback = 'Advertência registada na comunidade.';
        this.load();
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.revision) return;
        this.saving = false;
        this.error = 'Não foi possível registar a advertência. Verifica as permissões e tenta novamente.';
        this.changeDetector.markForCheck();
      }
    });
  }
  submitAppeal(warningId: number): void {
    const statement = this.appealDrafts[warningId]?.trim() ?? '';
    if (this.canManage || !this.community?.id || this.appealSavingId !== null
        || !this.warnings.some(warning => warning.id === warningId)
        || this.appealFor(warningId) || !statement || statement.length > 2000) return;
    const revision = this.revision;
    this.appealSavingId = warningId;
    this.error = '';
    this.feedback = '';
    this.api.appeal(this.community.id, warningId, statement).subscribe({
      next: appeal => {
        if (revision !== this.revision) return;
        this.appealSavingId = null;
        this.appeals = [...this.appeals, appeal];
        delete this.appealDrafts[warningId];
        this.feedback = 'A tua contestação ficou registada.';
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.revision) return;
        this.appealSavingId = null;
        this.error = 'Não foi possível enviar a contestação. Tenta novamente.';
        this.changeDetector.markForCheck();
      }
    });
  }

  decideAppeal(appealId: number): void {
    const appeal = this.appeals.find(entry => entry.id === appealId);
    const reason = this.decisionReasons[appealId]?.trim() ?? '';
    const outcome = this.decisionOutcomes[appealId] ?? 'UPHELD';
    if (!this.canManage || !this.community?.id || !appeal
        || this.decisionFor(appealId) || this.decisionSavingId !== null
        || !reason || reason.length > 1000) return;
    const revision = this.revision;
    this.decisionSavingId = appealId;
    this.error = '';
    this.feedback = '';
    this.api.decide(this.community.id, appealId, outcome, reason).subscribe({
      next: decision => {
        if (revision !== this.revision) return;
        this.decisions = [...this.decisions, decision];
        this.decisionSavingId = null;
        delete this.decisionReasons[appealId];
        this.feedback = 'Decisão registada e fundamentada.';
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (revision !== this.revision) return;
        this.decisionSavingId = null;
        this.error = 'Não foi possível decidir. O responsável que emitiu a advertência não pode rever o próprio caso.';
        this.changeDetector.markForCheck();
      }
    });
  }

}
