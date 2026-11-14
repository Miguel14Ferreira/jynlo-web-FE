import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from 'src/environment/environment';

interface SportSuggestion {
  id: number;
  name: string;
  usageCount: number;
  status: 'PENDING' | 'REVIEWED' | 'REJECTED';
  firstRequestedAt: string;
  lastRequestedAt: string;
}

@Component({
  selector: 'app-admin-sport-suggestions',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="sport-admin">
      <header class="heading">
        <div>
          <p class="eyebrow">Administração · Modalidades</p>
          <h1>Desportos sugeridos pela comunidade</h1>
          <p>Ordenados por utilização em sessões independentes. A revisão não ativa
            automaticamente regras de torneios ou classificações.</p>
        </div>
        <a routerLink="/menu/admin" href="/menu/admin">Voltar à administração</a>
      </header>
      <div class="filters" role="group" aria-label="Estado das sugestões">
        @for (value of statuses; track value) {
          <button type="button" [attr.aria-pressed]="status===value"
            [class.active]="status===value" (click)="load(value)">
            {{value === 'PENDING' ? 'Por rever' : value === 'REVIEWED' ? 'Revistas'
              : value === 'REJECTED' ? 'Rejeitadas' : 'Todas'}}
          </button>
        }
      </div>
      @if (loading) { <p role="status">A carregar sugestões…</p> }
      @if (error) { <p role="alert">{{error}}</p> }
      @if (!loading && !error && !items.length) {
        <p class="empty">Ainda não existem sugestões neste estado.</p>
      }
      <div class="suggestions">
        @for (item of items; track item.id) {
          <article>
            <div>
              <strong>{{item.name}}</strong>
              <p>{{item.usageCount}} {{item.usageCount === 1 ? 'sessão criada' : 'sessões criadas'}}
                · Última utilização: {{item.lastRequestedAt | date:'dd/MM/yyyy'}}</p>
              <small>Estado: {{item.status === 'PENDING' ? 'Por rever'
                : item.status === 'REVIEWED' ? 'Revista' : 'Rejeitada'}}</small>
            </div>
            <div class="actions">
              @if (item.status !== 'REVIEWED') {
                <button type="button" [disabled]="busyId!==null" (click)="decide(item,'REVIEWED')">
                  Marcar como revista
                </button>
              }
              @if (item.status !== 'REJECTED') {
                <button type="button" [disabled]="busyId!==null" (click)="decide(item,'REJECTED')">
                  Rejeitar
                </button>
              }
            </div>
          </article>
        }
      </div>
    </section>
  `,
  styles: [`
    .sport-admin{max-width:1080px;margin:auto;padding:clamp(1rem,3vw,2.5rem);color:var(--text-primary,#e7f4f1)}
    .heading{display:flex;justify-content:space-between;gap:1.5rem;align-items:start;flex-wrap:wrap}
    .heading h1{font-size:clamp(1.3rem,2.5vw,2rem);margin:.2rem 0}
    .heading p{max-width:680px;line-height:1.5}
    .eyebrow{font-size:.8rem;opacity:.75;text-transform:uppercase;letter-spacing:.08em}
    .heading a{color:#32c8a2}
    .filters{display:flex;flex-wrap:wrap;gap:.5rem;margin:1.5rem 0}
    button{border:1px solid #38605b;background:#123a35;color:#e7f4f1;
      padding:.6rem .8rem;border-radius:.6rem;cursor:pointer;font:inherit}
    button.active{border-color:#36d2aa;background:#18634f}
    button:disabled{opacity:.5;cursor:not-allowed}
    .suggestions{display:grid;gap:.75rem}
    article{background:#102924;border:1px solid #31544e;border-radius:.8rem;
      padding:1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
    article strong{font-size:1.1rem}article p{font-size:.85rem;margin:.4rem 0;color:#abcac2}
    article small{color:#8fb4aa}.actions{display:flex;gap:.5rem;flex-wrap:wrap}
    .empty{padding:1.5rem;border:1px dashed #45675e;border-radius:.8rem}
  `]
})
export class AdminSportSuggestionsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly endpoint = environment.apiUrl.replace(/\/+$/, '') + '/api/admin/sport-suggestions';
  readonly statuses = ['PENDING','REVIEWED','REJECTED','ALL'] as const;
  status: (typeof this.statuses)[number] = 'PENDING';
  items: SportSuggestion[] = [];
  loading = false;
  busyId: number | null = null;
  error = '';
  private requestRevision = 0;

  ngOnInit(): void { this.load(); }

  load(status: (typeof this.statuses)[number] = this.status): void {
    const revision = ++this.requestRevision;
    this.status = status;
    this.error = '';
    this.loading = true;
    this.http.get<SportSuggestion[]>(this.endpoint,
      {params: new HttpParams().set('status', status)})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          if(revision !== this.requestRevision)return;
          this.items = items; this.loading = false;
        },
        error: () => {
          if(revision !== this.requestRevision)return;
          this.error='Não foi possível carregar as sugestões.'; this.loading=false;
        }
      });
  }

  decide(item: SportSuggestion, status: 'REVIEWED' | 'REJECTED'): void {
    if(this.busyId !== null)return;
    this.busyId=item.id;this.error='';
    this.http.patch<void>(this.endpoint+'/'+item.id+'/status', {status})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {this.busyId=null;this.load();},
        error: () => {this.busyId=null;this.error='Não foi possível atualizar a sugestão.';}
      });
  }
}
