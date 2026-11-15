import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

/** Global team identity, not the existing community-scoped permanent-team record. */
export interface SportsTeam {
  id: number;
  slug: string;
  name: string;
  sport: string | null;
  location: string | null;
  description: string | null;
  ownerProfileId: number;
  feedEnabled: boolean;
  chatEnabled: boolean;
}

export interface CreateSportsTeam {
  name: string;
  sport?: string | null;
  location?: string | null;
  description?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SportsTeamsService {
  private readonly url = environment.apiUrl + '/api/teams';
  constructor(private readonly http: HttpClient) {}

  discover(query = ''): Observable<SportsTeam[]> {
    return this.http.get<SportsTeam[]>(this.url, {
      params: new HttpParams().set('q', query.trim())
    });
  }
  mine(): Observable<SportsTeam[]> {
    return this.http.get<SportsTeam[]>(this.url + '/mine');
  }
  detail(id: number): Observable<SportsTeam> {
    return this.http.get<SportsTeam>(this.url + '/' + id);
  }
  create(input: CreateSportsTeam): Observable<SportsTeam> {
    return this.http.post<SportsTeam>(this.url, input);
  }
  setFeatures(id: number, input: {feedEnabled?: boolean; chatEnabled?: boolean}): Observable<SportsTeam> {
    return this.http.patch<SportsTeam>(this.url + '/' + id + '/features', input);
  }
}
