/** Documentation entry: signature plus one factual sentence. */
export interface DocEntry {
  readonly signature: string;
  readonly description: string;
}

export type DocTable = Record<string, DocEntry>;
