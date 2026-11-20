import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Editable, versioned project; the SVG is drawn locally, never injected from stored HTML. */
export interface TeamCrestDesign {
  version:1;
  shape:string;symbol:string;pattern:string;
  primary:string;secondary:string;textColor:string;borderColor:string;
  patternOpacity:number;borderWidth:number;symbolSize:number;symbolY:number;
  showInitials:boolean;innerBorder:boolean;initialsSize:number;initialsY:number;
  customInitials:string;caption:string;
}
/** Sport-neutral badge designer. Exports a PNG and its editable model atomically. */
@Component({
  standalone: true,
  selector: 'app-team-crest-editor',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="crest-editor" aria-label="Estúdio de emblemas Jynlo">
      <header class="crest-editor-intro">
        <div><strong>Estúdio de emblemas</strong>
          <p>Constrói a identidade da tua equipa, em qualquer modalidade. Nenhum símbolo ou texto é obrigatório.</p>
        </div><span class="crest-label">PERSONALIZÁVEL</span>
      </header>
      <div class="crest-designer">
        <div class="crest-preview">
          <svg viewBox="0 0 320 360" role="img" [attr.aria-label]="'Pré-visualização do emblema da equipa ' + teamName">
            <defs>
              <clipPath id="crestDesignClip"><path [attr.d]="shieldPath"/></clipPath>
            </defs>
            <path [attr.d]="shieldPath" [attr.fill]="primary" [attr.stroke]="borderColor" [attr.stroke-width]="borderWidth"/>
            <g clip-path="url(#crestDesignClip)" [attr.opacity]="patternOpacity/100">
              <ng-container [ngSwitch]="pattern">
                <path *ngSwitchCase="'diagonal'" d="M-60 300 L240 -40 L335 15 L35 355 Z" [attr.fill]="secondary"/>
                <g *ngSwitchCase="'stripes'" [attr.fill]="secondary">
                  <rect x="66" y="0" width="38" height="360"/><rect x="141" y="0" width="38" height="360"/><rect x="216" y="0" width="38" height="360"/>
                </g>
                <g *ngSwitchCase="'hoops'" [attr.fill]="secondary">
                  <rect x="0" y="80" width="320" height="35"/><rect x="0" y="165" width="320" height="35"/><rect x="0" y="250" width="320" height="35"/>
                </g>
                <path *ngSwitchCase="'split'" d="M160 0H320V360H160Z" [attr.fill]="secondary"/>
                <path *ngSwitchCase="'chevron'" d="M0 75 L160 175 L320 75 V125 L160 225 L0 125 Z" [attr.fill]="secondary"/>
              </ng-container>
            </g>
            <path *ngIf="innerBorder" [attr.d]="shieldPath" fill="none" [attr.stroke]="borderColor" stroke-width="4"
              transform="translate(160 178) scale(.88) translate(-160 -178)"/>
            <text *ngIf="symbol !== 'none'" x="160" [attr.y]="symbolY" dominant-baseline="central"
              text-anchor="middle" [attr.font-size]="symbolSize" font-weight="800"
              [attr.fill]="textColor" font-family="Arial,sans-serif">{{symbolLabel}}</text>
            <text *ngIf="showInitials" x="160" [attr.y]="initialsY" dominant-baseline="central" text-anchor="middle"
              [attr.font-size]="initialsSize" font-weight="900" [attr.fill]="textColor" font-family="Arial,sans-serif">{{initials}}</text>
            <text *ngIf="footerText" x="160" y="286" dominant-baseline="central" text-anchor="middle"
              font-size="16" font-weight="750" [attr.fill]="textColor" font-family="Arial,sans-serif">{{footerText}}</text>
          </svg>
          <p>{{loadedFromTeam?'Projeto guardado reaberto para edição':'Pré-visualização em tempo real'}}</p>
        </div>
        <div class="crest-fields">
          <div class="crest-wide" role="group" aria-label="Modelos rápidos de emblema">
            <strong>Começar com um estilo</strong>
            <div class="crest-presets">
              <button type="button" *ngFor="let preset of presets" [disabled]="disabled"
                (click)="applyPreset(preset.id)">{{preset.label}}</button>
            </div>
          </div>
          <label>Formato
            <select [(ngModel)]="shape" [disabled]="disabled">
              <option value="shield">Escudo clássico</option><option value="rounded">Escudo arredondado</option>
              <option value="circle">Circular</option><option value="hex">Hexágono</option>
              <option value="diamond">Losango</option><option value="square">Quadrado</option>
              <option value="oval">Oval</option><option value="banner">Estandarte</option>
            </select>
          </label>
          <label>Elemento central
            <select [(ngModel)]="symbol" [disabled]="disabled">
              <option value="none">Sem símbolo</option><option value="letter">Monograma</option>
              <option value="star">★ Estrela</option><option value="bolt">⚡ Raio</option>
              <option value="crown">♛ Coroa</option><option value="flame">🔥 Chama</option>
              <option value="heart">♥ Coração</option><option value="trophy">🏆 Troféu</option>
              <option value="ball">⚽ Futebol</option><option value="basketball">🏀 Basquetebol</option>
              <option value="volleyball">🏐 Voleibol</option><option value="tennis">🎾 Ténis</option>
              <option value="rugby">🏉 Rugby</option><option value="badminton">🏸 Badminton</option>
              <option value="cricket">🏏 Cricket</option><option value="hockey">🏑 Hóquei</option>
              <option value="golf">⛳ Golfe</option><option value="cycling">🚴 Ciclismo</option>
              <option value="running">🏃 Atletismo</option><option value="swimming">🏊 Natação</option>
              <option value="boxing">🥊 Desportos de combate</option><option value="target">🎯 Precisão</option>
              <option value="mountain">⛰ Montanha</option><option value="wave">≈ Ondas</option>
            </select>
          </label>
          <label>Estilo de fundo
            <select [(ngModel)]="pattern" [disabled]="disabled">
              <option value="none">Liso</option><option value="diagonal">Faixa diagonal</option>
              <option value="stripes">Riscas verticais</option><option value="hoops">Riscas horizontais</option>
              <option value="split">Duas metades</option><option value="chevron">Chevron</option>
            </select>
          </label>
          <label>Iniciais (até 5)
            <input [(ngModel)]="customInitials" maxlength="5" autocomplete="off" [disabled]="disabled" placeholder="Ex.: JYNLO">
          </label>
          <label class="crest-check"><input type="checkbox" [(ngModel)]="showInitials" [disabled]="disabled"> Mostrar iniciais</label>
          <label class="crest-check"><input type="checkbox" [(ngModel)]="innerBorder" [disabled]="disabled"> Aro interior</label>
          <label class="crest-wide">Texto inferior opcional
            <input [(ngModel)]="caption" maxlength="22" autocomplete="off" [disabled]="disabled"
              placeholder="Ex.: DESDE 2026 · LISBOA">
          </label>
          <div class="crest-colors">
            <label>Fundo <input type="color" [(ngModel)]="primary" [disabled]="disabled"></label>
            <label>Padrão <input type="color" [(ngModel)]="secondary" [disabled]="disabled"></label>
            <label>Texto <input type="color" [(ngModel)]="textColor" [disabled]="disabled"></label>
            <label>Contorno <input type="color" [(ngModel)]="borderColor" [disabled]="disabled"></label>
          </div>
          <label *ngIf="pattern!=='none'" class="crest-wide">Intensidade do padrão · {{patternOpacity}}%
            <input type="range" min="0" max="100" step="5" [(ngModel)]="patternOpacity" [disabled]="disabled">
          </label>
          <label>Largura do contorno · {{borderWidth}}
            <input type="range" min="0" max="14" step="1" [(ngModel)]="borderWidth" [disabled]="disabled">
          </label>
          <label *ngIf="symbol!=='none'">Tamanho do símbolo · {{symbolSize}}
            <input type="range" min="30" max="112" step="2" [(ngModel)]="symbolSize" [disabled]="disabled">
          </label>
          <label *ngIf="symbol!=='none'">Posição do símbolo
            <input type="range" min="85" max="205" step="5" [(ngModel)]="symbolY" [disabled]="disabled">
          </label>
          <label *ngIf="showInitials">Tamanho das iniciais · {{initialsSize}}
            <input type="range" min="16" max="54" step="2" [(ngModel)]="initialsSize" [disabled]="disabled">
          </label>
          <label *ngIf="showInitials">Posição das iniciais
            <input type="range" min="165" max="265" step="5" [(ngModel)]="initialsY" [disabled]="disabled">
          </label>
          <button type="button" class="crest-reset" [disabled]="disabled" (click)="reset()">Repor desenho</button>
          <button type="button" class="crest-save" (click)="save()" [disabled]="disabled">
            {{disabled ? 'A guardar…' : 'Guardar emblema da equipa'}}
          </button>
          <small *ngIf="error" role="alert">{{error}}</small>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .crest-editor{margin:14px 0;padding:17px;border:1px solid #458e86;border-radius:16px;background:#0b2936;color:#effff9}
    .crest-editor-intro{display:flex;justify-content:space-between;gap:12px;align-items:start}
    .crest-editor-intro strong{font-size:1.05rem}.crest-editor-intro p{margin:5px 0 12px;font-size:.79rem;color:#c2d9d7}
    .crest-label{font-size:.62rem;color:#072e30;background:#6ef0c5;padding:5px 9px;border-radius:7px;font-weight:900}
    .crest-designer{display:grid;grid-template-columns:minmax(180px,300px) minmax(0,1fr);gap:20px;align-items:start}
    .crest-preview{position:sticky;top:18px;padding:14px;border:1px solid #44787e;border-radius:14px;background:radial-gradient(circle,#174d55,#071e2b)}
    .crest-preview svg{display:block;width:100%;height:auto;max-height:330px}
    .crest-preview p{color:#b4d5d8;font-size:.7rem;text-align:center}
    .crest-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .crest-fields label{display:grid;gap:5px;font-size:.76rem;font-weight:750;min-width:0}
    .crest-fields select,.crest-fields input:not([type=color]):not([type=checkbox]):not([type=range]){width:100%;min-width:0;box-sizing:border-box;padding:9px;border:1px solid #5a9290;
      border-radius:8px;background:#102d3b;color:white;font:inherit}
    .crest-wide,.crest-colors{grid-column:1/-1}
    .crest-presets{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
    .crest-presets button{padding:8px 11px;border:1px solid #478f8a;border-radius:9px;background:#103944;color:#dbfff4;cursor:pointer}
    .crest-presets button:hover{background:#18525b}
    .crest-check{display:flex!important;flex-direction:row;align-items:center;gap:8px!important}
    .crest-check input{accent-color:#55edc4}
    .crest-colors{display:flex;flex-wrap:wrap;gap:12px}
    .crest-colors label{display:flex;align-items:center;gap:7px}
    .crest-colors input{height:33px;width:43px;border:0;cursor:pointer;background:transparent}
    .crest-fields input[type=range]{width:100%;accent-color:#55edc4}
    .crest-reset{background:#153d4b;color:#d9fff7;border:1px solid #458e86;border-radius:10px;padding:10px;cursor:pointer}
    .crest-save{border:0;background:#55edc4;color:#062c31;border-radius:10px;padding:12px;font-weight:850;cursor:pointer}
    .crest-save:disabled{opacity:.6;cursor:wait}
    .crest-fields small{grid-column:1/-1;color:#ffc3c3}
    .crest-fields :is(button,input,select):focus-visible{outline:3px solid #a6ffe0;outline-offset:2px}
    @media(max-width:730px){.crest-designer{grid-template-columns:1fr}.crest-preview{position:static;width:min(260px,100%);box-sizing:border-box;margin:auto}}
    @media(max-width:430px){.crest-fields{grid-template-columns:1fr}.crest-wide,.crest-colors{grid-column:1}}
  `]
})
export class TeamCrestEditorComponent {
  @Input() teamName='';
  @Input() disabled=false;
  @Input() set savedDesign(raw:string|null|undefined) {
    if(!raw)return;
    try {
      const design=JSON.parse(raw) as TeamCrestDesign;
      if(design.version!==1 || !['shield','rounded','circle','hex','diamond','square','oval','banner'].includes(design.shape))return;
      this.applyDesign(design);
      this.loadedFromTeam=true;
    } catch { this.error='Não foi possível reabrir o desenho guardado.'; }
  }
  @Output() generated=new EventEmitter<{file:File;design:string}>();
  loadedFromTeam=false;
  shape='shield';symbol='none';pattern='none';
  primary='#0D7169';secondary='#F5FFFF';textColor='#FFFFFF';borderColor='#F5FFFF';
  patternOpacity=30;borderWidth=8;symbolSize=76;symbolY=145;
  showInitials=true;innerBorder=true;initialsSize=30;initialsY=225;
  customInitials='';caption='';error='';
  private snapshot():TeamCrestDesign {
    return {version:1,shape:this.shape,symbol:this.symbol,pattern:this.pattern,
      primary:this.primary,secondary:this.secondary,textColor:this.textColor,
      borderColor:this.borderColor,patternOpacity:this.patternOpacity,borderWidth:this.borderWidth,
      symbolSize:this.symbolSize,symbolY:this.symbolY,showInitials:this.showInitials,
      innerBorder:this.innerBorder,initialsSize:this.initialsSize,initialsY:this.initialsY,
      customInitials:this.customInitials,caption:this.caption};
  }
  private applyDesign(value:TeamCrestDesign):void {
    this.shape=value.shape;this.symbol=value.symbol;this.pattern=value.pattern;
    this.primary=value.primary;this.secondary=value.secondary;
    this.textColor=value.textColor;this.borderColor=value.borderColor;
    this.patternOpacity=value.patternOpacity;this.borderWidth=value.borderWidth;
    this.symbolSize=value.symbolSize;this.symbolY=value.symbolY;
    this.showInitials=value.showInitials;this.innerBorder=value.innerBorder;
    this.initialsSize=value.initialsSize;this.initialsY=value.initialsY;
    this.customInitials=value.customInitials;this.caption=value.caption;
  }
  readonly presets=[
    {id:'classic',label:'Clássico'},{id:'minimal',label:'Minimalista'},
    {id:'modern',label:'Moderno'},{id:'retro',label:'Retro'},
    {id:'energy',label:'Energia'},{id:'blank',label:'Em branco'}
  ];
  applyPreset(id:string):void {
    this.reset();
    switch(id){
      case 'classic':this.symbol='star';this.caption='DESDE 2026';break;
      case 'minimal':this.shape='circle';this.borderWidth=2;this.innerBorder=false;this.showInitials=true;break;
      case 'modern':this.shape='hex';this.pattern='diagonal';this.patternOpacity=35;this.symbol='bolt';break;
      case 'retro':this.shape='rounded';this.pattern='hoops';this.patternOpacity=22;this.primary='#692a28';this.secondary='#f6d891';this.textColor='#fff1d2';this.borderColor='#f6d891';break;
      case 'energy':this.shape='diamond';this.pattern='chevron';this.primary='#142e60';this.secondary='#23dbb0';this.symbol='flame';break;
      case 'blank':this.showInitials=false;this.innerBorder=false;this.borderWidth=0;break;
    }
  }
  get initials():string {
    return (this.customInitials.trim() || this.teamName.split(/\s+/).filter(Boolean).map(s=>s[0]).join(''))
      .replace(/[^A-Za-z0-9À-ÿ]/g,'').toUpperCase().slice(0,5)||'J';
  }
  get footerText():string{return this.caption.trim().slice(0,22);}
  get symbolLabel():string {
    const icons:Record<string,string>={none:'',letter:'◆',star:'★',bolt:'⚡',crown:'♛',flame:'🔥',
      heart:'♥',trophy:'🏆',ball:'⚽',basketball:'🏀',volleyball:'🏐',tennis:'🎾',
      rugby:'🏉',badminton:'🏸',cricket:'🏏',hockey:'🏑',golf:'⛳',cycling:'🚴',
      running:'🏃',swimming:'🏊',boxing:'🥊',target:'🎯',mountain:'⛰',wave:'≈'};
    return icons[this.symbol]||'';
  }
  get shieldPath():string {
    switch(this.shape){
      case 'circle':return 'M160 23 A142 142 0 1 1 159.99 23 Z';
      case 'hex':return 'M160 17 L286 89 L286 252 L160 333 L34 252 L34 89 Z';
      case 'diamond':return 'M160 15 L297 169 L160 345 L23 169 Z';
      case 'rounded':return 'M68 27 H252 Q288 27 288 66 V209 Q276 287 160 339 Q44 287 32 209 V66 Q32 27 68 27 Z';
      case 'square':return 'M43 34 H277 V326 H43 Z';
      case 'oval':return 'M160 20 C260 20 293 84 293 180 C293 277 259 340 160 340 C61 340 27 277 27 180 C27 84 60 20 160 20 Z';
      case 'banner':return 'M42 34 H278 V321 L160 261 L42 321 Z';
      default:return 'M42 34 H278 V207 Q269 284 160 340 Q51 284 42 207 Z';
    }
  }
  reset():void {
    this.shape='shield';this.symbol='none';this.pattern='none';
    this.primary='#0D7169';this.secondary='#F5FFFF';this.textColor='#FFFFFF';
    this.borderColor='#F5FFFF';this.patternOpacity=30;this.borderWidth=8;
    this.symbolSize=76;this.symbolY=145;this.showInitials=true;
    this.innerBorder=true;this.initialsSize=30;this.initialsY=225;
    this.customInitials='';this.caption='';this.error='';
  }
  save():void {
    if(this.disabled||typeof document==='undefined')return;
    this.error='';
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=576;
    const ctx=canvas.getContext('2d');
    if(!ctx){this.error='Este navegador não suporta a criação de emblemas.';return;}
    ctx.scale(1.6,1.6);
    const path=new Path2D(this.shieldPath);
    ctx.fillStyle=this.primary;ctx.fill(path);
    ctx.save();ctx.clip(path);ctx.globalAlpha=this.patternOpacity/100;ctx.fillStyle=this.secondary;
    if(this.pattern==='diagonal'){
      ctx.beginPath();ctx.moveTo(-60,300);ctx.lineTo(240,-40);ctx.lineTo(335,15);ctx.lineTo(35,355);ctx.closePath();ctx.fill();
    }else if(this.pattern==='stripes'){
      [66,141,216].forEach(x=>ctx.fillRect(x,0,38,360));
    }else if(this.pattern==='hoops'){
      [80,165,250].forEach(y=>ctx.fillRect(0,y,320,35));
    }else if(this.pattern==='split'){
      ctx.fillRect(160,0,160,360);
    }else if(this.pattern==='chevron'){
      ctx.beginPath();ctx.moveTo(0,75);ctx.lineTo(160,175);ctx.lineTo(320,75);ctx.lineTo(320,125);
      ctx.lineTo(160,225);ctx.lineTo(0,125);ctx.closePath();ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle=this.borderColor;ctx.lineWidth=this.borderWidth;ctx.stroke(path);
    if(this.innerBorder){
      ctx.save();ctx.translate(160,178);ctx.scale(.88,.88);ctx.translate(-160,-178);
      ctx.strokeStyle=this.borderColor;ctx.lineWidth=4;ctx.stroke(path);ctx.restore();
    }
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=this.textColor;
    if(this.symbol!=='none'){
      ctx.font='800 '+this.symbolSize+'px Arial, sans-serif';
      ctx.fillText(this.symbolLabel,160,this.symbolY,270);
    }
    if(this.showInitials){
      ctx.font='900 '+this.initialsSize+'px Arial, sans-serif';
      ctx.fillText(this.initials,160,this.initialsY,245);
    }
    if(this.footerText){
      ctx.font='750 16px Arial, sans-serif';
      ctx.fillText(this.footerText,160,286,245);
    }
    canvas.toBlob(blob=>{
      if(!blob){this.error='Não foi possível criar o PNG.';return;}
      this.generated.emit({file:new File([blob],'emblema-jynlo.png',{type:'image/png'}),
        design:JSON.stringify(this.snapshot())});
    },'image/png');
  }
}
