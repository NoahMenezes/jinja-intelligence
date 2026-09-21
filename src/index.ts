export const SERVER_NAME = "jinja-intelligence";
export const SERVER_VERSION = "0.1.0";

export type { DocumentVersion, Position, Range, TextEdit, UriString } from "./types/index.js";
export * from "./utils/ranges.js";
export * from "./utils/strings.js";
export * from "./utils/paths.js";
export { Document } from "./documents/document.js";
export { DocumentManager } from "./documents/document-manager.js";
export * from "./documents/offsets.js";
