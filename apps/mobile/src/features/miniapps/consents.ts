import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConsentCapability } from "@vado/contracts";

import {
  type ConsentMap,
  type ConsentStatus,
  consentStatus,
  type ConsentSubject,
  parseConsents,
  withConsent,
  withoutConsent,
} from "./consent-records";

/** İzinler yalnızca bu cihazda, kullanıcıya özel bir anahtarda tutulur. */
const keyFor = (userId: string) => `vado.consents.${userId}`;

export async function readConsents(userId: string): Promise<ConsentMap> {
  return parseConsents(await AsyncStorage.getItem(keyFor(userId)));
}

async function update(userId: string, change: (consents: ConsentMap) => ConsentMap): Promise<void> {
  const consents = change(await readConsents(userId));
  await AsyncStorage.setItem(keyFor(userId), JSON.stringify(consents));
}

export async function consentStatusOf(
  userId: string,
  subject: ConsentSubject,
  capability: ConsentCapability,
): Promise<ConsentStatus> {
  return consentStatus(await readConsents(userId), subject, capability);
}

export function grantConsent(
  userId: string,
  subject: ConsentSubject,
  capability: ConsentCapability,
): Promise<void> {
  return update(userId, (consents) => withConsent(consents, subject, capability));
}

export function revokeConsent(
  userId: string,
  miniAppId: string,
  capability: ConsentCapability,
): Promise<void> {
  return update(userId, (consents) => withoutConsent(consents, miniAppId, capability));
}

/** Mini uygulamanın bu cihazda sakladığı kendi verisi; kullanıcıya ve mini uygulamaya özeldir. */
export function miniAppStorage(userId: string, miniAppId: string) {
  const keyOf = (key: string) => `vado.miniapp.${miniAppId}.${userId}.${key}`;
  return {
    get: (key: string) => AsyncStorage.getItem(keyOf(key)),
    set: (key: string, value: string) => AsyncStorage.setItem(keyOf(key), value),
    remove: (key: string) => AsyncStorage.removeItem(keyOf(key)),
  };
}
