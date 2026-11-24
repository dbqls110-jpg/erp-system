export interface QuoteItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export function quoteItemsFromJson(value: unknown): QuoteItem[] {
  if (!Array.isArray(value) || value.length > 500) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const { name, quantity, unitPrice, amount } = item as Partial<QuoteItem>;
    if (typeof name !== "string" || !name.trim() || name.length > 200
      || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000
      || typeof unitPrice !== "number" || !Number.isSafeInteger(unitPrice) || unitPrice < 0
      || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) return [];
    if (Math.round(quantity * unitPrice) !== amount) return [];
    return [{ name: name.trim(), quantity, unitPrice, amount }];
  });
}
