# Examples

This directory contains example implementations of stack aliasing patterns.

## Simple Alias

The `simple-alias` example shows the most basic usage:
- Create an alias stack that redirects to a canonical stack
- Re-export specific outputs

**Usage:**
```typescript
import { createStackAlias } from "@egulatee/pulumi-stack-alias";

const alias = createStackAlias({
  targetProject: "infrastructure",
  targetStack: "shared",
  outputs: ["vpcId", "endpoint"],
});

export const vpcId = alias.vpcId;
```

## Conditional Alias

The `conditional-alias` example demonstrates:
- Using stack configuration to determine behavior
- Same code handles both alias and canonical stacks
- Config-driven stack behavior

**Usage:**
```typescript
const config = new pulumi.Config();
const aliasTarget = config.get("aliasTarget");

if (aliasTarget) {
  // Alias stack - redirect
  const alias = createStackAlias({ ... });
} else {
  // Canonical stack - create resources
  export const vpcId = /* actual resources */;
}
```

## Running Examples

1. Install dependencies:
   ```bash
   npm install
   ```

2. Navigate to an example:
   ```bash
   cd examples/simple-alias
   ```

3. Initialize stacks:
   ```bash
   pulumi stack init shared
   pulumi stack init dev
   ```

4. Deploy:
   ```bash
   pulumi up --stack shared  # Deploy canonical stack first
   pulumi up --stack dev     # Deploy alias stack
   ```
