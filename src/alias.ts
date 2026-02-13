import * as pulumi from "@pulumi/pulumi";
import { ResolveStackRefOptions, REDIRECT_KEY } from "./types";

/**
 * Resolves a stack reference by checking for producer-controlled redirects
 *
 * This function implements the Producer-Controlled Redirect pattern:
 * 1. Creates a StackReference to the target project using the current stack name
 * 2. Checks if the stack exports a `_canonicalStack` redirect pointer
 * 3. If redirect exists, follows it to the canonical stack
 * 4. Returns the canonical StackReference wrapped in Output
 *
 * The producer (infrastructure project) controls aliasing decisions by exporting
 * `_canonicalStack` in alias stacks. The consumer has zero knowledge of aliasing.
 *
 * @example
 * ```typescript
 * // Consumer code (application/index.ts)
 * import { resolveStackRef } from "@egulatee/pulumi-stack-alias";
 *
 * const infraStack = resolveStackRef("infrastructure");
 * const vpcId = infraStack.apply(ref => ref.requireOutput("vpcId"));
 *
 * // When application/dev deploys:
 * // → reads infrastructure/dev
 * // → finds _canonicalStack: "shared"
 * // → returns StackReference to infrastructure/shared
 * // → vpcId is always fresh from canonical stack!
 * ```
 *
 * @param project - Target project name (e.g., "infrastructure")
 * @param opts - Optional configuration
 * @returns Output containing the resolved StackReference
 */
export function resolveStackRef(
  project: string,
  opts?: ResolveStackRefOptions
): pulumi.Output<pulumi.StackReference> {
  const org = opts?.org || pulumi.getOrganization();
  const stack = pulumi.getStack();

  // Create initial reference to project/currentStack
  const initialStackName = `${org}/${project}/${stack}`;
  const initialRef = new pulumi.StackReference(initialStackName);

  // Check for redirect pointer
  return initialRef.getOutput(REDIRECT_KEY).apply((canonical) => {
    if (canonical && typeof canonical === "string") {
      // Redirect exists — follow it to the canonical stack
      const canonicalStackName = `${org}/${project}/${canonical}`;
      return new pulumi.StackReference(canonicalStackName);
    }

    // No redirect — this is already the canonical stack
    return initialRef;
  });
}

/**
 * Helper function for producer projects to export canonical stack pointer
 *
 * Use this in your producer project's index.ts to conditionally export
 * the redirect pointer based on configuration.
 *
 * @example
 * ```typescript
 * // infrastructure/index.ts
 * import { exportCanonicalPointer } from "@egulatee/pulumi-stack-alias";
 *
 * const config = new pulumi.Config();
 * const aliasTarget = config.get("aliasTarget");
 *
 * if (aliasTarget) {
 *   // This is an alias stack — export only the redirect pointer
 *   exportCanonicalPointer(aliasTarget);
 * } else {
 *   // This is a canonical stack — create actual resources
 *   export const vpcId = myVpc.id;
 *   export const clusterName = pulumi.output("my-cluster");
 * }
 * ```
 *
 * @param canonicalStackName - The name of the canonical stack to redirect to
 */
export function exportCanonicalPointer(canonicalStackName: string): void {
  // This function is meant to be used with dynamic exports
  // The caller should use: export const _canonicalStack = result
  // We'll just log for now, but the real pattern is direct export
  throw new Error(
    `exportCanonicalPointer should not be called directly. ` +
    `Instead, use: export const ${REDIRECT_KEY} = aliasTarget;`
  );
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
