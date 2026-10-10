"use client";

import { locationCountriesSchema, locationPlacesSchema } from "@vado/contracts";
import { useEffect, useState } from "react";

import { call } from "../lib/client";

/** İşyeri gerçek şube konumunu seçer; serbest adres üzerinden ilçe tahmini yapılmaz. */
export function BranchLocationFields({
  provinceId,
  districtId,
}: {
  provinceId: string | null;
  districtId: string | null;
}) {
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ id: string; name: string }[]>([]);
  const [province, setProvince] = useState(provinceId ?? "");
  const [district, setDistrict] = useState(districtId ?? "");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const countries = await call(locationCountriesSchema, "/api/location/countries");
        const tr = countries.items.find((country) => country.code === "TR");
        if (tr === undefined) return;
        const response = await call(
          locationPlacesSchema,
          `/api/location/countries/${tr.id}/provinces`,
        );
        if (active) setProvinces(response.items);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (province === "") {
      setDistricts([]);
      return;
    }
    void call(locationPlacesSchema, `/api/location/provinces/${province}/districts`)
      .then((response) => {
        if (active) setDistricts(response.items);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [province]);
  return (
    <>
      <label>
        İl
        <select
          name="provinceId"
          value={province}
          onChange={(e) => {
            setProvince(e.target.value);
            setDistrict("");
          }}
        >
          <option value="">Konum belirtilmemiş</option>
          {provinces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        İlçe
        <select
          name="districtId"
          value={district}
          disabled={province === ""}
          onChange={(e) => { setDistrict(e.target.value); }}
        >
          <option value="">İlçe seç</option>
          {districts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="small muted">Konum listesi yüklenemedi. Daha sonra tekrar dene.</p>}
      <p className="small muted">
        Yerel keşifte gösterilmek için şubenin il ve ilçesini birlikte seç.
      </p>
    </>
  );
}
