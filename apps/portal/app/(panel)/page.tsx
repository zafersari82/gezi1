import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { getMe, getOverview } from "@/lib/api";
import { formatBytes, formatNumber } from "@/lib/format";

interface QueueItem {
  count: number;
  text: string;
  href: Route;
  action: string;
}

const SECONDS_PER_MINUTE = 60;

export default async function OverviewPage() {
  // Genel bakış bütün kayıtların sayılarını gösterir; işletme hesabı doğrudan kendi mini
  // uygulamalarına gider.
  const me = await getMe();
  if (!me.permissions.includes("overview.read")) redirect("/miniapps");
  const overview = await getOverview();
  const { config } = overview;

  const queue: QueueItem[] = [
    {
      count: overview.pendingBusinesses,
      text: "işletme başvurusu onay bekliyor",
      href: "/businesses",
      action: "Başvuruları incele",
    },
    {
      count: overview.openReports,
      text: "şikayet yanıt bekliyor",
      href: "/reports",
      action: "Şikayetleri incele",
    },
    {
      count: overview.packagesInReview,
      text: "paket sürümü inceleme bekliyor",
      href: "/packages",
      action: "Paketleri incele",
    },
    {
      count: overview.unverifiedMiniApps,
      text: "mini uygulama doğrulanmadığı için kullanıcılara kapalı",
      href: "/miniapps",
      action: "Mini uygulamaları incele",
    },
  ];
  const waiting = queue.filter((item) => item.count > 0);

  return (
    <>
      <PageHeader title="Genel bakış" />

      <section aria-labelledby="queue-title">
        <h2 id="queue-title">Bekleyen işler</h2>
        <div className="panel">
          {waiting.length === 0 ? (
            <p className="empty">
              Bekleyen iş yok. Yeni başvuru veya şikayet geldiğinde burada görünür.
            </p>
          ) : (
            <ul className="queue">
              {waiting.map((item) => (
                <li key={item.href}>
                  <span className="queue-count">{formatNumber(item.count)}</span>
                  <span className="queue-text">{item.text}</span>
                  <Link href={item.href} className="button button-primary">
                    {item.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="today-title">
        <h2 id="today-title">Bugün</h2>
        <dl className="panel figures">
          <div>
            <dt>Yeni kullanıcı</dt>
            <dd>{formatNumber(overview.newUsersToday)}</dd>
          </div>
          <div>
            <dt>Gönderilen mesaj</dt>
            <dd>{formatNumber(overview.messagesToday)}</dd>
          </div>
          <div>
            <dt>Ödeme oturumu</dt>
            <dd>{formatNumber(overview.paymentsToday)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="totals-title">
        <h2 id="totals-title">Toplam</h2>
        <dl className="panel figures">
          <div>
            <dt>Kullanıcı</dt>
            <dd>{formatNumber(overview.users)}</dd>
          </div>
          <div>
            <dt>Yayındaki işletme</dt>
            <dd>{formatNumber(overview.activeBusinesses)}</dd>
          </div>
          <div>
            <dt>Yayındaki mini uygulama</dt>
            <dd>{formatNumber(overview.publishedMiniApps)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="config-title">
        <h2 id="config-title">Sunucu ayarları</h2>
        <dl className="panel facts">
          <div>
            <dt>Demo modu</dt>
            <dd>
              {config.demoMode ? "Açık" : "Kapalı"}
              <span className="note">
                {config.demoMode
                  ? "SMS gönderilmez, doğrulama kodu 000000 olur. Canlı ortamda kapalı olmalı."
                  : "Doğrulama kodları SMS ile gönderilir."}
              </span>
            </dd>
          </div>
          <div>
            <dt>Ödemeler</dt>
            <dd>
              {config.paymentMode === "sandbox" ? "Deneme modu" : "Ödeme kuruluşu"}
              <span className="note">
                {config.paymentMode === "sandbox"
                  ? "Gerçek para hareketi olmaz."
                  : "Ödemeler lisanslı ödeme kuruluşu üzerinden alınır."}
              </span>
            </dd>
          </div>
          <div>
            <dt>Mini uygulama geliştirme kipi</dt>
            <dd>
              {config.miniAppDevMode ? "Açık" : "Kapalı"}
              <span className="note">
                {config.miniAppDevMode
                  ? "Geliştiricinin kendi sunucusundan açılan kayıtlara izin verilir. Canlı ortamda kapalıdır."
                  : "Yalnızca VADO'ya yüklenmiş ve onaylanmış paketler çalışır."}
              </span>
              {!config.miniAppDevMode && overview.urlMiniApps > 0 && (
                <span className="note">
                  {formatNumber(overview.urlMiniApps)} kayıt hâlâ adresle açılıyor ve kullanıcılara
                  kapalı; <Link href="/miniapps">paketlerini yayınla</Link>.
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Paket boyutu sınırı</dt>
            <dd>
              {formatBytes(config.packageMaxBytes)}
              <span className="note">
                Açılmış dosyaların toplamı bunun dört katını aşamaz. Kesin sınır, gerçek cihazlarda
                açılış süresi ölçüldükten sonra belirlenecek.
              </span>
            </dd>
          </div>
          <div>
            <dt>Oturum süresi</dt>
            <dd>{config.sessionDays} gün</dd>
          </div>
          <div>
            <dt>Kişisel QR kodun geçerliliği</dt>
            <dd>{Math.round(config.userQrTtlSeconds / SECONDS_PER_MINUTE)} dakika</dd>
          </div>
          <div>
            <dt>İzinli web kaynakları</dt>
            <dd>
              <ul>
                {config.corsOrigins.map((origin) => (
                  <li key={origin} className="mono">
                    {origin}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
