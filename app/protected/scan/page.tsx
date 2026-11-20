import CertScanner from "@/components/CertScanner";
import { loadSettings } from "@/app/protected/settings/actions";

export default async function ScanPage() {
  const settings = await loadSettings().catch(() => null);
  return <CertScanner pricingStrategy={settings?.pricing_strategy ?? "auto"} />;
}
