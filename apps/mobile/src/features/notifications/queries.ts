import { useMutation, useQuery } from "@tanstack/react-query";
import type { NotificationSettings, UpdateNotificationSettingsBody } from "@vado/contracts";

import { api } from "@/api/client";
import { queryClient, queryKeys } from "@/api/query-client";

export function useNotificationSettings() {
  return useQuery({
    queryKey: queryKeys.notificationSettings,
    queryFn: () => api.get<NotificationSettings>("/v1/me/notifications"),
  });
}

export function useUpdateNotificationSettings() {
  return useMutation({
    mutationFn: (body: UpdateNotificationSettingsBody) =>
      api.patch<NotificationSettings>("/v1/me/notifications", body),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.notificationSettings, settings);
    },
  });
}
