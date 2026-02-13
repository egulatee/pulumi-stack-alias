import * as pulumi from "@pulumi/pulumi";

/**
 * The output key used to indicate a stack is an alias pointing to a canonical stack
 */
export const REDIRECT_KEY = "_canonicalStack";

/**
 * Options for resolveStackRef function
 */
export interface ResolveStackRefOptions {
  /**
   * Target organization name
   * @default pulumi.getOrganization()
   */
  org?: string;
}

/**
 * Result of stack resolution containing the canonical stack reference
 */
export interface ResolvedStack {
  /**
   * The canonical stack reference (after following any redirects)
   */
  stackRef: pulumi.StackReference;

  /**
   * Whether a redirect was followed (true if alias, false if canonical)
   */
  wasRedirected: boolean;

  /**
   * The final stack name that was resolved
   */
  resolvedStackName: string;
}
