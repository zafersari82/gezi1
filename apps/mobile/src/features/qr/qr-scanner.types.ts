export interface QrScannerProps {
  /** Bir kod okunduğunda içeriğiyle çağrılır. */
  onScanned: (value: string) => void;
  /** Okunan kod işlenirken yeni okuma yapılmaz. */
  paused?: boolean;
}
