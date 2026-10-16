import TabBar from "@/components/shell/TabBar";
import Rail from "@/components/shell/Rail";
import ActiveShowBanner from "@/components/ActiveShowBanner";
import { getActiveShow } from "@/app/protected/shows/actions";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Every page needs the workspace; say so plainly instead of a production error digest
  if (!process.env.OZONE_WORKSPACE_ID) {
    return (
      <div className="min-h-dvh bg-bg p-5 text-foreground">
        <div className="mx-auto w-full max-w-md space-y-3 rounded-2xl bg-surface p-5">
          <h1 className="text-lg font-semibold">Setup needed</h1>
          <p className="text-sm text-muted-foreground">
            The <code className="font-mono">OZONE_WORKSPACE_ID</code> environment variable is not set for this
            deployment. Add it in Vercel (Settings → Environment Variables, for Preview and Production) or in
            <code className="font-mono"> .env.local</code>, then redeploy.
          </p>
        </div>
      </div>
    );
  }

  const activeShow = await getActiveShow().catch(() => null);
  const hasActiveShow = !!activeShow;

  return (
    <div className="min-h-dvh bg-bg">
      <Rail hasActiveShow={hasActiveShow} />
      <TabBar hasActiveShow={hasActiveShow} />

      {/* Rail is fixed on md+, so content shifts right by its width.
          On mobile the floating tab bar needs clearance at the bottom. */}
      <div className="flex min-h-dvh flex-col md:pl-20">
        <ActiveShowBanner show={activeShow} />
        <main className="pb-tabbar-safe flex w-full flex-1 flex-col px-4 md:px-8 md:pb-5">
          {children}
        </main>
      </div>
    </div>
  );
}
