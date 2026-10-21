import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "~/hooks/useResizableWidth";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

import { RightPanelResizeHandle } from "../preview/RightPanelResizeHandle";

const MAX_TREE_WIDTH = 640;

/**
 * Right-docked file tree beside a file or diff view, resized by dragging its left edge.
 * The width persists under `storageKey` and never takes more than half the row, so the
 * content beside it keeps room in narrow panels.
 */
export function ResizableTreePane({
  storageKey,
  defaultWidth,
  minWidth,
  className,
  children,
}: {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  className?: string;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLElement>(null);
  const [rowWidth, setRowWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const row = hostRef.current?.parentElement;
    if (!row) return;
    const measure = () => setRowWidth(row.clientWidth);
    measure();
    return observeResize(row, measure);
  }, []);

  const maxWidth = rowWidth === null ? MAX_TREE_WIDTH : Math.min(MAX_TREE_WIDTH, rowWidth / 2);
  const { width, handlers } = useResizableWidth({
    storageKey,
    defaultWidth,
    // A narrow row lowers the minimum too, rather than letting it push past half the row.
    minWidth: Math.min(minWidth, maxWidth),
    maxWidth,
    edge: "left",
  });

  return (
    <aside
      ref={hostRef}
      className={cn(
        "relative flex min-h-0 w-(--resizable-width) min-w-0 shrink-0 border-l border-border/60",
        className,
      )}
      style={{ [RESIZABLE_WIDTH_PROPERTY]: `${width}px` } as CSSProperties}
    >
      <RightPanelResizeHandle handlers={handlers} className="touch-none" />
      {children}
    </aside>
  );
}
