import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { useChannelsFeed, useChannelsFollowing } from "@/features/businesses/channels";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { ErrorView, LoadingView } from "@/ui/states";

/** Kullanıcı yalnız bilerek takip ettiği işletmelerin yayımlanmış duyurularını görür. */
export default function FollowingChannelsScreen() {
  const feed = useChannelsFeed();
  const following = useChannelsFollowing();
  if (feed.isPending) return <LoadingView />;
  if (feed.isError) return <ErrorView error={feed.error} onRetry={() => void feed.refetch()} />;
  const posts = feed.data.pages.flatMap((page) => page.items);
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={feed.isRefetching && !feed.isFetchingNextPage}
          onRefresh={() => {
            void feed.refetch();
            void following.refetch();
          }}
          tintColor={colors.teal}
        />
      }
    >
      <AppText variant="heading">Takip ettiklerim</AppText>
      <AppText color="muted">
        Takip ettiğin işletmelerin duyuruları burada. Bildirim izni gerekmez.
      </AppText>
      {(following.data?.items.length ?? 0) > 0 && (
        <View style={styles.following}>
          {following.data?.items.map((item) => (
            <Pressable
              key={item.businessId}
              accessibilityRole="button"
              style={styles.business}
              onPress={() => {
                router.push({ pathname: "/businesses/[id]", params: { id: item.businessId } });
              }}
            >
              <AppText color="teal" variant="bodyStrong">
                {item.businessName}
              </AppText>
            </Pressable>
          ))}
        </View>
      )}
      {posts.length === 0 && (
        <AppText color="muted">
          Henüz duyuru yok. Keşfet'te bir işletmeyi takip ederek başlayabilirsin.
        </AppText>
      )}
      {posts.map((post) => (
        <Pressable
          key={post.id}
          style={styles.post}
          accessibilityRole="button"
          onPress={() => {
            router.push({ pathname: "/businesses/[id]", params: { id: post.businessId } });
          }}
        >
          <AppText color="teal" variant="bodyStrong">
            {post.businessName}
          </AppText>
          <AppText>{post.body}</AppText>
          <AppText color="muted" variant="caption">
            {new Date(post.publishedAt).toLocaleString("tr-TR")}
          </AppText>
        </Pressable>
      ))}
      {feed.isFetchingNextPage && <ActivityIndicator color={colors.teal} />}
      {feed.hasNextPage && (
        <Button
          label="Daha fazla duyuru"
          variant="secondary"
          loading={feed.isFetchingNextPage}
          onPress={() => void feed.fetchNextPage()}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { gap: space.md, padding: space.lg },
  following: { gap: space.sm },
  business: { backgroundColor: colors.tealSoft, padding: space.md, borderRadius: 12 },
  post: {
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    gap: space.sm,
  },
});
