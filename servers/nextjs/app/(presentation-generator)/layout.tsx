import React from "react";

import { ConfigurationInitializer } from "../ConfigurationInitializer";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <ConfigurationInitializer>{children}</ConfigurationInitializer>
    </div>
  );
}
