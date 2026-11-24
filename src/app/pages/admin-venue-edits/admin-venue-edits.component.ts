import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, finalize, takeUntil, timeout } from 'rxjs';

import { TranslatePipe } from '../../i18n/translate.pipe';
import {
  VenueEditField, VenueEditSuggestion, VenueEditSuggestionsService
} from '../../services/venue-edit-suggestions.service';

@Component({
  selector: 'app-admin-venue-edits',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './admin-venue-edits.component.html',
  styleUrls: ['./admin-venue-edits.component.css']
})
export class AdminVenueEditsComponent implements OnInit, OnDestroy {
  suggestions: VenueEditSuggestion[] = [];
  mode: 'pending' | 'history' = 'pending';
  selected: VenueEditSuggestion | null = null;
  action: 'approve' | 'reject' | null = null;
  /** What the server or the timeout said, shown instead of the generic message. */
  actionErrorMessage: string | null = null;
  note = '';
  sourceReviewed = false;
  page = 0;
  hasMore = false;
  loading = false;
  loadError = false;
  actionError = false;
  updating = false;
  private version = 0;
  private readonly destroyed = new Subject<void>();

  constructor(private readonly api: VenueEditSuggestionsService,
    private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(0); }

  changeMode(mode: 'pending' | 'history'): void {
    // Keep the moderation context stable until the in-flight write completes.
    if (this.mode === mode || this.updating) return;
    this.mode = mode;
    this.page = 0;
    this.selected = null;
    this.action = null;
    this.load(0);
  }

  load(page = this.page): void {
    if (!Number.isInteger(page) || page < 0 || page > 1000 || this.updating) return;
    const request = ++this.version;
    this.page = page;
    this.loading = true;
    this.loadError = false;
    // A failed/slow request must not retain the previous page's next-page state.
    this.hasMore = false;
    this.selected = null;
    this.action = null;
    this.suggestions = [];
    const request$ = this.mode === 'history' ? this.api.history(page) : this.api.pending(page);
    request$.pipe(timeout(12000), takeUntil(this.destroyed)).subscribe({
      next: response => {
        if (request !== this.version) return;
        this.suggestions = response.suggestions;
        this.hasMore = response.hasMore;
        this.selected = null;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        if (request !== this.version) return;
        this.suggestions = [];
        this.loading = false;
        this.loadError = true;
        this.cdr.markForCheck();
      }
    });
  }

  fields(item: VenueEditSuggestion): VenueEditField[] {
    return Object.keys(item.proposed) as VenueEditField[];
  }

  hasProposedContact(item: VenueEditSuggestion): boolean {
    return typeof item.proposed.contact === 'string' && !!item.proposed.contact.trim();
  }

  needsEvidenceReview(item: VenueEditSuggestion): boolean {
    return this.hasProposedContact(item)
      || item.proposed.latitude !== undefined || item.proposed.longitude !== undefined;
  }

  /** A source is user supplied; this validation is about safe links, not authenticity. */
  sourceLink(item: VenueEditSuggestion): string | null {
    if (typeof item.sourceUrl !== 'string' || item.sourceUrl.length > 500) return null;
    try {
      const url = new URL(item.sourceUrl);
      if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.hostname.endsWith('.')
          || url.username || url.password || (url.port && url.port !== '443')
          || url.hash || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)
          || /^[0-9.]+$/.test(url.hostname)) return null;
      return url.href;
    } catch { return null; }
  }

  canApproveSelected(): boolean {
    return !this.selected || !this.needsEvidenceReview(this.selected)
      || (!!this.sourceLink(this.selected) && this.sourceReviewed);
  }

  open(item: VenueEditSuggestion): void {
    this.selected = item;
    this.action = null;
    this.note = '';
    this.sourceReviewed = false;
    this.actionError = false;
    this.actionErrorMessage = null;
  }

  close(): void {
    if (this.updating) return;
    this.selected = null;
    this.action = null;
    this.sourceReviewed = false;
  }

  decide(): void {
    if (!this.selected || !this.action || this.updating || this.mode !== 'pending'
        || this.selected.status !== 'PENDING') return;
    if (this.action === 'approve' && !this.canApproveSelected()) {
      this.actionError = true;
      return;
    }
    if (this.action === 'reject' && this.note.trim().length < 5) {
      this.actionError = true;
      return;
    }
    const id = this.selected.id, decision = this.action;
    this.updating = true;
    this.actionError = false;
    this.actionErrorMessage = null;
    // The server must receive the moderator's explicit attestation; the UI-only
    // checkbox must never be mistaken for an authorization check.
    const decisionRequest = decision === 'approve' && this.needsEvidenceReview(this.selected)
      ? this.api.decide(id, decision, this.note.trim(), this.sourceReviewed)
      : this.api.decide(id, decision, this.note.trim());
    decisionRequest
      .pipe(timeout(12000), takeUntil(this.destroyed),
        finalize(() => { this.updating = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: () => {
          this.suggestions = this.suggestions.filter(x => x.id !== id);
          this.selected = null;
          this.action = null;
          if (!this.suggestions.length && this.hasMore) this.load(this.page);
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          // Includes 409 for a stale venue field; never auto-repeat a write.
          this.actionError = true;
          const timedOut = !!error && typeof error === 'object' && (error as { name?: string }).name === 'TimeoutError';
          const server = (error as { error?: { message?: string } } | null)?.error?.message;
          this.actionErrorMessage = timedOut
            ? 'A resposta demorou e não sabemos se a decisão ficou guardada. Atualizámos a lista: vê se a proposta ainda está por analisar antes de repetir.'
            : (typeof server === 'string' && server.trim() ? server.trim() : null);
          if (timedOut) { this.selected = null; this.action = null; this.load(this.page); }
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy(): void {
    ++this.version;
    this.destroyed.next();
    this.destroyed.complete();
  }
}
