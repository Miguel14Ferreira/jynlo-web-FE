export interface SessionMessage {
  id: number;
  sessionId: number;
  senderUsername: string;
  senderGuest?: boolean;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyToMessageId?: number | null;
  replyToSender?: string | null;
  replyToText?: string | null;
  attachments?: {index: number; filename: string; mimeType: string; size: number}[];
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSize?: number | null;
}
