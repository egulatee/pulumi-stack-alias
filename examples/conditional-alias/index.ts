import { createConditionalAlias } from "@egulatee/pulumi-stack-alias";

/**
 * Conditional alias example using pattern matching
 *
 * This example demonstrates how to use createConditionalAlias to automatically
 * route different stacks to appropriate canonical stacks based on patterns.
 *
 * Pattern matching rules:
 * - prod stacks -> infrastructure/prod
 * - staging stacks -> infrastructure/shared
 * - dev stacks -> infrastructure/shared
 * - *-ephemeral stacks -> infrastructure/shared
 */

const alias = createConditionalAlias({
  targetProject: "infrastructure",
  patterns: [
    { pattern: "*/prod", target: "prod" },
    { pattern: "*/staging", target: "shared" },
    { pattern: "*/dev", target: "shared" },
    { pattern: "*/*-ephemeral", target: "shared" },
  ],
  defaultTarget: "shared",
  outputs: ["vpcId", "endpoint", "clusterName"],
});

export const vpcId = alias.vpcId;
export const endpoint = alias.endpoint;
export const clusterName = alias.clusterName;
