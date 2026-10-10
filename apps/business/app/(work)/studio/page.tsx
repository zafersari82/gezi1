import { catalogSchema, studioConfigurationResponseSchema } from "@vado/contracts";

import { StudioEditor } from "../../../components/studio-editor";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

export default async function StudioPage() {
  const { membership } = await getBusinessContext();
  const catalog = await apiGet(catalogSchema, `/v1/business/${membership.businessId}/catalog`);
  const studio = await apiGet(
    studioConfigurationResponseSchema,
    `/v1/business/${membership.businessId}/studio`,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VADO Business Studio</span>
          <h1>Mağazanı tasarla</h1>
          <p className="muted">Telefonundan seç, düzenle ve önizle. Teknik bilgi gerekmez.</p>
        </div>
      </div>
      <StudioEditor
        key={membership.businessId}
        businessName={studio.businessName}
        category={studio.category}
        configuration={studio.configuration}
        published={studio.published}
        publishedVersion={studio.publishedVersion}
        catalog={catalog}
        canWrite={membership.role !== "staff"}
      />
    </>
  );
}
