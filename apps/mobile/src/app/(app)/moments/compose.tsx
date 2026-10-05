import { MOMENT_BODY_MAX, MOMENT_IMAGES_MAX } from "@vado/contracts";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { errorMessage, type LocalImage } from "@/api/client";
import { pickImages } from "@/features/media/pick-images";
import { useCreateMoment } from "@/features/moments/queries";
import { colors, radius, space, typography } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import { Screen } from "@/ui/screen";

const THUMBNAIL_SIZE = 84;

export default function ComposeMomentScreen() {
  const createMoment = useCreateMoment();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const remaining = MOMENT_IMAGES_MAX - images.length;
  const empty = body.trim() === "" && images.length === 0;

  async function addImages() {
    const picked = await pickImages(remaining);
    setImages([...images, ...picked].slice(0, MOMENT_IMAGES_MAX));
  }

  function share() {
    setError(null);
    createMoment.mutate(
      { body: body.trim(), images },
      {
        onSuccess: () => {
          router.back();
        },
        onError: (cause) => {
          setError(errorMessage(cause));
        },
      },
    );
  }

  return (
    <Screen
      scroll
      padded
      footer={
        <Button
          label="Paylaş"
          onPress={share}
          disabled={empty}
          loading={createMoment.isPending}
          testID="share-moment"
        />
      }
    >
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Ne paylaşmak istersin?"
        placeholderTextColor={colors.faint}
        accessibilityLabel="Paylaşım metni"
        multiline
        autoFocus
        maxLength={MOMENT_BODY_MAX}
        style={styles.input}
        testID="moment-body"
      />

      <View style={styles.images}>
        {images.map((image) => (
          <View key={image.uri}>
            <Image source={{ uri: image.uri }} style={styles.thumbnail} contentFit="cover" />
            <Pressable
              style={styles.remove}
              accessibilityRole="button"
              accessibilityLabel="Fotoğrafı kaldır"
              hitSlop={8}
              onPress={() => {
                setImages(images.filter((item) => item.uri !== image.uri));
              }}
            >
              <Icon name="close" size={14} color="white" />
            </Pressable>
          </View>
        ))}
        {remaining > 0 && (
          <Pressable
            style={[styles.thumbnail, styles.add]}
            accessibilityRole="button"
            accessibilityLabel="Fotoğraf ekle"
            onPress={() => void addImages()}
          >
            <Icon name="add" size={28} color="muted" />
          </Pressable>
        )}
      </View>
      <AppText variant="caption" color="muted">
        En fazla {MOMENT_IMAGES_MAX} fotoğraf ekleyebilirsin. Paylaşımını yalnızca kişilerin görür.
      </AppText>

      {error !== null && (
        <AppText variant="callout" color="coral">
          {error}
        </AppText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 120,
    ...typography.body,
    color: colors.ink,
    verticalAlign: "top",
    outlineWidth: 0,
  },
  images: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radius.sm,
    backgroundColor: colors.mist,
  },
  add: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: "dashed",
  },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
});
