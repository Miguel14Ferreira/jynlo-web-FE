import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { finalize } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate } from '../../i18n/i18n.service';
import { SportsTeamsService, TeamRosterEntry, TeamRosterPreview } from '../../services/sports-teams.service';

/**
 * Owner-only squad import from Excel/CSV. Players with a Jynlo username get
 * the normal invitation; the rest stay in the squad, visible to the owner.
 */
@Component({
  selector: 'app-team-roster-import',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="team-roster-import" [attr.aria-label]="'Plantel por Excel' | t">
      <h3>{{ 'Tens o plantel num Excel?' | t }}</h3>
      <p class="team-content-note">{{ 'Importa nome, número e posição. Quem tiver o utilizador Jynlo na folha recebe convite; os restantes ficam no plantel e só tu os vês. Emails e telefones do ficheiro não são lidos.' | t }}</p>
      <div class="team-roster-import__actions">
        <a class="team-roster-import__template" href="/assets/modelo-jynlo-plantel.csv" download="modelo-jynlo-plantel.csv">{{ 'Descarregar modelo' | t }}</a>
        <label class="team-roster-import__picker">
          <input #fileInput type="file" accept=".xlsx,.xls,.csv,.tsv" (change)="choose($event)" [disabled]="busy">
          <span>{{ busy && !preview ? ('A ler o ficheiro…' | t) : ('Escolher ficheiro' | t) }}</span>
        </label>
      </div>
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
      @if (entries.length) {
        <h3>{{ 'Plantel sem conta ({{n}})' | t:{n: withoutAccount} }}</h3>
        <ul class="team-roster-import__entries">
          @for (entry of entries; track entry.id) {
            <li>
              @if (entry.shirtNumber !== null) { <b>{{ entry.shirtNumber }}</b> }
              {{ entry.name }}
              @if (entry.position) { <small>· {{ entry.position }}</small> }
              @if (entry.username) { <small>· &#64;{{ entry.username }} · {{ memberLabel(entry.memberStatus) }}</small> }
              <button type="button" class="team-member-remove" [disabled]="busy" (click)="remove(entry)"
                [attr.aria-label]="('Remover {{name}} do plantel' | t:{name: entry.name})">✕</button>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .team-roster-import { display: grid; gap: 10px; margin-top: 18px; padding: 16px; border-radius: 14px;
      border: 1px dashed rgba(83, 188, 180, .45); }
    .team-roster-import h3 { margin: 0; }
    .team-roster-import__actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .team-roster-import__template { font-weight: 700; }
    .team-roster-import__picker { position: relative; display: inline-flex; padding: 8px 14px; border-radius: 999px;
      border: 1px solid rgba(83, 188, 180, .5); cursor: pointer; font-weight: 700; }
    .team-roster-import__picker input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .team-roster-import ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-height: 320px; overflow: auto; }
    .team-roster-import li { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .team-roster-import li b { min-width: 24px; }
    .team-roster-import li.is-skipped { opacity: .55; text-decoration: line-through; }
    .team-roster-import__status { margin-left: auto; opacity: .8; }
    .team-roster-import__entries li button { margin-left: auto; }
    .team-roster-import__error { color: #fca5a5; }
  `]
})
export class TeamRosterImportComponent implements OnChanges {
  @Input({ required: true }) teamId!: number;
  @Output() imported = new EventEmitter<void>();
  file: File | null = null;
  preview: TeamRosterPreview | null = null;
  result: { invited: number; added: number } | null = null;
  entries: TeamRosterEntry[] = [];
  busy = false;
  error = '';

  constructor(private readonly api: SportsTeamsService, private readonly cdr: ChangeDetectorRef) {}

  get withoutAccount(): number { return this.entries.filter(e => !e.username).length; }

  ngOnChanges(): void { this.load(); }

  load(): void {
    if (!this.teamId) return;
    this.api.roster(this.teamId).subscribe({
      next: entries => { this.entries = entries; this.cdr.markForCheck(); },
      error: () => { this.entries = []; this.cdr.markForCheck(); }
    });
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
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
      : appTranslate('recusou o convite');
  }
}
