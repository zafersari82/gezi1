import { router, Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from "react-native";

import { ImageViewer } from "@/features/media/image-viewer";
import { MomentCard } from "@/features/moments/moment-card";
import { useMomentsFeed } from "@/features/moments/queries";
import { ReportSheet } from "@/features/reports/report-sheet";
import { useMe } from "@/features/session/session-provider";
import { colors, space } from "@/theme/tokens";
import { HeaderActions, HeaderButton } from "@/ui/header-button";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

export default function MomentsScreen() {
  const me = useMe();
  const feed = useMomentsFeed();
  const [viewedImage, setViewedImage] = useState<string | null>(null);
  const [reportedId, setReportedId] = useState<string | null>(null);
  const compose = () => {
    router.push("/moments/compose");
  };

  if (feed.isPending) return <LoadingView />;
  if (feed.isError) return <ErrorView error={feed.error} onRetry={() => void feed.refetch()} />;

  const moments = feed.data.pages.flatMap((page) => page.items);
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderButton
                icon="camera-outline"
                label="Yeni paylaşım"
                onPress={compose}
                testID="compose-moment"
              />
            </HeaderActions>
          ),
        }}
      />
      <FlatList
        data={moments}
        keyExtractor={(moment) => moment.id}
        style={styles.list}
        contentContainerStyle={moments.length === 0 ? styles.empty : undefined}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <MomentCard
            moment={item}
            myId={me.id}
            onOpenUser={(userId) => {
              router.push({ pathname: "/user/[id]", params: { id: userId } });
            }}
            onOpenImage={setViewedImage}
            onReport={setReportedId}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={colors.teal} style={styles.loadingMore} />
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="aperture-outline"
            title="Henüz paylaşım yok"
            message="Burada senin ve kişilerinin paylaşımları görünür. İlk paylaşımı sen yap."
            actionLabel="Paylaşım yap"
            onAction={compose}
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => void feed.refetch()}
            tintColor={colors.teal}
          />
        }
      />
      <ImageViewer
        imageUrl={viewedImage}
        onClose={() => {
          setViewedImage(null);
        }}
      />
      <ReportSheet
        target={reportedId === null ? null : { type: "moment", id: reportedId }}
        onClose={() => {
          setReportedId(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  empty: {
    flexGrow: 1,
  },
  loadingMore: {
    padding: space.lg,
  },
});
