export type FeedItemType = 'POST' | 'SESSION_CREATED' | 'SESSION_ATTENDED';

export interface FeedItem {
  type: FeedItemType;
  postId: number | null;
  authorUsername: string;
  authorDisplayName: string;
  authorProfilePicUrl: string | null;
  content: string | null;
  imageUrl: string | null;
  videoUrl?: string | null;
  createdAt: string;
  sessionId: number | null;
  sport: string | null;
  city: string | null;
  gameDate: string | null;
  likeCount: number;
  likedByMe: boolean;
  hideLikers?: boolean;
  commentCount: number;
}

export interface SocialComment {
  id: number;
  postId: number;
  authorUsername: string;
  authorDisplayName: string;
  authorProfilePicUrl: string | null;
  content: string;
  createdAt: string;
}

export interface PostLikeStatus {
  likedByMe: boolean;
  likeCount: number;
}
