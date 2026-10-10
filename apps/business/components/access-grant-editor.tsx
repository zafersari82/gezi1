"use client";

import {
  type AccessGrant,
  type Branch,
  BUSINESS_PERMISSIONS,
  type BusinessPermission,
  type BusinessRegion,
} from "@vado/contracts";

type Mode = "none" | "business" | "selected";

function modeOf(grants: readonly AccessGrant[], permission: BusinessPermission): Mode {
  const own = grants.filter((grant) => grant.permission === permission);
  if (own.some((grant) => grant.scope.kind === "business")) return "business";
  return own.length > 0 ? "selected" : "none";
}

function selectedIds(
  grants: readonly AccessGrant[],
  permission: BusinessPermission,
  kind: "region" | "branch",
): string[] {
  const ids: string[] = [];
  for (const grant of grants) {
    if (grant.permission !== permission) continue;
    if (kind === "region" && grant.scope.kind === "region") ids.push(grant.scope.regionId);
    if (kind === "branch" && grant.scope.kind === "branch") ids.push(grant.scope.branchId);
  }
  return ids;
}

/**
 * Personelin izinlerini telefon ekranında düzenler. Her izin için: yok, bütün şubeler ya da
 * seçilen bölge ve şubeler. Kayıt sunucuda yeniden doğrulanır ve tek biçime getirilir.
 */
export function AccessGrantEditor({
  permissions,
  branches,
  regions,
  value,
  onChange,
  disabled,
}: {
  permissions: readonly BusinessPermission[];
  branches: readonly Branch[];
  regions: readonly BusinessRegion[];
  value: readonly AccessGrant[];
  onChange: (grants: AccessGrant[]) => void;
  disabled: boolean;
}) {
  const others = (permission: BusinessPermission) =>
    value.filter((grant) => grant.permission !== permission);

  function setMode(permission: BusinessPermission, mode: Mode) {
    if (mode === "none") onChange(others(permission));
    else if (mode === "business")
      onChange([...others(permission), { permission, scope: { kind: "business" } }]);
    else {
      const first = branches.find((branch) => branch.active);
      onChange(
        first === undefined
          ? others(permission)
          : [...others(permission), { permission, scope: { kind: "branch", branchId: first.id } }],
      );
    }
  }

  function toggle(
    permission: BusinessPermission,
    scope: { kind: "region"; regionId: string } | { kind: "branch"; branchId: string },
    checked: boolean,
  ) {
    const same = (grant: AccessGrant) =>
      grant.permission === permission &&
      ((scope.kind === "region" &&
        grant.scope.kind === "region" &&
        grant.scope.regionId === scope.regionId) ||
        (scope.kind === "branch" &&
          grant.scope.kind === "branch" &&
          grant.scope.branchId === scope.branchId));
    onChange(
      checked
        ? [...value.filter((grant) => !same(grant)), { permission, scope }]
        : value.filter((grant) => !same(grant)),
    );
  }

  return (
    <div>
      {permissions.map((permission) => {
        const definition = BUSINESS_PERMISSIONS[permission];
        const mode = modeOf(value, permission);
        const chosenRegions = selectedIds(value, permission, "region");
        const chosenBranches = selectedIds(value, permission, "branch");
        return (
          <fieldset className="grant-card" key={permission} disabled={disabled}>
            <legend>{definition.label}</legend>
            <p className="small muted">{definition.description}</p>
            <label>
              Kapsam
              <select
                value={mode}
                onChange={(event) => {
                  setMode(permission, event.target.value as Mode);
                }}
              >
                <option value="none">İzin yok</option>
                <option value="business">Bütün şubeler</option>
                <option value="selected">Seçilen bölge ve şubeler</option>
              </select>
            </label>
            {mode === "selected" && (
              <div className="form-stack">
                {regions.map((region) => (
                  <label className="check-label" key={region.id}>
                    <input
                      type="checkbox"
                      checked={chosenRegions.includes(region.id)}
                      onChange={(event) => {
                        toggle(
                          permission,
                          { kind: "region", regionId: region.id },
                          event.target.checked,
                        );
                      }}
                    />
                    {region.name} bölgesi ({region.branchIds.length} şube)
                  </label>
                ))}
                {branches
                  .filter((branch) => branch.active)
                  .map((branch) => (
                    <label className="check-label" key={branch.id}>
                      <input
                        type="checkbox"
                        checked={chosenBranches.includes(branch.id)}
                        onChange={(event) => {
                          toggle(
                            permission,
                            { kind: "branch", branchId: branch.id },
                            event.target.checked,
                          );
                        }}
                      />
                      {branch.name}
                    </label>
                  ))}
              </div>
            )}
            {definition.implies.length > 0 && mode !== "none" && (
              <p className="small muted">
                Bu izinle birlikte aynı kapsamda{" "}
                {definition.implies.map((id) => BUSINESS_PERMISSIONS[id].label).join(", ")} izni de
                verilir.
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
