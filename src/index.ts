/**
 * @egulatee/pulumi-stack-alias
 *
 * A generalized stack aliasing system for Pulumi that enables transparent
 * stack references and environment mapping.
 *
 * @packageDocumentation
 */

export {
  createStackAlias,
  createConditionalAlias,
  createSimpleAlias,
} from "./alias";

export {
  AliasConfig,
  AliasExports,
  PatternConfig,
  ConditionalAliasConfig,
} from "./types";

// Re-export Pulumi types for convenience
export { Output, StackReference } from "@pulumi/pulumi";
