import { useQuery } from "@tanstack/react-query";
import type {
  List,
  MiniApp,
  MiniAppDetail,
  MiniAppIdentity,
  MiniAppIdentityToken,
} from "@vado/contracts";

import { api } from "@/api/client";
import { queryKeys } from "@/api/query-client";

/** Yayındaki mini uygulamalar. Liste küçük olduğu için arama ve süzgeç cihazda uygulanır. */
export function useMiniApps() {
  return useQuery({
    queryKey: queryKeys.miniApps,
    queryFn: async () => (await api.get<List<MiniApp>>("/v1/miniapps")).items,
  });
}

/** Mini uygulamanın açılırken okunan kaydı: işletmeye özel ayarları da taşır. */
export function useMiniApp(miniAppId: string) {
  return useQuery({
    queryKey: queryKeys.miniApp(miniAppId),
    queryFn: () => api.get<MiniAppDetail>(`/v1/miniapps/${miniAppId}`),
  });
}

/** Kullanıcının bu mini uygulamaya özel kimliğini sunucudan alır. */
export function fetchMiniAppIdentity(miniAppId: string): Promise<MiniAppIdentity> {
  return api.get<MiniAppIdentity>(`/v1/miniapps/${miniAppId}/identity`);
}

/** Mini uygulamanın kendi sunucusuna göndereceği kimlik belirtecini sunucudan alır. */
export function fetchMiniAppIdentityToken(miniAppId: string): Promise<MiniAppIdentityToken> {
  return api.post<MiniAppIdentityToken>(`/v1/miniapps/${miniAppId}/identity-token`);
}
