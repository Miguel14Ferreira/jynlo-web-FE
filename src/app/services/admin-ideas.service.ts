import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environment/environment';
import { AdminIdea, IdeaStatus } from '../pages/model/admin-idea';

@Injectable({ providedIn: 'root' })
export class AdminIdeasService {
  private readonly url = environment.apiUrl + '/api/admin/ideas';

  constructor(private http: HttpClient) {}

  list(): Observable<AdminIdea[]> {
    return this.http.get<AdminIdea[]>(this.url);
  }

  reply(id: number, message: string): Observable<AdminIdea> {
    return this.http.post<AdminIdea>(this.url + '/' + id + '/reply', { message });
  }

  updateStatus(id: number, status: IdeaStatus): Observable<AdminIdea> {
    return this.http.put<AdminIdea>(
      this.url + '/' + id + '/status',
      { status }
    );
  }
}
