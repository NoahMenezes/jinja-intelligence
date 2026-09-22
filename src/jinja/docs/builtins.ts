import type { DocTable } from "./types.js";

/** Jinja globals available in templates, plus the `loop` helper attributes. */
export const BUILTIN_DOCS: DocTable = {
  range: { signature: "range([start,] stop[, step])", description: "Generate numbers for looping, like Python range." },
  dict: { signature: "dict(**kwargs)", description: "Build a dict from keyword arguments." },
  lipsum: { signature: "lipsum(n=5, html=True, min=20, max=100)", description: "Generate placeholder Lorem Ipsum text." },
  cycler: { signature: "cycler(*items)", description: "Cycle through values across loop iterations." },
  joiner: { signature: "joiner(sep=', ')", description: "Separator helper that skips the first call." },
  namespace: { signature: "namespace(**kwargs)", description: "Mutable object for carrying state out of loops." },
  loop: { signature: "loop", description: "Loop helper inside for bodies: index, first, last, length and more." },
  super: { signature: "super()", description: "Render the parent block's content inside an override." },
  self: { signature: "self.name()", description: "Render a block of the current template by name." },
  true: { signature: "true", description: "Boolean true literal." },
  false: { signature: "false", description: "Boolean false literal." },
  none: { signature: "none", description: "The None literal." },
};

export const LOOP_ATTRIBUTE_DOCS: DocTable = {
  index: { signature: "loop.index", description: "1-based iteration counter." },
  index0: { signature: "loop.index0", description: "0-based iteration counter." },
  revindex: { signature: "loop.revindex", description: "1-based reverse counter." },
  revindex0: { signature: "loop.revindex0", description: "0-based reverse counter." },
  first: { signature: "loop.first", description: "True on the first iteration." },
  last: { signature: "loop.last", description: "True on the last iteration." },
  length: { signature: "loop.length", description: "Number of items in the sequence." },
  depth: { signature: "loop.depth", description: "1-based recursion depth (recursive loops)." },
  depth0: { signature: "loop.depth0", description: "0-based recursion depth (recursive loops)." },
  previtem: { signature: "loop.previtem", description: "Item from the previous iteration." },
  nextitem: { signature: "loop.nextitem", description: "Item from the next iteration." },
  changed: { signature: "loop.changed(*values)", description: "True when the values changed since last iteration." },
  cycle: { signature: "loop.cycle(*values)", description: "Cycle helper bound to the loop." },
};
