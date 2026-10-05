import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { MiniAppForm } from "@/components/mini-app-form";
import { PageHeader } from "@/components/page-header";
import { getOverview } from "@/lib/api";
import { EMPTY_MINI_APP } from "@/lib/form-state";

export const metadata: Metadata = { title: "Yeni uygulama kaydı" };

const querySchema = z.object({ kind: z.enum(["showcase", "development"]).catch("showcase") });

export default async function NewMiniAppPage({ searchParams }: PageProps<"/miniapps/new">) {
  const { kind } = querySchema.parse(await searchParams);
  const { config } = await getOverview();
  const development = kind === "development" && config.miniAppDevMode;

  return (
    <>
      <Link href="/miniapps" className="back-link">
        Mini uygulamalar
      </Link>
      <PageHeader
        title={development ? "Yeni geliştirme kaydı" : "Yeni uygulama kaydı"}
        lead={
          development
            ? "Geliştirme kaydı, mini uygulamayı geliştiricinin kendi sunucusundan açar. Yalnızca geliştirme ortamında çalışır; canlı ortamda paket yayınlamak gerekir."
            : "Kayıt, işletmenin vitrinidir ve doğrulanmamış olarak oluşur. Oluşturduktan sonra kaydın sayfasından onaylı bir paket sürümü yayınlarsın."
        }
      >
        {config.miniAppDevMode &&
          (development ? (
            <Link href="/miniapps/new" className="button">
              Paketle yayınlanan kayıt oluştur
            </Link>
          ) : (
            <Link href="/miniapps/new?kind=development" className="button">
              Geliştirme kaydı oluştur
            </Link>
          ))}
      </PageHeader>
      <MiniAppForm
        key={development ? "development" : "showcase"}
        mode="create"
        kind={development ? "development" : "showcase"}
        initial={EMPTY_MINI_APP}
      />
    </>
  );
}
