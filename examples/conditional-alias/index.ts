import * as pulumi from "@pulumi/pulumi";
import { createStackAlias, createConditionalAlias } from "@egulatee/pulumi-stack-alias";

/**
 * Conditional alias example using stack configuration
 *
 * This approach uses Pulumi config to determine whether this is an alias
 * stack or a canonical stack with actual resources.
 */

const config = new pulumi.Config();
const aliasTarget = config.get("aliasTarget");

if (aliasTarget) {
  // This is an alias stack - redirect to target
  const alias = createStackAlias({
    targetProject: "infrastructure",
    targetStack: aliasTarget,
    outputs: ["vpcId", "endpoint", "clusterName"],
  });

  export const vpcId = alias.vpcId;
  export const endpoint = alias.endpoint;
  export const clusterName = alias.clusterName;
} else {
  // This is a canonical stack - create actual resources
  // (In a real implementation, this would create actual infrastructure resources)

  export const vpcId = pulumi.output("vpc-12345678");
  export const endpoint = pulumi.output("https://api.example.com");
  export const clusterName = pulumi.output("my-cluster");
}
