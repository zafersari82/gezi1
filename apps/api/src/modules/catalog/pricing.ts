/** KDV dahil tutardan vergiyi satır başına ayırır; kayan nokta hesabı yapılmaz. */
export function includedVat(grossMinor: number, vatBasisPoints: number): number {
  if (
    !Number.isSafeInteger(grossMinor) ||
    grossMinor < 0 ||
    !Number.isInteger(vatBasisPoints) ||
    vatBasisPoints < 0 ||
    vatBasisPoints > 10_000
  ) {
    throw new RangeError("Fiyat veya vergi oranı geçersiz");
  }
  const denominator = BigInt(10_000 + vatBasisPoints);
  return Number((BigInt(grossMinor) * BigInt(vatBasisPoints) + denominator / 2n) / denominator);
}
