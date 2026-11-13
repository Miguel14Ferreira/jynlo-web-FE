import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface PersonalLiveEvent {
  id:number; username:string; avatarUrl:string|null; title:string;
  status:'LIVE'|'ENDED'; startedAt:string; canManage:boolean;
}
export interface PersonalLiveConnection {
  serverUrl:string; token:string; role:'HOST'|'VIEWER'|'GUEST'; expiresAt:string;
}
export interface PersonalLiveChatMessage {
  id:number;username:string;message:string;createdAt:string;
}
export interface PersonalLiveGuestRequest {
  id:number;username:string;status:'PENDING'|'APPROVED'|'DECLINED';createdAt:string;
}
export interface PersonalLiveControls {
  chatEnabled:boolean;mutedByHost:boolean;guestUsername:string|null;
  requestStatus:string|null;pendingRequests:PersonalLiveGuestRequest[];
}
@Injectable({providedIn:'root'})
export class PersonalLiveService {
  private readonly http=inject(HttpClient);
  private readonly url=environment.apiUrl.replace(/\/+$/,'')+'/api/live';
  active(): Observable<PersonalLiveEvent[]> {
    return this.http.get<PersonalLiveEvent[]>(this.url);
  }
  start(title:string): Observable<PersonalLiveEvent> {
    return this.http.post<PersonalLiveEvent>(this.url,{title});
  }
  join(id:number): Observable<PersonalLiveConnection> {
    return this.http.post<PersonalLiveConnection>(this.url+'/'+id+'/join',{});
  }
  heartbeat(id:number): Observable<void> {
    return this.http.post<void>(this.url+'/'+id+'/heartbeat',{});
  }
  messages(id:number):Observable<PersonalLiveChatMessage[]> {
    return this.http.get<PersonalLiveChatMessage[]>(this.url+'/'+id+'/messages');
  }
  sendMessage(id:number,message:string):Observable<PersonalLiveChatMessage> {
    return this.http.post<PersonalLiveChatMessage>(this.url+'/'+id+'/messages',{message});
  }
  controls(id:number):Observable<PersonalLiveControls> {
    return this.http.get<PersonalLiveControls>(this.url+'/'+id+'/controls');
  }
  setChatEnabled(id:number,enabled:boolean):Observable<PersonalLiveControls> {
    return this.http.put<PersonalLiveControls>(this.url+'/'+id+'/chat',{enabled});
  }
  muteViewer(id:number,username:string,muted:boolean):Observable<PersonalLiveControls> {
    return this.http.put<PersonalLiveControls>(
      this.url+'/'+id+'/mute/'+encodeURIComponent(username),{muted});
  }
  requestToJoin(id:number):Observable<PersonalLiveGuestRequest> {
    return this.http.post<PersonalLiveGuestRequest>(this.url+'/'+id+'/guest-requests',{});
  }
  decideGuest(id:number,requestId:number,approve:boolean):Observable<PersonalLiveGuestRequest> {
    return this.http.post<PersonalLiveGuestRequest>(
      this.url+'/'+id+'/guest-requests/'+requestId+'/'+(approve?'approve':'decline'),{});
  }
  removeGuest(id:number):Observable<void> {
    return this.http.delete<void>(this.url+'/'+id+'/guest');
  }
  end(id:number): Observable<PersonalLiveEvent> {
    return this.http.post<PersonalLiveEvent>(this.url+'/'+id+'/end',{});
  }
}
