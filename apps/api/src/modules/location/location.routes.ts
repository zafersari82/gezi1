import {
  businessParamsSchema,
  businessRecordParamsSchema,
  createCustomerAddressBodySchema,
  createLocationServiceAreaBodySchema,
  expectedVersionSchema,
  locationDistrictQuerySchema,
  locationNeighborhoodQuerySchema,
  locationServiceAreaQuerySchema,
  shellBusinessParamsSchema,
  shellCartParamsSchema,
  updateCustomerAddressBodySchema,
  updateLocationServiceAreaBodySchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const deleteAddressBodySchema = z.object({ expectedVersion: expectedVersionSchema }).strict();

export function locationRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const { location, businessManagement } = services;

  server.get("/v1/locations/provinces", async (request) => {
    await guard(request);
    return { items: await location.provinces() };
  });
  server.get("/v1/locations/districts", async (request) => {
    await guard(request);
    const { provinceId } = parse(locationDistrictQuerySchema, request.query);
    return { items: await location.districts(provinceId) };
  });
  server.get("/v1/locations/neighborhoods", async (request) => {
    await guard(request);
    const { provinceId, districtId } = parse(locationNeighborhoodQuerySchema, request.query);
    return { items: await location.neighborhoods(provinceId, districtId) };
  });

  server.get("/v1/shell/:businessId/:appInstanceId/addresses", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId } = parse(shellBusinessParamsSchema, request.params);
    return {
      items: await location.addresses(
        await businessManagement.customerScope(userId, businessId, appInstanceId),
      ),
    };
  });
  server.post("/v1/shell/:businessId/:appInstanceId/addresses", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId } = parse(shellBusinessParamsSchema, request.params);
    return location.createAddress(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      parse(createCustomerAddressBodySchema, request.body),
    );
  });
  server.put("/v1/shell/:businessId/:appInstanceId/addresses/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId, id } = parse(shellCartParamsScheme, request.params);
    return location.updateAddress(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      id,
      parse(updateCustomerAddressBodySchema, request.body),
    );
  });
  server.delete("/v1/shell/:businessId/:appInstanceId/addresses/:id", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId, appInstanceId, id } = parse(shellCartParamsSchema, request.params);
    const { expectedVersion } = parse(deleteAddressBodySchema, request.body);
    await location.deleteAddress(
      await businessManagement.customerScope(userId, businessId, appInstanceId),
      id,
      expectedVersion,
    );
    return reply.code(204).send();
  });

  server.get("/v1/business/:businessId/service-areas", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const { branchId } = parse(locationServiceAreaQuerySchema, request.query);
    return {
      items: await location.serviceAreas(
        await businessManagement.authorise(userId, businessId),
        branchId,
      ),
    };
  });
  server.post("/v1/business/:businessId/service-areas", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return location.createServiceArea(
      await businessManagement.authorise(userId, businessId),
      parse(createLocationServiceAreaBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/service-areas/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsScheme, request.params);
    return location.updateServiceArea(
      await businessManagement.authorise(userId, businessId),
      id,
      parse(updateLocationServiceAreaBodyScheme, request.body),
    );
  });
}
