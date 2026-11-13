import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { catchError, finalize, of, timeout } from 'rxjs';
import { FeedItem, SocialComment } from '../model/feed-item';
import { SocialFeedService } from '../../services/social-feed.service';

/** Full-sized profile publication. One dialog for photographs, videos and albums. */
@Component({
  selector: 'app-profile-post-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="post-viewer-backdrop" (click)="closed.emit()">
      <section class="post-viewer" role="dialog" aria-modal="true"
        aria-label="Publicação de {{post.authorDisplayName}}" (click)="$event.stopPropagation()">
        <button type="button" class="post-viewer-close" (click)="closed.emit()" aria-label="Fechar">×</button>
        <div class="post-viewer-media" (touchstart)="beginSwipe($event)" (touchend)="endSwipe($event)">
          @if (media.length) {
            @for (asset of media; track asset.url; let i=$index) {
              @if (i === index) {
                @if (asset.mimeType.startsWith('video/')) {
                  <video [src]="asset.url" controls playsinline preload="metadata" aria-label="Vídeo da publicação"></video>
                } @else {
                  <img [src]="asset.url" [alt]="'Fotografia ' + (i+1) + ' de ' + media.length">
                }
              }
            }
            @if (media.length>1) {
              <button type="button" class="post-viewer-prev" (click)="change(-1)" aria-label="Anterior">‹</button>
              <button type="button" class="post-viewer-next" (click)="change(1)" aria-label="Seguinte">›</button>
              <span class="post-viewer-count">{{index+1}} / {{media.length}}</span>
            }
          } @else {
            <p class="post-viewer-empty">Publicação de texto</p>
          }
        </div>
        <aside class="post-viewer-details">
          <header>
            <a [routerLink]="['/menu/perfis',post.authorUsername]" (click)="closed.emit()">
              <strong>{{post.authorDisplayName}}</strong><small>&#64;{{post.authorUsername}}</small>
            </a>
            <time>{{post.createdAt | date:'dd/MM/yyyy HH:mm'}}</time>
          </header>
          @if(post.content){<p class="post-viewer-caption">{{post.content}}</p>}
          @if(post.location){<a class="post-viewer-place" [href]="'https://www.google.com/maps/search/?api=1&query='+encode(post.location)"
            target="_blank" rel="noopener noreferrer">📍 {{post.location}}</a>}
          <div class="post-viewer-actions">
            <button type="button" [disabled]="busy" [attr.aria-pressed]="post.likedByMe"
              (click)="toggleLike()">{{post.likedByMe?'♥':'♡'}} {{post.likeCount}} gostos</button>
            <span>◯ {{post.commentCount}} comentários</span>
            <button type="button" (click)="copyLink()">Partilhar</button>
          </div>
          @if(shareMessage){<small role="status">{{shareMessage}}</small>}
          <div class="post-viewer-comments">
            @if(loading){<p>A carregar comentários…</p>}
            @if(error){<p role="alert">{{error}}</p>}
            @for(comment of comments;track comment.id){
              <div class="post-viewer-comment">
                <a [routerLink]="['/menu/perfis',comment.authorUsername]" (click)="closed.emit()">
                  <strong>{{comment.authorDisplayName}}</strong>
                </a>
                <p>{{comment.content}}</p>
                <button type="button" [disabled]="busyComment===comment.id"
                  (click)="toggleCommentLike(comment)" [attr.aria-pressed]="!!comment.likedByMe">
                  {{comment.likedByMe?'♥':'♡'}} {{comment.likeCount||0}}
                </button>
                @if(comment.editedAt){<small>Editado</small>}
              </div>
            }
          </div>
          <form class="post-viewer-comment-form" (submit)="submitComment();$event.preventDefault()">
            <input [(ngModel)]="draft" name="comment" placeholder="Escrever um comentário…" maxlength="500"
              aria-label="Escrever comentário" [disabled]="sending">
            <button type="submit" [disabled]="sending||!draft.trim()">Publicar</button>
          </form>
        </aside>
      </section>
    </div>
  `,
  styles: [`
    .post-viewer-backdrop{position:fixed;inset:0;z-index:2200;background:#000d;
      backdrop-filter:blur(8px);display:grid;place-items:center;padding:20px}
    .post-viewer{position:relative;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.75fr);
      width:min(1120px,100%);height:min(760px,92dvh);background:#081e2a;
      border:1px solid #285c65;border-radius:16px;overflow:hidden;color:#eefbfc}
    .post-viewer-close{position:absolute;top:10px;right:12px;z-index:3;background:transparent;
      border:0;color:white;font-size:30px;cursor:pointer}
    .post-viewer-media{position:relative;display:grid;place-items:center;min-height:0;
      background:#020d14;overflow:hidden}
    .post-viewer-media img,.post-viewer-media video{width:100%;height:100%;
      object-fit:contain;min-height:0;max-width:100%;max-height:100%}
    .post-viewer-prev,.post-viewer-next{position:absolute;top:50%;transform:translateY(-50%);
      border:0;border-radius:50%;background:#071b29d9;color:#fff;width:40px;height:40px;
      cursor:pointer;font-size:32px}
    .post-viewer-prev{left:14px}.post-viewer-next{right:14px}
    .post-viewer-count{position:absolute;bottom:14px;background:#061622ca;border-radius:18px;padding:4px 12px}
    .post-viewer-details{display:flex;flex-direction:column;min-height:0;padding:22px 20px 14px;gap:12px}
    .post-viewer-details header{display:flex;justify-content:space-between;gap:10px;padding-right:25px}
    .post-viewer-details header a{display:grid;gap:2px;text-decoration:none;color:#f5ffff}
    .post-viewer-details header small,.post-viewer-details time{font-size:12px;color:#97b9c4}
    .post-viewer-caption{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;line-height:1.5}
    .post-viewer-place{color:#9bebdb;text-decoration:none}
    .post-viewer-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;
      border-block:1px solid #ffffff24;padding:12px 0;font-size:13px}
    .post-viewer-actions button,.post-viewer-comment button,.post-viewer-comment-form button{
      background:#123e4a;color:#eafffb;border:1px solid #397c7d;border-radius:9px;
      padding:7px 10px;cursor:pointer}
    .post-viewer-comments{flex:1;min-height:0;overflow-y:auto;display:grid;align-content:start;gap:14px}
    .post-viewer-comment{border-bottom:1px solid #ffffff16;padding-bottom:10px}
    .post-viewer-comment a{color:white;text-decoration:none}
    .post-viewer-comment p{margin:5px 0;overflow-wrap:anywhere}
    .post-viewer-comment button{font-size:12px;padding:3px 8px}
    .post-viewer-comment small{margin-left:8px;color:#a0bec5}
    .post-viewer-comment-form{display:flex;gap:8px}
    .post-viewer-comment-form input{flex:1;min-width:0;border:1px solid #477780;
      background:#0c303c;border-radius:8px;padding:10px;color:white}
    @media(max-width:720px){
      .post-viewer-backdrop{padding:0}
      .post-viewer{height:100dvh;width:100%;border-radius:0;display:flex;flex-direction:column}
      .post-viewer-media{height:53dvh;flex-shrink:0}
      .post-viewer-details{flex:1;padding:14px;overflow:hidden}
      .post-viewer-close{background:#051723a0;border-radius:50%}
    }
  `]
})
export class ProfilePostViewerComponent implements OnChanges {
  @Input({required:true}) post!:FeedItem;
  @Output() closed=new EventEmitter<void>();
  private readonly feed=inject(SocialFeedService);
  index=0;
  private swipeStartX:number|null=null;
  @HostListener('document:keydown.escape')
  onEscape():void {this.closed.emit();}
  @HostListener('document:keydown.arrowright')
  onArrowRight():void {this.change(1);}
  @HostListener('document:keydown.arrowleft')
  onArrowLeft():void {this.change(-1);}
  beginSwipe(event:TouchEvent):void {this.swipeStartX=event.changedTouches[0]?.clientX??null;}
  endSwipe(event:TouchEvent):void {
    if(this.swipeStartX==null)return;
    const dx=(event.changedTouches[0]?.clientX??this.swipeStartX)-this.swipeStartX;
    if(Math.abs(dx)>48)this.change(dx<0?1:-1);
    this.swipeStartX=null;
  }
  comments:SocialComment[]=[];
  draft='';
  loading=false;
  error='';
  busy=false;
  sending=false;
  busyComment:number|null=null;
  shareMessage='';
  get media():{url:string;mimeType:string}[]{
    return [
      ...(this.post.imageUrl?[{url:this.post.imageUrl,mimeType:'image/jpeg'}]:[]),
      ...(this.post.videoUrl?[{url:this.post.videoUrl,mimeType:'video/mp4'}]:[]),
      ...(this.post.extraMedia||[])
    ];
  }
  ngOnChanges():void{this.index=0;this.loadComments();}
  change(step:number):void{if(this.media.length)this.index=(this.index+step+this.media.length)%this.media.length;}
  encode(value:string):string{return encodeURIComponent(value);}
  loadComments():void{
    if(this.post.postId==null)return;
    this.loading=true;this.error='';
    this.feed.comments(this.post.postId).pipe(timeout(12000),
      finalize(()=>this.loading=false)).subscribe({
      next:comments=>this.comments=comments,
      error:()=>this.error='Não foi possível carregar os comentários.'
    });
  }
  toggleLike():void{
    if(this.busy||this.post.postId==null)return;
    this.busy=true;
    const request=this.post.likedByMe?this.feed.unlikePost(this.post.postId):this.feed.likePost(this.post.postId);
    request.pipe(timeout(10000),finalize(()=>this.busy=false)).subscribe({
      next:status=>{this.post.likedByMe=status.likedByMe;this.post.likeCount=status.likeCount;},
      error:()=>this.error='Não foi possível atualizar o gosto.'
    });
  }
  toggleCommentLike(comment:SocialComment):void{
    if(this.busyComment!=null||this.post.postId==null)return;
    this.busyComment=comment.id;
    const request=comment.likedByMe?this.feed.unlikeComment(this.post.postId,comment.id):
      this.feed.likeComment(this.post.postId,comment.id);
    request.pipe(timeout(10000),finalize(()=>this.busyComment=null)).subscribe({
      next:result=>{comment.likedByMe=result.likedByMe;comment.likeCount=result.likeCount;},
      error:()=>this.error='Não foi possível atualizar o gosto.'
    });
  }
  submitComment():void{
    const text=this.draft.trim();
    if(!text||this.post.postId==null||this.sending)return;
    this.sending=true;
    this.feed.addComment(this.post.postId,text).pipe(timeout(10000),
      finalize(()=>this.sending=false)).subscribe({
      next:result=>{this.comments.push(result);this.post.commentCount++;this.draft='';},
      error:()=>this.error='Não foi possível publicar o comentário.'
    });
  }
  async copyLink():Promise<void>{
    if(this.post.postId==null)return;
    const link=new URL('/menu/feed?post='+this.post.postId,window.location.origin).href;
    try {
      if(navigator.share)await navigator.share({url:link,title:'Publicação na Jynlo'});
      else {await navigator.clipboard.writeText(link);this.shareMessage='Link copiado';}
    } catch {this.shareMessage='Não foi possível partilhar o link.';}
  }
}
