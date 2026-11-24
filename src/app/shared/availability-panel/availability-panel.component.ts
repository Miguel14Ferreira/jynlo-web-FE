import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, Input, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { environment } from '../../../environment/environment';
import { appTranslate as t } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { injectAppDialog } from '../app-dialog/app-dialog.service';

export type AvailabilityAnswer = 'YES' | 'MAYBE' | 'NO';
export interface AvailabilitySlot { id: number; startsAt: string; yes: string[]; maybe: string[]; no: number; mine: AvailabilityAnswer | null; }
export interface AvailabilityRequest {
  id: number; kind: 'private' | 'community'; targetId: number; creator: string; note: string | null;
  createdAt: string; mine: boolean; members: number; answered: number; slots: AvailabilitySlot[];
}

export const AVAILABILITY_MAX_SLOTS = 5;

/** Most "yes", then most "maybe", then earliest; null when nobody answered yes or maybe. */
export function bestAvailabilitySlot(request: AvailabilityRequest | null | undefined): AvailabilitySlot | null {
  let best: { slot: AvailabilitySlot; yes: number; maybe: number } | null = null;
  for (const slot of request?.slots ?? []) {
    const yes = slot.yes.length, maybe = slot.maybe.length;
    if (yes + maybe === 0) continue;
    if (!best || yes > best.yes || (yes === best.yes && maybe > best.maybe)) best = { slot, yes, maybe };
  }
  return best?.slot ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A Date as the value of an <input type="datetime-local">. */
export function localDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Quem pode?" in a private group or a community (members only; the server checks). */
@Component({
  selector: 'app-availability-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './availability-panel.component.html',
  styleUrls: ['./availability-panel.component.css'],
})
export class AvailabilityPanelComponent implements OnChanges {
  private readonly appDialog = injectAppDialog();
  @Input({ required: true }) kind!: 'private' | 'community';
  @Input({ required: true }) targetId!: number;
  @Input() communityId: number | null = null;

  readonly maxSlots = AVAILABILITY_MAX_SLOTS;
  readonly answers: ReadonlyArray<{ value: AvailabilityAnswer; key: string }> = [
    { value: 'YES', key: 'availability.yes' }, { value: 'MAYBE', key: 'availability.maybe' }, { value: 'NO', key: 'availability.no' }];
  private readonly base = environment.apiUrl + '/api/availability';

  requests: AvailabilityRequest[] = [];
  error = '';
  formError = '';
  busy = false;
  creating = false;
  when = '';
  slots: string[] = [];
  note = '';
  minWhen = '';
  private version = 0;

  constructor(private readonly http: HttpClient, private readonly router: Router) {}

  ngOnChanges(): void {
    this.load();
  }

  load(): void {
    if (!this.kind || !this.targetId) return;
    const request = ++this.version;
    this.http.get<AvailabilityRequest[]>(this.base, { params: { kind: this.kind, targetId: String(this.targetId) } })
      .pipe(timeout(10_000)).subscribe({
        next: list => { if (request === this.version) { this.requests = list ?? []; this.error = ''; } },
        error: () => { if (request === this.version) this.error = t('availability.loadError'); },
      });
  }

  openForm(): void {
    this.creating = true;
    this.formError = '';
    this.minWhen = localDateTimeValue(new Date(Date.now() + 60 * 60_000));
  }

  cancel(): void {
    this.creating = false;
    this.slots = [];
    this.note = '';
    this.when = '';
    this.formError = '';
  }

  addSlot(): void {
    const time = Date.parse(this.when);
    if (!this.when || !Number.isFinite(time)) { this.formError = t('availability.pickWhen'); return; }
    if (time < Date.now() + 60 * 60_000) { this.formError = t('availability.tooSoon'); return; }
    if (time > Date.now() + 60 * 86_400_000) { this.formError = t('availability.tooFar'); return; }
    const iso = new Date(time).toISOString();
    if (this.slots.includes(iso)) { this.formError = t('availability.duplicate'); return; }
    if (this.slots.length >= AVAILABILITY_MAX_SLOTS) return;
    this.slots = [...this.slots, iso].sort();
    this.when = '';
    this.formError = '';
  }

  removeSlot(iso: string): void {
    this.slots = this.slots.filter(s => s !== iso);
  }

  submit(): void {
    if (this.busy || !this.slots.length) return;
    this.busy = true;
    this.formError = '';
    this.http.post<AvailabilityRequest>(this.base, { kind: this.kind, targetId: this.targetId, note: this.note.trim() || null, slots: this.slots })
      .pipe(timeout(10_000), finalize(() => this.busy = false)).subscribe({
        next: created => { this.requests = [created, ...this.requests]; this.cancel(); },
        error: e => this.formError = (typeof e?.error?.message === 'string' && e.error.message) || t('availability.createError'),
      });
  }

  answer(request: AvailabilityRequest, slot: AvailabilitySlot, value: AvailabilityAnswer): void {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.http.put<AvailabilityRequest>(`${this.base}/${request.id}/slots/${slot.id}/answer`, { answer: value })
      .pipe(timeout(10_000), finalize(() => this.busy = false)).subscribe({
        next: updated => this.requests = this.requests.map(r => r.id === updated.id ? updated : r),
        error: () => this.error = t('availability.answerError'),
      });
  }

  close(request: AvailabilityRequest): void {
    if (this.busy) return;
    void this.appDialog.confirm(t('availability.closeConfirm'), {}).then(ok => {
      if (!ok || this.busy) return;
      this.busy = true;
      this.http.post<void>(`${this.base}/${request.id}/close`, null)
        .pipe(timeout(10_000), finalize(() => this.busy = false)).subscribe({
          next: () => this.requests = this.requests.filter(r => r.id !== request.id),
          error: () => this.error = t('availability.closeError'),
        });
    });
  }

  best(request: AvailabilityRequest): AvailabilitySlot | null {
    return bestAvailabilitySlot(request);
  }

  createGame(request: AvailabilityRequest): void {
    const slot = this.best(request);
    if (!slot) return;
    const queryParams: Record<string, string> = { when: localDateTimeValue(new Date(slot.startsAt)) };
    if (this.communityId) queryParams['community'] = String(this.communityId);
    void this.router.navigate(['/menu/createEvent'], { queryParams });
  }

  label(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
}
