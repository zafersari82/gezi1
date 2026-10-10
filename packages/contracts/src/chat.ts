import { z } from "zod";

import { idSchema, timestampSchema } from "./common";
import { userRefSchema } from "./users";

export const MESSAGE_MAX_LENGTH = 4000;
export const GROUP_TITLE_MAX = 60;
export const GROUP_MEMBERS_MAX = 100;

export const messageKindSchema = z.enum(["text", "image", "system"]);
export type MessageKind = z.infer<typeof messageKindSchema>;

export const messageSchema = z.object({
  id: idSchema,
  /** Sunucunun verdiği artan sıra numarası; sıralama ve okundu bilgisi buna dayanır. */
  seq: z.number().int(),
  conversationId: idSchema,
  /** Sistem mesajlarında ve silinmiş hesaplarda `null`. */
  senderId: idSchema.nullable(),
  kind: messageKindSchema,
  body: z.string(),
  imageUrl: z.string().nullable(),
  /** İstemcinin ürettiği kimlik; aynı mesajın iki kez kaydedilmesini engeller. */
  clientId: z.string().nullable(),
  createdAt: timestampSchema,
});
export type Message = z.infer<typeof messageSchema>;

const clientIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const sendMessageBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    clientId: clientIdSchema,
    body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
  }),
  z.object({
    kind: z.literal("image"),
    clientId: clientIdSchema,
    mediaId: idSchema,
  }),
]);
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

export const conversationKindSchema = z.enum(["direct", "group", "business"]);
export type ConversationKind = z.infer<typeof conversationKindSchema>;

export const memberRoleSchema = z.enum(["owner", "member"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const conversationMemberSchema = userRefSchema.extend({
  role: memberRoleSchema,
  lastReadSeq: z.number().int(),
});
export type ConversationMember = z.infer<typeof conversationMemberSchema>;

export const lastMessageSchema = messageSchema.extend({
  senderName: z.string().nullable(),
});
export type LastMessage = z.infer<typeof lastMessageSchema>;

export const conversationSchema = z.object({
  id: idSchema,
  kind: conversationKindSchema,
  /** Grupta grup adı, birebir sohbette karşı tarafın görünen adı. */
  title: z.string(),
  avatarUrl: z.string().nullable(),
  /** Birebir sohbette karşı tarafın kimliği; grupta `null`. */
  peerId: idSchema.nullable(),
  memberCount: z.number().int(),
  lastMessage: lastMessageSchema.nullable(),
  unreadCount: z.number().int(),
  updatedAt: timestampSchema,
});
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationDetailSchema = conversationSchema.extend({
  members: z.array(conversationMemberSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const createDirectConversationBodySchema = z.object({
  userId: idSchema,
});
export type CreateDirectConversationBody = z.infer<typeof createDirectConversationBodySchema>;

const groupTitleSchema = z.string().trim().min(1).max(GROUP_TITLE_MAX);
const memberIdsSchema = z
  .array(idSchema)
  .min(1)
  .max(GROUP_MEMBERS_MAX - 1);

export const createGroupConversationBodySchema = z.object({
  title: groupTitleSchema,
  memberIds: memberIdsSchema,
});
export type CreateGroupConversationBody = z.infer<typeof createGroupConversationBodySchema>;

export const updateConversationBodySchema = z.object({
  title: groupTitleSchema,
});
export type UpdateConversationBody = z.infer<typeof updateConversationBodySchema>;

export const addMembersBodySchema = z.object({
  userIds: memberIdsSchema,
});
export type AddMembersBody = z.infer<typeof addMembersBodySchema>;

export const markReadBodySchema = z.object({
  seq: z.number().int().nonnegative(),
});
export type MarkReadBody = z.infer<typeof markReadBodySchema>;
