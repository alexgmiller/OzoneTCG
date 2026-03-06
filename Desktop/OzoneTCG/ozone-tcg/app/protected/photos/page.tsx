import { Suspense } from "react";
import PhotosServer from "./PhotosServer";

export default function PhotosPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading deal log…</div>}>
      <PhotosServer />
    </Suspense>
  );
}
