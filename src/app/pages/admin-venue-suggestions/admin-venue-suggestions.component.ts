import { ChangeDetectorRef, Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { Subject, takeUntil, timeout, finalize } from 'rxjs';
import {
  AdminVenueSuggestion, AdminVenueSuggestionsService
} from '../../services/admin-venue-suggestions.service';

@Component({
  selector: 'app-admin-venue-suggestions',
  templateUrl: './admin-venue-suggestions.component.html',
  styleUrls: ['./admin-venue-suggestions.component.css'],
  standalone: false
})
export class AdminVenueSuggestionsComponent implements OnInit, OnDestroy {
  suggestions: AdminVenueSuggestion[] = [];
  selected: AdminVenueSuggestion | null = null;
  action: 'approve' | 'reject' | null = null;
  page = 0;
  hasMore = false;
  loading = false;
  loadError = false;
  actionError = false;
  updatingId: number | null = null;
  private requestVersion = 0;
  private readonly destroyed = new Subject<void>();

  constructor(private readonly api: AdminVenueSuggestionsService,
    private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }

  load(page = this.page): void {
    if (page < 0 || !Number.isInteger(page)) return;
    const version = ++this.requestVersion;
    this.page = page;
    this.loadError = false;
    this.loading = true;
    this.hasMore = false;
    this.cdr.markForCheck();
    this.api.list(page).pipe(timeout(12000), takeUntil(this.destroyed)).subscribe({
      next: value => {
        if (version !== this.requestVersion) return;
        this.suggestions = value.suggestions;
        this.hasMore = value.hasMore;
        this.loading = false;
        this.selected = null;
        this.action = null;
        this.cdr.markForCheck();
      },
      error: () => {
        if (version !== this.requestVersion) return;
        this.suggestions = [];
        this.loading = false;
        this.loadError = true;
        this.hasMore = false;
        this.cdr.markForCheck();
      }
    });
  }

  open(suggestion: AdminVenueSuggestion): void {
    this.selected = suggestion;
    this.action = null;
    this.actionError = false;
    this.cdr.markForCheck();
  }

  close(): void {
    if (this.updatingId !== null) return;
    this.selected = null;
    this.action = null;
    this.actionError = false;
    this.cdr.markForCheck();
  }

  propose(action: 'approve' | 'reject'): void {
    if (this.updatingId !== null || !this.selected) return;
    this.action = action;
    this.actionError = false;
    this.cdr.markForCheck();
  }

  cancel(): void {
    if (this.updatingId === null) {
      this.action = null;
      this.cdr.markForCheck();
    }
  }

  confirm(): void {
    if (!this.selected || !this.action || this.updatingId !== null) return;
    const id = this.selected.id;
    const action = this.action;
    this.updatingId = id;
    this.actionError = false;
    this.cdr.markForCheck();
    this.api.decide(id, action)
      .pipe(timeout(12000), finalize(() => {
        this.updatingId = null;
        this.cdr.markForCheck();
      }), takeUntil(this.destroyed))
      .subscribe({
        next: () => {
          this.suggestions = this.suggestions.filter(x => x.id !== id);
          this.selected = null;
          this.action = null;
          if (this.suggestions.length === 0 && this.hasMore) this.load(this.page);
          this.cdr.markForCheck();
        },
        error: () => {
          // Never assume the decision took effect on a transport failure.
          // User must explicitly retry; no automatic retries of write requests.
          this.actionError = true;
          this.cdr.markForCheck();
        }
      });
  }

  ngOnDestroy(): void {
    ++this.requestVersion;
    this.destroyed.next();
    this.destroyed.complete();
  }
}
