import { getCardImageStats } from "@/lib/cardImages";
import AdminImagesClient from "./AdminImagesClient";

export const dynamic = "force-dynamic";

export default async function AdminImagesPage() {
  const stats = await getCardImageStats().catch(() => null);

  return (
    <div className="py-4 space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Image Manager</h1>
        <p className="text-xs opacity-40 mt-0.5">
          {stats
            ? `${stats.total.toLocaleString()} images · ${stats.unverified.toLocaleString()} unverified · ${stats.flagged.toLocaleString()} flagged · ${stats.notFoundCached.toLocaleString()} missing`
            : "Loading stats…"}
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Verified" value={stats.verified} accent="emerald" />
          <StatCard label="Unverified" value={stats.unverified} accent="amber" />
          <StatCard label="Flagged" value={stats.flagged} accent="rose" />
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="border rounded-xl p-3 space-y-1">
            <div className="text-xs font-semibold opacity-50 uppercase tracking-widest mb-2">By Category</div>
            <Row label="Singles"  value={stats.byCategory.single} />
            <Row label="Slabs"    value={stats.byCategory.slab} />
            <Row label="Sealed"   value={stats.byCategory.sealed} />
          </div>
          <div className="border rounded-xl p-3 space-y-1">
            <div className="text-xs font-semibold opacity-50 uppercase tracking-widest mb-2">By Language</div>
            <Row label="English"  value={stats.byLanguage.English} />
            <Row label="Japanese" value={stats.byLanguage.Japanese} />
            <Row label="Chinese"  value={stats.byLanguage.Chinese} />
            {stats.byLanguage.other > 0 && <Row label="Other" value={stats.byLanguage.other} />}
          </div>
        </div>
      )}

      <AdminImagesClient />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    rose: "text-rose-500",
  };
  return (
    <div className="border rounded-xl p-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${accent ? colors[accent] : ""}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs opacity-50 mt-0.5">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="opacity-60">{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
