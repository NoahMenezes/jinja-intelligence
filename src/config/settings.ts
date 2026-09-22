/** User-facing server settings. Extended by later phases; unknown keys ignored. */
export interface ServerSettings {
  /** Maximum retained log lines for future file logging. Unused in Phase 7. */
  readonly maxLogLines?: number;
  /** Reserved for Phase 16 template-directory configuration. */
  readonly templateExtensions?: readonly string[];
}

export const DEFAULT_SETTINGS: Required<Pick<ServerSettings, "maxLogLines">> & {
  readonly templateExtensions: readonly string[];
} = {
  maxLogLines: 500,
  templateExtensions: [".jinja", ".jinja2", ".j2"],
};

/** Merge partial user settings over defaults. Total: never throws. */
export function resolveSettings(input?: Partial<ServerSettings> | null): typeof DEFAULT_SETTINGS {
  if (input === undefined || input === null || typeof input !== "object") {
    return DEFAULT_SETTINGS;
  }
  const maxLogLines =
    typeof input.maxLogLines === "number" && Number.isFinite(input.maxLogLines) && input.maxLogLines > 0
      ? Math.floor(input.maxLogLines)
      : DEFAULT_SETTINGS.maxLogLines;
  const templateExtensions = Array.isArray(input.templateExtensions)
    ? input.templateExtensions.filter((e): e is string => typeof e === "string" && e.length > 0)
    : [...DEFAULT_SETTINGS.templateExtensions];
  return { maxLogLines, templateExtensions };
}
