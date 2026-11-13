export interface SocialStory {
  id: number;
  authorUsername: string;
  displayName: string;
  avatarUrl: string | null;
  communityId: number | null;
  communityName: string | null;
  communityPhotoUrl: string | null;
  caption: string | null;
  mediaUrl: string;
  video: boolean;
  createdAt: string;
  expiresAt: string;
  canDelete: boolean;
  textPosition?: 'top' | 'center' | 'bottom' | null;
  textScale?: 'small' | 'medium' | 'large' | null;
  textStyle?: 'plain' | 'pill' | null;
  altText?: string | null;
  showTime?: boolean;
  locationLabel?: string | null;
  taggedUsernames?: string | null;
}
