import {
  locationAddressBodySchema,
  locationAddressUpdateBodySchema,
  locationAreaBodySchema,
  locationAreaParamsSchema,
  locationAreaRecordParamsSchema,
  locationAreaUpdateBodySchema,
  locationKeySchema,
  locationRecordParamsSchema,
  locationVersionBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";
export function locationRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const location = services.location;
  server.get("/v1/location/countries", async (request) => {
    await guard(request);
    return location.listCountries();
  });
  for (const [resource, children, read] of [
    ["countries", "provinces", location.listProvinces],
    ["provinces", "districts", location.listDistricts],
    ["districts", "neighborhoods", location.listNeighborhoods],
  ] as const)
    server.get(`/v1/location/${resource}/:id/${children}`, async (request) => {
      await guard(request);
      const { id } = parse(locationRecordParamsSchema, request.params);
      return read(id);
    });
  server.get("/v1/location/neighborhoods/:id", async (request) => {
    await guard(request);
    const { id } = parse(locationRecordParamsSchema, request.params);
    return location.getPath(id);
  });
  server.get("/v1/location/addresses", async (request) => {
    const { userId } = await guard(request);
    return location.listAddresses(userId);
  });
  server.get("/v1/location/addresses/:id", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(locationRecordParamsSchema, request.params);
    return location.getAddress(userId, id);
  });
  server.post("/v1/location/addresses", async (request) => {
    const { userId } = await guard(request);
    const body = parse(locationAddressBodySchema, request.body);
    const key = parse(locationKeySchema, request.headers["idempotency-key"]);
    return location.createAddress(userId, key, body);
  });
  server.put("/v1/location/addresses/:id", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(locationRecordParamsSchema, request.params);
    const body = parse(locationAddressUpdateBodySchema, request.body);
    const key = parse(locationKeySchema, request.headers["idempotency-key"]);
    return location.updateAddress(userId, id, key, body);
  });
  server.post("/v1/location/addresses/:id/archive", async (request) => {
    const { userId } = await guard(request);
    const { id } = parse(locationRecordParamsSchema, request.params);
    const body = parse(locationVersionBodySchema, request.body);
    const key = parse(locationKeySchema, request.headers["idempotency-key"]);
    return location.archiveAddress(userId, id, key, body);
  });
  const root = "/v1/business/:businessId/branches/:branchId/service-areas";
  server.get(root, async (request) => {
    const { userId } = await guard(request);
    const { businessId, branchId } = parse(locationAreaParamsSchema, request.params);
    return location.listServiceAreas(
      await services.businessManagement.authorise(userId, businessId),
      branchId,
    );
  });
  server.post(root, async (request) => {
    const { userId } = await guard(request);
    const { businessId, branchId } = parse(locationAreaParamsSchema, request.params);
    const body = parse(locationAreaBodySchema, request.body);
    const key = parse(locationKeySchema, request.headers["idempotency-key"]);
    return location.createServiceArea(
      await services.businessManagement.authorise(userId, businessId),
      branchId,
      key,
      body,
    );
  });
  server.put(`${root}/:id`, async (request) => {
    const { userId } = await guard(request);
    const { businessId, branchId, id } = parse(locationAreaRecordParamsSchema, request.params);
    const body = parse(locationAreaUpdateBodySchema, request.body);
    const key = parse(locationKeySchema, request.headers["idempotency-key"]);
    return location.updateServiceArea(
      await services.businessManagement.authorise(userId, businessId),
      branchId,
      id,
      key,
      body,
    );
  });
  server.post(`${root}/:id/disable`, async (request) => {
    const { userId } = await guard(request);
    const { businessId, branchId, id } = parse(locationAreaRecordParamsSchema, request.params);
    const body = parse(locationVersionBodySchema, request.body);
    const key = parse(locationKeySchema, request.headers["idempotency-key"]);
    return location.disableServiceArea(
      await services.businessManagement.authorise(userId, businessId),
      branchId,
      id,
      key,
      body,
    );
  });
}
