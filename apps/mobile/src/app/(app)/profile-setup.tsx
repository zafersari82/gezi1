import { DISPLAY_NAME_MAX, displayNameSchema } from "@vado/contracts";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { useUpdateMe } from "@/features/users/queries";
import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Screen } from "@/ui/screen";
import { TextField } from "@/ui/text-field";

/** İlk girişte gösterilir: kullanıcı adını yazmadan uygulamanın geri kalanı açılmaz. */
export default function ProfileSetupScreen() {
  const updateMe = useUpdateMe();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError("Adın en az 2 harf olmalı.");
      return;
    }
    updateMe.mutate(
      { displayName: parsed.data },
      {
        onError: (cause) => {
          setError(errorMessage(cause));
        },
      },
    );
  }

  return (
    <Screen scroll padded edges={["top", "bottom", "left", "right"]}>
      <View style={styles.intro}>
        <AppText variant="title">Adın ne?</AppText>
        <AppText color="muted">
          Kişilerin seni bu adla görür. Dilediğin zaman profilinden değiştirebilirsin.
        </AppText>
      </View>

      <TextField
        label="Ad soyad"
        placeholder="Ayşe Yılmaz"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError(null);
        }}
        maxLength={DISPLAY_NAME_MAX}
        autoComplete="name"
        autoCapitalize="words"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
        error={error}
        testID="name-input"
      />
      <Button label="Devam et" onPress={save} loading={updateMe.isPending} testID="save-name" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: space.sm,
    marginTop: space.xxl,
  },
});
