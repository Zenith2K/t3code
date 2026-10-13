import { codeLineHeight } from "~/appearanceFonts";

import { useClientSettings } from "./useSettings";

/**
 * Code row height for virtualized @pierre/diffs views. Their metrics are read once at
 * mount, so key the view on this value to remount it when the code font size changes.
 */
export function useCodeLineHeight(): number {
  return useClientSettings((settings) => codeLineHeight(settings.fontSizeCode));
}
