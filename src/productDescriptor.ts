/**
 * The descriptor half of the brand lockup: what is left of `productName` once
 * the `productNameShort` prefix is stripped. For "Keep Thy Heart Bible Reader"
 * over "Keep Thy Heart" that is "Bible Reader".
 *
 * Derived rather than added as a third `branding.json` key so the two lines of
 * the lockup can never drift out of agreement with the full name — the stacked
 * mark always reads back as exactly `productName`. If the full name ever stops
 * starting with the short name, the whole `productName` is returned, which
 * degrades to a one-line mark instead of a wrong one.
 *
 * Its own module, not part of `branding.ts`: this runs in the browser (the
 * navbar and the homepage), and `branding.ts` imports `branding.json` at module
 * scope, so re-exporting it from there would ship the whole file — the
 * `_undecided` list and the support address included — into the client bundle.
 * It takes the branding object as an argument for the same reason: browser code
 * only ever has the `ClientBranding` subset that `customFields` hands it.
 */
export function productDescriptor(
  source: {productName: string; productNameShort: string},
): string {
  const {productName, productNameShort} = source;
  if (!productNameShort || !productName.startsWith(productNameShort)) {
    return productName;
  }
  return productName.slice(productNameShort.length).trim();
}
