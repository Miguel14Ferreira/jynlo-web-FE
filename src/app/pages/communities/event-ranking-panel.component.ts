import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { CommunityTournamentsService } from '../../services/community-tournaments.service';
import { EventRankingEvent, EventRankingKind, EventRankingOverview, EventRankingService } from '../../services/event-ranking.service';
import { CommunityTournament, TournamentParticipant } from '../model/community-tournament';

interface DraftRow { participantId: number; name: string; raw: string; dnf: boolean; }

/** Parses "62.4", "62,4", "1:02.40" or "1:02:03" into seconds. */
export function parseEventValue(raw: string, kind: EventRankingKind): number | null {
  const text = (raw || '').trim().replace(',', '.');
  if (!text) return null;
  if (kind === 'TIME' && text.includes(':')) {
    const parts = text.split(':');
    if (parts.length > 3 || parts.some(p => p === '' || isNaN(Number(p)))) return NaN;
    return parts.reduce((total, part) => total * 60 + Number(part), 0);
  }
  if (kind === 'POSITION') return /^\d+$/.test(text) ? Number(text) : NaN;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

export function formatEventValue(value: number | null, kind: EventRankingKind): string {
  if (value === null || value === undefined) return '—';
  if (kind !== 'TIME' || value < 60) return Number(value.toFixed(3)).toString().replace('.', ',');
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  const secText = seconds.toFixed(2).padStart(5, '0').replace('.', ',');
  return minutes >= 60 ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + secText
    : minutes + ':' + secText;
}

/** "Classificação por provas": events, results and the points table of an EVENT_RANKING tournament. */
@Component({
  selector: 'app-event-ranking-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './event-ranking-panel.component.html',
  styleUrls: ['./event-ranking-panel.component.css']
})
export class EventRankingPanelComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) communityId!: number;
  @Input({ required: true }) tournament!: CommunityTournament;
  @Input() isMember = false;
  @Input() canManage = false;
  @Input() myUsername = '';
  @Output() changed = new EventEmitter<void>();

  overview: EventRankingOverview | null = null;
  roster: TournamentParticipant[] = [];
  loading = false;
  busy = false;
  error = '';
  notice = '';
  editingEventId: number | null = null;
  formOpen = false;
  eventName = '';
  eventDate = '';
  rows: DraftRow[] = [];
  pointsDraft = '';
  pointsOpen = false;
  confirmComplete = false;
  expandedEventId: number | null = null;
  private loadedKey = '';
  private subs: Subscription[] = [];

  constructor(private readonly api: EventRankingService, private readonly tournaments: CommunityTournamentsService,
              private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    const key = this.communityId + ':' + this.tournament?.id;
    if (!this.tournament || key === this.loadedKey) return;
    this.loadedKey = key;
    this.reload();
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  get kind(): EventRankingKind { return this.overview?.valueKind ?? 'POSITION'; }
  get completed(): boolean { return this.overview?.status === 'COMPLETED' || this.tournament.status === 'COMPLETED'; }
  get manager(): boolean { return !!this.overview?.canManage && this.canManage; }
  get myEnrollment(): TournamentParticipant | undefined {
    const me = (this.myUsername || '').toLowerCase();
    return me ? this.roster.find(p => p.username?.toLowerCase() === me) : undefined;
  }
  get pending(): TournamentParticipant[] { return this.roster.filter(p => p.status === 'PENDING'); }

  reload(): void {
    this.loading = true;
    this.error = '';
    this.subs.push(this.api.overview(this.communityId, this.tournament.id).pipe(timeout(15000)).subscribe({
      next: overview => { this.apply(overview); this.loading = false; },
      error: () => { this.loading = false; this.error = t('eventRanking.loadError'); this.cdr.markForCheck(); }
    }));
    this.subs.push(this.tournaments.participants(this.communityId, this.tournament.id, 0).pipe(timeout(15000)).subscribe({
      next: page => { this.roster = page.participants; this.cdr.markForCheck(); },
      error: () => { this.roster = []; }
    }));
  }

  kindLabel(kind: EventRankingKind): string { return t('eventRanking.kind.' + kind); }
  value(value: number | null): string { return formatEventValue(value, this.kind); }

  chooseKind(kind: EventRankingKind): void {
    if (!this.manager || this.overview?.events.length) return;
    this.run(this.api.setKind(this.communityId, this.tournament.id, kind));
  }

  openPoints(): void { this.pointsDraft = (this.overview?.pointsByPlace ?? []).join(', '); this.pointsOpen = true; }
  savePoints(): void {
    this.run(this.api.setPoints(this.communityId, this.tournament.id, this.pointsDraft), () => { this.pointsOpen = false; });
  }

  newEvent(): void {
    this.editingEventId = null;
    this.eventName = t('eventRanking.defaultName', { n: (this.overview?.events.length ?? 0) + 1 });
    this.eventDate = new Date().toISOString().slice(0, 10);
    this.rows = (this.overview?.participants ?? []).map(p => ({ participantId: p.id, name: p.name, raw: '', dnf: false }));
    this.formOpen = true;
  }

  editEvent(event: EventRankingEvent): void {
    this.editingEventId = event.id;
    this.eventName = event.name;
    this.eventDate = event.heldOn ?? '';
    const byId = new Map(event.results.map(r => [r.participantId, r]));
    this.rows = (this.overview?.participants ?? []).map(p => {
      const r = byId.get(p.id);
      const raw = !r || r.didNotFinish ? '' : this.kind === 'POSITION' ? String(r.place ?? '') : String(r.value ?? '').replace('.', ',');
      return { participantId: p.id, name: p.name, raw, dnf: !!r?.didNotFinish };
    });
    this.formOpen = true;
  }

  saveEvent(): void {
    const results = [];
    for (const row of this.rows) {
      if (row.dnf) { results.push({ participantId: row.participantId, value: null, position: null, didNotFinish: true }); continue; }
      const parsed = parseEventValue(row.raw, this.kind);
      if (parsed === null) continue; // did not take part
      if (Number.isNaN(parsed) || parsed < 0) { this.error = t('eventRanking.invalidValue', { name: row.name }); return; }
      results.push({ participantId: row.participantId, didNotFinish: false,
        value: this.kind === 'POSITION' ? null : parsed, position: this.kind === 'POSITION' ? parsed : null });
    }
    if (!results.length) { this.error = t('eventRanking.noResults'); return; }
    this.run(this.api.saveEvent(this.communityId, this.tournament.id, this.editingEventId, {
      name: this.eventName.trim(), heldOn: this.eventDate || null, results }), () => {
      this.formOpen = false; this.notice = t('eventRanking.saved'); this.changed.emit();
    });
  }

  deleteEvent(event: EventRankingEvent): void {
    this.run(this.api.deleteEvent(this.communityId, this.tournament.id, event.id), () => { this.changed.emit(); });
  }

  complete(): void {
    this.run(this.api.complete(this.communityId, this.tournament.id), () => {
      this.confirmComplete = false; this.notice = t('eventRanking.completed'); this.changed.emit();
    });
  }

  join(): void { this.runVoid(this.tournaments.join(this.communityId, this.tournament.id)); }
  leave(): void { this.runVoid(this.tournaments.leave(this.communityId, this.tournament.id)); }
  confirm(p: TournamentParticipant): void { this.runVoid(this.tournaments.confirm(this.communityId, this.tournament.id, p.profileId)); }

  private run(request: Observable<EventRankingOverview>, after?: () => void): void {
    if (this.busy) return;
    this.busy = true; this.error = ''; this.notice = '';
    request.pipe(timeout(15000)).subscribe({
      next: overview => { this.busy = false; this.apply(overview); after?.(); this.cdr.markForCheck(); },
      error: failure => { this.busy = false; this.error = this.message(failure); this.cdr.markForCheck(); }
    });
  }

  private runVoid(request: Observable<unknown>): void {
    if (this.busy) return;
    this.busy = true; this.error = '';
    request.pipe(timeout(15000)).subscribe({
      next: () => { this.busy = false; this.reload(); },
      error: failure => { this.busy = false; this.error = this.message(failure); this.cdr.markForCheck(); }
    });
  }

  private apply(overview: EventRankingOverview): void { this.overview = overview; this.cdr.markForCheck(); }

  private message(failure: any): string {
    const text = failure?.error?.message || failure?.error?.reason;
    return typeof text === 'string' && text.length < 200 ? text : t('eventRanking.genericError');
  }
}
