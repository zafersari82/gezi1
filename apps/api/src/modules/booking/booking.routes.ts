import {
  bookingCreateSchema,
  bookingDateSchema,
  bookingHoursBodySchema,
  bookingResourceBodySchema,
  bookingServiceBodySchema,
  bookingStatusUpdateSchema,
  businessParamsSchema,
  businessRecordParamsSchema,
  idSchema,
} from "@vado/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { parse } from "../../core/http";
import type { RouteContext } from "../../routes";

const slotsQuery = z
  .object({
    branchId: idSchema,
    serviceId: idSchema,
    resourceId: idSchema,
    day: bookingDateSchema,
  })
  .strict();
const resourceParams = businessParamsSchema.extend({ resourceId: idSchema });

/** İşletme paneli ile müşteri aynı takvim motorunu kullanır; okuma/yazma ayrı yetkidedir. */
export function bookingRoutes(server: FastifyInstance, { services, guard }: RouteContext): void {
  const booking = services.booking;
  const business = services.businessManagement;
  server.get("/v1/businesses/:businessId/booking/catalog", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return booking.publicCatalog(userId, businessId);
  });
  server.get("/v1/businesses/:businessId/booking/slots", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const { branchId, serviceId, resourceId, day } = parse(slotsQuery, request.query);
    return booking.slots(userId, businessId, branchId, serviceId, resourceId, day);
  });
  server.post("/v1/businesses/:businessId/bookings", async (request, reply) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    const result = await booking.book(userId, businessId, parse(bookingCreateSchema, request.body));
    return reply.code(201).send(result);
  });
  server.get("/v1/businesses/:businessId/bookings/mine", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return booking.myBookings(userId, businessId);
  });
  server.put("/v1/businesses/:businessId/bookings/:id/status", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return booking.setStatus(
      { userId, businessId },
      id,
      parse(bookingStatusUpdateSchema, request.body),
    );
  });
  server.get("/v1/business/:businessId/bookings/setup", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return booking.businessSetup(await business.authorise(userId, businessId));
  });
  server.post("/v1/business/:businessId/bookings/services", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return booking.saveService(
      await business.authorise(userId, businessId),
      parse(bookingServiceBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/bookings/services/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return booking.saveService(
      await business.authorise(userId, businessId),
      parse(bookingServiceBodySchema, request.body),
      id,
    );
  });
  server.post("/v1/business/:businessId/bookings/resources", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return booking.saveResource(
      await business.authorise(userId, businessId),
      parse(bookingResourceBodySchema, request.body),
    );
  });
  server.put("/v1/business/:businessId/bookings/resources/:id", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return booking.saveResource(
      await business.authorise(userId, businessId),
      parse(bookingResourceBodySchema, request.body),
      id,
    );
  });
  server.put("/v1/business/:businessId/bookings/resources/:resourceId/hours", async (request) => {
    const { userId } = await guard(request);
    const { businessId, resourceId } = parse(resourceParams, request.params);
    return booking.saveHours(
      await business.authorise(userId, businessId),
      resourceId,
      parse(bookingHoursBodySchema, request.body).hours,
    );
  });
  server.get("/v1/business/:businessId/bookings", async (request) => {
    const { userId } = await guard(request);
    const { businessId } = parse(businessParamsSchema, request.params);
    return booking.businessBookings(await business.authorise(userId, businessId));
  });
  server.put("/v1/business/:businessId/bookings/:id/status", async (request) => {
    const { userId } = await guard(request);
    const { businessId, id } = parse(businessRecordParamsSchema, request.params);
    return booking.setStatus(
      { userId, businessId, scope: await business.authorise(userId, businessId) },
      id,
      parse(bookingStatusUpdateSchema, request.body),
    );
  });
}
