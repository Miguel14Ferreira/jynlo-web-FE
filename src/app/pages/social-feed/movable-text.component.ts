import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface TextPlacement {
  x: number; y: number; rotation: number; scale: number;
}

/** Shared direct-manipulation control for post and story text. Pointer events
 * support mouse, touch and pen, and all calculations use stage-relative units. */
@Component({
  selector: 'app-movable-text',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (text.trim()) {
      <div class="movable-text" [style.left.%]="placement.x"
           [style.top.%]="placement.y"
           [style.color]="color"
           [style.background]="background"
           [style.font-family]="fontFamily"
           [style.transform]="'translate(-50%,-50%) rotate(' + placement.rotation + 'deg) scale(' + placement.scale + ')'"
           (pointerdown)="begin($event, 'move')" (pointermove)="move($event)"
           (pointerup)="finish($event)" (pointercancel)="finish($event)"
           [class.plain]="plain" aria-label="Arrastar texto para mover">
        <span>{{ text }}</span>
        <button type="button" class="handle rotate" aria-label="Rodar texto"
          (pointerdown)="begin($event, 'rotate')">↻</button>
        <button type="button" class="handle resize" aria-label="Redimensionar texto"
          (pointerdown)="begin($event, 'resize')">↘</button>
      </div>
    }
  `,
  styles: [`
    :host {position:absolute;inset:0;z-index:8;pointer-events:none}
    .movable-text {position:absolute;max-width:76%;min-width:70px;box-sizing:border-box;
      color:white;background:#071923bb;border:1px dashed #5eead4;
      border-radius:8px;padding:9px 15px;text-align:center;font-weight:800;
      font-size:clamp(14px,2vw,23px);white-space:pre-wrap;overflow-wrap:anywhere;
      cursor:grab;touch-action:none;user-select:none;pointer-events:auto;
      transform-origin:center;line-height:1.25; text-shadow:0 1px 5px #000}
    .movable-text:active{cursor:grabbing}
    .movable-text.plain{background:transparent!important}
    .handle{position:absolute;width:29px;height:29px;border-radius:50%;
      border:1px solid #5eead4;color:#eaffff;background:#082b34;
      cursor:crosshair;touch-action:none;display:grid;place-items:center;font-size:17px}
    .rotate{top:-35px;left:50%;transform:translateX(-50%)}
    .resize{right:-20px;bottom:-20px}
  `]
})
export class MovableTextComponent {
  @Input() text = '';
  @Input() plain = false;
  @Input() color = '#ffffff';
  @Input() background = 'rgba(7,25,35,.73)';
  @Input() fontFamily = 'system-ui, sans-serif';
  @Input() placement: TextPlacement = {x:50,y:50,rotation:0,scale:1};
  @Output() placementChange = new EventEmitter<TextPlacement>();
  private action: 'move' | 'rotate' | 'resize' | null = null;
  private pointerId = -1;
  private origin: TextPlacement = {x:50,y:50,rotation:0,scale:1};
  private initialX = 0;
  private initialY = 0;
  private centerX = 0;
  private centerY = 0;
  private stageWidth = 1;
  private stageHeight = 1;
  begin(event: PointerEvent, action: 'move' | 'rotate' | 'resize'): void {
    if (this.action || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const stage = target.closest('app-movable-text') as HTMLElement | null;
    const rect = stage?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    this.action = action;
    this.pointerId = event.pointerId;
    this.origin = {...this.placement};
    this.initialX = event.clientX;
    this.initialY = event.clientY;
    this.stageWidth = rect.width;
    this.stageHeight = rect.height;
    this.centerX = rect.left + rect.width * this.origin.x / 100;
    this.centerY = rect.top + rect.height * this.origin.y / 100;
    target.setPointerCapture(event.pointerId);
  }
  move(event: PointerEvent): void {
    if (!this.action || event.pointerId !== this.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - this.initialX;
    const dy = event.clientY - this.initialY;
    let value = {...this.origin};
    if (this.action === 'move') {
      value.x = Math.max(12,Math.min(88,this.origin.x + dx / this.stageWidth * 100));
      value.y = Math.max(9,Math.min(91,this.origin.y + dy / this.stageHeight * 100));
    } else if (this.action === 'rotate') {
      const start = Math.atan2(this.initialY-this.centerY,this.initialX-this.centerX);
      const now = Math.atan2(event.clientY-this.centerY,event.clientX-this.centerX);
      value.rotation = Math.round(this.origin.rotation + (now-start)*180/Math.PI);
    } else {
      value.scale = Math.max(.55,Math.min(2.8,this.origin.scale +
        (dx + dy) / Math.min(this.stageWidth,this.stageHeight)));
    }
    this.placementChange.emit(value);
  }
  finish(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.action = null;
    this.pointerId = -1;
  }
}
