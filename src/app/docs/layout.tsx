import type { ReactNode } from "react";

import { DocsSidebar } from "@/components/site/docs-sidebar";
import { SiteHeader } from "@/components/site/site-header";

/*
  Docs shell. Server component. Wraps every /docs/** page with:
    - the regular SiteHeader (currentPath="/docs" so the top nav Docs tab
      stays lit regardless of which sub-route we're on),
    - a <details>-based mobile disclosure (no JS needed),
    - a persistent sidebar on ≥900px via the .docs-grid layout.
  The sidebar itself is a client component (see docs-sidebar.tsx) because
  it reads `usePathname()` to highlight the active link — the simplest
  correct pattern under React 19 + nested routes.
*/
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="terminal-stage flex flex-1 items-start justify-center px-5 py-5 sm:py-6">
      <main className="site-shell w-full max-w-6xl p-5 sm:p-6 lg:p-7">
        <SiteHeader currentPath="/docs" />

        {/*
          Mobile disclosure. Collapsed by default so the content is the
          first thing the reader sees. Desktop media query hides the
          whole <details> — the persistent sidebar in the grid below
          takes over.
        */}
        <details className="docs-mobile-nav">
          <summary>
            <span>Docs navigation</span>
          </summary>
          <div className="docs-mobile-nav-body">
            <DocsSidebar variant="mobile" />
          </div>
        </details>

        <div className="docs-grid">
          <aside className="hidden md:block">
            <DocsSidebar variant="desktop" />
          </aside>
          <article className="docs-content">{children}</article>
        </div>
      </main>
    </div>
  );
}
