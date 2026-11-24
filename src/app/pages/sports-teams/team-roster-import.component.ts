import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate } from '../../i18n/i18n.service';
import { SportsTeamMember, SportsTeamPlayerCandidate, SportsTeamsService, TeamRosterEntry, TeamRosterPreview, TeamRosterSuggestion } from '../../services/sports-teams.service';

/**
 * Owner-only squad import from Excel/CSV. Players with a Jynlo username get
 * the normal invitation; the rest stay in the squad, visible to the owner.
 */
@Component({
  selector: 'app-team-roster-import',
  standalone: true,
  imports: [TranslatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="team-roster-import" [attr.aria-label]="'Plantel por Excel' | t">
      <h3>{{ 'Já tens o plantel noutro sítio?' | t }}</h3>
      <p class="team-content-note">{{ 'Importa nome, número e posição. Quem tiver o utilizador Jynlo na folha recebe convite; os restantes ficam no plantel e só tu os vês. Emails e telefones do ficheiro não são lidos.' | t }}</p>
      <div class="team-roster-import__actions">
        <a class="team-roster-import__template" href="/assets/modelo-jynlo-plantel.csv" download="modelo-jynlo-plantel.csv">{{ 'Descarregar modelo' | t }}</a>
        <label class="team-roster-import__picker">
          <input #fileInput type="file" accept=".xlsx,.xls,.ods,.csv,.tsv,.txt" (change)="choose($event)" [disabled]="busy">
          <span>{{ busy && !preview ? ('A ler o ficheiro…' | t) : ('Escolher ficheiro' | t) }}</span>
        </label>
        <button type="button" class="team-roster-import__picker team-roster-import__paste-toggle" [attr.aria-expanded]="pasteOpen"
          [disabled]="busy" (click)="pasteOpen = !pasteOpen">{{ 'Colar lista' | t }}</button>
      </div>
      <p class="team-content-note team-roster-import__formats">{{ 'Aceitamos Excel (.xlsx, .xls), LibreOffice (.ods), CSV e TSV. No Google Sheets ou no Numbers: Ficheiro → Transferir/Exportar → Excel ou CSV.' | t }}</p>
      @if (pasteOpen) {
        <div class="team-roster-import__paste">
          <label for="roster-paste">{{ 'Um jogador por linha, por exemplo «10 João Silva» ou «João Silva; 10; Defesa». Também podes colar células copiadas de uma folha de cálculo.' | t }}</label>
          <textarea id="roster-paste" rows="6" maxlength="20000" [(ngModel)]="pasteText" [disabled]="busy"
            [placeholder]="'10 João Silva\n7 Rui Costa; Médio\nAna Santos'"></textarea>
          <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy || !pasteText.trim()" (click)="usePasted()">
            {{ 'Ver plantel' | t }}</button>
        </div>
      }
      @if (error) { <p role="alert" class="team-roster-import__error">{{ error }}</p> }
      @if (result) {
        <p role="status" class="team-roster-import__ok">{{ 'Plantel importado: {{a}} convites enviados, {{b}} jogadores adicionados.' | t:{a: result.invited, b: result.added} }}</p>
      }
      @if (preview) {
        <div class="team-roster-import__preview">
          <p><strong>{{ 'Vamos enviar {{a}} convites e adicionar {{b}} jogadores sem conta.' | t:{a: preview.invites, b: preview.newPlayers} }}</strong>
            @if (preview.skipped) { <span> {{ '{{n}} linhas ignoradas (repetidas ou já na equipa).' | t:{n: preview.skipped} }}</span> }
          </p>
          <ul>
            @for (row of preview.rows; track row.line) {
              <li [class.is-skipped]="row.status === 'DUPLICATE' || row.status === 'ALREADY_IN_TEAM'">
                @if (row.shirtNumber !== null) { <b>{{ row.shirtNumber }}</b> }
                {{ row.name }}
                @if (row.position) { <small>· {{ row.position }}</small> }
                <small class="team-roster-import__status">{{ statusLabel(row.status, row.username) }}</small>
              </li>
            }
          </ul>
          @for (w of preview.warnings; track w) { <p class="team-content-note">{{ w }}</p> }
          <div class="team-roster-import__actions">
            <button type="button" class="jynlo-action jynlo-action--primary" [disabled]="busy || !(preview.invites + preview.newPlayers)" (click)="confirm()">
              {{ busy ? ('A importar…' | t) : ('Importar plantel' | t) }}
            </button>
            <button type="button" class="jynlo-action" [disabled]="busy" (click)="reset(fileInput)">{{ 'Cancelar' | t }}</button>
          </div>
        </div>
      }
      @if (suggestions.length) {
        <div class="team-roster-import__suggestions" role="group" [attr.aria-label]="'Sugestões de associação' | t">
          <h3>{{ 'Será a mesma pessoa?' | t }}</h3>
          @for (sug of suggestions; track sug.entryId) {
            <p>
              <strong>{{ sug.entryName }}</strong>@if (sug.shirtNumber !== null) { · nº {{ sug.shirtNumber }} }
              → &#64;{{ sug.username }}@if (sug.fullName) { ({{ sug.fullName }}) }
              <button type="button" class="jynlo-action jynlo-action--primary jynlo-action--compact" [disabled]="busy" (click)="acceptSuggestion(sug)">{{ 'Sim' | t }}</button>
              <button type="button" class="jynlo-action jynlo-action--compact" [disabled]="busy" (click)="dismissSuggestion(sug)">{{ 'Não' | t }}</button>
            </p>
          }
        </div>
      }
      @if (shareNotice) { <p role="status" class="team-roster-import__ok">{{ shareNotice }}</p> }
      @if (entries.length) {
        <h3>{{ 'Plantel importado ({{n}})' | t:{n: entries.length} }}</h3>
        <ul class="team-roster-import__entries">
          @for (entry of entries; track entry.id) {
            <li>
              @if (editing === entry.id) {
                <input class="team-roster-import__num" type="number" min="0" max="999" [(ngModel)]="draftNumber" [attr.aria-label]="'Número' | t">
                <input [(ngModel)]="draftName" maxlength="100" [attr.aria-label]="'Nome' | t">
                <input [(ngModel)]="draftPosition" maxlength="40" [placeholder]="'Posição' | t" [attr.aria-label]="'Posição' | t">
                <button type="button" class="jynlo-action jynlo-action--primary jynlo-action--compact" [disabled]="busy" (click)="saveEntry(entry)">{{ 'Guardar' | t }}</button>
                <button type="button" class="jynlo-action jynlo-action--compact" [disabled]="busy" (click)="editing = null">{{ 'Cancelar' | t }}</button>
              } @else {
                @if (entry.shirtNumber !== null) { <b>{{ entry.shirtNumber }}</b> }
                {{ entry.name }}
                @if (entry.position) { <small>· {{ entry.position }}</small> }
                @if (entry.username) {
                  <small>· &#64;{{ entry.username }} · {{ memberLabel(entry.memberStatus) }}</small>
                } @else {
                  <small>· {{ 'sem conta' | t }}</small>
                }
                <span class="team-roster-import__row-actions">
                  @if (!entry.username) {
                    <button type="button" class="jynlo-action jynlo-action--compact" [disabled]="busy" (click)="shareClaim(entry)">{{ 'Partilhar convite' | t }}</button>
                    <button type="button" class="jynlo-action jynlo-action--compact" [disabled]="busy" (click)="startLink(entry)">{{ 'Associar a utilizador' | t }}</button>
                  } @else {
                    <button type="button" class="jynlo-action jynlo-action--compact" [disabled]="busy" (click)="unlink(entry)">{{ 'Desfazer associação' | t }}</button>
                  }
                  <button type="button" class="jynlo-action jynlo-action--compact" [disabled]="busy" (click)="startEdit(entry)">{{ 'Editar' | t }}</button>
                  <button type="button" class="team-member-remove" [disabled]="busy" (click)="remove(entry)"
                    [attr.aria-label]="('Remover {{name}} do plantel' | t:{name: entry.name})">✕</button>
                </span>
              }
              @if (linking === entry.id) {
                <div class="team-roster-import__link">
                  <input type="search" [(ngModel)]="linkQuery" maxlength="80" [placeholder]="'Nome ou utilizador' | t" (keyup.enter)="searchLink()">
                  <button type="button" class="jynlo-action jynlo-action--compact" [disabled]="busy || linkQuery.trim().length < 2" (click)="searchLink()">{{ 'Pesquisar' | t }}</button>
                  @for (c of linkCandidates; track c.profileId) {
                    <button type="button" class="jynlo-action jynlo-action--compact" [disabled]="busy" (click)="link(entry, c)">{{ c.fullName || c.username }} · &#64;{{ c.username }}</button>
                  }
                  @if (linkSearched && !linkCandidates.length) { <small>{{ 'Não encontrámos ninguém com essa pesquisa.' | t }}</small> }
                </div>
              }
            </li>
          }
        </ul>
      }
      @if (unlinkedMembers.length) {
        <details class="team-roster-import__members">
          <summary>{{ 'Número e posição de quem já está na equipa' | t }}</summary>
          @for (m of unlinkedMembers; track m.profileId) {
            <div class="team-roster-import__member">
              <span>{{ m.fullName || m.username }}</span>
              <input class="team-roster-import__num" type="number" min="0" max="999" [ngModel]="m.shirtNumber" (ngModelChange)="memberDraft(m).shirtNumber = $event" [attr.aria-label]="'Número' | t">
              <input [ngModel]="m.position" (ngModelChange)="memberDraft(m).position = $event" maxlength="40" [placeholder]="'Posição' | t" [attr.aria-label]="'Posição' | t">
              <button type="button" class="jynlo-action jynlo-action--compact" [disabled]="busy" (click)="saveMember(m)">{{ 'Guardar' | t }}</button>
            </div>
          }
        </details>
      }
    </section>
  `,
  styles: [`
    .team-roster-import { display: grid; gap: 10px; margin-top: 18px; padding: 16px; border-radius: 14px;
      border: 1px dashed rgba(83, 188, 180, .45); }
    .team-roster-import h3 { margin: 0; }
    .team-roster-import__actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .team-roster-import__template { font-weight: 700; color: #5ee6c8; text-decoration: none; }
    .team-roster-import__template:hover { text-decoration: underline; }
    .team-roster-import .team-member-remove { min-width: 32px; height: 32px; border-radius: 999px; border: 1px solid rgba(248, 113, 113, .45);
      background: transparent; color: #fca5a5; font-weight: 800; cursor: pointer; }
    .team-roster-import .team-member-remove:hover:not(:disabled) { background: rgba(248, 113, 113, .12); }
    .team-roster-import input:not([type=file]) { min-height: 36px; padding: 6px 10px; border-radius: 10px;
      border: 1px solid rgba(83, 188, 180, .35); background: rgba(6, 22, 32, .6); color: inherit; }
    .team-roster-import details summary { cursor: pointer; font-weight: 700; }
    .team-roster-import__picker { position: relative; display: inline-flex; padding: 8px 14px; border-radius: 999px;
      border: 1px solid rgba(83, 188, 180, .5); cursor: pointer; font-weight: 700; }
    .team-roster-import__picker input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .team-roster-import__paste-toggle { font: inherit; font-weight: 700; cursor: pointer; background: transparent; color: inherit; }
    .team-roster-import__formats { margin-top: 8px; font-size: .8rem; }
    .team-roster-import__paste { display: grid; gap: 8px; margin-top: 10px; }
    .team-roster-import__paste label { font-size: .85rem; color: #c3dce5; }
    .team-roster-import__paste textarea { width: 100%; box-sizing: border-box; border-radius: 12px; padding: 10px;
      background: #092c3d; color: #f1fffc; border: 1px solid rgba(48,184,196,.36); font: inherit; }
    .team-roster-import__paste button { justify-self: start; }
    .team-roster-import ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 320px; overflow: auto; }
    .team-roster-import li { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .team-roster-import li b { min-width: 24px; }
    .team-roster-import li.is-skipped { opacity: .55; text-decoration: line-through; }
    .team-roster-import__status { margin-left: auto; opacity: .8; }
    .team-roster-import__entries li button { margin-left: auto; }
    .team-roster-import__error { color: #fca5a5; }
    .team-roster-import__row-actions { margin-left: auto; display: inline-flex; flex-wrap: wrap; gap: 6px; }
    .team-roster-import__link, .team-roster-import__member { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; width: 100%; padding: 6px 0; }
    .team-roster-import__num { width: 70px; }
    .team-roster-import__suggestions { display: grid; gap: 6px; padding: 10px; border-radius: 12px; background: rgba(83, 188, 180, .1); }
    .team-roster-import__suggestions p { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0; }
  `]
})
export class TeamRosterImportComponent implements OnChanges {
  @Input({ required: true }) teamId!: number;
  @Input() members: readonly SportsTeamMember[] = [];
  @Output() imported = new EventEmitter<void>();
  /** Public roster numbers/positions changed. */
  @Output() rosterChanged = new EventEmitter<void>();
  suggestions: TeamRosterSuggestion[] = [];
  editing: number | null = null;
  draftName = ''; draftNumber: number | null = null; draftPosition = '';
  linking: number | null = null;
  linkQuery = ''; linkCandidates: SportsTeamPlayerCandidate[] = []; linkSearched = false;
  shareNotice = '';
  private readonly dismissed = new Set<number>();
  private readonly memberDrafts = new Map<number, { shirtNumber: number | null; position: string | null }>();
  file: File | null = null;
  preview: TeamRosterPreview | null = null;
  result: { invited: number; added: number } | null = null;
  entries: TeamRosterEntry[] = [];
  busy = false;
  error = '';

  constructor(private readonly api: SportsTeamsService, private readonly cdr: ChangeDetectorRef) {}

  get withoutAccount(): number { return this.entries.filter(e => !e.username).length; }

  ngOnChanges(changes: SimpleChanges): void { if (changes['teamId']) this.load(); }

  load(): void {
    if (!this.teamId) return;
    this.api.roster(this.teamId).subscribe({
      next: entries => { this.entries = entries; this.cdr.markForCheck(); },
      error: () => { this.entries = []; this.cdr.markForCheck(); }
    });
    this.api.rosterSuggestions(this.teamId).subscribe({
      next: list => { this.suggestions = list.filter(s => !this.dismissed.has(s.entryId)); this.cdr.markForCheck(); },
      error: () => { this.suggestions = []; this.cdr.markForCheck(); }
    });
  }

  /** Members who have no squad line yet (their number/position can be set here). */
  get unlinkedMembers(): SportsTeamMember[] {
    const linked = new Set(this.entries.map(e => e.username?.toLowerCase()).filter(Boolean));
    return this.members.filter(m => !linked.has(m.username.toLowerCase()));
  }

  memberDraft(m: SportsTeamMember): { shirtNumber: number | null; position: string | null } {
    let draft = this.memberDrafts.get(m.profileId);
    if (!draft) { draft = { shirtNumber: m.shirtNumber ?? null, position: m.position ?? null }; this.memberDrafts.set(m.profileId, draft); }
    return draft;
  }

  saveMember(m: SportsTeamMember): void {
    const d = this.memberDraft(m);
    const number = d.shirtNumber === null || (d.shirtNumber as unknown) === '' ? null : Number(d.shirtNumber);
    this.run(this.api.setMemberLine(this.teamId, m.profileId, { shirtNumber: number, position: d.position || null }),
      () => { this.load(); this.rosterChanged.emit(); });
  }

  startEdit(entry: TeamRosterEntry): void {
    this.editing = entry.id; this.linking = null;
    this.draftName = entry.name; this.draftNumber = entry.shirtNumber; this.draftPosition = entry.position ?? '';
  }

  saveEntry(entry: TeamRosterEntry): void {
    const number = this.draftNumber === null || (this.draftNumber as unknown) === '' ? null : Number(this.draftNumber);
    this.run(this.api.updateRosterEntry(this.teamId, entry.id, { name: this.draftName, shirtNumber: number, position: this.draftPosition || null }),
      () => { this.editing = null; this.load(); this.rosterChanged.emit(); });
  }

  shareClaim(entry: TeamRosterEntry): void {
    this.run(this.api.rosterClaimLink(this.teamId, entry.id), link => {
      const url = (typeof window !== 'undefined' ? window.location.origin : 'https://jynlosports.com') + link.path;
      const text = appTranslate('{{name}}, és tu no plantel? Entra na equipa aqui: {{url}}', { name: entry.name, url });
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.share) {
        void nav.share({ text }).catch(() => undefined);
        this.shareNotice = appTranslate('Convite criado para {{name}}. Um link novo anula o anterior.', { name: entry.name });
      } else if (nav?.clipboard) {
        void nav.clipboard.writeText(text);
        this.shareNotice = appTranslate('Link copiado. Envia-o a {{name}} (por exemplo, no WhatsApp).', { name: entry.name });
      } else {
        this.shareNotice = url;
      }
      this.load();
    });
  }

  startLink(entry: TeamRosterEntry): void {
    this.linking = this.linking === entry.id ? null : entry.id; this.editing = null;
    this.linkQuery = entry.name; this.linkCandidates = []; this.linkSearched = false;
  }

  searchLink(): void {
    const q = this.linkQuery.trim();
    if (q.length < 2) return;
    this.run(this.api.findPlayers(q), list => { this.linkCandidates = list.slice(0, 8); this.linkSearched = true; });
  }

  link(entry: TeamRosterEntry, candidate: SportsTeamPlayerCandidate): void {
    this.run(this.api.linkRosterEntry(this.teamId, entry.id, candidate.profileId), updated => {
      this.linking = null;
      this.shareNotice = updated.memberStatus === 'ACTIVE'
        ? appTranslate('{{name}} associado a @{{u}}.', { name: entry.name, u: candidate.username })
        : appTranslate('Convite enviado a @{{u}}. Fica associado quando aceitar.', { u: candidate.username });
      this.load(); this.imported.emit(); this.rosterChanged.emit();
    });
  }

  unlink(entry: TeamRosterEntry): void {
    this.run(this.api.unlinkRosterEntry(this.teamId, entry.id), () => { this.load(); this.rosterChanged.emit(); });
  }

  acceptSuggestion(sug: TeamRosterSuggestion): void {
    this.run(this.api.linkRosterEntry(this.teamId, sug.entryId, sug.profileId), () => { this.load(); this.rosterChanged.emit(); });
  }

  dismissSuggestion(sug: TeamRosterSuggestion): void {
    this.dismissed.add(sug.entryId);
    this.suggestions = this.suggestions.filter(s => s.entryId !== sug.entryId);
  }

  private run<T>(request: import('rxjs').Observable<T>, next: (value: T) => void): void {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.shareNotice = '';
    request.pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({ next, error: e => this.error = e?.error?.message || appTranslate('Não foi possível guardar') });
  }

  pasteOpen = false;
  pasteText = '';

  /** A pasted list goes through the same preview → confirm flow as a file. */
  usePasted(): void {
    const text = this.pasteText.trim();
    if (!text || this.busy) return;
    this.previewFile(new File([text], 'lista.txt', { type: 'text/plain' }));
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.previewFile(input.files?.[0] ?? null);
  }

  private previewFile(file: File | null): void {
    this.result = null; this.error = ''; this.preview = null; this.file = file;
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { this.error = appTranslate('O ficheiro não pode ultrapassar 2 MB'); return; }
    this.busy = true;
    this.api.previewRosterImport(this.teamId, file)
      .pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: preview => this.preview = preview,
        error: e => this.error = e?.error?.message || appTranslate('Não foi possível ler o ficheiro')
      });
  }

  confirm(): void {
    if (!this.file || this.busy) return;
    this.busy = true; this.error = '';
    this.api.importRoster(this.teamId, this.file)
      .pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: result => { this.result = result; this.preview = null; this.file = null; this.load(); this.imported.emit(); },
        error: e => this.error = e?.error?.message || appTranslate('Não foi possível importar o plantel')
      });
  }

  reset(input: HTMLInputElement): void {
    input.value = ''; this.file = null; this.preview = null; this.error = '';
  }

  remove(entry: TeamRosterEntry): void {
    if (this.busy) return;
    this.busy = true;
    this.api.removeRosterEntry(this.teamId, entry.id)
      .pipe(finalize(() => { this.busy = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => this.entries = this.entries.filter(e => e.id !== entry.id),
        error: e => this.error = e?.error?.message || appTranslate('Não foi possível remover')
      });
  }

  statusLabel(status: TeamRosterPreview['rows'][number]['status'], username: string | null): string {
    switch (status) {
      case 'INVITE': return appTranslate('Convite para @{{u}}', { u: username ?? '' });
      case 'ALREADY_IN_TEAM': return appTranslate('Já está na equipa');
      case 'DUPLICATE': return appTranslate('Repetido');
      case 'UNKNOWN_USERNAME': return appTranslate('Utilizador não encontrado · fica sem conta');
      default: return appTranslate('Sem conta Jynlo');
    }
  }

  memberLabel(status: string | null): string {
    return status === 'ACTIVE' ? appTranslate('na equipa') : status === 'INVITED' ? appTranslate('convite enviado')
      : status === 'DECLINED' ? appTranslate('recusou o convite') : appTranslate('saiu da equipa');
  }
}
