import * as pulumi from "@pulumi/pulumi";
import { AliasConfig, AliasExports, ConditionalAliasConfig } from "./types";

/**
 * Creates a stack alias that re-exports outputs from a target stack
 *
 * This is the core function for implementing transparent stack aliasing.
 * Use this in alias stacks to redirect to canonical stacks.
 *
 * @example
 * ```typescript
 * // In infrastructure/dev stack (alias to shared)
 * const alias = createStackAlias({
 *   targetProject: "infrastructure",
 *   targetStack: "shared",
 *   outputs: ["vpcId", "endpoint", "clusterName"]
 * });
 *
 * // Export the aliased outputs
 * export const vpcId = alias.vpcId;
 * export const endpoint = alias.endpoint;
 * export const clusterName = alias.clusterName;
 * ```
 *
 * @param config - Alias configuration
 * @returns Object with re-exported outputs
 */
export function createStackAlias(config: AliasConfig): AliasExports {
  const org = config.targetOrg || pulumi.getOrganization();
  const targetStackName = `${org}/${config.targetProject}/${config.targetStack}`;

  const targetStack = new pulumi.StackReference(targetStackName, {
    // Add description for clarity in Pulumi Console
    aliases: [{
      name: `alias-to-${config.targetStack}`,
    }],
  });

  const exports: AliasExports = {};

  // Re-export each specified output
  for (const outputName of config.outputs) {
    exports[outputName] = targetStack.requireOutput(outputName);
  }

  return exports;
}

/**
 * Creates a conditional alias based on pattern matching
 *
 * This allows dynamic aliasing based on the current project/stack context.
 * Useful for implementing environment-specific aliasing rules.
 *
 * @example
 * ```typescript
 * const alias = createConditionalAlias({
 *   targetProject: "infrastructure",
 *   patterns: [
 *     { pattern: "application/*", target: "shared" },
 *     { pattern: "* /dev", target: "shared" },
 *     { pattern: "* /staging", target: "shared" },
 *     { pattern: "* /prod", target: "prod" }
 *   ],
 *   defaultTarget: "shared",
 *   outputs: ["vpcId"]
 * });
 * ```
 *
 * @param config - Conditional alias configuration
 * @returns Object with re-exported outputs
 */
export function createConditionalAlias(config: ConditionalAliasConfig): AliasExports {
  const project = pulumi.getProject();
  const stack = pulumi.getStack();
  const org = pulumi.getOrganization();

  // Find matching pattern
  let targetStack = config.defaultTarget || "shared";

  for (const patternConfig of config.patterns) {
    if (matchesPattern(patternConfig.pattern, project, stack)) {
      targetStack = patternConfig.target;
      break;
    }
  }

  // Create alias to determined target
  return createStackAlias({
    targetProject: config.targetProject,
    targetStack: targetStack,
    outputs: config.outputs,
  });
}

/**
 * Pattern matching with wildcard support
 *
 * @param pattern - Pattern string (e.g., "project/*", "* /stack", "project/stack")
 * @param project - Current project name
 * @param stack - Current stack name
 * @returns True if pattern matches
 */
function matchesPattern(pattern: string, project: string, stack: string): boolean {
  const [projectPattern, stackPattern] = pattern.split("/");

  const projectMatches = projectPattern === "*" || projectPattern === project;
  const stackMatches = stackPattern === "*" || stackPattern === stack;

  return projectMatches && stackMatches;
}

/**
 * Helper function to create simple project-to-project aliases
 *
 * @example
 * ```typescript
 * // Alias entire infrastructure project to shared stack
 * const alias = createSimpleAlias("infrastructure", "shared", ["vpcId", "endpoint"]);
 * ```
 */
export function createSimpleAlias(
  targetProject: string,
  targetStack: string,
  outputs: string[]
): AliasExports {
  return createStackAlias({
    targetProject,
    targetStack,
    outputs,
  });
}
