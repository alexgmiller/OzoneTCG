import CertScanner from "@/components/CertScanner";
import { loadSettings } from "@/app/protected/settings/actions";
import { ScanModesClient } from "./ScanModesClient";

// ── Scan ──
// Cert (a slab's barcode) or Card (a photo of any card); see ScanModesClient
export default async function ScanPage() {
  const settings = await loadSettings().catch(() => null);
  return <ScanModesClient cert={<CertScanner pricingStrategy={settings?.pricing_strategy ?? "auto"} />} />;
}
