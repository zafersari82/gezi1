import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import type {
  channelFollowingSchema,
  channelFollowSchema,
  channelPageSchema,
} from "@vado/contracts";
import type { z } from "zod";

import { api } from "@/api/client";
import { queryClient, queryKeys } from "@/api/query-client";

export function useChannelFollow(businessId: string) {
  return useQuery({
    queryKey: queryKeys.channelsFollow(businessId),
    queryFn: () =>
      api.get<z.infer<typeof channelFollowSchema>>(`/v1/businesses/${businessId}/channel/follow`),
  });
}

export function useToggleChannelFollow(businessId: string) {
  return useMutation({
    mutationFn: (following: boolean) =>
      following
        ? api.put<z.infer<typeof channelFollowSchema>>(
            `/v1/businesses/${businessId}/channel/follow`,
            {},
          )
        : api.delete<z.infer<typeof channelFollowSchema>>(
            `/v1/businesses/${businessId}/channel/follow`,
          ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.channelsFollow(businessId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.channelsFeed });
      void queryClient.invalidateQueries({ queryKey: queryKeys.channelsFollowing });
    },
  });
}

export function useChannelPosts(businessId: string) {
  return useQuery({
    queryKey: queryKeys.channelsPosts(businessId),
    queryFn: () =>
      api.get<z.infer<typeof channelPageSchema>>(`/v1/businesses/${businessId}/channel/posts`, {
        limit: 5,
      }),
  });
}

export function useChannelsFeed() {
  return useInfiniteQuery({
    queryKey: queryKeys.channelsFeed,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<z.infer<typeof channelPageSchema>>("/v1/channels/feed", {
        limit: 20,
        ...(pageParam === null ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useChannelsFollowing() {
  return useQuery({
    queryKey: queryKeys.channelsFollowing,
    queryFn: () =>
      api.get<{
        items: z.infer<typeof channelFollowingSchema>[];
      }>("/v1/channels/following"),
  });
}
