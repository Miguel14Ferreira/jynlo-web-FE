import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { Subscription, timeout } from 'rxjs';
import { CommunityGroup } from '../model/community-group';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommunityTournamentEligibilityService, TournamentEligibilityOverview } from '../../services/community-tournament-eligibility.service';

/** Management alert: pre-existing registrations must be checked before kickoff. */
@Component({
  selector: 'app-community-tournament-eligibility-panel',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <section class="eligibility-panel" aria-labelledby="eligibility-title">
      <div class="eligibility-header">
        <h4 id="eligibility-title">{{ 'communities.tournaments.eligibility.title' | t }}</h4>
        <button type="button" class="jynlo-action jynlo-action--neutral" (click)="reload()" [disabled]="loading">{{ 'communities.tournaments.eligibility.refresh' | t }}</button>
      </div>
      <p>{{ 'communities.tournaments.eligibility.description' | t }}</p>
      @if (loading) {
        <p role="status">{{ 'communities.tournaments.eligibility.loading' | t }}</p>
      } @else if (error) {
        <p role="alert">{{ error | t }}</p>
      } @else if (overview && overview.ineligibleEntries.length > 0) {
        <p role="alert">{{ 'communities.tournaments.eligibility.suspendedCount' | t:{count:overview.ineligibleEntries.length} }}</p>
        <ul>
          @for (entry of overview.ineligibleEntries; track $index) {
            <li>
              <strong>{{ memberName(entry.profileId) }}</strong>
              @if (entry.teamId !== null) { · {{ 'communities.tournaments.eligibility.team' | t }} #{{ entry.teamId }} }
              @if (entry.participantStatus) { · {{ (entry.participantStatus === 'CONFIRMED' ? 'communities.tournaments.eligibility.confirmed' : 'communities.tournaments.eligibility.pending') | t }} }
              · {{ 'communities.tournaments.eligibility.until' | t }} {{ entry.suspendedUntil | date:'dd/MM/yyyy HH:mm' }}
            </li>
          }
        </ul>
      } @else if (overview) {
        <p role="status">{{ 'communities.tournaments.eligibility.noSuspensions' | t }}</p>
      }
      @if (overview) {
        <small>{{ 'communities.tournaments.eligibility.checkedAt' | t }} {{ overview.checkedAt | date:'dd/MM/yyyy HH:mm' }}.
          {{ 'communities.tournaments.eligibility.disclaimer' | t }}</small>
      }
    </section>
  `,
  styles: [`
    .eligibility-panel { border:1px solid var(--border-color,#77889955); border-radius:14px; padding:1rem; margin:1rem 0; }
    .eligibility-header { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; }
    .eligibility-header h4 { margin:0; }
    .eligibility-header button { padding:.4rem .7rem; border-radius:8px; }
    .eligibility-panel p { margin:.7rem 0; }
    .eligibility-panel li { margin:.35rem 0; }
    .eligibility-panel small { opacity:.75; }
  `]
})
export class CommunityTournamentEligibilityPanelComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) community!: CommunityGroup;
  @Input({ required: true }) tournamentId!: number;
  @Input() entryType?: TournamentEligibilityOverview['entryType'];
  overview: TournamentEligibilityOverview | null = null;
  loading = false;
  error = '';
  private revision = 0;
  private request?: Subscription;
  private destroyed = false;

  constructor(private readonly api: CommunityTournamentEligibilityService,
              private readonly changeDetector: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['community'] || changes['tournamentId'] || changes['entryType']) this.reload();
  }

  memberName(profileId: number): string {
    const member = this.community?.members?.find(p => p.profileId === profileId);
    return member?.fullName || member?.username || `#${profileId}`;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    ++this.revision;
    this.request?.unsubscribe();
  }

  reload(): void {
    if (this.destroyed) return;
    // Abort the previous tournament's private report when selection or role changes.
    ++this.revision;
    this.request?.unsubscribe();
    this.request = undefined;
    const id = this.community?.id;
    const tournament = this.tournamentId;
    const expectedEntryType = this.entryType;
    const revision = this.revision;
    this.overview = null;
    this.error = '';
    this.loading = false;
    if (!id || !tournament || !['OWNER','ADMIN'].includes(this.community.myRole ?? '')) return;
    this.loading = true;
    this.request = this.api.overview(id, tournament).pipe(timeout(12000)).subscribe({
      next: result => {
        if (this.destroyed || revision !== this.revision) return;
        // Never display an out-of-scope report if a cache/proxy/server response
        // returns a different tournament than the one the organizer selected.
        if (result.tournamentId !== tournament
          || (expectedEntryType && result.entryType !== expectedEntryType)) {
          this.error = 'communities.tournaments.eligibility.loadError';
          this.loading = false;
          this.changeDetector.markForCheck();
          return;
        }
        this.overview = result;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (this.destroyed || revision !== this.revision) return;
        this.error = 'communities.tournaments.eligibility.loadError';
        this.loading = false;
        this.changeDetector.markForCheck();
      }
    });
  }
}
