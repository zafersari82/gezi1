import type { ContactRequest } from "@vado/contracts";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet } from "react-native";

import { errorMessage } from "@/api/client";
import {
  useAcceptContactRequest,
  useContactRequests,
  useDismissContactRequest,
} from "@/features/contacts/queries";
import { colors } from "@/theme/tokens";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

/**
 * İsteği gönderenin ya da alanın profil resmi; dokununca profilini açar. İstek satırı düğme
 * taşıdığı için satırın kendisi tıklanmaz: dokunulabilir öğeler iç içe konmaz.
 */
function RequestAvatar({ request }: { request: ContactRequest }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={request.user.displayName}
      onPress={() => {
        router.push({ pathname: "/user/[id]", params: { id: request.user.id } });
      }}
    >
      <Avatar name={request.user.displayName} imageUrl={request.user.avatarUrl} size={48} />
    </Pressable>
  );
}

export default function ContactRequestsScreen() {
  const requests = useContactRequests();
  const accept = useAcceptContactRequest();
  const dismiss = useDismissContactRequest();
  const { notify } = useFeedback();

  if (requests.isPending) return <LoadingView />;
  if (requests.isError) {
    return <ErrorView error={requests.error} onRetry={() => void requests.refetch()} />;
  }

  const { incoming, outgoing } = requests.data;
  const onError = (error: unknown) => {
    notify(errorMessage(error));
  };

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        icon="mail-open-outline"
        title="Bekleyen istek yok"
        message="Sana gelen ve senin gönderdiğin kişi istekleri burada görünür."
      />
    );
  }

  return (
    <ScrollView style={styles.screen}>
      {incoming.length > 0 && <SectionTitle>Sana gelenler</SectionTitle>}
      {incoming.map((request) => (
        <ListRow
          key={request.id}
          title={request.user.displayName}
          subtitle={request.message === "" ? "Seni kişilerine eklemek istiyor" : request.message}
          subtitleLines={2}
          leading={<RequestAvatar request={request} />}
          footer={
            <>
              <Button
                label="Kabul et"
                size="small"
                onPress={() => {
                  accept.mutate(request.id, { onError });
                }}
                testID="accept-request"
              />
              <Button
                label="Reddet"
                variant="secondary"
                size="small"
                onPress={() => {
                  dismiss.mutate(request.id, { onError });
                }}
              />
            </>
          }
          testID={`request-${request.id}`}
        />
      ))}

      {outgoing.length > 0 && <SectionTitle>Gönderdiklerin</SectionTitle>}
      {outgoing.map((request) => (
        <ListRow
          key={request.id}
          title={request.user.displayName}
          subtitle="Yanıt bekleniyor"
          leading={<RequestAvatar request={request} />}
          trailing={
            <Button
              label="Geri çek"
              variant="secondary"
              size="small"
              onPress={() => {
                dismiss.mutate(request.id, { onError });
              }}
            />
          }
          testID={`request-${request.id}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
});
