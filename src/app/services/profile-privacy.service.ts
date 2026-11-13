import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface ProfilePrivacyStatus {
  privateProfile: boolean;
  canViewContent: boolean;
  privateModeAvailable: boolean;
}
export interface FollowRequestSummary {
  id:number;
  username:string;
  name:string|null;
  avatarUrl:string|null;
  createdAt:string;
}
@Injectable({providedIn:'root'})
export class ProfilePrivacyService {
  private readonly http=inject(HttpClient);
  private readonly base=environment.apiUrl+'/api/profile/privacy';
  status(username:string):Observable<ProfilePrivacyStatus> {
    return this.http.get<ProfilePrivacyStatus>(this.base+'/'+encodeURIComponent(username));
  }
  mine():Observable<ProfilePrivacyStatus> {
    return this.http.get<ProfilePrivacyStatus>(this.base+'/me');
  }
  setPrivate(privateProfile:boolean):Observable<ProfilePrivacyStatus> {
    return this.http.put<ProfilePrivacyStatus>(this.base+'/me',{privateProfile});
  }
  requests():Observable<FollowRequestSummary[]> {
    return this.http.get<FollowRequestSummary[]>(this.base+'/me/requests');
  }
  decide(id:number,accept:boolean):Observable<void> {
    return this.http.post<void>(this.base+'/me/requests/'+id+'/'+(accept?'accept':'reject'),{});
  }
  request(username:string):Observable<void> {
    return this.http.post<void>(this.base+'/'+encodeURIComponent(username)+'/requests',{});
  }
  cancel(username:string):Observable<void> {
    return this.http.delete<void>(this.base+'/'+encodeURIComponent(username)+'/requests');
  }
}
