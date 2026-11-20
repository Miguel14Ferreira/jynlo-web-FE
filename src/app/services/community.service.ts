import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environment/environment';
import { CommunityProfile } from '../pages/model/community-profile';
import { FriendSummary } from '../pages/model/friend-summary';

export interface UserBlockStatus {
  blocked: boolean;
}

export interface FriendshipStatus {
  friends: boolean;
  pendingRequest: boolean;
}

export interface PublicCompletedParticipation {
  tournamentId: number;
  tournamentName: string;
  communityId: number;
  communityName: string;
  sport: string | null;
  completedAt: string;
  individualChampion: boolean;
  wins: number | null;
  draws: number | null;
  losses: number | null;
}

export interface PublicIndividualTitle {
  tournamentId: number;
  tournamentName: string;
  communityId: number;
  communityName: string;
  sport: string | null;
  completedAt: string;
}

export interface PublicProfileAffiliations {
  teams: Array<{id:number;name:string;sport:string|null}>;
  communities: Array<{id:number;name:string;sport:string|null}>;
}

export interface ProfileSearchFilters {
  name?: string;
  sport?: string;
  location?: string;
  minAge?: number;
  maxAge?: number;
  skillLevel?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CommunityService {
  private readonly profileUrl = environment.apiUrl + '/api/profile';
  private readonly friendsUrl = environment.apiUrl + '/api/friends';
  private readonly userReportsUrl = environment.apiUrl + '/api/reports/users';
  private readonly userBlocksUrl = environment.apiUrl + '/api/blocks/users';

  constructor(private http: HttpClient) {}

  discoverProfiles(): Observable<CommunityProfile[]> {
    return this.http.get<CommunityProfile[]>(this.profileUrl + '/discover');
  }

  findProfiles(filters: ProfileSearchFilters): Observable<CommunityProfile[]> {
    let params = new HttpParams();

    if (filters.name?.trim()) {
      params = params.set('name', filters.name.trim());
    }
    if (filters.sport?.trim()) {
      params = params.set('sport', filters.sport.trim());
    }
    if (filters.location?.trim()) {
      params = params.set('location', filters.location.trim());
    }
    if (filters.minAge !== undefined) {
      params = params.set('minAge', String(filters.minAge));
    }
    if (filters.maxAge !== undefined) {
      params = params.set('maxAge', String(filters.maxAge));
    }
    if (filters.skillLevel?.trim()) {
      params = params.set('skillLevel', filters.skillLevel.trim());
    }

    return this.http.get<CommunityProfile[]>(
      this.profileUrl + '/search',
      { params }
    );
  }

  searchProfiles(name: string): Observable<CommunityProfile[]> {
    return this.http.get<CommunityProfile[]>(
      this.profileUrl + '/name/' + encodeURIComponent(name.trim())
    );
  }

  publicProfile(username: string): Observable<CommunityProfile> {
    return this.http.get<CommunityProfile>(
      this.profileUrl + '/' + encodeURIComponent(username)
    );
  }

  publicCompletedParticipations(username: string): Observable<PublicCompletedParticipation[]> {
    return this.http.get<PublicCompletedParticipation[]>(
      this.profileUrl + '/' + encodeURIComponent(username) + '/completed-individual-participations'
    );
  }

  publicIndividualTitles(username: string): Observable<PublicIndividualTitle[]> {
    return this.http.get<PublicIndividualTitle[]>(
      this.profileUrl + '/' + encodeURIComponent(username) + '/individual-titles'
    );
  }

  publicAffiliations(username: string): Observable<PublicProfileAffiliations> {
    return this.http.get<PublicProfileAffiliations>(
      this.profileUrl + '/' + encodeURIComponent(username) + '/public-affiliations'
    );
  }

  friendshipStatus(username: string): Observable<FriendshipStatus> {
    return this.http.get<FriendshipStatus>(
      this.friendsUrl + '/status/' + encodeURIComponent(username)
    );
  }

  sendFriendRequest(username: string): Observable<unknown> {
    return this.http.post(
      this.friendsUrl + '/add/' + encodeURIComponent(username),
      null
    );
  }

  reportUser(username: string, reason: string): Observable<void> {
    return this.http.post<void>(
      this.userReportsUrl + '/' + encodeURIComponent(username),
      { reason: reason.trim() }
    );
  }

  userBlockStatus(username: string): Observable<UserBlockStatus> {
    return this.http.get<UserBlockStatus>(
      this.userBlocksUrl + '/' + encodeURIComponent(username) + '/status'
    );
  }

  blockUser(username: string): Observable<UserBlockStatus> {
    return this.http.post<UserBlockStatus>(
      this.userBlocksUrl + '/' + encodeURIComponent(username),
      null
    );
  }

  unblockUser(username: string): Observable<UserBlockStatus> {
    return this.http.delete<UserBlockStatus>(
      this.userBlocksUrl + '/' + encodeURIComponent(username)
    );
  }

  friends(): Observable<FriendSummary[]> {
    return this.http.get<FriendSummary[]>(this.friendsUrl + '/me');
  }

  blockFriend(username: string): Observable<unknown> {
    return this.http.put(
      this.friendsUrl + '/' + encodeURIComponent(username) + '/block',
      null
    );
  }

  unblockFriend(username: string): Observable<unknown> {
    return this.http.put(
      this.friendsUrl + '/' + encodeURIComponent(username) + '/unblock',
      null
    );
  }

  removeFriend(username: string): Observable<unknown> {
    return this.http.delete(
      this.friendsUrl + '/' + encodeURIComponent(username)
    );
  }
}
