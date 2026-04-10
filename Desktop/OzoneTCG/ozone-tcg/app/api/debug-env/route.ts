export async function GET() {
  return Response.json({
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    keyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 10) ?? "NOT SET",
    allEnvKeys: Object.keys(process.env).filter(k => k.includes("SUPABASE")),
  });
}
