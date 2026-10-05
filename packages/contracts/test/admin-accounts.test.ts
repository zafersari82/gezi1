import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_PERMISSIONS,
  ADMIN_ROLES,
  adminSecondFactorBodySchema,
  adminUsernameSchema,
  recoveryCodeSchema,
  roleHasPermission,
} from "../src";

const rolesWith = (permission: (typeof ADMIN_PERMISSIONS)[number]) =>
  ADMIN_ROLES.filter((role) => roleHasPermission(role, permission));

describe("roller ve izinler", () => {
  it("sahip her izne sahiptir; hesapları yalnızca sahip yönetir", () => {
    expect([...ADMIN_ROLE_PERMISSIONS.owner].sort()).toEqual([...ADMIN_PERMISSIONS].sort());
    expect(rolesWith("accounts.manage")).toEqual(["owner"]);
  });

  it("denetçi her şeyi okur, hiçbir şeyi değiştiremez", () => {
    expect(ADMIN_ROLE_PERMISSIONS.auditor.every((permission) => permission.endsWith(".read"))).toBe(
      true,
    );
    const reads = ADMIN_PERMISSIONS.filter((permission) => permission.endsWith(".read"));
    expect([...ADMIN_ROLE_PERMISSIONS.auditor].sort()).toEqual([...reads].sort());
  });

  it("paketi onaylayan ile yükleyen ayrı rollerdir; ikisini birden yalnızca sahip yapabilir", () => {
    expect(rolesWith("packages.review")).toEqual(["owner", "reviewer"]);
    expect(rolesWith("packages.upload")).toEqual(["owner", "operator"]);
  });

  it("acil kapatmayı sahip, inceleyen ve operatör yapabilir", () => {
    expect(rolesWith("emergency.disable")).toEqual(["owner", "reviewer", "operator"]);
  });

  it("her rol genel bakışı görür; tablodaki her izin tanımlı izin listesindendir", () => {
    for (const role of ADMIN_ROLES) {
      expect(roleHasPermission(role, "overview.read")).toBe(true);
      for (const permission of ADMIN_ROLE_PERMISSIONS[role]) {
        expect(ADMIN_PERMISSIONS).toContain(permission);
      }
    }
  });
});

describe("hesap biçimleri", () => {
  it("kullanıcı adı küçük harfe çevrilir; kısa ya da geçersiz karakterli ad reddedilir", () => {
    expect(adminUsernameSchema.parse(" Deniz.Arslan ")).toBe("deniz.arslan");
    for (const invalid of ["ab", "-deniz", "deniz arslan", "déniz", "a".repeat(33)]) {
      expect(adminUsernameSchema.safeParse(invalid).success, invalid).toBe(false);
    }
  });

  it("kurtarma kodu tireli ya da tiresiz, büyük ya da küçük harfle girilebilir", () => {
    expect(recoveryCodeSchema.parse("ABCD-EFGH-IJKL-MN23")).toBe("abcdefghijklmn23");
    expect(recoveryCodeSchema.safeParse("abcd-efgh").success).toBe(false);
    expect(adminSecondFactorBodySchema.safeParse({ code: "12345" }).success).toBe(false);
    expect(adminSecondFactorBodySchema.parse({ code: "123456" })).toEqual({ code: "123456" });
  });
});
