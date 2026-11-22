import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Subscription, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PublicRankingPage, PublicRankingService } from '../../services/public-ranking.service';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

/** /classificacao/:id — the community's season ranking, readable without an account. */
@Component({
  selector: 'app-public-ranking',
  standalone: true,
  imports: [SportNamePipe, CommonModule, RouterModule, TranslatePipe],
  templateUrl: './public-ranking.component.html',
  styleUrls: ['../public-tournament/public-tournament.component.css']
})
export class PublicRankingComponent implements OnInit, OnDestroy {
  page: PublicRankingPage | null = null;
  loading = true;
  notFound = false;
  failed = false;
  private communityId = 0;
  private sub?: Subscription;
  private routeSub?: Subscription;

  constructor(private readonly route: ActivatedRoute, private readonly api: PublicRankingService,
              private readonly title: Title, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      if (!Number.isSafeInteger(id) || id <= 0) { this.loading = false; this.notFound = true; return; }
      this.communityId = id;
      const season = Number(this.route.snapshot.queryParamMap.get('epoca'));
      this.load(Number.isSafeInteger(season) && season > 0 ? season : null);
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); this.routeSub?.unsubscribe(); }

  load(seasonId: number | null): void {
    this.sub?.unsubscribe();
    this.loading = !this.page; this.notFound = false; this.failed = false;
    this.sub = this.api.page(this.communityId, seasonId).pipe(timeout(15000)).subscribe({
      next: page => {
        this.page = page; this.loading = false;
        this.title.setTitle(this.t(page.communityName) + ' · Classificação · Jynlo');
        this.cdr.markForCheck();
      },
      error: failure => {
        this.loading = false;
        if (failure?.status === 404) this.notFound = true; else this.failed = true;
        this.cdr.markForCheck();
      }
    });
  }

  selectSeason(value: string): void {
    const id = Number(value);
    this.load(Number.isSafeInteger(id) && id > 0 ? id : null);
  }

  selectedSeasonName(): string | null {
    return this.page?.seasons.find(s => s.id === this.page?.selectedSeasonId)?.name ?? null;
  }

  private t(value: string | null): string { return value ?? 'Jynlo'; }
}
