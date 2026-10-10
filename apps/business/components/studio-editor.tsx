"use client";

import {
  type Catalog,
  catalogSchema,
  type Category,
  MEDIA_MAX_BYTES,
  MEDIA_UPLOAD_FIELD,
  mediaSchema,
  OFFERED_STUDIO_TEMPLATES,
  publishStudioBodySchema,
  type SaveStudioBody,
  saveStudioBodySchema,
  STUDIO_PALETTES,
  type StudioConfiguration,
  studioConfigurationResponseSchema,
  type StudioDesign,
  studioInitialPalette,
  studioItemImageBodySchema,
  studioPaletteById,
  type StudioPaletteId,
  studioTemplateById,
  type StudioTemplateId,
} from "@vado/contracts";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { call, ClientApiError, errorMessage } from "../lib/client";
import { money } from "../lib/values";
import { StudioStarterWizard } from "./studio-starter-wizard";

const mediaUsageSchema = z.object({
  quotaBytes: z.number().nonnegative(),
  usedBytes: z.number().nonnegative(),
  imageCount: z.number().int().nonnegative(),
});
const mediaPruneSchema = z.object({
  removed: z.number().int(),
  freedBytes: z.number(),
  pendingRemoval: z.number().int(),
});

interface Props {
  businessName: string;
  category: Category;
  configuration: StudioConfiguration | null;
  published: StudioDesign | null;
  publishedVersion: number;
  catalog: Catalog;
  canWrite: boolean;
}

export function StudioEditor({
  businessName,
  category,
  configuration,
  published,
  publishedVersion,
  catalog,
  canWrite,
}: Props) {
  const choices = OFFERED_STUDIO_TEMPLATES.filter((item) => item.category === category);
  const [currentCatalog, setCurrentCatalog] = useState(catalog);
  const [templateId, setTemplateId] = useState<StudioTemplateId | null>(
    configuration?.templateId ?? choices[0]?.id ?? null,
  );
  const [title, setTitle] = useState(configuration?.title ?? businessName);
  const [tagline, setTagline] = useState(configuration?.tagline ?? "");
  const [palette, setPalette] = useState<StudioPaletteId>(
    configuration?.palette ??
      studioInitialPalette(configuration?.templateId ?? choices[0]?.id ?? "food-fast"),
  );
  const [version, setVersion] = useState(configuration?.version ?? 0);
  const [logoMediaId, setLogoMediaId] = useState<string | null>(configuration?.logoMediaId ?? null);
  const [coverMediaId, setCoverMediaId] = useState<string | null>(
    configuration?.coverMediaId ?? null,
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(configuration?.logoUrl ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(configuration?.coverUrl ?? null);
  const [itemImages, setItemImages] = useState(() =>
    Object.fromEntries(
      catalog.items.map((item) => [
        item.id,
        {
          imageUrl: item.imageUrl,
          imageMediaId: item.imageMediaId,
          version: item.version,
        },
      ]),
    ),
  );
  const [publishedDesign, setPublishedDesign] = useState(published);
  const [release, setRelease] = useState(publishedVersion);
  const [saved, setSaved] = useState(configuration !== null);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<z.infer<typeof mediaUsageSchema> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void call(mediaUsageSchema, "/api/business/studio/media/usage")
      .then(setUsage)
      .catch(() => undefined);
  }, []);

  if (templateId === null) {
    return (
      <section className="panel">
        <h2>Bu sektörün şablonları hazırlanıyor</h2>
        <p className="muted">
          Şu anda yemek, alışveriş ve güzellik sektörlerinin vitrin şablonları düzenlenebilir.
          İşletmenin diğer yönetim özellikleri kullanılmaya devam eder.
        </p>
      </section>
    );
  }

  const template = studioTemplateById(templateId);
  const previewItems = currentCatalog.items
    .filter(
      (item) =>
        item.active &&
        item.available &&
        (item.categoryId === null ||
          currentCatalog.categories.some(
            (section) => section.id === item.categoryId && section.active,
          )),
    )
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageUrl: itemImages[item.id]?.imageUrl ?? null,
      version: itemImages[item.id]?.version ?? item.version,
      price:
        currentCatalog.prices.find((price) => price.itemId === item.id && price.branchId === null)
          ?.amountMinor ?? null,
    }));
  const colors = studioPaletteById(palette);
  const previewStyle = {
    "--studio-accent": colors.accent,
    "--studio-soft": colors.surface,
  } as CSSProperties;

  /** Dosya seçiminde API yalnız JPEG/PNG/WebP imzasına göre kabul verir. */
  async function upload(file: File) {
    if (
      file.size === 0 ||
      file.size > MEDIA_MAX_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      throw new Error("En fazla 8 MB boyutunda JPEG, PNG veya WebP görsel seç.");
    }
    const form = new FormData();
    form.append(MEDIA_UPLOAD_FIELD, file);
    const response = await fetch("/api/business/media", {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const code =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "object" &&
        data.error !== null &&
        "code" in data.error
          ? data.error.code
          : null;
      if (code === "media_quota_exceeded")
        throw new Error("Görsel alanı doldu. Kullanılmayan fotoğrafları temizleyin.");
      throw new Error("Görsel yüklenemedi. Dosyayı kontrol edip yeniden dene.");
    }
    const uploaded = mediaSchema.parse(data);
    void call(mediaUsageSchema, "/api/business/studio/media/usage")
      .then(setUsage)
      .catch(() => undefined);
    return uploaded;
  }

  async function updateBrandImage(kind: "logo" | "cover", file: File | undefined) {
    if (!canWrite || file === undefined) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const image = await upload(file);
      if (kind === "logo") {
        setLogoMediaId(image.id);
        setLogoUrl(image.url);
      } else {
        setCoverMediaId(image.id);
        setCoverUrl(image.url);
      }
      setSaved(false);
      setMessage("Görsel eklendi. Mağazaya uygulamak için taslağı kaydet.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function updateItemImage(itemId: string, file: File | null) {
    if (!canWrite) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const image = file === null ? null : await upload(file);
      const previous = itemImages[itemId];
      if (previous === undefined) throw new Error("Ürün kaydı bulunamadı.");
      const body = studioItemImageBodySchema.parse({
        mediaId: image?.id ?? null,
        expectedVersion: previous.version,
      });
      const result = await call(
        z.object({ imageMediaId: z.uuid().nullable(), version: z.number().int().positive() }),
        `/api/business/catalog/items/${itemId}/image`,
        "PUT",
        body,
      );
      setItemImages((current) => ({
        ...current,
        [itemId]: {
          imageMediaId: result.imageMediaId,
          imageUrl: image?.url ?? null,
          version: result.version,
        },
      }));
      setMessage("Ürün görseli kaydedildi. Menüde görüntülenebilir.");
    } catch (cause) {
      setError(
        cause instanceof ClientApiError && cause.status === 409
          ? "Ürün başka cihazdan değişmiş. Sayfayı yenileyip yeniden dene."
          : errorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError("");
    setMessage("");
    const body: SaveStudioBody = {
      templateId: template.id,
      title,
      tagline,
      palette,
      logoMediaId,
      coverMediaId,
      expectedVersion: version,
    };
    const validated = saveStudioBodySchema.safeParse(body);
    if (!validated.success) {
      setError("Mağaza adı en az 2, en fazla 80; açıklama en fazla 180 karakter olmalıdır.");
      return;
    }
    setBusy(true);
    try {
      const saved = await call(
        studioConfigurationResponseSchema,
        "/api/business/studio",
        "PUT",
        validated.data,
      );
      if (saved.configuration === null) throw new Error("Mağaza taslağı kaydedilemedi.");
      setVersion(saved.configuration.version);
      setLogoUrl(saved.configuration.logoUrl);
      setCoverUrl(saved.configuration.coverUrl);
      setSaved(true);
      setMessage("Taslağın kaydedildi. Henüz müşterilere yayımlanmadı.");
    } catch (cause) {
      setError(
        cause instanceof ClientApiError && cause.status === 409
          ? "Mağaza başka bir cihazda güncellenmiş. Son değişiklikleri görmek için sayfayı yenile."
          : errorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setMessage("");
    setError("");
    if (!saved || version === 0) {
      setError("Önce taslağını kaydet, sonra yayımla.");
      return;
    }
    const body = publishStudioBodySchema.parse({ expectedVersion: version });
    setBusy(true);
    try {
      const result = await call(
        studioConfigurationResponseSchema,
        "/api/business/studio/publish",
        "POST",
        body,
      );
      setPublishedDesign(result.published);
      setRelease(result.publishedVersion);
      setMessage("Mağaza görünümün yayımlandı. Müşteriler yeni tasarımı görecek.");
    } catch (cause) {
      setError(
        cause instanceof ClientApiError && cause.status === 409
          ? "Taslak başka bir cihazdan güncellenmiş. Sayfayı yenileyip yeniden dene."
          : errorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  async function cleanOldImages() {
    if (
      !canWrite ||
      busy ||
      !window.confirm("Yedi günden eski ve hiçbir yerde kullanılmayan görseller temizlensin mi?")
    )
      return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await call(mediaPruneSchema, "/api/business/studio/media/prune", "POST", {});
      setUsage(await call(mediaUsageSchema, "/api/business/studio/media/usage"));
      setMessage(
        result.pendingRemoval > 0
          ? `${result.removed} kayıt temizlendi; ${result.pendingRemoval} dosya sunucudan silinmek üzere bekliyor.`
          : result.removed === 0
            ? "Temizlenebilecek eski görsel bulunamadı."
            : `${result.removed} kullanılmayan fotoğraf temizlendi.`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StudioStarterWizard
        category={category}
        itemCount={currentCatalog.items.length}
        draftSaved={saved}
        isPublished={release > 0}
        canWrite={canWrite}
        onImported={async () => {
          const next = await call(catalogSchema, "/api/business/catalog");
          setCurrentCatalog(next);
          setItemImages(
            Object.fromEntries(
              next.items.map((item) => [
                item.id,
                {
                  imageUrl: item.imageUrl,
                  imageMediaId: item.imageMediaId,
                  version: item.version,
                },
              ]),
            ),
          );
        }}
      />
      <div className="studio-workspace">
        <form
          className="studio-controls"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <section className="panel studio-panel">
            <div className="studio-step">1 · Mağaza şablonu</div>
            <h2>Görünümünü seç</h2>
            <p className="muted small">
              Daha sonra değiştirebilirsin; ürün ve siparişlerin etkilenmez.
            </p>
            <div className="studio-template-list" role="group" aria-label="Mağaza şablonu">
              {choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className={`studio-template ${choice.id === templateId ? "selected" : ""}`}
                  aria-pressed={choice.id === templateId}
                  disabled={!canWrite || busy}
                  onClick={() => {
                    setSaved(false);
                    setTemplateId(choice.id);
                    setPalette(studioInitialPalette(choice.id));
                  }}
                >
                  <span
                    className="studio-template-thumbnail"
                    data-layout={choice.layout}
                    style={{ "--studio-thumb": choice.accent } as CSSProperties}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>{choice.name}</strong>
                  <span>{choice.description}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel studio-panel">
            <div className="studio-step">2 · Mağazanın bilgileri ve görselleri</div>
            <h2>Adını ve rengini düzenle</h2>
            <div className="form-stack">
              <label>
                Müşterilerin göreceği mağaza adı
                <input
                  value={title}
                  maxLength={80}
                  minLength={2}
                  onChange={(event) => {
                    setSaved(false);
                    setTitle(event.target.value);
                  }}
                  disabled={!canWrite || busy}
                  required
                />
              </label>
              <label>
                Kısa tanıtım (isteğe bağlı)
                <textarea
                  value={tagline}
                  maxLength={180}
                  rows={3}
                  onChange={(event) => {
                    setSaved(false);
                    setTagline(event.target.value);
                  }}
                  disabled={!canWrite || busy}
                  placeholder="Örneğin: Her gün taze hazırlıyoruz."
                />
              </label>
              <div className="studio-palette-label" id="studio-colors-label">
                Renk seç
              </div>
              <div className="studio-palettes" role="group" aria-labelledby="studio-colors-label">
                {STUDIO_PALETTES.map((choice) => (
                  <button
                    type="button"
                    key={choice.id}
                    style={{ "--studio-swatch": choice.accent } as CSSProperties}
                    className={`studio-palette ${palette === choice.id ? "selected" : ""}`}
                    aria-label={choice.name}
                    aria-pressed={palette === choice.id}
                    title={choice.name}
                    onClick={() => {
                      setSaved(false);
                      setPalette(choice.id);
                    }}
                    disabled={!canWrite || busy}
                  >
                    <span aria-hidden="true" />
                  </button>
                ))}
              </div>
              <div className="studio-media-fields">
                <label>
                  Mağaza logosu (isteğe bağlı)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!canWrite || busy}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file !== undefined) void updateBrandImage("logo", file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    disabled={!canWrite || busy}
                    onClick={() => {
                      setLogoUrl(null);
                      setLogoMediaId(null);
                      setSaved(false);
                    }}
                  >
                    Logoyu kaldır
                  </button>
                )}
                <label>
                  Kapak fotoğrafı (isteğe bağlı)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={!canWrite || busy}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file !== undefined) void updateBrandImage("cover", file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {coverUrl && (
                  <button
                    type="button"
                    disabled={!canWrite || busy}
                    onClick={() => {
                      setCoverUrl(null);
                      setCoverMediaId(null);
                      setSaved(false);
                    }}
                  >
                    Kapağı kaldır
                  </button>
                )}
                <p className="small muted">
                  JPEG, PNG, WebP · en fazla 8 MB. Görsel ancak taslağı kaydedip yayımladığında
                  müşteriye görünür.
                </p>
              </div>
            </div>
          </section>
          <section className="panel studio-panel">
            <div className="studio-step">Görsel depolama</div>
            <h2>Fotoğraf alanım</h2>
            {usage === null ? (
              <p className="small muted">Depolama bilgisi alınıyor.</p>
            ) : (
              <>
                <p className="small muted">
                  {(usage.usedBytes / 1048576).toFixed(1)} MB kullanıldı /{" "}
                  {(usage.quotaBytes / 1048576).toFixed(0)} MB · {usage.imageCount} fotoğraf
                </p>
                <progress
                  value={usage.usedBytes}
                  max={usage.quotaBytes}
                  style={{ width: "100%" }}
                />
              </>
            )}
            <p className="small muted">
              Yedi günden eski, taslakta veya yayında kullanılmayan görselleri temizleyebilirsin.
            </p>
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() => void cleanOldImages()}
            >
              Kullanılmayan görselleri temizle
            </button>
          </section>
          <section className="panel studio-save-panel">
            <p className="small muted">
              Kaydettiğin değişiklikler taslakta tutulur. Mağaza yayımlama ayrı bir aşamadır.
            </p>
            <button className="primary" disabled={!canWrite || busy} type="submit">
              {busy
                ? "Kaydediliyor…"
                : version === 0
                  ? "Taslağımı oluştur"
                  : "Değişiklikleri kaydet"}
            </button>
            <div className="studio-publish-actions">
              <p className="small muted">
                {release > 0 ? `Canlı görünüm: ${release}. yayın` : "Bu mağaza henüz yayımlanmadı."}
              </p>
              {publishedDesign !== null && (
                <p className="small muted">Canlı mağaza adı: {publishedDesign.title}</p>
              )}
              <button
                type="button"
                disabled={!canWrite || busy || !saved || version === 0}
                onClick={() => void publish()}
              >
                {busy ? "İşleniyor…" : "Kaydedilen taslağı yayımla"}
              </button>
              <p className="small muted">
                Yayınlamak için işletmenin doğrulanmış ve etkin olması gerekir.
              </p>
            </div>
            {!canWrite && (
              <p className="small muted">Düzenlemeyi işletme sahibi veya yönetici yapabilir.</p>
            )}
            {error !== "" && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {message !== "" && (
              <p className="success" role="status">
                {message}
              </p>
            )}
          </section>
        </form>
        <section className="studio-preview-area" aria-label="Canlı mağaza önizlemesi">
          <div className="studio-preview-heading">
            <div>
              <div className="studio-step">3 · Canlı önizleme</div>
              <h2>Müşterinin göreceği tasarım</h2>
            </div>
            <span className="badge">
              {saved ? "Kaydedilmiş taslak" : "Kaydedilmemiş değişiklik"}
            </span>
          </div>
          <div className="studio-phone" style={previewStyle} data-layout={template.layout}>
            <div className="studio-phone-top">
              <span>VADO</span>
              <span>Mağaza</span>
            </div>
            <div className="studio-hero">
              {coverUrl !== null && (
                <img className="studio-cover-image" src={coverUrl} alt="Mağaza kapak önizlemesi" />
              )}
              {logoUrl !== null && (
                <img className="studio-logo-image" src={logoUrl} alt="Mağaza logosu önizlemesi" />
              )}
              <span className="studio-category">{template.eyebrow}</span>
              <h3>{title.trim() || businessName}</h3>
              <p>{tagline.trim() || "Mağazamıza hoş geldiniz."}</p>
              {template.layout === "enterprise" && (
                <span className="studio-enterprise-note">Şubeler için tek marka görünümü</span>
              )}
            </div>
            <div className="studio-phone-content">
              <h3>{template.menuHeading}</h3>
              {previewItems.length === 0 ? (
                <div className="studio-placeholder">
                  <span className="studio-placeholder-icon" aria-hidden="true">
                    +
                  </span>
                  <strong>Henüz yayına uygun ürün bulunmuyor</strong>
                  <span className="small">
                    Katalog bölümünden ürünlerini ekle. Gerçek fiyatlar burada görünecek.
                  </span>
                </div>
              ) : (
                <div className="studio-preview-products">
                  {previewItems.map((item) => (
                    <div className="studio-preview-product" key={item.id}>
                      <div className="studio-item-main">
                        {item.imageUrl !== null && (
                          <img
                            className="studio-item-image"
                            src={item.imageUrl}
                            alt={`${item.name} görseli`}
                          />
                        )}
                        <strong>{item.name}</strong>
                      </div>
                      {canWrite && (
                        <div className="studio-item-actions">
                          <label>
                            Görsel seç
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={busy}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                if (file !== undefined) void updateItemImage(item.id, file);
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                          {item.imageUrl !== null && (
                            <button
                              disabled={busy}
                              type="button"
                              onClick={() => void updateItemImage(item.id, null)}
                            >
                              Görseli kaldır
                            </button>
                          )}
                        </div>
                      )}
                      {item.description !== "" && <span>{item.description}</span>}
                      <b>
                        {item.price === null ? "Fiyat şubeye göre belirleniyor" : money(item.price)}
                      </b>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="studio-phone-footer">VADO ile oluşturuldu</div>
          </div>
          <p className="small muted">
            Bu taslak önizlemesidir. Ürünler işletmenin gerçek kataloğundan alınır. Tasarım ancak
            açıkça yayımlandığında müşteri ekranına geçer.
          </p>
        </section>
      </div>
    </>
  );
}
