export type IdeaStatus = 'NEW' | 'IN_REVIEW' | 'PLANNED' | 'REJECTED' | 'IMPLEMENTED';

export interface AdminIdea {
  id: number;
  name: string;
  city: string;
  email: string;
  gender: string;
  subject: string;
  problem: string;
  status: IdeaStatus;
  createdAt: string | null;
  adminReply?: string | null;
  adminRepliedAt?: string | null;
  adminRepliedBy?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
}
