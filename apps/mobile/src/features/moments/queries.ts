import { type InfiniteData, useInfiniteQuery, useMutation } from "@tanstack/react-query";
import type { Moment, Page } from "@vado/contracts";

import { api, type LocalImage, uploadImage } from "@/api/client";
import { queryClient, queryKeys } from "@/api/query-client";

const FEED_PAGE_SIZE = 15;

type MomentPages = InfiniteData<Page<Moment>, string | undefined>;

export function useMomentsFeed() {
  return useInfiniteQuery({
    queryKey: queryKeys.moments,
    queryFn: ({ pageParam }) =>
      api.get<Page<Moment>>("/v1/moments", { limit: FEED_PAGE_SIZE, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Beğeni veya yorumdan sonra sunucunun döndürdüğü güncel paylaşımı akışta yerine koyar. */
function replaceMoment(moment: Moment): void {
  queryClient.setQueryData<MomentPages>(queryKeys.moments, (data) =>
    data === undefined
      ? data
      : {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === moment.id ? moment : item)),
          })),
        },
  );
}

function refreshFeed(): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.moments });
}

interface NewMoment {
  body: string;
  images: LocalImage[];
}

export function useCreateMoment() {
  return useMutation({
    mutationFn: async ({ body, images }: NewMoment) => {
      // Görseller seçildikleri sırayla yüklenir; sıra paylaşımda korunur.
      const mediaIds: string[] = [];
      for (const image of images) mediaIds.push((await uploadImage(image)).id);
      return api.post<Moment>("/v1/moments", { body, mediaIds });
    },
    onSuccess: refreshFeed,
  });
}

export function useDeleteMoment() {
  return useMutation({
    mutationFn: (momentId: string) => api.delete(`/v1/moments/${momentId}`),
    onSuccess: refreshFeed,
  });
}

export function useSetMomentLiked() {
  return useMutation({
    mutationFn: ({ momentId, liked }: { momentId: string; liked: boolean }) =>
      liked
        ? api.put<Moment>(`/v1/moments/${momentId}/like`)
        : api.delete<Moment>(`/v1/moments/${momentId}/like`),
    onSuccess: replaceMoment,
  });
}

export function useAddMomentComment() {
  return useMutation({
    mutationFn: ({ momentId, body }: { momentId: string; body: string }) =>
      api.post<Moment>(`/v1/moments/${momentId}/comments`, { body }),
    onSuccess: replaceMoment,
  });
}

export function useDeleteMomentComment() {
  return useMutation({
    mutationFn: ({ momentId, commentId }: { momentId: string; commentId: string }) =>
      api.delete<Moment>(`/v1/moments/${momentId}/comments/${commentId}`),
    onSuccess: replaceMoment,
  });
}
