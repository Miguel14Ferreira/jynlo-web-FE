import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, timeout } from 'rxjs';
import { SocialStory } from '../model/social-story';
import { SocialStoriesService } from '../../services/social-stories.service';

/** Media and access come from the authenticated Story API, never from the pasted URL. */
@Component({
  selector:'app-inbox-story-card',
  standalone:true,
  imports:[CommonModule,RouterLink],
  template:`
    <div class="inbox-story-card" aria-label="Story partilhada">
      @if(story && !unavailable) {
        <div class="inbox-story-media">
          @if(story.video) {
            <video [src]="story.mediaUrl" controls playsinline preload="metadata"
              (error)="markUnavailable()" aria-label="Vídeo da Story"></video>
          } @else {
            <img [src]="story.mediaUrl" [alt]="story.altText || 'Imagem da Story'"
              loading="lazy" (error)="markUnavailable()" />
          }
        </div>
        <div class="inbox-story-info">
          <strong>Story de @{{story.authorUsername}}</strong>
          @if(story.caption) {<span>{{story.caption}}</span>}
          <a class="inbox-story-link" [routerLink]="['/menu/feed']"
            [queryParams]="{story:story.id}">Ver Story ↗</a>
        </div>
      } @else if(loading) {
        <div class="inbox-story-status" role="status">A carregar Story…</div>
      } @else {
        <div class="inbox-story-status inbox-story-unavailable" role="status">
          <strong>Story indisponível</strong>
          <span>A Story expirou, foi eliminada ou já não está acessível.</span>
        </div>
      }
    </div>
  `,
  styles:[`
    .inbox-story-card{width:min(100%,320px);border:1px solid #53bca65e;border-radius:14px;
      background:#092f38;overflow:hidden;color:#e8fff7;box-sizing:border-box}
    .inbox-story-link{display:inline-flex;align-self:start;color:#88f5dc;font-weight:800;text-decoration:none}
    .inbox-story-link:focus-visible{outline:3px solid #93ffe5;outline-offset:-3px}
    .inbox-story-media{height:220px;display:grid;place-items:center;background:#061c29}
    .inbox-story-media img,.inbox-story-media video{display:block;width:100%;height:100%;object-fit:contain}
    .inbox-story-info{display:grid;gap:5px;padding:12px 14px;min-width:0}
    .inbox-story-info strong,.inbox-story-info span{overflow-wrap:anywhere}

    .inbox-story-status{display:grid;gap:6px;padding:17px 16px;color:#c6dbd9;line-height:1.45}
    .inbox-story-unavailable{border-left:3px solid #56bcae}
    .inbox-story-unavailable strong{color:#e7fff5}
    .inbox-story-unavailable span{font-size:.81rem}
    @media(max-width:430px){.inbox-story-media{height:180px}}
  `]
})
export class InboxStoryCardComponent implements OnChanges,OnDestroy {
  @Input({required:true}) storyId=0;
  /** A Story cannot be newer than the message used to share it. */
  @Input() sharedAt:string|null=null;
  story:SocialStory|null=null;
  loading=true;
  unavailable=false;
  private fetch?:Subscription;
  private expiration?:ReturnType<typeof setTimeout>;
  private generation=0;
  constructor(private readonly stories:SocialStoriesService){}
  ngOnChanges():void {
    const version=++this.generation;
    this.fetch?.unsubscribe();
    if(this.expiration!==undefined)clearTimeout(this.expiration);
    this.story=null;this.unavailable=false;this.loading=true;
    if(!Number.isSafeInteger(this.storyId)||this.storyId<=0){this.markUnavailable();return;}
    const sentAt=this.sharedAt?Date.parse(this.sharedAt):NaN;
    // All Jynlo Stories expire within 24h. If a message is older than
    // that, its Story has necessarily expired. Never issue a doomed API GET.
    if(Number.isFinite(sentAt)&&Date.now()-sentAt>=24*60*60*1000){
      this.markUnavailable();return;
    }
    // Never leave an expired or unreachable Story indefinitely in a loading state.
    this.fetch=this.stories.get(this.storyId).pipe(timeout(5000)).subscribe({
      next:story=>{
        if(version!==this.generation)return;
        const expiry=Date.parse(story.expiresAt);
        if(story.id!==this.storyId||!story.mediaUrl||!Number.isFinite(expiry)||expiry<=Date.now()){
          this.markUnavailable();return;
        }
        this.story=story;this.loading=false;
        // Avoid displaying expired media indefinitely when the chat stays open.
        this.expiration=setTimeout(()=>{if(version===this.generation)this.markUnavailable();},
          Math.min(expiry-Date.now(),2147483647));
      },
      error:()=>{if(version===this.generation)this.markUnavailable();}
    });
  }
  markUnavailable():void {
    this.story=null;this.loading=false;this.unavailable=true;
  }
  ngOnDestroy():void {
    this.generation++;this.fetch?.unsubscribe();
    if(this.expiration!==undefined)clearTimeout(this.expiration);
  }
}
