import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type Booking,
  bookingCatalogSchema,
  bookingCreateSchema,
  bookingListSchema,
  bookingSchema,
  bookingSlotsPageSchema,
} from "@vado/contracts";
import * as Crypto from "expo-crypto";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { api, errorMessage } from "@/api/client";
import { formatMoney } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { ErrorView, LoadingView } from "@/ui/states";

const localTime = (iso: string, timezone: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
/** Müşteri hizmet seçer, gerçek müsait saatleri sorgular ve sunucudan onay alır. */
export default function BusinessBookingScreen() {
  const { businessId } = useLocalSearchParams<{ businessId: string }>();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const now = useNow(60_000);
  const catalog = useQuery({
    queryKey: ["booking-catalog", businessId],
    enabled: !!businessId,
    queryFn: () =>
      api
        .get<unknown>(`/v1/businesses/${businessId}/booking/catalog`)
        .then((x) => bookingCatalogSchema.parse(x)),
  });
  const mine = useQuery({
    queryKey: ["booking-mine", businessId],
    enabled: !!businessId,
    queryFn: () =>
      api
        .get<unknown>(`/v1/businesses/${businessId}/bookings/mine`)
        .then((x) => bookingListSchema.parse(x)),
  });
  const branches = catalog.data?.branches ?? [];
  const branch = branches.find((b) => b.id === branchId);
  const services = (catalog.data?.services ?? []).filter((s) => s.branchId === branchId);
  const resources = (catalog.data?.resources ?? []).filter((r) => r.branchId === branchId);
  const selectedService = services.find((s) => s.id === serviceId);
  const timezone = branch?.timezone ?? "Europe/Istanbul";
  const days = Array.from({ length: 14 }, (_, index) => new Date(now + index * 86_400_000)).map(
    (value) => ({
      key: new Intl.DateTimeFormat("sv-SE", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(value),
      label: new Intl.DateTimeFormat("tr-TR", {
        timeZone: timezone,
        day: "numeric",
        month: "short",
        weekday: "short",
      }).format(value),
    }),
  );
  const slots = useQuery({
    queryKey: ["booking-slots", businessId, branchId, serviceId, resourceId, day],
    enabled: !!businessId && !!branchId && !!serviceId && !!resourceId && !!day,
    queryFn: () =>
      api
        .get<unknown>(`/v1/businesses/${businessId}/booking/slots`, {
          branchId,
          serviceId,
          resourceId,
          day,
        })
        .then((x) => bookingSlotsPageSchema.parse(x)),
    staleTime: 0,
  });
  async function reserve() {
    if (!slot || busy || selectedService === undefined) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const request = bookingCreateSchema.parse({
        branchId,
        serviceId,
        resourceId,
        startsAt: slot,
        seenPriceMinor: selectedService.priceMinor,
        seenDurationMinutes: selectedService.durationMinutes,
        requestKey: Crypto.randomUUID(),
      });
      const result = bookingSchema.parse(
        await api.post<unknown>(`/v1/businesses/${businessId}/bookings`, request),
      );
      setNotice(
        `${new Date(result.startsAt).toLocaleString("tr-TR")} için randevun onaylandı. Ödeme alınmadı.`,
      );
      setSlot("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["booking-slots", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["booking-mine", businessId] }),
      ]);
    } catch (cause) {
      setError(errorMessage(cause));
      await slots.refetch();
    } finally {
      setBusy(false);
    }
  }
  async function cancel(booking: Booking) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      bookingSchema.parse(
        await api.put<unknown>(`/v1/businesses/${businessId}/bookings/${booking.id}/status`, {
          status: "cancelled",
          expectedVersion: booking.version,
        }),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["booking-slots", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["booking-mine", businessId] }),
      ]);
      setNotice("Randevu iptal edildi.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (catalog.isPending) return <LoadingView />;
  if (catalog.isError)
    return <ErrorView error={catalog.error} onRetry={() => void catalog.refetch()} />;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppText variant="heading">VADO Randevu</AppText>
      <AppText color="muted">
        Gerçek müsaitlik bilgisiyle randevu al. Ücret varsa işletmede ödenir; uygulamada ödeme
        alınmaz.
      </AppText>
      <AppText variant="title">Şube</AppText>
      <View style={styles.choices}>
        {branches.map((b) => (
          <Chip
            key={b.id}
            label={b.name}
            selected={branchId === b.id}
            onPress={() => {
              setBranchId(b.id);
              setServiceId("");
              setResourceId("");
              setDay("");
              setSlot("");
            }}
          />
        ))}
      </View>
      {branches.length === 0 && (
        <AppText color="muted">Bu işletmenin aktif şubesi bulunmuyor.</AppText>
      )}
      {branchId !== "" && (
        <>
          <AppText variant="title">Hizmet</AppText>
          <View style={styles.choices}>
            {services.map((s) => (
              <Chip
                key={s.id}
                label={`${s.name} · ${s.durationMinutes} dk · ${formatMoney(s.priceMinor)}`}
                selected={serviceId === s.id}
                onPress={() => {
                  setServiceId(s.id);
                  setSlot("");
                }}
              />
            ))}
          </View>
          {services.length === 0 && (
            <AppText color="muted">Bu şube henüz randevu hizmeti yayımlamamış.</AppText>
          )}
          <AppText variant="title">Kaynak / Uzman</AppText>
          <View style={styles.choices}>
            {resources.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                selected={resourceId === r.id}
                onPress={() => {
                  setResourceId(r.id);
                  setSlot("");
                }}
              />
            ))}
          </View>
        </>
      )}
      {serviceId !== "" && resourceId !== "" && (
        <>
          <AppText variant="title">Gün seç</AppText>
          <View style={styles.choices}>
            {days.map((d) => (
              <Chip
                key={d.key}
                label={d.label}
                selected={day === d.key}
                onPress={() => {
                  setDay(d.key);
                  setSlot("");
                }}
              />
            ))}
          </View>
        </>
      )}
      {day !== "" && (
        <>
          <AppText variant="title">Müsait saatler</AppText>
          {slots.isFetching && <AppText color="muted">Saatler güncelleniyor…</AppText>}
          {slots.isError && <AppText color="coral">Müsaitlik alınamadı. Yeniden dene.</AppText>}
          <View style={styles.choices}>
            {slots.data?.items.map((s) => (
              <Chip
                key={s.startsAt}
                label={localTime(s.startsAt, timezone)}
                selected={slot === s.startsAt}
                onPress={() => {
                  setSlot(s.startsAt);
                }}
              />
            ))}
          </View>
          {slots.data?.items.length === 0 && !slots.isFetching && (
            <AppText color="muted">Bu gün için boş saat yok.</AppText>
          )}
          <Button
            label="Randevuyu onayla"
            loading={busy}
            disabled={!slot || slots.isFetching}
            onPress={() => void reserve()}
          />
        </>
      )}
      {error !== "" && <AppText color="coral">{error}</AppText>}
      {notice !== "" && <AppText color="teal">{notice}</AppText>}
      <AppText variant="title">Randevularım</AppText>
      {mine.isPending && <AppText color="muted">Randevular yükleniyor…</AppText>}
      {mine.data?.items.length === 0 && <AppText color="muted">Henüz randevun yok.</AppText>}
      {mine.data?.items.map((item) => (
        <View style={styles.appointment} key={item.id}>
          <AppText variant="bodyStrong">
            {item.serviceName} · {item.resourceName}
          </AppText>
          <AppText>
            {new Intl.DateTimeFormat("tr-TR", {
              timeZone: branches.find((b) => b.id === item.branchId)?.timezone ?? "Europe/Istanbul",
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(item.startsAt))}{" "}
            · {formatMoney(item.priceMinor)}
          </AppText>
          <AppText color="muted">
            {item.status === "confirmed"
              ? "Onaylandı"
              : item.status === "cancelled"
                ? "İptal edildi"
                : "Tamamlandı"}
          </AppText>
          {item.status === "confirmed" && new Date(item.startsAt).getTime() > now && (
            <Button
              label="Randevuyu iptal et"
              size="small"
              variant="secondary"
              disabled={busy}
              onPress={() => void cancel(item)}
            />
          )}
        </View>
      ))}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  appointment: { padding: space.md, borderColor: colors.line, borderWidth: 1, gap: space.xs },
});
