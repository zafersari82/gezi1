import type { UserProfile } from "@vado/contracts";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { useUserSearch } from "@/features/users/queries";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { IconTile } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";
import { TextField } from "@/ui/text-field";

const MIN_QUERY_LENGTH = 3;

export default function AddContactScreen() {
  const search = useUserSearch();
  const [query, setQuery] = useState("");
  /** `undefined`: henüz arama yapılmadı; `null`: arama sonuç vermedi. */
  const [result, setResult] = useState<UserProfile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const value = query.trim();
    if (value.length < MIN_QUERY_LENGTH) return;
    setError(null);
    search.mutate(value, {
      onSuccess: setResult,
      onError: (cause) => {
        setError(errorMessage(cause));
      },
    });
  }

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
        <TextField
          label="Telefon numarası veya VADO kimliği"
          placeholder="0555 123 45 67 veya @ayse"
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setResult(undefined);
            setError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={submit}
          error={error}
          hint="Tam numarayı veya kimliği yazmalısın; kısmi arama yapılmaz."
          testID="search-input"
        />
        <Button
          label="Ara"
          onPress={submit}
          loading={search.isPending}
          disabled={query.trim().length < MIN_QUERY_LENGTH}
          testID="search-submit"
        />
      </View>

      {result === null && (
        <AppText color="muted" align="center" style={styles.notFound}>
          Bu bilgilerle kayıtlı bir kullanıcı bulunamadı.
        </AppText>
      )}
      {result !== null && result !== undefined && (
        <ListRow
          title={result.displayName}
          subtitle={result.username === null ? result.bio : `@${result.username}`}
          leading={<Avatar name={result.displayName} imageUrl={result.avatarUrl} size={48} />}
          chevron
          onPress={() => {
            router.push({ pathname: "/user/[id]", params: { id: result.id } });
          }}
          testID="search-result"
        />
      )}

      <SectionTitle>QR kod ile</SectionTitle>
      <ListRow
        title="QR kod okut"
        subtitle="Karşındaki kişinin kodunu okut"
        leading={<IconTile name="scan" accent="teal" />}
        chevron
        onPress={() => {
          router.push("/scan");
        }}
      />
      <ListRow
        title="QR kodumu göster"
        subtitle="Kodunu karşındaki kişi okutsun"
        leading={<IconTile name="qr-code" accent="cobalt" />}
        chevron
        onPress={() => {
          router.push("/my-qr");
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  form: {
    gap: space.md,
    padding: space.lg,
  },
  notFound: {
    padding: space.xl,
  },
});
