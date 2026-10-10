/** Büyük tamsayı hesabı ve kararlı en büyük artık yöntemiyle her kuruş bir satıra gider. */
export function allocateDiscount(weights: readonly number[], amount: number): number[] {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    weights.some((n) => !Number.isSafeInteger(n) || n < 0)
  )
    throw new RangeError("İndirim ve satır tutarları negatif olmayan tamsayı olmalıdır");
  const total = weights.reduce((sum, n) => sum + BigInt(n), 0n);
  if (BigInt(amount) > total) throw new RangeError("İndirim satır toplamını aşamaz");
  if (total === 0n) return weights.map(() => 0);
  const parts = weights.map((n, index) => {
    const numerator = BigInt(n) * BigInt(amount);
    return { index, value: Number(numerator / total), remainder: numerator % total };
  });
  let left = amount - parts.reduce((sum, part) => sum + part.value, 0);
  const priority = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const part of priority) {
    if (left === 0) break;
    part.value += 1;
    left -= 1;
  }
  return parts.map((part) => part.value);
}

/** Kümülatif iade aşağı yuvarlanır; tam iade önceden kalan bütün puanı geri verir. */
export function proportionalPoints(points: number, refund: number, total: number): number {
  if (
    ![points, refund, total].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    total === 0 ||
    refund > total
  )
    throw new RangeError("Puan iadesi geçerli tahsilat aralığında olmalıdır");
  return Number((BigInt(points) * BigInt(refund)) / BigInt(total));
}
