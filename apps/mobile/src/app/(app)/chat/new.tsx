import { GROUP_TITLE_MAX } from "@vado/contracts";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { errorMessage } from "@/api/client";
import {
  useAddMembers,
  useConversation,
  useCreateGroup,
  useOpenDirectConversation,
} from "@/features/chat/queries";
import { ContactPicker } from "@/features/contacts/contact-picker";
import { useContacts } from "@/features/contacts/queries";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { Screen } from "@/ui/screen";
import { ErrorView, LoadingView } from "@/ui/states";
import { TextField } from "@/ui/text-field";

/**
 * Kişi seçerek sohbet başlatır: bir kişi seçilirse birebir sohbet açılır, birden çok kişi
 * seçilirse grup kurulur. `addTo` parametresiyle açıldığında var olan gruba üye ekler.
 */
export default function NewChatScreen() {
  const { addTo } = useLocalSearchParams<{ addTo?: string }>();
  return addTo === undefined ? <StartConversation /> : <AddMembers conversationId={addTo} />;
}

function StartConversation() {
  const contacts = useContacts();
  const openDirect = useOpenDirectConversation();
  const createGroup = useCreateGroup();
  const { notify } = useFeedback();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");

  if (contacts.isPending) return <LoadingView />;
  if (contacts.isError) {
    return <ErrorView error={contacts.error} onRetry={() => void contacts.refetch()} />;
  }

  const [firstId] = selectedIds;
  const isGroup = selectedIds.length > 1;
  const openChat = (conversationId: string) => {
    router.replace({ pathname: "/chat/[id]", params: { id: conversationId } });
  };
  const options = {
    onSuccess: (conversation: { id: string }) => {
      openChat(conversation.id);
    },
    onError: (error: unknown) => {
      notify(errorMessage(error));
    },
  };

  return (
    <Screen
      footer={
        firstId === undefined ? (
          <AppText variant="callout" color="muted" align="center">
            Bir kişi seçersen sohbet açılır, birden çok kişi seçersen grup kurulur.
          </AppText>
        ) : isGroup ? (
          <>
            <TextField
              label="Grup adı"
              placeholder="Hafta sonu planı"
              value={title}
              onChangeText={setTitle}
              maxLength={GROUP_TITLE_MAX}
              testID="group-title"
            />
            <Button
              label={`Grup kur (${selectedIds.length + 1} kişi)`}
              disabled={title.trim() === ""}
              loading={createGroup.isPending}
              onPress={() => {
                createGroup.mutate({ title: title.trim(), memberIds: selectedIds }, options);
              }}
              testID="create-group"
            />
          </>
        ) : (
          <Button
            label="Sohbeti aç"
            loading={openDirect.isPending}
            onPress={() => {
              openDirect.mutate(firstId, options);
            }}
            testID="open-chat"
          />
        )
      }
    >
      <ContactPicker contacts={contacts.data} selectedIds={selectedIds} onChange={setSelectedIds} />
    </Screen>
  );
}

function AddMembers({ conversationId }: { conversationId: string }) {
  const contacts = useContacts();
  const conversation = useConversation(conversationId);
  const addMembers = useAddMembers(conversationId);
  const { notify } = useFeedback();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (contacts.isPending || conversation.isPending) return <LoadingView />;
  if (contacts.isError || conversation.isError) {
    return <ErrorView error={contacts.error ?? conversation.error} />;
  }

  return (
    <Screen
      footer={
        <Button
          label={selectedIds.length === 0 ? "Kişi seç" : `Gruba ekle (${selectedIds.length})`}
          disabled={selectedIds.length === 0}
          loading={addMembers.isPending}
          onPress={() => {
            addMembers.mutate(selectedIds, {
              onSuccess: () => {
                router.back();
              },
              onError: (error) => {
                notify(errorMessage(error));
              },
            });
          }}
          testID="add-members"
        />
      }
    >
      <Stack.Screen options={{ title: "Üye ekle" }} />
      <ContactPicker
        contacts={contacts.data}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
        excludedIds={conversation.data.members.map((member) => member.id)}
      />
    </Screen>
  );
}
