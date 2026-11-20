import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Generates a real PNG accepted by the existing protected team-logo upload API.
 * No untrusted SVG/HTML or external artwork is ever loaded into the canvas. */
@Component({
  standalone: true,
  selector: 'app-team-crest-editor',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="crest-editor" aria-label="Criador de emblemas">
      <div class="crest-editor-intro">
        <div><strong>Criar emblema Jynlo</strong>
          <p>Desenha um emblema único para a tua equipa. Podes alterá-lo mais tarde.</p></div>
        <span class="crest-label">NOVO</span>
      </div>
      <div class="crest-designer">
        <div class="crest-preview" aria-label="Pré-visualização do emblema">
          <svg viewBox="0 0 320 360" role="img" [attr.aria-label]="'Emblema ' + teamName">
            <path [attr.d]="shieldPath" [attr.fill]="primary" stroke="#f8ffff" stroke-width="9"/>
            <path [attr.d]="shieldPath" fill="none" [attr.stroke]="secondary" stroke-width="5"
              transform="translate(160 170) scale(.91) translate(-160 -170)"/>
            <path *ngIf="shape==='shield'" d="M74 106H246" [attr.stroke]="secondary" stroke-width="5"/>
            <text x="160" y="160" text-anchor="middle" font-size="87" font-weight="800"
              [attr.fill]="secondary" font-family="Arial,sans-serif">{{ symbolLabel }}</text>
            <text x="160" y="221" text-anchor="middle" font-size="28" font-weight="900"
              [attr.fill]="secondary" font-family="Arial,sans-serif">{{ initials }}</text>
            <text x="160" y="264" text-anchor="middle" font-size="17" font-weight="750"
              [attr.fill]="secondary" font-family="Arial,sans-serif">JYNLO · {{ year }}</text>
          </svg>
        </div>
        <div class="crest-fields">
          <label>Formato
            <select [(ngModel)]="shape" [disabled]="disabled">
              <option value="shield">Escudo</option>
              <option value="circle">Circular</option>
              <option value="hex">Hexagonal</option>
              <option value="diamond">Losango</option>
              <option value="rounded">Escudo arredondado</option>
            </select>
          </label>
          <label>Símbolo
            <select [(ngModel)]="symbol" [disabled]="disabled">
              <option value="ball">⚽ Futebol</option>
              <option value="star">★ Estrela</option>
              <option value="bolt">⚡ Energia</option>
              <option value="trophy">🏆 Troféu</option>
              <option value="letter">Iniciais</option>
              <option value="crown">♛ Coroa</option>
              <option value="flame">🔥 Chama</option>
              <option value="heart">♥ Coração</option>
            </select>
          </label>
          <label>Iniciais
            <input [(ngModel)]="customInitials" maxlength="4" autocomplete="off"
              [disabled]="disabled" placeholder="Ex.: JFC">
          </label>
          <label>Ano
            <input [(ngModel)]="year" inputmode="numeric" maxlength="4" [disabled]="disabled">
          </label>
          <div class="crest-colors">
            <label>Cor principal <input type="color" [(ngModel)]="primary" [disabled]="disabled"></label>
            <label>Cor secundária <input type="color" [(ngModel)]="secondary" [disabled]="disabled"></label>
          </div>
          <button type="button" class="crest-save" (click)="save()" [disabled]="disabled">
            {{ disabled ? 'A guardar…' : 'Guardar como emblema da equipa' }}
          </button>
          <small *ngIf="error" role="alert">{{ error }}</small>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .crest-editor{margin:14px 0;padding:17px;border:1px solid #458e86;border-radius:16px;background:#0b2936;color:#effff9}
    .crest-editor-intro{display:flex;justify-content:space-between;gap:12px;align-items:start}
    .crest-editor-intro strong{font-size:1.05rem}.crest-editor-intro p{margin:5px 0 12px;font-size:.79rem;color:#c2d9d7}
    .crest-label{font-size:.65rem;color:#072e30;background:#6ef0c5;padding:5px 9px;border-radius:7px;font-weight:900}
    .crest-designer{display:grid;grid-template-columns:minmax(180px,260px) minmax(0,1fr);gap:20px;align-items:center}
    .crest-preview{padding:14px;border:1px solid #44787e;border-radius:14px;background:radial-gradient(circle,#174d55,#071e2b)}
    .crest-preview svg{display:block;width:100%;height:auto;max-height:290px}
    .crest-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .crest-fields label{display:grid;gap:5px;font-size:.76rem;font-weight:750}
    .crest-fields select,.crest-fields input:not([type=color]){width:100%;min-width:0;box-sizing:border-box;padding:9px;border:1px solid #5a9290;
      border-radius:8px;background:#102d3b;color:white;font:inherit}
    .crest-colors{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:20px}
    .crest-colors label{display:flex;align-items:center;gap:8px}
    .crest-colors input{height:35px;width:54px;border:0;cursor:pointer;background:transparent}
    .crest-save{grid-column:1/-1;border:0;background:#55edc4;color:#062c31;border-radius:10px;padding:12px;font-weight:850;cursor:pointer}
    .crest-save:disabled{opacity:.6;cursor:wait}
    .crest-fields small{grid-column:1/-1;color:#ffc3c3}
    .crest-fields :is(button,input,select):focus-visible{outline:3px solid #a6ffe0;outline-offset:2px}
    @media(max-width:670px){.crest-designer{grid-template-columns:1fr}.crest-preview{width:min(240px,100%);box-sizing:border-box;margin:auto}}
  `]
})
export class TeamCrestEditorComponent {
  @Input() teamName = '';
  @Input() disabled = false;
  @Output() generated = new EventEmitter<File>();
  shape: 'shield'|'circle'|'hex'|'diamond'|'rounded' = 'shield';
  symbol: 'ball'|'star'|'bolt'|'trophy'|'letter'|'crown'|'flame'|'heart' = 'ball';
  primary = '#0D7169';
  secondary = '#F5FFFF';
  customInitials = '';
  year = new Date().getFullYear().toString();
  error = '';
  get initials(): string {
    return (this.customInitials.trim() || this.teamName.split(/\s+/).filter(Boolean).map(s => s[0]).join(''))
      .replace(/[^A-Za-z0-9À-ÿ]/g,'').toUpperCase().slice(0,4) || 'J';
  }
  get symbolLabel(): string {
    return {ball:'⚽',star:'★',bolt:'⚡',trophy:'🏆',letter:'◆',crown:'♛',flame:'🔥',heart:'♥'}[this.symbol];
  }
  get shieldPath(): string {
    if (this.shape==='circle') return 'M160 23 A142 142 0 1 1 159.99 23 Z';
    if (this.shape==='hex') return 'M160 17 L286 89 L286 252 L160 333 L34 252 L34 89 Z';
    if (this.shape==='diamond') return 'M160 15 L297 169 L160 345 L23 169 Z';
    if (this.shape==='rounded') return 'M68 27 H252 Q288 27 288 66 V209 Q276 287 160 339 Q44 287 32 209 V66 Q32 27 68 27 Z';
    return 'M42 34 H278 V207 Q269 284 160 340 Q51 284 42 207 Z';
  }
  save():void {
    if (this.disabled || typeof document==='undefined') return;
    this.error='';
    const year = this.year.trim();
    if (!/^\d{4}$/.test(year)) { this.error='Indica um ano com quatro algarismos.'; return; }
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=512;
    const ctx=canvas.getContext('2d');
    if(!ctx){this.error='Este navegador não suporta a criação de emblemas.';return;}
    ctx.scale(1.6,1.42);
    const path=new Path2D(this.shieldPath);
    ctx.fillStyle=this.primary;ctx.strokeStyle='#f8ffff';ctx.lineWidth=8;
    ctx.fill(path);ctx.stroke(path);
    ctx.save();
    ctx.translate(160,170);ctx.scale(.91,.91);ctx.translate(-160,-170);
    ctx.strokeStyle=this.secondary;ctx.lineWidth=5;ctx.stroke(path);ctx.restore();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=this.secondary;
    ctx.font='bold 80px Arial';ctx.fillText(this.symbolLabel,160,145);
    ctx.font='900 32px Arial';ctx.fillText(this.initials,160,218);
    ctx.font='bold 17px Arial';ctx.fillText('JYNLO · '+year,160,268);
    canvas.toBlob(blob=>{
      if(!blob){this.error='Não foi possível criar o PNG.';return;}
      this.generated.emit(new File([blob],'emblema-jynlo.png',{type:'image/png'}));
    },'image/png');
  }
}
