export const DEFAULT_VIEWPORT_WIDTH = 1280;
export const DEFAULT_VIEWPORT_HEIGHT = 720;

export function parseWidth(value: string): number {
  const width = parseInt(value, 10);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`Invalid --width: ${value}. Must be a positive integer.`);
  }
  return width;
}

/**
 * Resolve viewport dimensions (16:9).
 * When widthOverride is set, height is scaled proportionally.
 * When widthOverride is omitted and required is false, returns undefined (cloud default).
 */
export function resolveViewport(
  widthOverride?: string,
  required = true
): { width: number; height: number } | undefined {
  if (widthOverride !== undefined) {
    const width = parseWidth(widthOverride);
    const height = Math.round(
      (width * DEFAULT_VIEWPORT_HEIGHT) / DEFAULT_VIEWPORT_WIDTH
    );
    return { width, height };
  }

  if (!required) {
    return undefined;
  }

  return {
    width: DEFAULT_VIEWPORT_WIDTH,
    height: DEFAULT_VIEWPORT_HEIGHT,
  };
}
