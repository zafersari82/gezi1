import AsyncStorage from "@react-native-async-storage/async-storage";
import { idSchema } from "@vado/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

/** Yalnız açıkça seçilen il/ilçe saklanır; GPS izni, sokak veya koordinat tutulmaz. */
const storageKey = "vado.discovery.location.v1";
const locationSchema = z.object({
  provinceId: idSchema,
  provinceName: z.string().min(1),
  districtId: idSchema.optional(),
  districtName: z.string().optional(),
}).strict();
export type DiscoveryLocation = z.infer<typeof locationSchema>;

export async function readDiscoveryLocation(): Promise<DiscoveryLocation | null> {
  const raw = await AsyncStorage.getItem(storageKey).catch(() => null);
  if (raw === null) return null;
  try {
    const parsed = locationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

export function useDiscoveryLocation() {
  const client = useQueryClient();
  const location = useQuery({ queryKey: ["discovery-location"], queryFn: readDiscoveryLocation,
    staleTime: Infinity });
  async function save(value: DiscoveryLocation | null) {
    if (value === null) await AsyncStorage.removeItem(storageKey);
    else await AsyncStorage.setItem(storageKey, JSON.stringify(locationSchema.parse(value)));
    client.setQueryData(["discovery-location"], value);
  }
  return { location: location.data ?? null, isPending: location.isPending, save };
}
