import { shareCardUrl } from '../../shared/share-card-url';

export function buildCommunityGroupInviteUrl(origin: string, communityId: number): string {
  return shareCardUrl('communities', communityId, origin);
}

export function buildWhatsAppGroupShareUrl(message: string): string {
  return 'https://wa.me/?text=' + encodeURIComponent(message);
}
