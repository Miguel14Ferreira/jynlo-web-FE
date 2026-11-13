export interface FollowStatus {
  followedByMe: boolean;
  followsMe: boolean;
  followers: number;
  following: number;
  requestPending?: boolean;
  privateProfile?: boolean;
}

export interface FollowProfile {
  username: string;
  fullName: string | null;
  nickname: string | null;
  profilePicUrl: string | null;
}
