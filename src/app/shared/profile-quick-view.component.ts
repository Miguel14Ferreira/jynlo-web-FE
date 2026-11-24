import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DirectCallClientService } from '../services/direct-call-client.service';
import { Optional } from '@angular/core';
import { Subscription, timeout } from 'rxjs';
import { environment } from 'src/environment/environment';
import { CommunityProfile } from '../pages/model/community-profile';
import { CommunityService } from '../services/community.service';
import { ProfileQuickViewService } from '../services/profile-quick-view.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { VenueSportsBadgesComponent } from './venue-sports-badges/venue-sports-badges.component';

@Component({
 selector:'app-profile-quick-view',standalone:true,
 imports:[CommonModule,RouterLink,TranslatePipe,VenueSportsBadgesComponent],
 template:`
 @if (quick.username$ | async; as username) {
   <div class="contact-backdrop" (click)="close()" (keydown.escape)="close()">
     <section class="contact-panel" role="dialog" aria-modal="true"
       aria-labelledby="contact-title" tabindex="-1"
       (click)="$event.stopPropagation()" (keydown.escape)="close()"
       (keydown.tab)="trapFocus($event)">
       <header class="contact-header">
         <strong id="contact-title">{{ 'profile.contactInfo' | t }}</strong>
         <button #closeControl type="button" class="contact-close"
           [attr.aria-label]="'common.close' | t" [attr.title]="'common.close' | t"
           (click)="close()">
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"
             fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
             stroke-linejoin="round" aria-hidden="true" focusable="false">
             <path d="M18 6 6 18M6 6l12 12" />
           </svg>
         </button>
       </header>
       @if (loading) {
         <p role="status" class="contact-state">{{ 'common.loading' | t }}</p>
       } @else if (error) {
         <p role="alert" class="contact-state">{{ 'feedback.profile.loadError' | t }}</p>
       } @else if (person) {
         <div class="contact-identity">
           <div class="contact-avatar">
             @if (photo(person); as image) {
               <img [src]="image" [alt]="person.nickname || person.fullName || person.username">
             } @else { {{ initials(person) }} }
           </div>
           <h2 id="contact-name">{{ person.nickname || person.fullName || person.username }}</h2>
           <p class="contact-handle">@{{ person.username }}</p>
           @if (person.location) { <p class="contact-meta">{{ person.location }}</p> }
           @if (person.favoriteSports) {
             <app-venue-sports-badges class="contact-sports"
               [sports]="person.favoriteSports" [limit]="4" [expandable]="true"
               [compact]="true"></app-venue-sports-badges>
           }
           @if (person.bio) { <p class="contact-bio">{{ person.bio }}</p> }
         </div>
         <div class="contact-actions">
           <a [routerLink]="['/menu/profiles', person.username]"
              (click)="close()" class="contact-primary">{{ 'profile.openFullProfile' | t }}</a>
           <a routerLink="/menu/messages" [queryParams]="{kind:'direct',id:person.username}"
              (click)="close()" class="contact-secondary">{{ 'friends.chatAction' | t }}</a>
           <a routerLink="/menu/groups" [queryParams]="{from:person.username}"
              (click)="close()" class="contact-secondary">{{ 'groups.addMembers' | t }}</a>
           @if (calls?.available$ | async) {
             <button type="button" class="contact-secondary" (click)="call(person.username,'voice')">{{ 'calls.voice' | t }}</button>
             <button type="button" class="contact-secondary" (click)="call(person.username,'video')">{{ 'calls.video' | t }}</button>
           }
         </div>
       }
     </section>
   </div>
 }
 `,
 styles:[`
 .contact-backdrop{position:fixed;inset:0;z-index:9100;display:grid;place-items:center;
   padding:16px;background:rgba(2,14,24,.78);backdrop-filter:blur(5px)}
 .contact-panel{width:min(100%,430px);max-height:min(88dvh,680px);overflow-y:auto;
   border:1px solid #416b72;background:#122e3a;color:#effdfa;border-radius:22px;
   box-shadow:0 25px 70px #001018bd;outline:none}
 .contact-header{display:flex;align-items:center;justify-content:space-between;gap:15px;
   padding:16px 20px;border-bottom:1px solid #ffffff19;font-size:1.06rem}
 .contact-header strong{min-width:0;overflow-wrap:anywhere}
 .contact-close{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;
   padding:0;border:1px solid transparent;border-radius:10px;
   background:transparent;color:#e5f7f4;line-height:1;cursor:pointer;
   transition:background-color .15s ease,border-color .15s ease}
 .contact-close svg{display:block;width:18px;height:18px}
 .contact-close:hover{background:#214850;border-color:#3c6b70}
 .contact-close:active{background:#2e5b61}
 .contact-identity{text-align:center;padding:24px 24px 14px}
 .contact-avatar{height:154px;width:154px;display:grid;place-items:center;margin:0 auto 15px;
   border-radius:50%;background:#28635c;border:3px solid #6ddec6;color:white;
   font-size:3.4rem;overflow:hidden}
 .contact-avatar img{width:100%;height:100%;object-fit:cover}
 h2{font-size:1.55rem;margin:6px 0 3px;overflow-wrap:anywhere}
 .contact-handle{color:#71dec8;margin:0 0 12px}
 .contact-meta{font-size:.85rem;color:#bcdbda;margin:4px}
 .contact-sports{display:block;text-align:left;margin:10px auto;max-width:330px}
 .contact-bio{color:#e3efef;overflow-wrap:anywhere;font-size:.86rem;margin:14px 0}
 .contact-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:18px 20px;
   border-top:1px solid #ffffff19}
 .contact-actions a,.contact-actions button{text-align:center;padding:12px 8px;border-radius:12px;
   font-size:.82rem;text-decoration:none;font-weight:700;border:0;cursor:pointer}
 .contact-primary{background:#35cfb2;color:#032d31}
 .contact-secondary{background:#244f58;color:#e6fff9}
 .contact-state{padding:30px;text-align:center}
 button:focus-visible,a:focus-visible{outline:2px solid #9cffdb;outline-offset:3px}
 `]
})
export class ProfileQuickViewComponent implements OnDestroy {
 @ViewChild('closeControl') closeControl?: ElementRef<HTMLButtonElement>;
 person:CommunityProfile|null=null;
 loading=false; error=false;
 private current=0;
 private subscription=new Subscription();
 private profileLoad?:Subscription;
 constructor(public quick:ProfileQuickViewService,private profiles:CommunityService,
   private readonly cdr:ChangeDetectorRef,@Optional() public calls:DirectCallClientService|null){
   this.subscription.add(quick.username$.subscribe(username=>{
     this.profileLoad?.unsubscribe();this.person=null;this.error=false;this.loading=!!username;
     const version=++this.current;
     if(!username)return;
     this.profileLoad=this.profiles.publicProfile(username).pipe(timeout(12000)).subscribe({
       next:person=>{if(version===this.current){this.person=person;this.loading=false;
         this.cdr.detectChanges();}},
       error:()=>{if(version===this.current){this.error=true;this.loading=false;
         this.cdr.detectChanges();}}
     });
     queueMicrotask(()=>this.closeControl?.nativeElement.focus({preventScroll:true}));
   }));
 }
 photo(person:CommunityProfile):string|null{
   const url=person.profilePicUrl;
   if(!url||url.startsWith('data:'))return url||null;
   if(url.startsWith('https://'))return url;
   if(url.startsWith('/'))return environment.apiUrl+url;
   return null;
 }
 initials(p:CommunityProfile):string{
   return (p.nickname||p.fullName||p.username||'?').trim().slice(0,1).toUpperCase();
 }
 trapFocus(event:Event):void{
   const root=(event.currentTarget as HTMLElement);
   const els=Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]'));
   if(!els.length)return;
   const first=els[0],last=els[els.length-1];
   if((event as KeyboardEvent).shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!(event as KeyboardEvent).shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 call(username:string,media:'voice'|'video'):void{
   if(this.calls?.available$.value){this.quick.close();void this.calls.start(username,media);}
 }
 close():void{this.quick.close();}
 ngOnDestroy():void{this.profileLoad?.unsubscribe();this.subscription.unsubscribe();}
}
