import { Suspense } from "react";

import PdfMakerClient from "./PdfMakerClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PdfMakerClient />
    </Suspense>
  );
}
