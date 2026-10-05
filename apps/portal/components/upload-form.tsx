"use client";

import { PACKAGE_MANIFEST_FILE, PACKAGE_UPLOAD_FIELD } from "@vado/contracts";
import { unstable_rethrow as rethrowNavigation } from "next/navigation";
import { useActionState } from "react";

import { uploadVersion } from "@/lib/actions";
import type { FormState } from "@/lib/form-state";
import { formatBytes, packageTooLargeMessage } from "@/lib/format";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

interface UploadFormProps {
  packageId: string;
  /** Yüklenebilecek en büyük arşivin boyutu, bayt. */
  maxBytes: number;
}

const INITIAL_STATE: FormState<null> = { error: null, saved: false, values: null };
const failed = (error: string): FormState<null> => ({ ...INITIAL_STATE, error });

const INTERRUPTED =
  "Yükleme panele ulaşmadan kesildi. Bağlantı kopmuş ya da panelin önündeki ters vekil (Nginx) " +
  "bu boyuttaki dosyayı geri çevirmiş olabilir: client_max_body_size, paket sınırından büyük olmalı.";

/** Sunucuda oluşan hatalar bir kayıt koduyla (digest) gelir; panele hiç ulaşmayan gönderimde bu yoktur. */
function reachedServer(error: unknown): boolean {
  return error instanceof Error && "digest" in error;
}

/** Paketin yeni sürümünü zip dosyası olarak yükler; reddedilirse nedenleri listelenir. */
export function UploadForm({ packageId, maxBytes }: UploadFormProps) {
  /**
   * Sınırı aşan dosya hiç gönderilmez; sınırı sunucu da uygular. Gönderim panele ulaşmadan
   * kesilirse genel hata sayfası yerine neden burada yazılır.
   */
  async function upload(previous: FormState<null>, formData: FormData): Promise<FormState<null>> {
    const file = formData.get(PACKAGE_UPLOAD_FIELD);
    if (file instanceof File && file.size > maxBytes) {
      return failed(packageTooLargeMessage(maxBytes));
    }
    try {
      return await uploadVersion(packageId, previous, formData);
    } catch (error) {
      // Başarılı yüklemede sunucu sürümün sayfasına yönlendirir; yönlendirme bir hata değildir.
      rethrowNavigation(error);
      if (reachedServer(error)) throw error;
      return failed(INTERRUPTED);
    }
  }
  const [state, formAction] = useActionState(upload, INITIAL_STATE);

  return (
    <form action={formAction} className="form">
      <div className="field">
        <label htmlFor="package">Paket dosyası (zip)</label>
        <input
          id="package"
          name={PACKAGE_UPLOAD_FIELD}
          type="file"
          accept=".zip,application/zip"
          required
          aria-describedby="package-hint"
        />
        <p className="hint" id="package-hint">
          Kökünde {PACKAGE_MANIFEST_FILE} bulunan derleme çıktısı; en çok {formatBytes(maxBytes)}.
          Sürüm numarası bildirim dosyasından okunur ve daha önce yüklenenlerden büyük olmalıdır.
        </p>
      </div>
      <div className="form-footer">
        <SubmitButton variant="primary">Sürümü yükle</SubmitButton>
        <FormFeedback state={state} saved="Yüklendi." />
      </div>
    </form>
  );
}
