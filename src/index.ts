/**
 * @egulatee/pulumi-stack-alias
 *
 * A lightweight stack resolver library for Pulumi that enables producer-controlled
 * stack aliasing through redirect pointers. Eliminates output staleness and
 * operational overhead by using lightweight alias stacks that export only a
 * redirect pointer to the canonical stack.
 *
 * ## Producer-Controlled Redirect Pattern
 *
 * Alias stacks export a `_canonicalStack` pointer. The consumer-side resolver
 * transparently follows redirects to reach the canonical stack, ensuring outputs
 * are always fresh.
 *
 * @packageDocumentation
 */

export {
  resolveStackRef,
  matchesPattern,
} from "./alias";

export {
  ResolveStackRefOptions,
  REDIRECT_KEY,
} from "./types";

// Re-export Pulumi types for convenience
export { Output, StackReference } from "@pulumi/pulumi";
