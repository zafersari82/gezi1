import { BIO_MAX, DISPLAY_NAME_MAX, updateMeBodySchema } from "@vado/contracts";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { errorMessage, uploadImage } from "@/api/client";
import { pickImages } from "@/features/media/pick-images";
import { useMe } from "@/features/session/session-provider";
import { useUpdateMe } from "@/features/users/queries";
import { space } from "@/theme/tokens";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { Screen } from "@/ui/screen";
import { TextField } from "@/ui/text-field";

export default function EditProfileScreen() {
  const me = useMe();
  const updateMe = useUpdateMe();
  const { notify } = useFeedback();
  const [displayName, setDisplayName] = useState(me.displayName ?? "");
  const [username, setUsername] = useState(me.username ?? "");
  const [bio, setBio] = useState(me.bio);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changePhoto() {
    const [image] = await pickImages(1);
    if (image === undefined) return;
    setUploading(true);
    try {
      const media = await uploadImage(image);
      await updateMe.mutateAsync({ avatarMediaId: media.id });
    } catch (cause) {
      notify(errorMessage(cause));
    } finally {
      setUploading(false);
    }
  }

  function save() {
    const body = updateMeBodySchema.safeParse({
      displayName,
      username: username.trim() === "" ? null : username.trim().toLowerCase(),
      bio,
    });
    if (!body.success) {
      setError(
        "Adın en az 2 harf olmalı. VADO kimliği harfle başlamalı; 3-24 küçük harf, rakam veya alt çizgiden oluşmalı.",
      );
      return;
    }
    setError(null);
    updateMe.mutate(body.data, {
      onSuccess: () => {
        notify("Profilin güncellendi.");
        router.back();
      },
      onError: (cause) => {
        setError(errorMessage(cause));
      },
    });
  }

  return (
    <Screen
      scroll
      padded
      footer={
        <Button label="Kaydet" onPress={save} loading={updateMe.isPending} testID="save-profile" />
      }
    >
      <View style={styles.photo}>
        <Avatar name={me.displayName ?? ""} imageUrl={me.avatarUrl} size={96} />
        <View style={styles.photoActions}>
          <Button
            label="Fotoğrafı değiştir"
            variant="secondary"
            size="small"
            loading={uploading}
            onPress={() => void changePhoto()}
          />
          {me.avatarUrl !== null && (
            <Button
              label="Kaldır"
              variant="ghost"
              size="small"
              onPress={() => {
                updateMe.mutate({ avatarMediaId: null });
              }}
            />
          )}
        </View>
      </View>

      <TextField
        label="Ad soyad"
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={DISPLAY_NAME_MAX}
        autoCapitalize="words"
        testID="profile-name"
      />
      <TextField
        label="VADO kimliği"
        prefix="@"
        placeholder="ayse_yilmaz"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={24}
        hint="Kişilerin seni bu kimlikle arayıp bulabilir."
        testID="profile-username"
      />
      <TextField
        label="Hakkında"
        value={bio}
        onChangeText={setBio}
        maxLength={BIO_MAX}
        multiline
        error={error}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: {
    alignItems: "center",
    gap: space.md,
  },
  photoActions: {
    flexDirection: "row",
    gap: space.sm,
  },
});
