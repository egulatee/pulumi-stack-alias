import * as pulumi from "@pulumi/pulumi";
import {
  AliasConfig,
  AliasExports,
  ConditionalAliasConfig,
} from "./types";

/**
 * Creates a stack alias that re-exports outputs from a target stack
 *
 * This is the core function of the Producer-Controlled Proxy pattern.
 * It creates a StackReference to the target stack and re-exports specified outputs.
 *
 * @example
 * ```typescript
 * // In alias stack infrastructure/dev
 * import { createStackAlias } from "@egulatee/pulumi-stack-alias";
 *
 * const alias = createStackAlias({
 *   targetProject: "infrastructure",
 *   targetStack: "shared",
 *   outputs: ["vpcId", "clusterName", "endpoint"]
 * });
 *
 * export const vpcId = alias.vpcId;
 * export const clusterName = alias.clusterName;
 * export const endpoint = alias.endpoint;
 * ```
 *
 * @param config - Alias configuration
 * @returns Record of Pulumi Outputs for each specified output name
 */
export function createStackAlias(config: AliasConfig): AliasExports {
  const org = config.targetOrg || pulumi.getOrganization();
  const targetStackName = `${org}/${config.targetProject}/${config.targetStack}`;
  const targetStack = new pulumi.StackReference(targetStackName);

  const exports: AliasExports = {};
  for (const outputName of config.outputs) {
    exports[outputName] = targetStack.requireOutput(outputName);
  }

  return exports;
}

/**
 * Creates a conditional alias based on pattern matching
 *
 * Evaluates pattern rules in order and uses the first matching target.
 * Falls back to defaultTarget if no pattern matches.
 *
 * @example
 * ```typescript
 * // In infrastructure/index.ts
 * import { createConditionalAlias } from "@egulatee/pulumi-stack-alias";
 *
 * const alias = createConditionalAlias({
 *   targetProject: "infrastructure",
 *   patterns: [
 *     { pattern: "*\/prod", target: "prod" },
 *     { pattern: "*\/staging", target: "shared" },
 *     { pattern: "*\/*-ephemeral", target: "shared" }
 *   ],
 *   defaultTarget: "shared",
 *   outputs: ["vpcId", "endpoint"]
 * });
 *
 * export const vpcId = alias.vpcId;
 * export const endpoint = alias.endpoint;
 * ```
 *
 * @param config - Conditional alias configuration
 * @returns Record of Pulumi Outputs for each specified output name
 */
export function createConditionalAlias(config: ConditionalAliasConfig): AliasExports {
  const currentProject = pulumi.getProject();
  const currentStack = pulumi.getStack();

  // Find first matching pattern
  let targetStack = config.defaultTarget;
  for (const rule of config.patterns) {
    if (matchesPattern(rule.pattern, currentProject, currentStack)) {
      targetStack = rule.target;
      break;
    }
  }

  if (!targetStack) {
    throw new Error(
      `No matching pattern found for ${currentProject}/${currentStack} ` +
      `and no defaultTarget specified.`
    );
  }

  return createStackAlias({
    targetProject: config.targetProject,
    targetStack: targetStack,
    targetOrg: config.targetOrg,
    outputs: config.outputs,
  });
}

/**
 * Creates a simple alias using a simplified API
 *
 * Convenience wrapper around createStackAlias for common use cases.
 *
 * @example
 * ```typescript
 * import { createSimpleAlias } from "@egulatee/pulumi-stack-alias";
 *
 * const alias = createSimpleAlias("infrastructure", "shared", ["vpcId"]);
 * export const vpcId = alias.vpcId;
 * ```
 *
 * @param targetProject - Target project name
 * @param targetStack - Target stack name
 * @param outputs - List of output names to re-export
 * @returns Record of Pulumi Outputs for each specified output name
 */
export function createSimpleAlias(
  targetProject: string,
  targetStack: string,
  outputs: string[]
): AliasExports {
  return createStackAlias({ targetProject, targetStack, outputs });
}

/**
 * Pattern matching with wildcard support
 *
 * Supports wildcards (*) in project and stack positions, as well as
 * prefix and suffix wildcards.
 *
 * Pattern format: "projectPattern/stackPattern"
 *
 * Wildcard rules:
 * - "*" matches any value
 * - "*-suffix" matches any string ending with "-suffix"
 * - "prefix-*" matches any string starting with "prefix-"
 * - "exact" matches exactly "exact"
 *
 * @example
 * ```typescript
 * matchesPattern("myproject/*", "myproject", "dev") // true
 * matchesPattern("*\/dev", "anyproject", "dev") // true
 * matchesPattern("*\/*-dev", "app", "service-dev") // true
 * ```
 *
 * @param pattern - Pattern string (e.g., "myproject/*", "*\/dev")
 * @param project - Current project name to match against
 * @param stack - Current stack name to match against
 * @returns True if pattern matches the project/stack combination
 */
export function matchesPattern(pattern: string, project: string, stack: string): boolean {
  const [projectPattern, stackPattern] = pattern.split("/");

  if (!projectPattern || !stackPattern) {
    throw new Error(
      `Invalid pattern format: "${pattern}". Expected "projectPattern/stackPattern".`
    );
  }

  const projectMatches = matchesWildcard(projectPattern, project);
  const stackMatches = matchesWildcard(stackPattern, stack);

  return projectMatches && stackMatches;
}

/**
 * Wildcard matching for a single component
 *
 * Supports:
 * - "*" matches anything
 * - "*-suffix" matches strings ending with suffix
 * - "prefix-*" matches strings starting with prefix
 * - "exact" matches exactly
 *
 * @internal
 * @param pattern - Pattern string (may contain wildcards)
 * @param value - Value to match against pattern
 * @returns True if value matches pattern
 */
function matchesWildcard(pattern: string, value: string): boolean {
  // Exact wildcard - matches anything
  if (pattern === "*") {
    return true;
  }

  // Suffix wildcard: *-dev matches foo-dev, bar-dev
  if (pattern.startsWith("*")) {
    const suffix = pattern.substring(1);
    return value.endsWith(suffix);
  }

  // Prefix wildcard: prod-* matches prod-us, prod-eu
  if (pattern.endsWith("*")) {
    const prefix = pattern.substring(0, pattern.length - 1);
    return value.startsWith(prefix);
  }

  // Exact match
  return pattern === value;
}
