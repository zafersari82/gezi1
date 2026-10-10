import type { ReactNode } from "react";

import { AppShell } from "../../components/app-shell";
import { getBusinessContext } from "../../lib/context";

export default async function WorkLayout({ children }: { children: ReactNode }) {
  const context = await getBusinessContext();
  return (
    <AppShell
      name={context.membership.businessName}
      role={context.membership.role}
      canBook={context.canBook}
      blocks={context.blocks.filter(
        (block) => block.view !== "returns" || context.membership.role !== "staff",
      )}
    >
      {children}
    </AppShell>
  );
}
