import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommunityService } from '../../services/community.service';
import { AuthenticationService } from '../../services/authethication.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { PrivateGroup, PrivateGroupMessage, PrivateGroupService } from '../../services/private-group.service';
import { ConversationMuteService, MutedConversation, isConversationMuted } from '../../services/conversation-mute.service';
import { FriendSummary } from '../model/friend-summary';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t } from '../../i18n/i18n.service';
import { environment } from 'src/environment/environment';

@Component({
  selector:'app-private-groups',
  standalone:true,
  imports:[CommonModule,FormsModule,RouterLink,TranslatePipe],
  templateUrl:'./private-groups.component.html',
  styleUrls:['./private-groups.component.css'],
  changeDetection:ChangeDetectionStrategy.Eager
})
export class PrivateGroupsComponent implements OnInit,OnDestroy {
  groups:PrivateGroup[]=[];
  friends:FriendSummary[]=[];
  selected:PrivateGroup|null=null;
  messages:PrivateGroupMessage[]=[];
  draft='';
  title='';
  showCreate=false;
  showAdd=false;
  showRename=false;
  photoUploading=false;
  removingUsername:string|null=null;
  renameTitle='';
  selectedNames=new Set<string>();
  friendSearch='';
  initialFriend='';
  private createOpenedFromMessages=false;
  loading=true;
  loadingMessages=false;
  busy=false;
  error='';
  groupError='';
  mutedConversations: MutedConversation[] = [];
  muteLoading = false;
  muteError = '';
  hasMore=false;
  private currentRequest=0;
  private subscriptions=new Subscription();
  readonly me:string;

  constructor(private api:PrivateGroupService,private contact:CommunityService,
    private realtime:DirectChatRealtimeService,private auth:AuthenticationService,
    private router:Router,private route:ActivatedRoute,
    private conversationMutes:ConversationMuteService){
    this.me=(auth.loggedInPerfilname||'').toLowerCase();
  }

  ngOnInit():void{
    this.conversationMutes.list().subscribe({
      next: items => this.mutedConversations = items,
      error: () => this.muteError = t('chat.muteFailed')
    });
    this.realtime.connect();
    this.subscriptions.add(this.realtime.groupMessages$.subscribe(message=>{
      if(this.selected?.id===message.groupId && !this.messages.some(old=>old.id===message.id)){
        this.messages=[...this.messages,message];
      }
      this.refreshGroups(false);
    }));
    this.subscriptions.add(this.realtime.groupUpdates$.subscribe(()=>{
      this.refreshGroups(false);
    }));
    this.subscriptions.add(this.route.queryParamMap.subscribe(params=>{
      const from=params.get('from')||'';
      this.initialFriend=from;
      if(from){
        this.createOpenedFromMessages=true;
        this.openCreate(from);
      }
      const id=Number(params.get('id'));
      if(Number.isSafeInteger(id)&&id>0){
        const found=this.groups.find(x=>x.id===id);
        if(found)this.select(found);
      }
    }));
    this.refreshGroups(true);
    this.contact.friends().subscribe({
      next:friends=>this.friends=friends,
      error:()=>this.friends=[]
    });
  }
  ngOnDestroy():void{this.subscriptions.unsubscribe();this.currentRequest++;}

  refreshGroups(initial:boolean):void{
    this.api.list().subscribe({
      next:groups=>{
        this.groups=groups;
        this.loading=false;
        this.error='';
        const requested=Number(this.route.snapshot.queryParamMap.get('id'));
        if(Number.isSafeInteger(requested)&&requested>0){
          const target=groups.find(x=>x.id===requested);
          if(target&&this.selected?.id!==target.id){this.select(target);}
        }
        if(this.selected){
          const updated=groups.find(x=>x.id===this.selected!.id);
          if(updated)this.selected=updated;
          else {this.selected=null;this.messages=[];}
        }
      },
      error:()=>{if(initial){this.error=t('groups.loadError');this.loading=false;}}
    });
  }

  get selectedMuted(): boolean {
    return !!this.selected && isConversationMuted(this.mutedConversations, 'private', this.selected.id);
  }

  toggleMute():void{
    if(!this.selected||this.muteLoading)return;
    const id=this.selected.id,next=!this.selectedMuted;
    this.muteLoading=true;this.muteError='';
    this.conversationMutes.set('private',id,next).subscribe({
      next:()=>{
        this.muteLoading=false;
        const rest=this.mutedConversations.filter(item=>!(item.kind==='private'&&item.id===String(id)));
        this.mutedConversations=next?[...rest,{kind:'private',id:String(id)}]:rest;
      },
      error:()=>{this.muteLoading=false;this.muteError=t('chat.muteFailed');}
    });
  }

  select(group:PrivateGroup):void{
    if(this.selected?.id===group.id)return;
    this.selected=group;this.showCreate=false;this.showAdd=false;
    this.showRename=false;this.removingUsername=null;
    this.messages=[];this.loadingMessages=true;this.hasMore=false;
    this.groupError='';
    const ticket=++this.currentRequest;
    this.api.messages(group.id).subscribe({
      next:items=>{
        if(this.currentRequest!==ticket)return;
        this.messages=items;this.loadingMessages=false;this.hasMore=items.length>=50;
      },
      error:()=>{
        if(this.currentRequest!==ticket)return;
        this.groupError=t('groups.loadMessagesError');this.loadingMessages=false;
      }
    });
    void this.router.navigate(['/menu/groups'],{queryParams:{id:group.id}});
  }

  older():void{
    if(!this.selected||!this.messages.length||this.loadingMessages||!this.hasMore)return;
    this.loadingMessages=true;
    const groupId=this.selected.id,ticket=this.currentRequest;
    this.api.messages(groupId,this.messages[0].id).subscribe({
      next:items=>{
        if(this.currentRequest!==ticket)return;
        this.messages=[...items.filter(msg=>!this.messages.some(old=>old.id===msg.id)),...this.messages];
        this.hasMore=items.length>=50;this.loadingMessages=false;
      },
      error:()=>{this.loadingMessages=false;this.groupError=t('groups.loadMessagesError');}
    });
  }

  send():void{
    const group=this.selected,text=this.draft.trim();
    if(!group||!text||text.length>2000||this.busy)return;
    this.busy=true;this.groupError='';
    this.api.send(group.id,text).subscribe({
      next:message=>{
        if(this.selected?.id===group.id&&!this.messages.some(old=>old.id===message.id)){
          this.messages=[...this.messages,message];
        }
        this.draft='';this.busy=false;
      },
      error:()=>{this.groupError=t('groups.sendError');this.busy=false;}
    });
  }

  openCreate(initial=''):void{
    this.showCreate=true;this.showAdd=false;this.showRename=false;this.title='';
    this.friendSearch='';
    this.selectedNames=new Set(initial?[initial.trim().toLowerCase()]:[]);
    this.groupError='';
  }
  openAdd():void{
    if(!this.isCreator)return;
    this.selectedNames=new Set();
    this.friendSearch='';
    this.showAdd=true;this.showCreate=false;this.showRename=false;this.groupError='';
  }

  photoUrl(group:PrivateGroup):string|null {
    const url=group.photoUrl;
    if(!url)return null;
    if(url.startsWith('https://'))return url;
    if(url.startsWith('/'))return environment.apiUrl+url;
    return null;
  }
  uploadPhoto(event:Event):void {
    const input=event.target as HTMLInputElement;
    const file=input.files?.item(0);
    input.value='';
    const group=this.selected;
    if(!file||!group||!this.isCreator||this.photoUploading)return;
    const allowed=['image/jpeg','image/png','image/webp','image/gif'];
    if(!allowed.includes(file.type)||file.size===0||file.size>5*1024*1024){
      this.groupError=t('groups.photoInvalid');return;
    }
    this.photoUploading=true;this.groupError='';
    this.api.uploadPhoto(group.id,file).subscribe({
      next:updated=>{
        this.photoUploading=false;
        if(this.selected?.id===group.id)this.selected=updated;
        this.groups=this.groups.map(item=>item.id===group.id?updated:item);
      },
      error:()=>{this.photoUploading=false;this.groupError=t('groups.photoError');}
    });
  }

  openRename():void {
    if(!this.isCreator||!this.selected)return;
    this.renameTitle=this.selected.title;
    this.showRename=true;this.showAdd=false;this.showCreate=false;this.groupError='';
  }
  rename():void {
    const group=this.selected,title=this.renameTitle.trim();
    if(!group||!this.isCreator||this.busy||title.length<2||title.length>90)return;
    this.busy=true;this.groupError='';
    this.api.rename(group.id,title).subscribe({
      next:updated=>{
        this.busy=false;this.showRename=false;this.selected=updated;
        this.groups=this.groups.map(g=>g.id===updated.id?updated:g);
      },
      error:()=>{this.busy=false;this.groupError=t('groups.renameError');}
    });
  }
  askRemove(username:string):void{
    if(!this.selected || (!this.isCreator&&username.toLowerCase()!==this.me)
        || (this.isCreator&&username.toLowerCase()===this.me))return;
    this.removingUsername=username;this.groupError='';
  }
  confirmRemove():void{
    const group=this.selected,username=this.removingUsername;
    if(!group||!username||this.busy)return;
    this.busy=true;this.groupError='';
    this.api.removeMember(group.id,username).subscribe({
      next:updated=>{
        this.busy=false;this.removingUsername=null;
        if(username.toLowerCase()===this.me){
          this.selected=null;this.messages=[];this.currentRequest++;
          this.groups=this.groups.filter(g=>g.id!==group.id);
          void this.router.navigate(['/menu/groups']);
        }else{
          this.selected=updated;this.groups=this.groups.map(g=>g.id===updated.id?updated:g);
        }
      },
      error:()=>{this.busy=false;this.groupError=t('groups.removeError');}
    });
  }
  get isCreator():boolean{
    return !!this.selected?.creatorUsername
      && this.selected.creatorUsername.toLowerCase()===this.me;
  }
  get invitedFriends():FriendSummary[]{
    if(!this.showAdd||!this.selected)return this.friends;
    const existing=new Set(this.selected.members.map(m=>m.username.toLowerCase()));
    return this.friends.filter(f=>!existing.has(f.username.toLowerCase()));
  }
  /** Accent-insensitive, case-insensitive search over all visible friend identities.
   * Filtering only changes what is shown, never the selected usernames.
   */
  private normalizeFriendSearch(value:string):string{
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .trim().replace(/^@/, '').toLocaleLowerCase();
  }

  get filteredInviteFriends():FriendSummary[]{
    const query=this.normalizeFriendSearch(this.friendSearch);
    const friends=this.invitedFriends;
    if(!query)return friends;
    return friends.filter(friend=>
      [friend.username,friend.fullName,friend.nickname]
        .some(value=>this.normalizeFriendSearch(value||'').includes(query)));
  }

  clearFriendSearch():void{this.friendSearch='';}

  closeInviteDialog():void{
    if(this.busy)return;
    const returnToConversation=this.showCreate && this.createOpenedFromMessages;
    const previousFriend=this.initialFriend;
    this.showCreate=false;
    this.showAdd=false;
    this.friendSearch='';
    this.groupError='';
    this.createOpenedFromMessages=false;
    this.initialFriend='';
    if(returnToConversation){
      void this.router.navigate(['/menu/messages'],{
        queryParams:{kind:'direct',id:previousFriend}
      });
    }
  }

  toggle(name:string):void{
    const key=name.toLowerCase();
    if(this.selectedNames.has(key))this.selectedNames.delete(key);
    else this.selectedNames.add(key);
    this.selectedNames=new Set(this.selectedNames);
  }
  create():void{
    const names=[...this.selectedNames];
    if(this.busy||!names.length||this.title.trim().length<2||this.title.trim().length>90)return;
    this.busy=true;this.groupError='';
    this.api.create(this.title.trim(),names).subscribe({
      next:group=>{
        this.busy=false;this.groups=[group,...this.groups];
        this.initialFriend='';this.selectedNames.clear();this.select(group);
      },
      error:()=>{this.busy=false;this.groupError=t('groups.createError');}
    });
  }
  add():void{
    if(!this.selected||!this.isCreator||this.busy||!this.selectedNames.size)return;
    this.busy=true;this.groupError='';
    this.api.add(this.selected.id,[...this.selectedNames]).subscribe({
      next:updated=>{
        this.busy=false;this.showAdd=false;this.selectedNames.clear();
        this.selected=updated;
        this.groups=this.groups.map(g=>g.id===updated.id?updated:g);
      },
      error:()=>{this.busy=false;this.groupError=t('groups.addError');}
    });
  }
}
