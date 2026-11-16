import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function ErrorContent({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;

  return (
    <p className="text-sm text-muted-foreground">
      {params?.error ? `Code error: ${params.error}` : "An unspecified error occurred."}
    </p>
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sorry, something went wrong.</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Suspense>
              <ErrorContent searchParams={searchParams} />
            </Suspense>
            <Button asChild variant="outline" className="w-full">
              <Link href="/auth/login">Back to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
