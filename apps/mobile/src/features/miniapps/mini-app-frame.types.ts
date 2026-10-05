import type { MiniApp } from "@vado/contracts";
import type { Ref } from "react";

/** Kabuğun mini uygulama penceresi üzerinde yapabildiği işlemler. */
export interface MiniAppFrameHandle {
  /** Köprü yanıtını mini uygulamaya iletir. */
  post: (message: string) => void;
  reload: () => void;
}

export interface MiniAppFrameProps {
  miniApp: MiniApp;
  /** Mini uygulamanın kendi sayfasından gelen her köprü iletisi için çağrılır. */
  onMessage: (message: string) => void;
  ref: Ref<MiniAppFrameHandle>;
}
