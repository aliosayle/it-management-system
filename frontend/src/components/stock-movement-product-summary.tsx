type Props = {
  id: string;
  sku: string;
  name: string;
  quantityOnHand: number;
  description?: string | null;
};

export function StockMovementProductSummary({
  id,
  sku,
  name,
  quantityOnHand,
  description,
}: Props) {
  const qtyLabel = Number.isFinite(quantityOnHand)
    ? quantityOnHand.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "—";

  return (
    <div
      style={{
        marginBottom: 16,
        padding: 12,
        borderRadius: 8,
        background: "var(--base-bg, rgba(0, 0, 0, 0.04))",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(120px, 32%) 1fr",
          gap: "8px 16px",
          alignItems: "start",
        }}
      >
        <strong>SKU</strong>
        <span>{sku || "—"}</span>
        <strong>Name</strong>
        <span>{name || "—"}</span>
        <strong>Qty on hand</strong>
        <span>{qtyLabel}</span>
        <strong>Product ID</strong>
        <span style={{ fontFamily: "monospace", fontSize: 12, wordBreak: "break-all" }}>{id}</span>
        {description ? (
          <>
            <strong>Description</strong>
            <span
              style={{
                whiteSpace: "pre-wrap",
                maxHeight: 120,
                overflow: "auto",
              }}
            >
              {description}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
