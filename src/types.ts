import * as pulumi from "@pulumi/pulumi";

/**
 * Configuration for creating a stack alias
 */
export interface AliasConfig {
  /**
   * Target organization name (defaults to current organization)
   */
  targetOrg?: string;

  /**
   * Target project name
   */
  targetProject: string;

  /**
   * Target stack name
   */
  targetStack: string;

  /**
   * List of output names to re-export from the target stack
   */
  outputs: string[];
}

/**
 * Record of aliased outputs (all are Pulumi Outputs)
 */
export type AliasExports = Record<string, pulumi.Output<any>>;

/**
 * A pattern rule for conditional aliasing
 */
export interface PatternRule {
  /**
   * Pattern in format "project/stack" with wildcard support
   * Examples: "* /prod", "myproject/ *", "* / *-ephemeral" (without spaces)
   */
  pattern: string;

  /**
   * Target stack name to use when this pattern matches
   */
  target: string;
}

/**
 * Configuration for creating a conditional alias based on pattern matching
 */
export interface ConditionalAliasConfig {
  /**
   * Target project name
   */
  targetProject: string;

  /**
   * Target organization name (defaults to current organization)
   */
  targetOrg?: string;

  /**
   * List of pattern rules (evaluated in order, first match wins)
   */
  patterns: PatternRule[];

  /**
   * Default target stack if no pattern matches (optional)
   */
  defaultTarget?: string;

  /**
   * List of output names to re-export from the target stack
   */
  outputs: string[];
}
