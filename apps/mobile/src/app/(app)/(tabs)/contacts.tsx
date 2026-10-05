import type { Contact } from "@vado/contracts";
import { router } from "expo-router";
import { useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";

import { useContactRequests, useContacts } from "@/features/contacts/queries";
import { compareTr, foldText, upperCaseTr } from "@/lib/text";
import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { CountBadge } from "@/ui/badge";
import { IconTile } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { SearchField } from "@/ui/search-field";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

interface Section {
  title: string;
  data: Contact[];
}

/** Kişileri ada göre sıralar ve baş harflerine göre bölümlere ayırır. */
function groupByInitial(contacts: Contact[]): Section[] {
  const sections = new Map<string, Contact[]>();
  for (const contact of [...contacts].sort((a, b) => compareTr(a.displayName, b.displayName))) {
    const initial = upperCaseTr(contact.displayName.trim()[0] ?? "#");
    sections.set(initial, [...(sections.get(initial) ?? []), contact]);
  }
  return [...sections].map(([title, data]) => ({ title, data }));
}

export default function ContactsScreen() {
  const contacts = useContacts();
  const requests = useContactRequests();
  const [search, setSearch] = useState("");

  if (contacts.isPending) return <LoadingView />;
  if (contacts.isError) {
    return <ErrorView error={contacts.error} onRetry={() => void contacts.refetch()} />;
  }

  const needle = foldText(search);
  const visible = contacts.data.filter(
    (contact) =>
      needle === "" ||
      foldText(contact.displayName).includes(needle) ||
      (contact.username?.includes(needle) ?? false),
  );

  return (
    <SectionList
      sections={groupByInitial(visible)}
      keyExtractor={(contact) => contact.id}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View>
          <SearchField value={search} onChangeText={setSearch} placeholder="Kişilerinde ara" />
          <ListRow
            title="Kişi istekleri"
            leading={<IconTile name="person-add" accent="teal" />}
            trailing={<CountBadge count={requests.data?.incoming.length ?? 0} />}
            chevron
            onPress={() => {
              router.push("/contacts/requests");
            }}
            testID="contact-requests"
          />
        </View>
      }
      renderSectionHeader={({ section }) => (
        <AppText variant="caption" color="muted" style={styles.sectionHeader}>
          {section.title}
        </AppText>
      )}
      renderItem={({ item }) => (
        <ListRow
          title={item.displayName}
          subtitle={item.bio}
          leading={<Avatar name={item.displayName} imageUrl={item.avatarUrl} size={44} />}
          onPress={() => {
            router.push({ pathname: "/user/[id]", params: { id: item.id } });
          }}
          testID={`contact-${item.id}`}
        />
      )}
      ListEmptyComponent={
        contacts.data.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Henüz kişin yok"
            message="Telefon numarası, VADO kimliği veya QR kod ile kişi ekleyebilirsin."
            actionLabel="Kişi ekle"
            onAction={() => {
              router.push("/contacts/add");
            }}
          />
        ) : (
          <AppText color="muted" align="center" style={styles.noMatch}>
            “{search}” ile eşleşen kişi yok.
          </AppText>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  sectionHeader: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  noMatch: {
    padding: space.xxl,
  },
});
