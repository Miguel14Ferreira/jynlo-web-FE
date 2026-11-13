import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface PersonalLiveEvent {
  id:number; username:string; avatarUrl:string|null; title:string;
  status:'LIVE'|'ENDED'; startedAt:string; canManage:boolean;
}
export interface PersonalLiveConnection {
  serverUrl:string; token:string; role:'HOST'|'VIEWER'; expiresAt:string;
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
  end(id:number): Observable<PersonalLiveEvent> {
    return this.http.post<PersonalLiveEvent>(this.url+'/'+id+'/end',{});
  }
}
