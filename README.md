# @egulatee/pulumi-stack-alias

Producer-side stack aliasing for Pulumi using lightweight proxy stacks. Consumers use standard `StackReference` (zero library dependency), while producers use this library to create alias stacks that re-export outputs from canonical stacks.

[![CI](https://github.com/egulatee/pulumi-stack-alias/actions/workflows/ci.yml/badge.svg)](https://github.com/egulatee/pulumi-stack-alias/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@egulatee%2Fpulumi-stack-alias.svg)](https://www.npmjs.com/package/@egulatee/pulumi-stack-alias)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Problem

When managing infrastructure across multiple environments (dev, staging, prod), consumer projects need to reference shared infrastructure stacks. Traditional approaches either:
- Force consumers to know which stack holds the real resources
- Scatter mapping logic across every consumer project
- Require complex consumer-side resolvers with library dependencies

**The aliasing decision belongs with the producer (infrastructure project), not the consumer.**

## Solution: Producer-Controlled Proxy Stacks

Alias stacks re-export outputs from canonical stacks. Consumers use standard Pulumi `StackReference` with **no library dependency**. Producers use this library to create lightweight proxy stacks.

### How It Works

```
infrastructure/shared    → canonical stack, exports real resources
infrastructure/dev       → proxy stack, re-exports outputs from shared
infrastructure/staging   → proxy stack, re-exports outputs from shared
infrastructure/prod      → canonical stack, exports real resources
```

Consumer uses standard Pulumi:
```typescript
const stack = new pulumi.StackReference(`org/infrastructure/${pulumi.getStack()}`);
const vpcId = stack.requireOutput("vpcId");
```

**Zero consumer dependencies!** The consumer has no knowledge of aliasing. When `application/dev` deploys, it reads `infrastructure/dev`, which is a proxy stack that re-exports outputs from `infrastructure/shared`.

## Installation

**Producer projects only:**
```bash
npm install @egulatee/pulumi-stack-alias
```

**Consumer projects:** No installation needed! Use standard Pulumi `StackReference`.

## Usage

### Producer Side (Infrastructure Project)

Create alias stacks that re-export outputs from canonical stacks:

#### Simple Alias

```typescript
// infrastructure/index.ts
import { createStackAlias } from "@egulatee/pulumi-stack-alias";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const aliasTarget = config.get("aliasTarget");

if (aliasTarget) {
  // This is an alias stack — re-export outputs from target
  const alias = createStackAlias({
    targetProject: "infrastructure",
    targetStack: aliasTarget,
    outputs: ["vpcId", "endpoint", "clusterName"],
  });

  export const vpcId = alias.vpcId;
  export const endpoint = alias.endpoint;
  export const clusterName = alias.clusterName;
} else {
  // This is a canonical stack — create actual resources
  const vpc = new aws.ec2.Vpc("main", {
    cidrBlock: "10.0.0.0/16",
  });

  export const vpcId = vpc.id;
  export const endpoint = pulumi.output("https://api.example.com");
  export const clusterName = pulumi.output("my-cluster");
}
```

Configure your stack files:

```yaml
# infrastructure/Pulumi.shared.yaml
config:
  # No aliasTarget — this is the canonical stack

# infrastructure/Pulumi.dev.yaml
config:
  infrastructure:aliasTarget: shared

# infrastructure/Pulumi.staging.yaml
config:
  infrastructure:aliasTarget: shared

# infrastructure/Pulumi.prod.yaml
config:
  # No aliasTarget — this is a canonical stack (separate from shared)
```

#### Conditional Alias (Pattern-Based)

For automatic aliasing without config:

```typescript
// infrastructure/index.ts
import { createConditionalAlias } from "@egulatee/pulumi-stack-alias";

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
```

#### Simple API

Simplified API for common cases:

```typescript
import { createSimpleAlias } from "@egulatee/pulumi-stack-alias";

const alias = createSimpleAlias("infrastructure", "shared", ["vpcId"]);
export const vpcId = alias.vpcId;
```

### Consumer Side (Application Project)

Use standard Pulumi `StackReference` — **no library dependency**:

```typescript
// application/index.ts
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Standard Pulumi StackReference — no special library needed!
const infraStack = new pulumi.StackReference(
  `${pulumi.getOrganization()}/infrastructure/${pulumi.getStack()}`
);

const vpcId = infraStack.requireOutput("vpcId");
const endpoint = infraStack.requireOutput("endpoint");

const subnet = new aws.ec2.Subnet("app-subnet", {
  vpcId: vpcId,
  cidrBlock: "10.0.1.0/24",
});
```

The consumer has **zero knowledge** of aliasing. When `application/dev` deploys:
1. Reads `infrastructure/dev` (a proxy stack)
2. Gets outputs (re-exported from `infrastructure/shared`)
3. No library dependency required!

## Deployment Flow

### Initial Setup

```bash
# Deploy canonical stacks (creates real resources)
pulumi up --stack shared
pulumi up --stack prod

# Deploy alias stacks (creates proxy outputs)
pulumi up --stack dev
pulumi up --stack staging

# Consumer deployments — no alias awareness needed
cd application && pulumi up --stack dev
```

### Keeping Outputs Fresh

Alias stacks capture outputs at deploy time. When canonical stack outputs change, redeploy aliases:

```bash
# Update canonical stack
pulumi up --stack shared

# Sync alias stacks (fast — no real resources)
pulumi up --stack dev
pulumi up --stack staging
```

### CI/CD Orchestration

Automate alias synchronization in CI/CD:

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy-canonical:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy shared stack
        run: pulumi up --stack shared --yes

  sync-aliases:
    needs: deploy-canonical
    runs-on: ubuntu-latest
    strategy:
      matrix:
        stack: [dev, staging]
    steps:
      - name: Sync alias stack
        run: pulumi up --stack ${{ matrix.stack }} --yes
```

Alias deployments are fast (seconds) since they create no real resources — just re-export outputs.

## API Reference

### `createStackAlias(config)`

Creates a stack alias that re-exports outputs from a target stack.

**Parameters:**
- `config.targetProject` (string) - Target project name
- `config.targetStack` (string) - Target stack name
- `config.targetOrg` (optional string) - Target organization (defaults to current org)
- `config.outputs` (string[]) - List of output names to re-export

**Returns:** `AliasExports` - Record of Pulumi Outputs

**Example:**
```typescript
const alias = createStackAlias({
  targetProject: "infrastructure",
  targetStack: "shared",
  outputs: ["vpcId", "endpoint"],
});

export const vpcId = alias.vpcId;
export const endpoint = alias.endpoint;
```

### `createConditionalAlias(config)`

Creates a conditional alias based on pattern matching.

**Parameters:**
- `config.targetProject` (string) - Target project name
- `config.patterns` (PatternRule[]) - Pattern matching rules (evaluated in order, first match wins)
- `config.defaultTarget` (optional string) - Default target if no pattern matches
- `config.targetOrg` (optional string) - Target organization (defaults to current org)
- `config.outputs` (string[]) - List of output names to re-export

**Returns:** `AliasExports` - Record of Pulumi Outputs

**Example:**
```typescript
const alias = createConditionalAlias({
  targetProject: "infrastructure",
  patterns: [
    { pattern: "*/prod", target: "prod" },
    { pattern: "*/dev", target: "shared" },
  ],
  defaultTarget: "shared",
  outputs: ["vpcId"],
});
```

### `createSimpleAlias(targetProject, targetStack, outputs)`

Simplified API for creating aliases.

**Parameters:**
- `targetProject` (string) - Target project name
- `targetStack` (string) - Target stack name
- `outputs` (string[]) - List of output names to re-export

**Returns:** `AliasExports` - Record of Pulumi Outputs

**Example:**
```typescript
const alias = createSimpleAlias("infrastructure", "shared", ["vpcId"]);
export const vpcId = alias.vpcId;
```

### `matchesPattern(pattern, project, stack)`

Pattern matching with wildcard support.

**Wildcard rules:**
- `*` matches any value
- `*-suffix` matches strings ending with `-suffix`
- `prefix-*` matches strings starting with `prefix-`
- `exact` matches exactly

**Example:**
```typescript
import { matchesPattern } from "@egulatee/pulumi-stack-alias";

matchesPattern("*/dev", "myproject", "dev")        // true
matchesPattern("*/*-ephemeral", "app", "pr-123-ephemeral")  // true
matchesPattern("app-*/prod-*", "app-api", "prod-us")        // true
```

## Pattern Format

Patterns follow the format: `"projectPattern/stackPattern"`

Examples:
- `"*/dev"` - Any project, stack must be "dev"
- `"myproject/*"` - Project must be "myproject", any stack
- `"*/*-ephemeral"` - Any project, stack must end with "-ephemeral"
- `"app-*/prod-*"` - Project must start with "app-", stack must start with "prod-"

## Comparison with Other Approaches

| Concern | Producer Redirect (v0.1.0) | Producer Proxy (v0.2.0) | Consumer Config |
|---|---|---|---|
| Who owns mapping | Producer ✓ | Producer ✓ | Consumer |
| Consumer library dependency | Yes | **None** ✓ | Varies |
| Alias stack weight | Trivial (one pointer) | Light (output refs) | N/A |
| Output freshness | Always live ✓ | Stale until redeployed* | Always live ✓ |
| Consumer code | `resolveStackRef(...)` | `new StackReference(...)` ✓ | Custom |
| CI/CD orchestration | Not needed | Recommended | Not needed |

\* *Mitigated with CI/CD automation — alias deployments are fast (seconds)*

## Benefits

✅ **Zero consumer dependencies** - Consumers use standard Pulumi `StackReference`
✅ **Producer-controlled** - Infrastructure projects own aliasing decisions
✅ **Type-safe** - Full TypeScript support
✅ **Flexible patterns** - Wildcard pattern matching for conditional aliasing
✅ **CI/CD friendly** - Fast alias deployments (no real resources)
✅ **Simple API** - Three functions cover all use cases

## Trade-offs

**Pros:**
- Zero consumer library dependency
- Standard Pulumi patterns
- Simple mental model

**Cons:**
- Alias stacks need redeployment when canonical outputs change (mitigated with CI/CD)
- Slightly more operational overhead than redirect pattern (but eliminates consumer dependencies)

## Use Cases

### Shared Development Infrastructure

Deploy infrastructure once, route dev/staging to it:

```typescript
const alias = createConditionalAlias({
  targetProject: "infrastructure",
  patterns: [
    { pattern: "*/prod", target: "prod" },
  ],
  defaultTarget: "shared",
  outputs: ["vpcId", "endpoint"],
});
```

### Ephemeral PR Environments

Route ephemeral stacks to shared infrastructure:

```typescript
const alias = createConditionalAlias({
  targetProject: "infrastructure",
  patterns: [
    { pattern: "*/*-ephemeral", target: "shared" },
    { pattern: "*/prod", target: "prod" },
  ],
  defaultTarget: "shared",
  outputs: ["vpcId"],
});
```

### Multi-Region Deployments

Route regional stacks to regional infrastructure:

```typescript
const alias = createConditionalAlias({
  targetProject: "infrastructure",
  patterns: [
    { pattern: "*/us-*", target: "us-east" },
    { pattern: "*/eu-*", target: "eu-west" },
  ],
  outputs: ["vpcId"],
});
```

## Examples

See the [examples](./examples) directory for complete implementations:
- [Simple Alias](./examples/simple-alias) - Basic proxy stack
- [Conditional Alias](./examples/conditional-alias) - Pattern-based aliasing

## Migration Guide

### From v0.1.0 (Redirect Pattern) to v0.2.0 (Proxy Pattern)

This is a **breaking change** — complete API rewrite.

#### Producer Changes

**Before (v0.1.0):**
```typescript
// infrastructure/index.ts
const config = new pulumi.Config();
const aliasTarget = config.get("aliasTarget");

if (aliasTarget) {
  export const _canonicalStack = aliasTarget;
} else {
  export const vpcId = vpc.id;
}
```

**After (v0.2.0):**
```typescript
// infrastructure/index.ts
import { createStackAlias } from "@egulatee/pulumi-stack-alias";

const config = new pulumi.Config();
const aliasTarget = config.get("aliasTarget");

if (aliasTarget) {
  const alias = createStackAlias({
    targetProject: "infrastructure",
    targetStack: aliasTarget,
    outputs: ["vpcId", "endpoint"],
  });

  export const vpcId = alias.vpcId;
  export const endpoint = alias.endpoint;
} else {
  export const vpcId = vpc.id;
  export const endpoint = /* ... */;
}
```

#### Consumer Changes

**Before (v0.1.0):**
```typescript
import { resolveStackRef } from "@egulatee/pulumi-stack-alias";

const infraStack = resolveStackRef("infrastructure");
const vpcId = infraStack.apply(ref => ref.requireOutput("vpcId"));
```

**After (v0.2.0):**
```typescript
// NO LIBRARY IMPORT NEEDED!
const infraStack = new pulumi.StackReference(
  `${pulumi.getOrganization()}/infrastructure/${pulumi.getStack()}`
);
const vpcId = infraStack.requireOutput("vpcId");
```

#### Migration Steps

1. **Update package.json**: Bump to `@egulatee/pulumi-stack-alias@^0.2.0`
2. **Update producer code**: Replace `_canonicalStack` exports with `createStackAlias()` calls
3. **Update consumer code**: Replace `resolveStackRef()` with standard `new StackReference()`
4. **Remove consumer dependency**: Uninstall `@egulatee/pulumi-stack-alias` from consumer projects
5. **Redeploy all stacks**: Alias stacks need one-time redeployment to export new outputs
6. **Set up CI/CD**: Add alias sync jobs to keep outputs fresh

## Contributing

Contributions are welcome! Please see the [GitHub issues](https://github.com/egulatee/pulumi-stack-alias/issues) for planned features and enhancements.

## License

MIT © Eric Gulatee

## Links

- [GitHub Repository](https://github.com/egulatee/pulumi-stack-alias)
- [npm Package](https://www.npmjs.com/package/@egulatee/pulumi-stack-alias)
- [Issue Tracker](https://github.com/egulatee/pulumi-stack-alias/issues)
