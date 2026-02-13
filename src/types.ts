import * as pulumi from "@pulumi/pulumi";

/**
 * Configuration for creating a stack alias
 */
export interface AliasConfig {
  /**
   * Target organization (defaults to current organization)
   */
  targetOrg?: string;

  /**
   * Target project name (e.g., "infrastructure")
   */
  targetProject: string;

  /**
   * Target stack name (e.g., "shared")
   */
  targetStack: string;

  /**
   * List of output names to re-export from the target stack
   */
  outputs: string[];
}

/**
 * Stack alias exports - maps output names to their values
 */
export type AliasExports = Record<string, pulumi.Output<any>>;

/**
 * Pattern matching configuration for dynamic alias resolution
 */
export interface PatternConfig {
  /**
   * Pattern string (supports wildcards)
   * Examples: "projectname/stackname", "projectname/*", "* /stackname"
   */
  pattern: string;

  /**
   * Target stack to alias to
   */
  target: string;
}

/**
 * Configuration for conditional aliasing behavior
 */
export interface ConditionalAliasConfig {
  /**
   * Target project name
   */
  targetProject: string;

  /**
   * Mapping patterns (evaluated in order)
   */
  patterns: PatternConfig[];

  /**
   * Default target if no pattern matches
   */
  defaultTarget?: string;

  /**
   * List of outputs to re-export
   */
  outputs: string[];
}
