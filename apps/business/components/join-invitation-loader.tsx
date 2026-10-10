"use client";

import dynamic from "next/dynamic";

/** Davet belirteci yalnız tarayıcıdaki adres parçasındadır; bileşen sunucuda çizilmez. */
export const JoinInvitationLoader = dynamic(
  () => import("./join-invitation").then((module) => module.JoinInvitation),
  { ssr: false, loading: () => <p>Daveti kontrol ediyorum…</p> },
);
