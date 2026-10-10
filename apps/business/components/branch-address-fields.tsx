"use client";

import {
  type BranchAddressView,
  locationCountriesSchema,
  locationPlacesSchema,
} from "@vado/contracts";
import { useEffect, useState } from "react";

import { call } from "../lib/client";

interface Place {
  id: string;
  name: string;
}

/**
 * Şube adresi Türkiye adres kataloğundan seçilir: il, ilçe, mahalle ve açık adres. Eski serbest
 * metinden ilçe tahmin edilmez. İl seçilmezse şube adressiz kaydedilir.
 */
export function BranchAddressFields({ initial }: { initial: BranchAddressView | null }) {
  const [provinces, setProvinces] = useState<Place[]>([]);
  const [districts, setDistricts] = useState<Place[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Place[]>([]);
  const [province, setProvince] = useState(initial?.provinceId ?? "");
  const [district, setDistrict] = useState(initial?.districtId ?? "");
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhoodId ?? "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    call(locationCountriesSchema, "/api/location/countries")
      .then((countries) => {
        const turkey = countries.items.find((country) => country.code === "TR");
        if (turkey === undefined) throw new Error("Türkiye kataloğu yok");
        return call(locationPlacesSchema, `/api/location/countries/${turkey.id}/provinces`);
      })
      .then((response) => {
        if (active) setProvinces(response.items);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (province === "") return;
    let active = true;
    call(locationPlacesSchema, `/api/location/provinces/${province}/districts`)
      .then((response) => {
        if (active) setDistricts(response.items);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [province]);

  useEffect(() => {
    if (district === "") return;
    let active = true;
    call(locationPlacesSchema, `/api/location/districts/${district}/neighborhoods`)
      .then((response) => {
        if (active) setNeighborhoods(response.items);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [district]);

  const required = province !== "";
  return (
    <fieldset className="editor-fieldset">
      <legend>Adres</legend>
      <label>
        İl
        <select
          name="provinceId"
          value={province}
          onChange={(event) => {
            setProvince(event.target.value);
            setDistrict("");
            setNeighborhood("");
            setDistricts([]);
            setNeighborhoods([]);
          }}
        >
          <option value="">Adres girilmedi</option>
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
          disabled={!required}
          required={required}
          onChange={(event) => {
            setDistrict(event.target.value);
            setNeighborhood("");
            setNeighborhoods([]);
          }}
        >
          <option value="">İlçe seç</option>
          {districts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mahalle
        <select
          name="neighborhoodId"
          value={neighborhood}
          disabled={district === ""}
          required={required}
          onChange={(event) => {
            setNeighborhood(event.target.value);
          }}
        >
          <option value="">Mahalle seç</option>
          {neighborhoods.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Açık adres
        <input
          name="addressLine"
          maxLength={300}
          minLength={5}
          required={required}
          disabled={!required}
          placeholder="Cadde/sokak, bina no, kat, daire"
          defaultValue={initial?.line ?? ""}
        />
      </label>
      {failed && (
        <p className="small muted">Adres listesi yüklenemedi. Sayfayı yenileyip tekrar dene.</p>
      )}
      <p className="small muted">
        Keşfette ve teslimatta bu adres kullanılır. İl, ilçe ve mahalle listeden seçilir.
      </p>
    </fieldset>
  );
}
