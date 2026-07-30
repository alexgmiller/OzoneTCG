import { Suspense } from "react";
import PhotosServer from "./PhotosServer";
import PhotosLoading from "./loading";

export default function PhotosPage() {
  return (
    <Suspense fallback={<PhotosLoading />}>
      <PhotosServer />
    </Suspense>
  );
}
