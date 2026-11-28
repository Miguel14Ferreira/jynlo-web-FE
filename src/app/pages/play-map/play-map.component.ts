import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { catchError, of, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { SessionService } from '../../services/session.service';
import { PlayTabsComponent } from '../../shared/play-tabs/play-tabs.component';
import { SessionSummary } from '../model/session-summary';
import { SessionDiscoveryMapComponent, SessionMapSearchArea } from '../discover/session-discovery-map.component';

/** Jogar → Mapa: public games on the map, searchable by the visible area. */
@Component({
  selector: 'app-play-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslatePipe, PlayTabsComponent, SessionDiscoveryMapComponent],
  template: `
    <section class="play-map-page jynlo-c1">
      <div class="play-map-shell">
        <app-play-tabs active="map"></app-play-tabs>
        @if (loading) { <p class="play-map-note" role="status">{{ 'A carregar…' | t }}</p> }
        @if (error) { <p class="play-map-note" role="alert">{{ 'Não foi possível carregar os jogos. Tenta novamente.' | t }}</p> }
        <app-session-discovery-map [sessions]="sessions" (searchArea)="searchArea($event)"></app-session-discovery-map>
      </div>
    </section>
  `,
  styles: [`
    .play-map-shell { width: min(1240px, calc(100% - 32px)); margin: 0 auto; padding: 96px 0 40px; }
    .play-map-note { color: #b9d4d6; margin: 0 0 10px; }
  `],
})
export class PlayMapComponent implements OnInit {
  private readonly api = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);
  sessions: SessionSummary[] = [];
  loading = false;
  error = false;

  ngOnInit(): void { this.load({}); }

  searchArea(area: SessionMapSearchArea): void {
    if (![area.latitude, area.longitude, area.radiusKm].every(Number.isFinite)) return;
    this.load({ latitude: area.latitude, longitude: area.longitude, radiusKm: Math.min(500, Math.max(5, area.radiusKm)) });
  }

  private load(filters: { latitude?: number; longitude?: number; radiusKm?: number }): void {
    this.loading = true; this.error = false; this.cdr.markForCheck();
    this.api.discover({ ...filters, privateGame: false, from: new Date().toISOString() }).pipe(timeout(15000), catchError(() => { this.error = true; return of([] as SessionSummary[]); }))
      .subscribe(list => { this.sessions = list ?? []; this.loading = false; this.cdr.markForCheck(); });
  }
}
