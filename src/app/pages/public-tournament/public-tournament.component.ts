import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Subscription, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PublicTournamentGame, PublicTournamentPage, PublicTournamentService } from '../../services/public-tournament.service';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

interface Round { round: number; group: number | null; games: PublicTournamentGame[]; }

/** /torneio/:id — shareable table and results, readable without an account. */
@Component({
  selector: 'app-public-tournament',
  standalone: true,
  imports: [SportNamePipe, CommonModule, RouterModule, TranslatePipe],
  templateUrl: './public-tournament.component.html',
  styleUrls: ['./public-tournament.component.css']
})
export class PublicTournamentComponent implements OnInit, OnDestroy {
  page: PublicTournamentPage | null = null;
  rounds: Round[] = [];
  loading = true;
  notFound = false;
  failed = false;
  private sub?: Subscription;
  private routeSub?: Subscription;

  constructor(private readonly route: ActivatedRoute, private readonly api: PublicTournamentService,
              private readonly title: Title, private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      if (!Number.isSafeInteger(id) || id <= 0) { this.loading = false; this.notFound = true; return; }
      this.load(id);
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); this.routeSub?.unsubscribe(); }

  load(id: number): void {
    this.sub?.unsubscribe();
    this.loading = true; this.notFound = false; this.failed = false;
    this.sub = this.api.page(id).pipe(timeout(15000)).subscribe({
      next: page => {
        this.page = page;
        this.rounds = this.groupRounds(page.games);
        this.loading = false;
        this.title.setTitle(page.name + ' · Jynlo');
        this.cdr.markForCheck();
      },
      error: failure => {
        this.loading = false;
        if (failure?.status === 404) this.notFound = true; else this.failed = true;
        this.cdr.markForCheck();
      }
    });
  }

  retry(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isSafeInteger(id) && id > 0) this.load(id);
  }

  statusKey(status: string): string {
    return status === 'COMPLETED' ? 'publicTournament.statusCompleted'
      : status === 'IN_PROGRESS' ? 'publicTournament.statusLive' : 'publicTournament.statusDraft';
  }

  completedGames(): number { return this.page?.games.filter(g => g.status === 'COMPLETED').length ?? 0; }

  private groupRounds(games: PublicTournamentGame[]): Round[] {
    const map = new Map<string, Round>();
    for (const game of games) {
      const key = (game.group ?? 0) + ':' + game.round;
      if (!map.has(key)) map.set(key, { round: game.round, group: game.group, games: [] });
      map.get(key)!.games.push(game);
    }
    return [...map.values()].sort((a, b) => (a.group ?? 0) - (b.group ?? 0) || a.round - b.round);
  }
}
