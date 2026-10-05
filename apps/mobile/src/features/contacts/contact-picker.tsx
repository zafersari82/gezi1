import type { Contact } from "@vado/contracts";
import { useState } from "react";
import { FlatList, StyleSheet } from "react-native";

import { compareTr, foldText } from "@/lib/text";
import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { Icon } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { SearchField } from "@/ui/search-field";

interface ContactPickerProps {
  contacts: Contact[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  /** Seçilemeyen kişiler (ör. zaten grup üyesi olanlar) listede gösterilmez. */
  excludedIds?: string[];
}

/** Kişiler arasından birden çok kişi seçtirir (yeni sohbet, grup kurma, üye ekleme). */
export function ContactPicker({
  contacts,
  selectedIds,
  onChange,
  excludedIds = [],
}: ContactPickerProps) {
  const [search, setSearch] = useState("");
  const needle = foldText(search);
  const visible = contacts
    .filter((contact) => !excludedIds.includes(contact.id))
    .filter((contact) => needle === "" || foldText(contact.displayName).includes(needle))
    .sort((a, b) => compareTr(a.displayName, b.displayName));

  function toggle(contactId: string) {
    onChange(
      selectedIds.includes(contactId)
        ? selectedIds.filter((id) => id !== contactId)
        : [...selectedIds, contactId],
    );
  }

  return (
    <FlatList
      data={visible}
      keyExtractor={(contact) => contact.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <SearchField value={search} onChangeText={setSearch} placeholder="Kişilerinde ara" />
      }
      renderItem={({ item }) => {
        const selected = selectedIds.includes(item.id);
        return (
          <ListRow
            title={item.displayName}
            leading={<Avatar name={item.displayName} imageUrl={item.avatarUrl} size={44} />}
            trailing={
              <Icon
                name={selected ? "checkmark-circle" : "ellipse-outline"}
                size={24}
                color={selected ? "teal" : "faint"}
              />
            }
            onPress={() => {
              toggle(item.id);
            }}
            testID={`pick-${item.id}`}
          />
        );
      }}
      ListEmptyComponent={
        <AppText color="muted" align="center" style={styles.empty}>
          {contacts.length === 0
            ? "Sohbet başlatmak için önce kişi eklemelisin."
            : "Seçilebilecek kişi yok."}
        </AppText>
      }
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    padding: space.xxl,
  },
});
