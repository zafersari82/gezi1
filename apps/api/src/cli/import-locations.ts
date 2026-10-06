import { readFile } from "node:fs/promises";

import pg from "pg";
import { z } from "zod";

import { loadConfig, loadEnvFile } from "../core/config";

const neighborhoodSchema = z.object({
  mahalle_id: z.string().min(1).max(120),
  mahalle_adi: z.string().min(1).max(160),
  mahalle_slug: z.string().min(1).max(200),
  posta_kodu: z.string().regex(/^\d{5}$/).nullable().optional(),
});
const districtSchema = z.object({
  ilce_id: z.string().min(1).max(120),
  ilce_adi: z.string().min(1).max(120),
  ilce_slug: z.string().min(1).max(160),
  mahalleler: z.array(neighborhoodSchema),
});
const provinceSchema = z.object({
  il_id: z.string().min(1).max(120),
  il_adi: z.string().min(1).max(120),
  il_slug: z.string().min(1).max(160),
  ilceler: z.array(districtSchema),
});
const treeSchema = z.array(provinceSchema).min(1);

async function main(): Promise<void> {
  loadEnvFile();
  const file = process.argv[2];
  if (file === undefined) {
    throw new Error(
      "Kullanım: npm run locations:import -w @vado/api -- <turkiye-adres-tree-tr.json>",
    );
  }
  const tree = treeSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const config = loadConfig();
  const client = new pg.Client({ connectionString: config.databaseMigrateUrl });
  await client.connect();
  try {
    await client.query("begin");
    let districts = 0;
    let neighborhoods = 0;
    for (const province of tree) {
      await client.query(
        "insert into location_provinces(id,name,slug) values($1,$2,$3) " +
          "on conflict(id) do update set name=excluded.name,slug=excluded.slug",
        [province.il_id, province.il_adi, province.il_slug],
      );
      const districtRows = province.ilceler;
      districts += districtRows.length;
      if (districtRows.length > 0) {
        await client.query(
          "insert into location_districts(id,province_id,name,slug) " +
            "select * from unnest($1::text[],$2::text[],$3::text[],$4::text[]) " +
            "on conflict(id) do update set province_id=excluded.province_id,name=excluded.name,slug=excluded.slug",
          [
            districtRows.map((row) => row.ilce_id),
            districtRows.map(() => province.il_id),
            districtRows.map((row) => row.ilce_adi),
            districtRows.map((row) => row.ilce_slug),
          ],
        );
      }
      const neighborhoodRows = districtRows.flatMap((district) =>
        district.mahalleler.map((row) => ({ district, row })),
      );
      neighborhoods += neighborhoodRows.length;
      if (neighborhoodRows.length > 0) {
        await client.query(
          "insert into location_neighborhoods(id,province_id,district_id,name,slug,postal_code) " +
            "select * from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[]) " +
            "on conflict(id) do update set province_id=excluded.province_id,district_id=excluded.district_id," +
            "name=excluded.name,slug=excluded.slug,postal_code=excluded.postal_code",
          [
            neighborhoodRows.map(({ row }) => row.mahalle_id),
            neighborhoodRows.map(() => province.il_id),
            neighborhoodRows.map(({ district }) => district.ilce_id),
            neighborhoodRows.map(({ row }) => row.mahalle_adi),
            neighborhoodRows.map(({ row }) => row.mahalle_slug),
            neighborhoodRows.map(({ row }) => row.posta_kodu ?? null),
          ],
        );
      }
    }
    await client.query("commit");
    console.log(
      `Konum verisi yüklendi: ${tree.length} il, ${districts} ilçe, ${neighborhoods} mahalle.`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
