import { Component, HostListener, Input, OnChanges } from '@angular/core';
import { SessionSummary } from '../model/session-summary';

interface Tile { key: string; url: string; left: number; top: number; }
interface MapPin { session: SessionSummary; left: number; top: number; }
type MapArea = 'mainland' | 'azores' | 'madeira';

/**
 * Public discovery map, deliberately not an exact navigation map.
 * The API supplies coarse cell centres; never replace them with exact venue GPS.
 * OSM tiles are shown using a lightweight slippy-map implementation.
 */
@Component({
  selector: 'app-session-discovery-map',
  standalone: false,
  template: `
    <div class="jynlo-session-map">
      <div class="jynlo-session-map-toolbar" aria-label="Navegar no mapa de Portugal">
        <button type="button" (click)="showArea('mainland')">Continente</button>
        <button type="button" (click)="showArea('azores')">Açores</button>
        <button type="button" (click)="showArea('madeira')">Madeira</button>
        <button type="button" (click)="zoomBy(1)" aria-label="Aproximar mapa">+</button>
        <button type="button" (click)="zoomBy(-1)" aria-label="Afastar mapa">−</button>
      </div>
      <div class="jynlo-session-map-viewport" aria-label="Mapa das zonas aproximadas dos jogos"
        (pointerdown)="startPan($event)" (pointermove)="movePan($event)"
        (pointerup)="stopPan()" (pointercancel)="stopPan()" (lostpointercapture)="stopPan()">
        @for (tile of tiles; track tile.key) {
          <img class="jynlo-session-map-tile" [src]="tile.url"
            [style.left.px]="tile.left" [style.top.px]="tile.top" alt="" draggable="false">
        }
        @for (pin of pins; track pin.session.id) {
          <button type="button" class="jynlo-session-map-pin" [style.left.px]="pin.left"
            [style.top.px]="pin.top" [attr.aria-label]="'Ver ' + pin.session.sport + ' em ' + pin.session.city"
            (pointerdown)="$event.stopPropagation()" (click)="select(pin.session)">
            <span aria-hidden="true">●</span>
          </button>
        }
      </div>
      <p class="jynlo-session-map-caption">© OpenStreetMap contributors · Os marcadores indicam zonas aproximadas, não pontos de encontro exatos.</p>
      @if (selected; as session) {
        <div class="jynlo-session-map-selected">
          <div><strong>{{ session.sport }}</strong><span>{{ session.city }} · {{ session.gameDate | date:'dd/MM HH:mm' }}</span></div>
          <a [routerLink]="['/menu/events', session.id]">Ver jogo →</a>
        </div>
      }
      @if (pins.length === 0) {
        <p class="jynlo-session-map-empty">Não há sessões com localização pública nesta área. Experimenta outra região ou consulta a lista.</p>
      }
    </div>
  `,
  styles: [`
    .jynlo-session-map{display:grid;gap:.7rem;min-width:0}
    .jynlo-session-map-toolbar{display:flex;flex-wrap:wrap;gap:.4rem}
    .jynlo-session-map-toolbar button{background:#0d3443;border:1px solid #257485;border-radius:.6rem;color:#f4fbfd;padding:.45rem .7rem;cursor:pointer;font-weight:700}
    .jynlo-session-map-toolbar button:hover,.jynlo-session-map-toolbar button:focus-visible{background:#176175}
    .jynlo-session-map-viewport{height:420px;overflow:hidden;position:relative;background:#133f4b;border:1px solid #276074;border-radius:1rem;touch-action:none;user-select:none;cursor:grab}
    .jynlo-session-map-viewport:active{cursor:grabbing}
    .jynlo-session-map-tile{position:absolute;width:256px;height:256px;max-width:none;pointer-events:none}
    .jynlo-session-map-pin{position:absolute;transform:translate(-50%,-100%);z-index:1;border:2px solid #f6fffe;border-radius:100%;width:26px;height:26px;background:#00bca9;color:#002b30;display:grid;place-items:center;cursor:pointer;box-shadow:0 3px 12px #052d46a8}
    .jynlo-session-map-pin:hover,.jynlo-session-map-pin:focus-visible{background:#fff;transform:translate(-50%,-100%) scale(1.18)}
    .jynlo-session-map-caption,.jynlo-session-map-empty{font-size:.76rem;color:#bad0d7;margin:0;line-height:1.5}
    .jynlo-session-map-selected{display:flex;justify-content:space-between;gap:1rem;align-items:center;border:1px solid #245669;border-radius:.8rem;padding:.75rem}
    .jynlo-session-map-selected div{display:grid;gap:.2rem;min-width:0}
    .jynlo-session-map-selected span{font-size:.79rem;color:#9cc4cf}
    .jynlo-session-map-selected a{white-space:nowrap;color:#3ce5d2;font-weight:800}
  `]
})
export class SessionDiscoveryMapComponent implements OnChanges {
  @Input() sessions: SessionSummary[] = [];
  tiles: Tile[] = [];
  pins: MapPin[] = [];
  selected: SessionSummary | null = null;
  private center = { latitude: 39.5, longitude: -8.0 };
  private zoom = 7;
  private width = 850;
  private readonly height = 420;
  private drag: { x: number; y: number; lat: number; lon: number } | null = null;

  ngOnChanges(): void {
    if (this.selected && !this.sessions.some(s => s.id === this.selected?.id)) this.selected = null;
    this.update();
  }

  @HostListener('window:resize')
  resize(): void {
    this.update();
  }

  showArea(area: MapArea): void {
    const target = {
      mainland: { latitude: 39.5, longitude: -8.0, zoom: 7 },
      azores: { latitude: 38.5, longitude: -28.0, zoom: 7 },
      madeira: { latitude: 32.7, longitude: -16.9, zoom: 9 }
    }[area];
    this.center = { latitude: target.latitude, longitude: target.longitude };
    this.zoom = target.zoom;
    this.selected = null;
    this.update();
  }

  zoomBy(delta: number): void {
    this.zoom = Math.max(4, Math.min(13, this.zoom + delta));
    this.update();
  }

  select(session: SessionSummary): void { this.selected = session; }

  startPan(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    this.drag = { x: event.clientX, y: event.clientY, lat: this.center.latitude, lon: this.center.longitude };
    target.setPointerCapture(event.pointerId);
  }

  movePan(event: PointerEvent): void {
    if (!this.drag) return;
    const scale = 256 * 2 ** this.zoom;
    const initial = this.project(this.drag.lat, this.drag.lon);
    const movedX = initial.x - (event.clientX - this.drag.x);
    const movedY = initial.y - (event.clientY - this.drag.y);
    const lon = movedX / scale * 360 - 180;
    const lat = 180 / Math.PI * (2 * Math.atan(Math.exp(Math.PI * (1 - 2 * movedY / scale))) - Math.PI / 2);
    this.center = { latitude: Math.max(-85, Math.min(85, lat)), longitude: Math.max(-180, Math.min(180, lon)) };
    this.update();
  }

  stopPan(): void { this.drag = null; }

  private project(latitude: number, longitude: number): { x: number; y: number } {
    const size = 256 * 2 ** this.zoom;
    const clamped = Math.max(-85.051128, Math.min(85.051128, latitude));
    const sin = Math.sin(clamped * Math.PI / 180);
    return { x: (longitude + 180) / 360 * size,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
  }

  private update(): void {
    // The map's container width varies with the Explore grid and viewport.
    const element = typeof document === 'undefined' ? null : document.querySelector('.jynlo-session-map-viewport');
    this.width = element?.clientWidth || this.width;
    const centre = this.project(this.center.latitude, this.center.longitude);
    const left = centre.x - this.width / 2, top = centre.y - this.height / 2;
    const max = 2 ** this.zoom;
    const tiles: Tile[] = [];
    for (let x = Math.floor(left / 256); x <= Math.floor((left + this.width) / 256); x++) {
      for (let y = Math.floor(top / 256); y <= Math.floor((top + this.height) / 256); y++) {
        if (y < 0 || y >= max) continue;
        const wrappedX = ((x % max) + max) % max;
        tiles.push({ key: `${this.zoom}-${x}-${y}`,
          url: `https://tile.openstreetmap.org/${this.zoom}/${wrappedX}/${y}.png`,
          left: x * 256 - left, top: y * 256 - top });
      }
    }
    this.tiles = tiles;
    this.pins = this.sessions.filter(session =>
      session.privateGame !== true && session.audience !== 'COMMUNITY_ONLY' &&
      typeof session.latitude === 'number' && typeof session.longitude === 'number' &&
      Number.isFinite(session.latitude) && Number.isFinite(session.longitude) &&
      Math.abs(session.latitude) <= 90 && Math.abs(session.longitude) <= 180
    ).map(session => {
      const point = this.project(session.latitude!, session.longitude!);
      return { session, left: point.x - left, top: point.y - top };
    }).filter(pin => pin.left >= 0 && pin.left <= this.width && pin.top >= 0 && pin.top <= this.height);
  }
}
