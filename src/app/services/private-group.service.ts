import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface PrivateGroupMember {
  username: string; displayName: string; profilePicUrl: string | null; admin: boolean;
}
export interface PrivateGroup {
  id: number; title: string; creatorUsername: string; createdAt: string;
  members: PrivateGroupMember[]; photoUrl?: string | null;
}
export interface PrivateGroupAttachment { index: number; filename: string; mimeType: string; size: number | null; }
export interface PrivateGroupMessage {
  id: number; groupId: number; sender: string; text: string; createdAt: string;
  replyToId?: number | null; editedAt?: string | null; deleted?: boolean; attachments?: PrivateGroupAttachment[];
}

/** All operations are authenticated; backend rechecks membership for each call. */
@Injectable({providedIn:'root'})
export class PrivateGroupService {
  private readonly base = environment.apiUrl + '/api/private-groups';
  constructor(private readonly http:HttpClient){}
  list():Observable<PrivateGroup[]> {return this.http.get<PrivateGroup[]>(this.base);}
  get(id:number):Observable<PrivateGroup> {return this.http.get<PrivateGroup>(this.base+'/'+id);}
  create(title:string,usernames:string[]):Observable<PrivateGroup> {
    return this.http.post<PrivateGroup>(this.base,{title,usernames});
  }
  add(id:number,usernames:string[]):Observable<PrivateGroup> {
    return this.http.post<PrivateGroup>(this.base+'/'+id+'/members',{usernames});
  }
  rename(id:number,title:string):Observable<PrivateGroup> {
    return this.http.patch<PrivateGroup>(this.base+'/'+id,{title});
  }
  uploadPhoto(id:number,file:File):Observable<PrivateGroup> {
    const body=new FormData();body.append('photo',file,file.name);
    return this.http.post<PrivateGroup>(this.base+'/'+id+'/photo',body);
  }
  removeMember(id:number,username:string):Observable<PrivateGroup> {
    return this.http.delete<PrivateGroup>(this.base+'/'+id+'/members/'+encodeURIComponent(username));
  }
  messages(id:number,beforeId?:number):Observable<PrivateGroupMessage[]> {
    return this.http.get<PrivateGroupMessage[]>(this.base+'/'+id+'/messages',{
      params:beforeId?{beforeId}:{}
    });
  }
  send(id:number,text:string,replyToId?:number|null):Observable<PrivateGroupMessage> {
    return this.http.post<PrivateGroupMessage>(this.base+'/'+id+'/messages',{text,replyToId:replyToId??null});
  }
  edit(id:number,messageId:number,text:string):Observable<PrivateGroupMessage> {
    return this.http.put<PrivateGroupMessage>(this.base+'/'+id+'/messages/'+messageId,{text});
  }
  deleteMessage(id:number,messageId:number):Observable<void> {
    return this.http.delete<void>(this.base+'/'+id+'/messages/'+messageId);
  }
  search(id:number,q:string):Observable<PrivateGroupMessage[]> {
    return this.http.get<PrivateGroupMessage[]>(this.base+'/'+id+'/messages/search',{params:{q}});
  }
  attachmentsAvailable(id:number):Observable<{available:boolean}> {
    return this.http.get<{available:boolean}>(this.base+'/'+id+'/messages/attachments/availability');
  }
  upload(id:number,files:File[],caption:string,replyToId?:number|null):Observable<PrivateGroupMessage> {
    const body=new FormData();
    for(const file of files)body.append('files',file,file.name);
    if(caption.trim())body.append('caption',caption.trim());
    if(replyToId)body.append('replyToMessageId',String(replyToId));
    return this.http.post<PrivateGroupMessage>(this.base+'/'+id+'/messages/attachments',body);
  }
  download(id:number,messageId:number,index:number):Observable<Blob> {
    return this.http.get(this.base+'/'+id+'/messages/'+messageId+'/attachments/'+index,{responseType:'blob'});
  }
}
