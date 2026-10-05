import { type Moment, MOMENT_COMMENT_MAX } from "@vado/contracts";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { errorMessage } from "@/api/client";
import { formatDateTime } from "@/lib/format";
import { colors, radius, space, typography } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { useFeedback } from "@/ui/feedback";
import { HeaderButton } from "@/ui/header-button";
import { Icon } from "@/ui/icon";

import {
  useAddMomentComment,
  useDeleteMoment,
  useDeleteMomentComment,
  useSetMomentLiked,
} from "./queries";

const AVATAR_SIZE = 44;

interface MomentCardProps {
  moment: Moment;
  myId: string;
  onOpenUser: (userId: string) => void;
  onOpenImage: (imageUrl: string) => void;
  onReport: (momentId: string) => void;
}

/** Görsel sayısına göre sütun sayısı: tek görsel geniş, 2-4 görsel ikili, fazlası üçlü ızgara. */
function columnsFor(count: number): number {
  if (count === 1) return 1;
  return count <= 4 ? 2 : 3;
}

export function MomentCard({ moment, myId, onOpenUser, onOpenImage, onReport }: MomentCardProps) {
  const setLiked = useSetMomentLiked();
  const addComment = useAddMomentComment();
  const deleteComment = useDeleteMomentComment();
  const deleteMoment = useDeleteMoment();
  const { confirm, notify } = useFeedback();
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState("");

  const mine = moment.author.id === myId;
  const columns = columnsFor(moment.imageUrls.length);
  const hasActivity = moment.likes.length > 0 || moment.comments.length > 0;
  const onError = (error: unknown) => {
    notify(errorMessage(error));
  };

  function submitComment() {
    const body = draft.trim();
    if (body === "") return;
    addComment.mutate(
      { momentId: moment.id, body },
      {
        onSuccess: () => {
          setDraft("");
          setCommenting(false);
        },
        onError,
      },
    );
  }

  async function remove() {
    const confirmed = await confirm({
      title: "Paylaşım silinsin mi?",
      message: "Beğeniler ve yorumlar da silinir.",
      confirmLabel: "Sil",
      destructive: true,
    });
    if (confirmed) deleteMoment.mutate(moment.id, { onError });
  }

  async function removeComment(commentId: string) {
    const confirmed = await confirm({
      title: "Yorum silinsin mi?",
      confirmLabel: "Sil",
      destructive: true,
    });
    if (confirmed) deleteComment.mutate({ momentId: moment.id, commentId }, { onError });
  }

  return (
    <View style={styles.card} testID={`moment-${moment.id}`}>
      <Pressable
        onPress={() => {
          onOpenUser(moment.author.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={moment.author.displayName}
      >
        <Avatar
          name={moment.author.displayName}
          imageUrl={moment.author.avatarUrl}
          size={AVATAR_SIZE}
        />
      </Pressable>

      <View style={styles.body}>
        <AppText
          variant="bodyStrong"
          color="teal"
          onPress={() => {
            onOpenUser(moment.author.id);
          }}
        >
          {moment.author.displayName}
        </AppText>
        {moment.body !== "" && <AppText>{moment.body}</AppText>}

        {moment.imageUrls.length > 0 && (
          <View style={styles.images}>
            {moment.imageUrls.map((imageUrl) => (
              <Pressable
                key={imageUrl}
                style={{ width: `${100 / columns}%` }}
                onPress={() => {
                  onOpenImage(imageUrl);
                }}
                accessibilityRole="button"
                accessibilityLabel="Fotoğrafı aç"
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={[styles.image, columns === 1 && styles.imageSingle]}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.toolbar}>
          <AppText variant="caption" color="muted" style={styles.time}>
            {formatDateTime(moment.createdAt)}
          </AppText>
          {mine ? (
            <HeaderButton
              icon="trash-outline"
              label="Paylaşımı sil"
              color="muted"
              onPress={() => void remove()}
            />
          ) : (
            <HeaderButton
              icon="flag-outline"
              label="Paylaşımı şikayet et"
              color="muted"
              onPress={() => {
                onReport(moment.id);
              }}
              testID={`report-${moment.id}`}
            />
          )}
          <HeaderButton
            icon={moment.likedByMe ? "heart" : "heart-outline"}
            label={moment.likedByMe ? "Beğeniyi geri al" : "Beğen"}
            color={moment.likedByMe ? "coral" : "muted"}
            onPress={() => {
              setLiked.mutate({ momentId: moment.id, liked: !moment.likedByMe }, { onError });
            }}
            testID={`like-${moment.id}`}
          />
          <HeaderButton
            icon="chatbubble-outline"
            label="Yorum yap"
            color="muted"
            onPress={() => {
              setCommenting(!commenting);
            }}
            testID={`comment-${moment.id}`}
          />
        </View>

        {hasActivity && (
          <View style={styles.activity}>
            {moment.likes.length > 0 && (
              <View style={styles.likes}>
                <Icon name="heart" size={14} color="coral" />
                <AppText variant="callout" color="teal" style={styles.likeNames}>
                  {moment.likes.map((user) => user.displayName).join(", ")}
                </AppText>
              </View>
            )}
            {moment.comments.map((comment) => {
              const removable = mine || comment.author.id === myId;
              return (
                <View key={comment.id} style={styles.comment}>
                  <AppText variant="callout" style={styles.commentText}>
                    <AppText variant="callout" color="teal" style={styles.commentAuthor}>
                      {comment.author.displayName}
                    </AppText>{" "}
                    {comment.body}
                  </AppText>
                  {removable && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Yorumu sil"
                      hitSlop={8}
                      onPress={() => void removeComment(comment.id)}
                    >
                      <Icon name="close" size={16} color="faint" />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {commenting && (
          <View style={styles.commentBox}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Yorum yaz"
              placeholderTextColor={colors.faint}
              accessibilityLabel="Yorum yaz"
              maxLength={MOMENT_COMMENT_MAX}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={submitComment}
              style={styles.commentInput}
              testID="comment-input"
            />
            <HeaderButton
              icon="send"
              label="Yorumu gönder"
              color={draft.trim() === "" ? "faint" : "teal"}
              onPress={submitComment}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: space.md,
    padding: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  body: {
    flex: 1,
    gap: space.xs,
  },
  images: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: space.xs,
    marginHorizontal: -2,
  },
  image: {
    aspectRatio: 1,
    margin: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.mist,
  },
  imageSingle: {
    aspectRatio: 4 / 3,
    maxWidth: 260,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  time: {
    flex: 1,
  },
  activity: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.sm,
    backgroundColor: colors.mist,
  },
  likes: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
  },
  likeNames: {
    flex: 1,
  },
  comment: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  commentText: {
    flex: 1,
  },
  commentAuthor: {
    fontWeight: "600",
  },
  commentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingLeft: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.mist,
  },
  commentInput: {
    flex: 1,
    height: 40,
    ...typography.callout,
    color: colors.ink,
    outlineWidth: 0,
  },
});
