import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { AuthenticationService } from '../../services/authethication.service';
import { ManagedVenue, VenueBookingService } from '../../services/venue-booking.service';

export interface HomeShortcut { id: string; label: string; icon: string; route: string | (string | number)[]; }

/** Every shortcut a person can pin; "my-venues" and "book-court" only when they apply. */
export const SHORTCUT_CATALOG: HomeShortcut[] = [
  { id: 'create', label: 'Criar jogo', icon: '➕', route: '/menu/createEvent' },
  { id: 'my-games', label: 'Os meus jogos', icon: '📅', route: '/menu/my-sessions' },
  { id: 'games', label: 'Encontrar jogos', icon: '🔎', route: '/menu/events' },
  { id: 'communities', label: 'Comunidades', icon: '👥', route: '/menu/communities' },
  { id: 'tournaments', label: 'Torneios', icon: '🏆', route: '/menu/teams/competitions' },
  { id: 'teams', label: 'Equipas', icon: '🛡️', route: '/menu/teams' },
  { id: 'messages', label: 'Mensagens', icon: '💬', route: '/menu/messages' },
  { id: 'venues', label: 'Recintos', icon: '📍', route: '/menu/venues' },
  { id: 'people', label: 'Pessoas', icon: '🙋', route: '/menu/discover' },
  { id: 'my-bookings', label: 'As minhas reservas', icon: '🎟️', route: '/menu/venue-bookings' },
  { id: 'book-court', label: 'Reservar campo', icon: '🗓️', route: '/menu/reservar' },
  { id: 'my-venues', label: 'Os meus recintos', icon: '🏟️', route: '/menu/venue-bookings' },
];
export const DEFAULT_SHORTCUTS = ['create', 'my-games', 'communities', 'tournaments'];
export const MAX_SHORTCUTS = 6;
const STORAGE_PREFIX = 'jynlo-home-shortcuts:';

/** The pinned ids, in order, keeping only ids that exist and are available now. */
export function resolveShortcuts(saved: string[] | null, available: Set<string>, manager: boolean): string[] {
  const valid = (ids: string[]) => ids.filter((id, i) => available.has(id) && ids.indexOf(id) === i).slice(0, MAX_SHORTCUTS);
  if (saved) return valid(saved);
  // Until someone edits, venue managers get their venues first.
  return valid(manager ? ['my-venues', ...DEFAULT_SHORTCUTS] : DEFAULT_SHORTCUTS);
}

/** Início: a row of shortcuts each person picks and orders; the main navigation stays the same for everyone. */
@Component({
  selector: 'app-home-shortcuts',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hs" [attr.aria-label]="'Os teus atalhos' | t">
      <div class="hs__head">
        <strong>{{ 'Os teus atalhos' | t }}</strong>
        <button type="button" class="hs__edit" (click)="editing ? cancel() : startEdit()">{{ editing ? ('Cancelar' | t) : ('Personalizar' | t) }}</button>
      </div>
      @if (!editing) {
        <div class="hs__row">
          @for (s of pinned(); track s.id) {
            <a class="hs__item" [routerLink]="routeOf(s)">
              <span class="hs__icon" aria-hidden="true">{{ s.icon }}</span>
              <span>{{ s.label | t }}</span>
              @if (s.id === 'my-venues' && pending) { <span class="hs__badge">{{ pending }}</span> }
            </a>
          }
        </div>
      } @else {
        <p class="hs__muted">{{ 'Escolhe até 6 atalhos e põe-nos pela ordem que preferires.' | t }}</p>
        <ul class="hs__list">
          @for (id of draft; track id; let i = $index) {
            <li class="hs__line">
              <span>{{ byId(id)?.icon }} {{ byId(id)?.label ?? '' | t }}</span>
              <span class="hs__tools">
                <button type="button" [disabled]="i === 0" (click)="move(i, -1)" [attr.aria-label]="'Subir' | t">↑</button>
                <button type="button" [disabled]="i === draft.length - 1" (click)="move(i, 1)" [attr.aria-label]="'Descer' | t">↓</button>
                <button type="button" (click)="remove(id)" [attr.aria-label]="'Remover' | t">✕</button>
              </span>
            </li>
          }
        </ul>
        @if (addable().length) {
          <p class="hs__muted">{{ 'Adicionar' | t }}</p>
          <div class="hs__row">
            @for (s of addable(); track s.id) {
              <button type="button" class="hs__item hs__item--add" [disabled]="draft.length >= max" (click)="add(s.id)">
                <span aria-hidden="true">{{ s.icon }}</span> {{ s.label | t }}
              </button>
            }
          </div>
        }
        <div class="hs__actions">
          <button type="button" class="jynlo-action jynlo-action--primary" (click)="save()">{{ 'Guardar' | t }}</button>
          <button type="button" class="jynlo-action jynlo-action--neutral" (click)="restore()">{{ 'Repor os atalhos iniciais' | t }}</button>
        </div>
      }
    </section>
  `,
  styles: [`
    .hs { display:grid; gap:.6rem; padding:1rem; margin-bottom:1rem; border-radius:18px; border:1px solid rgba(96,176,182,.3); background:rgba(10,41,55,.55); color:#eafff9; }
    .hs__head { display:flex; justify-content:space-between; align-items:center; gap:.5rem; }
    .hs__edit { background:none; border:0; color:#62e6c4; font:inherit; font-weight:700; cursor:pointer; }
    .hs__row { display:flex; gap:.5rem; flex-wrap:wrap; }
    .hs__item { position:relative; display:inline-flex; align-items:center; gap:.45rem; min-height:44px; padding:0 .9rem; border-radius:14px;
      border:1px solid rgba(96,176,182,.35); background:rgba(4,24,33,.6); color:#eafff9; text-decoration:none; font:inherit; font-weight:700; cursor:pointer; }
    .hs__item:hover { border-color:#62e6c4; }
    .hs__item--add { border-style:dashed; }
    .hs__item[disabled] { opacity:.45; cursor:not-allowed; }
    .hs__icon { font-size:1.1rem; }
    .hs__badge { min-width:1.2rem; height:1.2rem; padding:0 .3rem; display:inline-grid; place-items:center; border-radius:999px; background:#62e6c4; color:#04212b; font-size:.72rem; }
    .hs__muted { margin:0; color:#b9d4d6; font-size:.86rem; }
    .hs__list { list-style:none; margin:0; padding:0; display:grid; gap:.35rem; }
    .hs__line { display:flex; justify-content:space-between; align-items:center; gap:.5rem; padding:.45rem .6rem; border-radius:12px; background:rgba(4,24,33,.6); }
    .hs__tools { display:flex; gap:.3rem; }
    .hs__tools button { width:36px; height:36px; border-radius:10px; border:1px solid rgba(96,176,182,.35); background:transparent; color:#eafff9; cursor:pointer; }
    .hs__tools button[disabled] { opacity:.35; cursor:not-allowed; }
    .hs__actions { display:flex; gap:.5rem; flex-wrap:wrap; }
  `]
})
export class HomeShortcutsComponent implements OnInit {
  readonly max = MAX_SHORTCUTS;
  ids: string[] = [];
  draft: string[] = [];
  editing = false;
  managed: ManagedVenue[] = [];
  pending = 0;
  private bookingsOpen = false;
  private saved: string[] | null = null;

  private readonly bookings = inject(VenueBookingService);
  private readonly auth = inject(AuthenticationService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.saved = this.readSaved();
    this.refresh();
    this.bookings.managed().subscribe({
      next: list => { this.managed = list || []; this.pending = this.managed.reduce((n, v) => n + (v.pendingRequests || 0), 0); this.refresh(); },
      error: () => { /* not a manager, or offline */ }
    });
    this.bookings.accepting().subscribe(ids => { this.bookingsOpen = ids.length > 0; this.refresh(); });
  }

  pinned(): HomeShortcut[] { return this.ids.map(id => this.byId(id)).filter((s): s is HomeShortcut => !!s); }
  addable(): HomeShortcut[] { return this.available().filter(s => !this.draft.includes(s.id)); }
  byId(id: string): HomeShortcut | undefined { return SHORTCUT_CATALOG.find(s => s.id === id); }

  routeOf(s: HomeShortcut): string | (string | number)[] {
    if (s.id === 'my-venues' && this.managed.length === 1) return ['/menu/venues', this.managed[0].venueId, 'manage'];
    return s.route;
  }

  startEdit(): void { this.draft = [...this.ids]; this.editing = true; }
  cancel(): void { this.editing = false; }
  add(id: string): void { if (this.draft.length < MAX_SHORTCUTS && !this.draft.includes(id)) this.draft = [...this.draft, id]; }
  remove(id: string): void { this.draft = this.draft.filter(x => x !== id); }
  move(i: number, step: number): void {
    const j = i + step;
    if (j < 0 || j >= this.draft.length) return;
    const next = [...this.draft];
    [next[i], next[j]] = [next[j], next[i]];
    this.draft = next;
  }
  save(): void { this.saved = [...this.draft]; this.writeSaved(this.saved); this.editing = false; this.refresh(); }
  restore(): void { this.saved = null; this.writeSaved(null); this.editing = false; this.refresh(); }

  private available(): HomeShortcut[] {
    return SHORTCUT_CATALOG.filter(s => (s.id !== 'my-venues' || this.managed.length > 0) && (s.id !== 'book-court' || this.bookingsOpen));
  }

  private refresh(): void {
    this.ids = resolveShortcuts(this.saved, new Set(this.available().map(s => s.id)), this.managed.length > 0);
    this.cdr.markForCheck();
  }

  private key(): string {
    let user = '';
    try { user = this.auth?.isLoggedIn() ? (this.auth.loggedInPerfilname ?? '') : ''; } catch { user = ''; }
    return STORAGE_PREFIX + (user || 'me');
  }
  private readSaved(): string[] | null {
    try {
      const raw = localStorage.getItem(this.key());
      const value = raw ? JSON.parse(raw) : null;
      return Array.isArray(value) ? value.filter((x: unknown) => typeof x === 'string') : null;
    } catch { return null; }
  }
  private writeSaved(ids: string[] | null): void {
    try { if (ids) localStorage.setItem(this.key(), JSON.stringify(ids)); else localStorage.removeItem(this.key()); } catch { /* private mode */ }
  }
}
