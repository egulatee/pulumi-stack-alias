import { createStackAlias } from "@egulatee/pulumi-stack-alias";

/**
 * Simple alias example: infrastructure/dev → infrastructure/shared
 *
 * This stack acts as an alias that redirects to the canonical 'shared' stack.
 * All outputs from the shared stack are re-exported here.
 */

const alias = createStackAlias({
  targetProject: "infrastructure",
  targetStack: "shared",
  outputs: [
    "vpcId",
    "endpoint",
    "clusterName",
  ],
});

// Re-export all outputs
export const vpcId = alias.vpcId;
export const endpoint = alias.endpoint;
export const clusterName = alias.clusterName;
