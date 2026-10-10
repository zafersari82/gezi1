import { bookingListSchema, bookingSetupSchema, branchSchema } from "@vado/contracts";
import { redirect } from "next/navigation";
import { z } from "zod";

import { BookingsView } from "../../../components/bookings-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

/** Rezervasyon yönetimi işletme sahip ve yöneticileriyle sınırlıdır. */
export default async function BookingsPage() {
  const { membership } = await getBusinessContext();
  if (membership.role !== "owner" && membership.role !== "manager") redirect("/orders");
  const businessId = membership.businessId;
  const [setup, bookings, branches] = await Promise.all([
    apiGet(bookingSetupSchema, `/v1/business/${businessId}/bookings/setup`),
    apiGet(bookingListSchema, `/v1/business/${businessId}/bookings`),
    apiGet(z.object({ items: z.array(branchSchema) }), `/v1/business/${businessId}/branches`),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VADO Booking</span>
          <h1>Randevular</h1>
          <p className="muted">Hizmetlerini ve uygun saatleri telefonundan yönet.</p>
        </div>
      </div>
      <BookingsView
        initialSetup={setup}
        initialBookings={bookings.items}
        branches={branches.items}
      />
    </>
  );
}
