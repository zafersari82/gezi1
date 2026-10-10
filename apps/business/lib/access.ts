import {
  type AccessGrant,
  type AccessGrantView,
  BUSINESS_PERMISSIONS,
  type BusinessPermission,
  businessPermissionSchema,
} from "@vado/contracts";

/** Bu işletmede anlamlı izinler: platform izinleri ve açık yetenek paketlerinin izinleri. */
export function visiblePermissions(capabilities: readonly string[]): BusinessPermission[] {
  return businessPermissionSchema.options.filter((permission) => {
    const capability = BUSINESS_PERMISSIONS[permission].capability;
    return capability === null || capabilities.some((id) => id.startsWith(`${capability}@`));
  });
}

/** "Siparişleri işleme: Kadıköy, Ege bölgesi" biçiminde okunur özet. */
export function grantSummary(grants: readonly AccessGrantView[]): string[] {
  const byPermission = new Map<BusinessPermission, string[]>();
  for (const grant of grants) {
    const places = byPermission.get(grant.permission) ?? [];
    places.push(
      grant.scope.kind === "business"
        ? "Tüm şubeler"
        : grant.scope.kind === "region"
          ? `${grant.scopeName ?? "Bölge"} bölgesi`
          : (grant.scopeName ?? "Şube"),
    );
    byPermission.set(grant.permission, places);
  }
  return [...byPermission.entries()].map(
    ([permission, places]) => `${BUSINESS_PERMISSIONS[permission].label}: ${places.join(", ")}`,
  );
}

export function plainGrants(grants: readonly AccessGrantView[]): AccessGrant[] {
  return grants.map(({ permission, scope }) => ({ permission, scope }));
}
