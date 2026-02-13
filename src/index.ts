/**
 * @egulatee/pulumi-stack-alias
 *
 * Producer-side stack aliasing for Pulumi using lightweight proxy stacks.
 *
 * Consumers use standard StackReference (no library dependency).
 * Producers use this library to create alias stacks that re-export outputs.
 *
 * ## Producer-Controlled Proxy Pattern
 *
 * Alias stacks re-export outputs from canonical stacks. Consumers use standard
 * Pulumi StackReference without any library dependency. Producers use this
 * library to create proxy stacks that keep outputs in sync.
 *
 * @packageDocumentation
 */

export {
  createStackAlias,
  createConditionalAlias,
  createSimpleAlias,
  matchesPattern,
} from "./alias";

export type {
  AliasConfig,
  AliasExports,
  PatternRule,
  ConditionalAliasConfig,
} from "./types";

// Re-export Pulumi types for convenience
export { Output, StackReference } from "@pulumi/pulumi";
