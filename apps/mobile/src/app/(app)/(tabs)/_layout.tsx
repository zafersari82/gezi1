import { router } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConversations } from "@/features/chat/queries";
import { useContactRequests } from "@/features/contacts/queries";
import { colors, typography } from "@/theme/tokens";
import { HeaderActions, HeaderButton } from "@/ui/header-button";
import { Icon, type IconName } from "@/ui/icon";

const MAX_BADGE = 99;
/** Simge ve etiketin rahat sığdığı çubuk yüksekliği; alttaki güvenli alan buna eklenir. */
const TAB_BAR_HEIGHT = 56;

/** Sekme rozetinde gösterilecek sayı; sıfırsa rozet çizilmez. */
function badge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > MAX_BADGE ? `${MAX_BADGE}+` : String(count);
}

function tabIcon(active: IconName, inactive: IconName) {
  return function TabIcon({ focused }: { focused: boolean }) {
    return <Icon name={focused ? active : inactive} size={24} color={focused ? "teal" : "faint"} />;
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const conversations = useConversations();
  const requests = useContactRequests();
  const unreadCount = (conversations.data ?? []).reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );
  const requestCount = requests.data?.incoming.length ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerStyle: styles.header,
        headerShadowVisible: false,
        headerTitleAlign: "left",
        headerTitleStyle: styles.headerTitle,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: [styles.tabBar, { height: TAB_BAR_HEIGHT + insets.bottom }],
        tabBarLabelStyle: styles.tabLabel,
        tabBarBadgeStyle: styles.tabBadge,
        sceneStyle: styles.scene,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Sohbetler",
          tabBarIcon: tabIcon("chatbubbles", "chatbubbles-outline"),
          tabBarBadge: badge(unreadCount),
          tabBarButtonTestID: "tab-chats",
          headerRight: () => (
            <HeaderActions tabs>
              <HeaderButton
                icon="qr-code-outline"
                label="QR okut"
                onPress={() => {
                  router.push("/scan");
                }}
              />
              <HeaderButton
                icon="create-outline"
                label="Yeni sohbet"
                onPress={() => {
                  router.push("/chat/new");
                }}
                testID="new-chat"
              />
            </HeaderActions>
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: "Kişiler",
          tabBarIcon: tabIcon("people", "people-outline"),
          tabBarBadge: badge(requestCount),
          tabBarButtonTestID: "tab-contacts",
          headerRight: () => (
            <HeaderActions tabs>
              <HeaderButton
                icon="person-add-outline"
                label="Kişi ekle"
                onPress={() => {
                  router.push("/contacts/add");
                }}
                testID="add-contact"
              />
            </HeaderActions>
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Keşfet",
          tabBarIcon: tabIcon("compass", "compass-outline"),
          tabBarButtonTestID: "tab-discover",
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "Ben",
          tabBarIcon: tabIcon("person", "person-outline"),
          tabBarButtonTestID: "tab-me",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
  },
  headerTitle: {
    ...typography.heading,
    color: colors.ink,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
  tabBadge: {
    backgroundColor: colors.coral,
    color: colors.white,
    fontSize: 11,
    fontWeight: "600",
  },
  scene: {
    backgroundColor: colors.surface,
  },
});
