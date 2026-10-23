import { Check, Copy, Maximize2 } from "lucide";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";

import { observeResize } from "../../lib/observeResize";
import {
  serializeTableElementToCsv,
  serializeTableElementToMarkdown,
} from "../../markdown-clipboard";
import { MorphIcon } from "../MorphIcon";
import { Button } from "../ui/button";
import { Dialog, DialogPanel, DialogPopup, DialogTitle } from "../ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { reportMarkdownActionFailure } from "./markdownActionFailure";

/**
 * Whether the expanded layout is wider than the chat lane, meaning the fitted
 * table had to squeeze its columns. Only then is opening it worth offering.
 * Measures with the container briefly expanded and restores it before the
 * browser paints.
 */
function tableOutgrowsLane(container: HTMLElement, table: HTMLTableElement): boolean {
  const viewport = table.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
  if (!viewport) return false;
  const scrollLeft = viewport.scrollLeft;
  const previous = container.dataset.expanded;
  container.dataset.expanded = "true";
  try {
    return table.getBoundingClientRect().width > viewport.clientWidth + 1;
  } finally {
    if (previous === undefined) delete container.dataset.expanded;
    else container.dataset.expanded = previous;
    if (scrollLeft > 0) viewport.scrollLeft = scrollLeft;
  }
}

/**
 * Tables fit the chat lane by wrapping their cells. A squeezed table opens in a
 * dialog where each column takes the width its text needs.
 */
export function MarkdownTable({ children, ...props }: ComponentProps<"table">) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [open, setOpen] = useState(false);
  const [outgrowsLane, setOutgrowsLane] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyLabel = copied ? "Copied" : "Copy table";

  const measureOutgrowsLane = () => {
    const container = containerRef.current;
    const table = tableRef.current;
    if (!container || !table) return;
    setOutgrowsLane(tableOutgrowsLane(container, table));
  };

  // A streamed cell can widen the expanded layout while the fitted table keeps
  // its size, so remeasure after every render, not only on resize.
  useLayoutEffect(measureOutgrowsLane);

  // The lane can resize without rendering this table.
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    return observeResize(table, measureOutgrowsLane);
  }, [measureOutgrowsLane]);

  const handleCopy = (format: "markdown" | "csv") => {
    const table = containerRef.current?.querySelector("table");
    if (!table || typeof navigator === "undefined" || navigator.clipboard == null) {
      return;
    }
    const text =
      format === "markdown"
        ? serializeTableElementToMarkdown(table)
        : serializeTableElementToCsv(table);
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        if (copiedTimerRef.current != null) {
          clearTimeout(copiedTimerRef.current);
        }
        setCopied(true);
        copiedTimerRef.current = setTimeout(() => {
          setCopied(false);
          copiedTimerRef.current = null;
        }, 1200);
      })
      .catch((cause) => {
        reportMarkdownActionFailure({ operation: "copy-table", format }, cause);
      });
  };

  useEffect(
    () => () => {
      if (copiedTimerRef.current != null) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    },
    [],
  );

  const copyMenu = (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button type="button" variant="ghost-muted" size="icon-xs" aria-label={copyLabel} />
              }
            />
          }
        >
          <MorphIcon className="size-3" icon={copied ? Check : Copy} />
        </TooltipTrigger>
        <TooltipPopup side="top">{copyLabel}</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        <MenuItem onClick={() => handleCopy("markdown")}>Copy as Markdown</MenuItem>
        <MenuItem onClick={() => handleCopy("csv")}>Copy as CSV</MenuItem>
      </MenuPopup>
    </Menu>
  );

  return (
    <div ref={containerRef} className="chat-markdown-table-container">
      <ScrollArea radius="none" chainVerticalScroll scrollFade className="w-full max-w-full">
        <table ref={tableRef} {...props}>
          {children}
        </table>
      </ScrollArea>
      <div className="mt-0.5 flex items-center justify-between select-none">
        {outgrowsLane ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost-muted"
                  size="icon-xs"
                  onClick={() => setOpen(true)}
                  aria-label="Open table"
                />
              }
            >
              <MorphIcon className="size-3" icon={Maximize2} />
            </TooltipTrigger>
            <TooltipPopup side="top">Open table</TooltipPopup>
          </Tooltip>
        ) : (
          <span />
        )}
        {copyMenu}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="w-auto max-w-[min(72rem,calc(100vw-2rem))]">
          <DialogTitle className="sr-only">Table</DialogTitle>
          <DialogPanel>
            {/* The dialog portals out of the message, so it brings its own markdown scope. */}
            <div className="chat-markdown">
              <div className="chat-markdown-table-container" data-expanded="true">
                <ScrollArea radius="none" scrollFade className="w-full max-w-full">
                  <table {...props}>{children}</table>
                </ScrollArea>
                <div className="mt-0.5 flex justify-end select-none">{copyMenu}</div>
              </div>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
