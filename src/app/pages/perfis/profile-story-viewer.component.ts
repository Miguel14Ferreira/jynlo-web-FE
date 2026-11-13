import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnDestroy, Output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SocialStory } from '../model/social-story';

@Component({
  selector:'app-profile-story-viewer',
  standalone:true,
  imports:[CommonModule,RouterModule],
  template:`
    <div class="profile-story-backdrop" (click)="closed.emit()">
      <section role="dialog" aria-modal="true" class="profile-story-dialog"
        [attr.aria-label]="'Stories de '+username" (click)="$event.stopPropagation()">
        <div class="profile-story-progress" aria-label="Progresso das stories">
          @for(story of stories;track story.id;let i=$index){
            <div class="profile-story-track"><span [style.width.%]="i<index ? 100 : i===index ? progress : 0"></span></div>
          }
        </div>
        <header>
          <span>&#64;{{username}}</span>
          <button type="button" (click)="closed.emit()" aria-label="Fechar story">×</button>
        </header>
        @if(active;as story){
          <div class="profile-story-media">
            @if(story.video){
              <video [src]="story.mediaUrl" autoplay playsinline [muted]="muted" #video
                (loadedmetadata)="videoDuration($event)" (ended)="next()"></video>
              <button type="button" class="profile-story-mute" (click)="muted=!muted">
                {{muted?'Ativar som':'Silenciar'}}
              </button>
            } @else {
              <img [src]="story.mediaUrl" [alt]="story.altText || 'Story de '+username"
                (load)="imageReady=true" (error)="mediaError=true">
            }
            @if(story.caption){
              <span class="profile-story-caption"
                [style.left.%]="story.textX ?? 50" [style.top.%]="story.textY ?? 74"
                [style.transform]="'translate(-50%,-50%) rotate('+(story.textRotation||0)+'deg) scale('+(story.textZoom||1)+')'"
                [style.color]="fontColor(story)" [style.background]="captionBackground(story)"
                [style.font-family]="fontFamily(story)">{{story.caption}}</span>
            }
            @if(story.locationLabel){
              <a class="profile-story-location" target="_blank" rel="noopener noreferrer"
                [href]="'https://www.google.com/maps/search/?api=1&query='+encode(story.locationLabel)">
                📍 {{story.locationLabel}}
              </a>
            }
            @if(story.showTime){
              <span class="profile-story-time">{{story.createdAt | date:'dd/MM/yyyy · HH:mm'}}</span>
            }
            @if(story.taggedUsernames){
              <div class="profile-story-tags">
                @for(tag of story.taggedUsernames.split(',');track tag){
                  <a [routerLink]="['/menu/perfis',tag.trim().replace('@','')]"
                    (click)="closed.emit()">&#64;{{tag.trim().replace('@','')}}</a>
                }
              </div>
            }
          </div>
          @if(mediaError){<p role="alert">Não foi possível carregar esta story.</p>}
        }
        <button type="button" class="profile-story-prev" (click)="previous()" aria-label="Story anterior">‹</button>
        <button type="button" class="profile-story-next" (click)="next()" aria-label="Story seguinte">›</button>
      </section>
    </div>
  `,
  styles:[`
    .profile-story-backdrop{position:fixed;inset:0;z-index:2200;display:grid;place-items:center;
      background:#000e;padding:12px}
    .profile-story-dialog{position:relative;width:min(450px,100%);height:min(850px,96dvh);
      background:#010d14;border:1px solid #32877d;border-radius:19px;overflow:hidden;color:white}
    .profile-story-progress{position:absolute;z-index:5;top:12px;left:12px;right:12px;display:flex;gap:4px}
    .profile-story-track{flex:1;min-width:0;height:3px;border-radius:4px;background:#ffffff59;overflow:hidden}
    .profile-story-track span{height:100%;display:block;background:#fff}
    header{position:absolute;z-index:5;top:25px;left:17px;right:17px;display:flex;justify-content:space-between;align-items:center;text-shadow:0 2px 6px #000}
    header button{background:transparent;border:0;color:white;font-size:30px;cursor:pointer}
    .profile-story-media{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden}
    .profile-story-media img,.profile-story-media video{width:100%;height:100%;object-fit:contain}
    .profile-story-caption{position:absolute;z-index:2;max-width:75%;padding:8px 12px;border-radius:8px;
      font-weight:800;text-shadow:0 2px 5px #0009;white-space:pre-wrap;overflow-wrap:anywhere;text-align:center}
    .profile-story-location,.profile-story-time{position:absolute;z-index:3;top:19%;padding:8px 11px;
      border:1px solid #ffffff47;border-radius:20px;background:#091f2dc9;color:#fff;font-size:12px;text-decoration:none}
    .profile-story-location{left:20px;max-width:60%;overflow-wrap:anywhere}
    .profile-story-time{right:20px}
    .profile-story-tags{position:absolute;z-index:3;bottom:16%;left:12px;right:12px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
    .profile-story-tags a{background:#092434ce;border-radius:10px;color:#fff;padding:5px 9px;font-size:12px;text-decoration:none}
    .profile-story-prev,.profile-story-next{position:absolute;z-index:4;top:48%;border:0;border-radius:50%;
      background:#001b2b8c;color:white;font-size:32px;width:38px;height:38px;cursor:pointer}
    .profile-story-prev{left:7px}.profile-story-next{right:7px}
    .profile-story-mute{position:absolute;bottom:12px;right:12px;z-index:5;border:1px solid #567d84;
      background:#0a2639;color:#fff;border-radius:10px;padding:9px;cursor:pointer}
    @media(max-width:550px){.profile-story-backdrop{padding:0}.profile-story-dialog{
      border-radius:0;height:100dvh;width:100vw}}
  `]
})
export class ProfileStoryViewerComponent implements OnDestroy {
  @Input({required:true}) stories:SocialStory[]=[];
  @Input({required:true}) username='';
  @Output() closed=new EventEmitter<void>();
  index=0;
  progress=0;
  @HostListener('document:keydown.escape')
  onEscape():void {this.closed.emit();}
  @HostListener('document:keydown.arrowright')
  onArrowRight():void {this.next();}
  @HostListener('document:keydown.arrowleft')
  onArrowLeft():void {this.previous();}
  muted=true;
  imageReady=false;
  mediaError=false;
  private last=Date.now();
  private ticker=setInterval(()=>this.tick(),100);
  get active():SocialStory|undefined{return this.stories[this.index];}
  tick():void{
    const now=Date.now(),elapsed=Math.min(250,now-this.last);
    this.last=now;
    if(!this.active||this.active.video||!this.imageReady)return;
    this.progress=Math.min(100,this.progress+elapsed/7000*100);
    if(this.progress>=100)this.next();
  }
  videoDuration(event:Event):void{
    const video=event.target as HTMLVideoElement;
    if(video.duration>0&&Number.isFinite(video.duration)){
      video.ontimeupdate=()=>{this.progress=video.currentTime/video.duration*100;};
    }
  }
  next():void{
    if(this.index>=this.stories.length-1){this.closed.emit();return;}
    this.index++;this.reset();
  }
  previous():void{this.index=Math.max(0,this.index-1);this.reset();}
  reset():void{this.progress=0;this.imageReady=false;this.mediaError=false;this.last=Date.now();}
  encode(value:string):string{return encodeURIComponent(value);}
  fontColor(s:SocialStory):string{return ({
    white:'#fff',black:'#020617',yellow:'#fef08a',mint:'#5eead4',pink:'#f9a8d4',blue:'#93c5fd'
  } as Record<string,string>)[s.textColor||'white']||'#fff';}
  captionBackground(s:SocialStory):string{
    if(s.textBackground==='none'||s.textStyle==='plain')return 'transparent';
    return s.textBackground==='light'||s.textColor==='black'?'#fffd':'#071923d9';
  }
  fontFamily(s:SocialStory):string{
    return s.textFont==='classic'?'Georgia,serif':s.textFont==='mono'?'monospace':'system-ui,sans-serif';
  }
  ngOnDestroy():void{clearInterval(this.ticker);}
}
