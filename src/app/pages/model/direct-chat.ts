export interface DirectChatMessage {
  id: number | null;
  username1: string;
  username2: string;
  text: string;
  dataDisplay: string | null;
  date: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  attachments?: {index: number; filename: string; mimeType: string; size: number}[];
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSize?: number | null;
  replyToMessageId?: number | null;
  replyToSender?: string | null;
  replyToText?: string | null;
}

export interface DirectChatInfo {
  chatBlocked: boolean;
  whoBlocked: string | null;
}
