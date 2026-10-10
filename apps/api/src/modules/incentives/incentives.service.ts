import {
  type IncentiveQuote,
  incentiveQuoteSchema,
  type IncentiveRule,
  type IncentiveRuleBody,
  incentiveRuleSchema,
  type IncentiveSettingsBody,
  incentiveSettingsSchema,
  type LoyaltyWallet,
  loyaltyWalletSchema,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { TenantContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { OrderingLifecycle, OrderingLifecycleEvent } from "../../core/ordering-lifecycle";
import type { OrderPricing, OrderPricingInput } from "../../core/ordering-pricing";
import { appendEvent } from "../../core/outbox-events";
import { withPlatformMutation } from "../../core/platform-mutations";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import { includedVat } from "../catalog/pricing";
import { allocateDiscount } from "./incentive-math";

interface RuleRow {
  id: string;
  business_id: string;
  name: string;
  kind: "campaign" | "coupon";
  code: string | null;
  discount_type: "fixed" | "percentage";
  value: number;
  minimum_minor: number;
  branch_id: string | null;
  item_ids: string[];
  starts_at: Date;
  ends_at: Date;
  total_limit: number | null;
  per_customer_limit: number | null;
  active: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
}
function view(row: RuleRow): IncentiveRule {
  return incentiveRuleSchema.parse({
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    kind: row.kind,
    code: row.code,
    discountType: row.discount_type,
    value: row.value,
    minimumMinor: row.minimum_minor,
    branchId: row.branch_id,
    itemIds: row.item_ids,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    totalLimit: row.total_limit,
    perCustomerLimit: row.per_customer_limit,
    active: row.active,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}
function identity(scope: TenantScope) {
  if (
    scope.role !== "customer" ||
    scope.businessCustomerId === null ||
    scope.appInstanceId === null
  )
    throw new AppError("forbidden");
  return scope.businessCustomerId;
}
async function lock(tx: Database, businessId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${businessId + ":incentives"},731))`,
  );
}
async function settings(tx: Database, businessId: string) {
  const row = await tx.maybeOne<{
    version: number;
    stack_campaign_coupon: boolean;
    earn_basis_points: number;
  }>(sql`select * from incentive_settings where business_id=${businessId}`);
  return incentiveSettingsSchema.parse({
    version: row?.version ?? 0,
    stackCampaignCoupon: row?.stack_campaign_coupon ?? false,
    earnBasisPoints: row?.earn_basis_points ?? 0,
  });
}
async function wallet(
  tx: Database,
  businessId: string,
  customerId: string,
): Promise<LoyaltyWallet> {
  const row = await tx.maybeOne<{ balance: number; version: number }>(
    sql`select balance,version from loyalty_wallets where business_id=${businessId} and business_customer_id=${customerId}`,
  );
  return loyaltyWalletSchema.parse({
    balance: row?.balance ?? 0,
    available: Math.max(0, row?.balance ?? 0),
    version: row?.version ?? 0,
  });
}
function discount(rule: RuleRow, weights: readonly number[]): number {
  const total = weights.reduce((sum, n) => sum + BigInt(n), 0n);
  return rule.discount_type === "fixed"
    ? Number(total < BigInt(rule.value) ? total : BigInt(rule.value))
    : Number((total * BigInt(rule.value)) / 10000n);
}

export function createIncentiveService({ db }: TenantContext, lifecycle: OrderingLifecycle) {
  async function price(tx: Database, scope: TenantScope, input: OrderPricingInput) {
    const customerId = identity(scope);
    if (input.lock) await lock(tx, scope.businessId);
    const config = await settings(tx, scope.businessId),
      currentWallet = await wallet(tx, scope.businessId, customerId);
    const rules = await tx.many<RuleRow>(
      sql`select * from incentive_rules where business_id=${scope.businessId} and active and starts_at<=now() and ends_at>now() and (branch_id is null or branch_id=${input.branchId}) order by id`,
    );
    const eligible: RuleRow[] = [];
    for (const rule of rules) {
      const count = await tx.one<{ total: number; personal: number }>(
        sql`select * from incentive_usage_count(${scope.businessId},${rule.id},${customerId},${input.cartId})`,
      );
      if (
        (rule.total_limit === null || count.total < rule.total_limit) &&
        (rule.per_customer_limit === null || count.personal < rule.per_customer_limit)
      )
        eligible.push(rule);
    }
    let lines = input.lines.map((line) => ({ ...line, discountMinor: 0 }));
    const allocations = lines.map(() => 0),
      issues: IncentiveQuote["issues"] = [];
    const weights = (rule: RuleRow) =>
      lines.map((line) =>
        rule.item_ids.length === 0 || rule.item_ids.includes(line.itemId) ? line.totalMinor : 0,
      );
    const valid = (rule: RuleRow) =>
      lines.reduce((sum, line) => sum + line.totalMinor, 0) >= rule.minimum_minor &&
      discount(rule, weights(rule)) > 0;
    const campaigns = eligible
      .filter((rule) => rule.kind === "campaign" && valid(rule))
      .sort(
        (a, b) => discount(b, weights(b)) - discount(a, weights(a)) || a.id.localeCompare(b.id),
      );
    const campaign = campaigns[0];
    const coupon =
      input.choice.couponCode === null
        ? undefined
        : eligible.find((rule) => rule.kind === "coupon" && rule.code === input.choice.couponCode);
    let appliedCampaign: IncentiveQuote["campaign"] = null,
      appliedCoupon: IncentiveQuote["coupon"] = null;
    function apply(rule: RuleRow) {
      const amount = discount(rule, weights(rule));
      const parts = allocateDiscount(weights(rule), amount);
      lines = lines.map((line, index) => {
        const part = parts[index] ?? 0;
        allocations[index] = (allocations[index] ?? 0) + part;
        return {
          ...line,
          totalMinor: line.totalMinor - part,
          discountMinor: line.discountMinor + part,
        };
      });
      return { id: rule.id, version: rule.version, name: rule.name, amountMinor: amount };
    }
    if (campaign !== undefined) appliedCampaign = apply(campaign);
    if (input.choice.couponCode !== null) {
      if (coupon === undefined || !valid(coupon)) issues.push("coupon_unavailable");
      else if (appliedCampaign !== null && !config.stackCampaignCoupon)
        issues.push("stack_forbidden");
      else appliedCoupon = apply(coupon);
    }
    let points = input.choice.pointsToSpend;
    const ownedSpent = await tx.maybeOne<{ points_spent: number }>(
      sql`select s.points_spent from incentive_settlements s join orders o on o.business_id=s.business_id and o.id=s.order_id where o.business_id=${scope.businessId} and o.cart_id=${input.cartId} and o.business_customer_id=${customerId}`,
    );
    if (
      points > currentWallet.available + (ownedSpent?.points_spent ?? 0) ||
      points > lines.reduce((sum, line) => sum + line.totalMinor, 0)
    ) {
      issues.push("loyalty_insufficient");
      points = 0;
    }
    const parts = allocateDiscount(
      lines.map((line) => line.totalMinor),
      points,
    );
    lines = lines.map((line, index) => {
      const part = parts[index] ?? 0;
      allocations[index] = (allocations[index] ?? 0) + part;
      const total = line.totalMinor - part;
      return {
        ...line,
        totalMinor: total,
        discountMinor: line.discountMinor + part,
        vatMinor: includedVat(total, line.vatBasisPoints),
      };
    });
    const goods = lines.reduce((sum, line) => sum + line.totalMinor, 0);
    const incentives = incentiveQuoteSchema.parse({
      issues,
      settingsVersion: config.version,
      earnBasisPoints: config.earnBasisPoints,
      campaign: appliedCampaign,
      coupon: appliedCoupon,
      pointsSpent: points,
      pointsToEarn: Number((BigInt(goods) * BigInt(config.earnBasisPoints)) / 10000n),
      discountMinor: allocations.reduce((sum, n) => sum + n, 0),
      allocations,
    });
    return { lines, incentives };
  }
  const pricing: OrderPricing = price;
  for (const stage of ["reserve", "complete", "cancel", "refund"] as const)
    lifecycle.register(`incentives.${stage}`, {
      [stage]: async (tx: Database, event: OrderingLifecycleEvent) => {
        const row = await tx.one<{ result: { error?: string } }>(
          sql`select incentive_lifecycle(${event.businessId},${event.orderId},${stage}) as result`,
        );
        if (row.result.error !== undefined) {
          const code = row.result.error;
          if (
            code === "incentive_unavailable" ||
            code === "loyalty_insufficient" ||
            code === "incentive_stack_forbidden" ||
            code === "forbidden" ||
            code === "order_state_invalid" ||
            code === "validation_failed"
          )
            throw new AppError(code);
          throw new Error("Teşvik işlemi beklenmeyen hata döndürdü");
        }
      },
    });
  async function listRules(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => ({
      items: (
        await tx.many<RuleRow>(
          sql`select * from incentive_rules where business_id=${scope.businessId} order by created_at desc,id`,
        )
      ).map(view),
    }));
  }
  async function saveRule(
    scope: TenantScope,
    id: string | null,
    key: string,
    body: IncentiveRuleBody & { expectedVersion?: number },
  ) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) =>
      withPlatformMutation(
        tx,
        scope.userId,
        scope.businessId,
        `incentive.rule:${id ?? "new"}`,
        key,
        body,
        async () => {
          await lock(tx, scope.businessId);
          if (
            body.branchId !== null &&
            (await tx.maybeOne(
              sql`select id from branches where business_id=${scope.businessId} and id=${body.branchId}`,
            )) === null
          )
            throw new AppError("not_found");
          for (const itemId of body.itemIds) {
            if (
              (await tx.maybeOne(
                sql`select id from catalog_items where business_id=${scope.businessId} and id=${itemId}`,
              )) === null
            )
              throw new AppError("not_found");
          }
          const current =
            id === null
              ? null
              : await tx.maybeOne<RuleRow>(
                  sql`select * from incentive_rules where business_id=${scope.businessId} and id=${id} for update`,
                );
          if (id !== null && current === null) throw new AppError("not_found");
          if (current !== null && current.version !== body.expectedVersion)
            throw new AppError("settings_version_conflict");
          if (current !== null && current.kind !== body.kind)
            throw new AppError("validation_failed");
          if (
            body.code !== null &&
            (await tx.maybeOne(
              sql`select id from incentive_rules where business_id=${scope.businessId} and code=${body.code} ${id === null ? sql.empty : sql`and id<>${id}`} `,
            )) !== null
          )
            throw new AppError("incentive_code_taken");
          const row =
            current === null
              ? await tx.one<RuleRow>(
                  sql`insert into incentive_rules(business_id,name,kind,code,discount_type,value,minimum_minor,branch_id,item_ids,starts_at,ends_at,total_limit,per_customer_limit,active) values(${scope.businessId},${body.name},${body.kind},${body.code},${body.discountType},${body.value},${body.minimumMinor},${body.branchId},${body.itemIds}::uuid[],${body.startsAt},${body.endsAt},${body.totalLimit},${body.perCustomerLimit},${body.active}) returning *`,
                )
              : await tx.one<RuleRow>(
                  sql`update incentive_rules set name=${body.name},code=${body.code},discount_type=${body.discountType},value=${body.value},minimum_minor=${body.minimumMinor},branch_id=${body.branchId},item_ids=${body.itemIds}::uuid[],starts_at=${body.startsAt},ends_at=${body.endsAt},total_limit=${body.totalLimit},per_customer_limit=${body.perCustomerLimit},active=${body.active},version=version+1 where business_id=${scope.businessId} and id=${current.id} returning *`,
                );
          await recordAudit(tx, {
            actor: scope.userId,
            action: "incentive.rule_saved",
            targetType: "incentive_rule",
            targetId: row.id,
            metadata: { businessId: scope.businessId, version: row.version },
          });
          await appendEvent(tx, scope, {
            type: "incentive.rule_saved",
            aggregateId: row.id,
            sequence: row.version,
            payload: { ruleId: row.id, version: row.version },
          });
          return view(row);
        },
      ),
    );
  }
  function getSettings(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, (tx) => settings(tx, scope.businessId));
  }
  function saveSettings(scope: TenantScope, key: string, body: IncentiveSettingsBody) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, (tx) =>
      withPlatformMutation(
        tx,
        scope.userId,
        scope.businessId,
        "incentive.settings",
        key,
        body,
        async () => {
          await lock(tx, scope.businessId);
          const current = await settings(tx, scope.businessId);
          if (current.version !== body.expectedVersion)
            throw new AppError("settings_version_conflict");
          await tx.execute(
            sql`insert into incentive_settings(business_id,version,stack_campaign_coupon,earn_basis_points) values(${scope.businessId},${current.version + 1},${body.stackCampaignCoupon},${body.earnBasisPoints}) on conflict(business_id) do update set version=excluded.version,stack_campaign_coupon=excluded.stack_campaign_coupon,earn_basis_points=excluded.earn_basis_points`,
          );
          await recordAudit(tx, {
            actor: scope.userId,
            action: "incentive.settings_saved",
            targetType: "business",
            targetId: scope.businessId,
            metadata: { version: current.version + 1 },
          });
          await appendEvent(tx, scope, {
            type: "incentive.settings_saved",
            aggregateId: scope.businessId,
            sequence: current.version + 1,
            payload: { version: current.version + 1 },
          });
          return settings(tx, scope.businessId);
        },
      ),
    );
  }
  function getWallet(scope: TenantScope) {
    const customerId = identity(scope);
    return withTenant(db, scope, (tx) => wallet(tx, scope.businessId, customerId));
  }
  function available(scope: TenantScope) {
    const customerId = identity(scope);
    return withTenant(db, scope, async (tx) => ({
      settings: await settings(tx, scope.businessId),
      wallet: await wallet(tx, scope.businessId, customerId),
      campaigns: (
        await tx.many<RuleRow>(
          sql`select * from incentive_rules where business_id=${scope.businessId} and kind='campaign' and active and starts_at<=now() and ends_at>now() order by id`,
        )
      ).map(view),
    }));
  }
  return { pricing, listRules, saveRule, getSettings, saveSettings, getWallet, available };
}
