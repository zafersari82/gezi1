import * as ImagePicker from "expo-image-picker";

import type { LocalImage } from "@/api/client";

/** Yüklenmeden önce uygulanan sıkıştırma; görsel kalitesi ile dosya boyutu arasındaki denge. */
const QUALITY = 0.7;

/** Galeriden en fazla `limit` görsel seçtirir. Kullanıcı vazgeçerse boş liste döner. */
export async function pickImages(limit: number): Promise<LocalImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: QUALITY,
  });
  if (result.canceled) return [];

  return result.assets.slice(0, limit).map((asset) => ({
    uri: asset.uri,
    mimeType: asset.mimeType,
    file: asset.file,
  }));
}
