// Generic fallback for any protected page that doesn't have its own loading.tsx
export default function ProtectedLoading() {
  return (
    <div className="flex items-center justify-center py-24 animate-pulse">
      <div className="space-y-3 w-full max-w-sm px-4">
        <div className="h-4 bg-muted rounded-lg w-3/4 mx-auto" />
        <div className="h-4 bg-muted rounded-lg w-1/2 mx-auto" />
      </div>
    </div>
  );
}
