# @egulatee/pulumi-stack-alias

A lightweight Pulumi library that enables **producer-controlled stack aliasing** through redirect pointers. Eliminates output staleness and operational overhead while keeping aliasing decisions with the infrastructure project.

[![CI](https://github.com/egulatee/pulumi-stack-alias/actions/workflows/ci.yml/badge.svg)](https://github.com/egulatee/pulumi-stack-alias/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@egulatee%2Fpulumi-stack-alias.svg)](https://www.npmjs.com/package/@egulatee/pulumi-stack-alias)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Problem

When managing infrastructure across multiple environments (dev, staging, prod), consumer projects need to reference shared infrastructure stacks. Traditional approaches either:
- Force consumers to know which stack holds the real resources
- Scatter mapping logic across every consumer project
- Create heavy proxy stacks that re-export all outputs (causing staleness)

**The aliasing decision belongs with the producer (infrastructure project), not the consumer.**

## Solution: Producer-Controlled Redirect

Alias stacks export a single `_canonicalStack` redirect pointer instead of re-exporting all outputs. The consumer-side resolver transparently follows redirects to reach the canonical stack, ensuring outputs are always fresh.

### How It Works

```
infrastructure/shared    → canonical stack, exports real resources
infrastructure/dev       → alias stack, exports only { _canonicalStack: "shared" }
infrastructure/staging   → alias stack, exports only { _canonicalStack: "shared" }
infrastructure/prod      → canonical stack (no _canonicalStack), exports real resources
```

Consumer calls `resolveStackRef("infrastructure")`:
1. Creates a `StackReference` to `infrastructure/${currentStack}` (e.g., `infrastructure/dev`)
2. Checks for `_canonicalStack` output
3. If present, follows the redirect to `infrastructure/shared`
4. If absent, returns the current reference (already canonical)

## Installation

```bash
npm install @egulatee/pulumi-stack-alias
```

## Usage

### Producer Side (Infrastructure Project)

Create lightweight alias stacks that export only a redirect pointer:

```typescript
// infrastructure/index.ts
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();
const aliasTarget = config.get("aliasTarget");

if (aliasTarget) {
  // This is an alias stack — export only the redirect pointer
  export const _canonicalStack = aliasTarget;
} else {
  // This is a canonical stack — create actual resources
  const vpc = new aws.ec2.Vpc("main", {
    cidrBlock: "10.0.0.0/16",
  });

  export const vpcId = vpc.id;
  export const clusterName = pulumi.output("my-cluster");
  export const endpoint = pulumi.output("https://api.example.com");
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

Deploy your stacks:

```bash
# Deploy canonical stacks (creates real resources)
pulumi up --stack shared
pulumi up --stack prod

# Deploy alias stacks (one-time, trivial — just sets a pointer)
pulumi up --stack dev
pulumi up --stack staging
```

### Consumer Side (Application Project)

Use the resolver to transparently follow redirects:

```typescript
// application/index.ts
import * as pulumi from "@pulumi/pulumi";
import { resolveStackRef } from "@egulatee/pulumi-stack-alias";

const infraStack = resolveStackRef("infrastructure");
const vpcId = infraStack.apply(ref => ref.requireOutput("vpcId"));

const subnet = new aws.ec2.Subnet("app-subnet", {
  vpcId: vpcId,
  cidrBlock: "10.0.1.0/24",
});
```

The consumer has **zero knowledge** of the aliasing. When `application/dev` deploys:
1. Resolver reads `infrastructure/dev`
2. Finds `_canonicalStack: "shared"`
3. Returns `StackReference` to `infrastructure/shared`
4. Outputs are always fresh from the canonical stack!

## Deployment Flow

```bash
# Deploy canonical stack (creates real resources)
pulumi up --stack shared

# Deploy alias stacks (one-time, trivial)
pulumi up --stack dev
pulumi up --stack staging

# Consumer deployments — no alias awareness needed
cd application && pulumi up --stack dev
# → resolver reads infrastructure/dev
# → follows _canonicalStack
# → reads infrastructure/shared
```

## Why Output Staleness Is Gone

Alias stacks export only `_canonicalStack: "shared"` — a string that almost never changes. The actual resource outputs (VPC IDs, endpoints, cluster names) are read **live** from the canonical stack at consumer deploy time.

You only need to redeploy an alias stack if the redirect itself changes (e.g., moving `dev` from `shared` to its own dedicated stack).

## API Reference

### `resolveStackRef(project, opts?)`

Resolves a stack reference by checking for producer-controlled redirects.

**Parameters:**
- `project` (string) - Target project name (e.g., `"infrastructure"`)
- `opts` (optional)
  - `org` (string) - Target organization (defaults to current org)

**Returns:** `pulumi.Output<pulumi.StackReference>` - The resolved stack reference

**Example:**
```typescript
const infraStack = resolveStackRef("infrastructure");
const vpcId = infraStack.apply(ref => ref.requireOutput("vpcId"));
```

### `matchesPattern(pattern, project, stack)`

Pattern matching with wildcard support. Useful for producer-side conditional logic.

**Wildcard rules:**
- `*` matches any value
- `*-suffix` matches strings ending with `-suffix`
- `prefix-*` matches strings starting with `prefix-`
- `exact` matches exactly

**Example:**
```typescript
import { matchesPattern } from "@egulatee/pulumi-stack-alias";

if (matchesPattern("*/dev", currentProject, currentStack)) {
  export const _canonicalStack = "shared";
}
```

### Constants

#### `REDIRECT_KEY`

The output key used to indicate a stack is an alias: `"_canonicalStack"`

## Pattern Matching for Producer Logic

You can use pattern matching in your producer project to conditionally set redirects:

```typescript
// infrastructure/index.ts
import * as pulumi from "@pulumi/pulumi";
import { matchesPattern } from "@egulatee/pulumi-stack-alias";

const project = pulumi.getProject();
const stack = pulumi.getStack();

// Pattern-based aliasing rules
const patterns = [
  { pattern: "*/dev", target: "shared" },
  { pattern: "*/staging", target: "shared" },
  { pattern: "*/*-ephemeral", target: "shared" },
];

let canonicalStack: string | undefined;
for (const p of patterns) {
  if (matchesPattern(p.pattern, project, stack)) {
    canonicalStack = p.target;
    break;
  }
}

if (canonicalStack) {
  // This is an alias stack
  export const _canonicalStack = canonicalStack;
} else {
  // This is a canonical stack — create resources
  export const vpcId = /* ... */;
}
```

## Comparison with Other Approaches

| Concern | Full Proxy Stacks | Consumer Config | Producer-Controlled Redirect |
|---|---|---|---|
| Who owns mapping | Producer | Consumer | Producer ✓ |
| Consumer config needed | None ✓ | Yes (per stack) | None ✓ |
| Alias stack weight | Heavy (all outputs) | N/A | Trivial (one pointer) ✓ |
| Output freshness | Stale until redeployed | Always live ✓ | Always live ✓ |
| Redeploy aliases when canonical changes | Yes, every time | N/A | No ✓ |
| Consumer code | `new StackReference(...)` ✓ | Custom resolver | `resolveStackRef(...)` |
| Operational overhead | High | Low ✓ | Low ✓ |

## Benefits

✅ **Producer-controlled** - Infrastructure projects own aliasing decisions
✅ **Always fresh** - Outputs are read live from canonical stacks
✅ **Lightweight** - Alias stacks export only a redirect pointer
✅ **Zero consumer config** - Consumers have no aliasing awareness
✅ **Flexible** - Easy to change mappings without touching consumers
✅ **Type-safe** - Full TypeScript support

## Use Cases

### Shared Development Infrastructure

Deploy CI/CD infrastructure once on a shared cluster, route dev/staging to it:

```yaml
# infrastructure/Pulumi.dev.yaml
config:
  infrastructure:aliasTarget: shared

# infrastructure/Pulumi.staging.yaml
config:
  infrastructure:aliasTarget: shared
```

### Environment-Specific Production

Production uses dedicated infrastructure, dev/staging share:

```yaml
# infrastructure/Pulumi.prod.yaml
config:
  # No alias — dedicated prod infrastructure

# infrastructure/Pulumi.dev.yaml
config:
  infrastructure:aliasTarget: shared
```

### Multi-Region Deployments

Route regional stacks to regional canonical infrastructure:

```yaml
# infrastructure/Pulumi.us-east-1.yaml
config:
  infrastructure:aliasTarget: us-east

# infrastructure/Pulumi.us-west-1.yaml
config:
  infrastructure:aliasTarget: us-west
```

## Examples

See the [examples](./examples) directory for complete implementations:
- [Simple Redirect](./examples/simple-redirect) - Basic producer-controlled aliasing
- [Pattern-Based](./examples/pattern-based) - Conditional redirect logic

## Migration from Previous Versions

If you were using the old `createStackAlias()` pattern (full proxy stacks), migrate to the Producer-Controlled Redirect pattern:

**Before (v1.x - Full Proxy Stacks):**
```typescript
// infrastructure/index.ts - OLD
const alias = createStackAlias({
  targetProject: "infrastructure",
  targetStack: "shared",
  outputs: ["vpcId", "endpoint"],
});
export const vpcId = alias.vpcId;
export const endpoint = alias.endpoint;
```

**After (v2.x - Producer-Controlled Redirect):**
```typescript
// infrastructure/index.ts - NEW
const config = new pulumi.Config();
const aliasTarget = config.get("aliasTarget");

if (aliasTarget) {
  export const _canonicalStack = aliasTarget;
} else {
  export const vpcId = /* actual resource */;
  export const endpoint = /* actual resource */;
}
```

**Consumer code changes:**
```typescript
// Before
const infraStack = new pulumi.StackReference(`${org}/infrastructure/${stack}`);
const vpcId = infraStack.requireOutput("vpcId");

// After
const infraStack = resolveStackRef("infrastructure");
const vpcId = infraStack.apply(ref => ref.requireOutput("vpcId"));
```

## Contributing

Contributions are welcome! Please see the [GitHub issues](https://github.com/egulatee/pulumi-stack-alias/issues) for planned features and enhancements.

## License

MIT © Eric Gulatee

## Links

- [GitHub Repository](https://github.com/egulatee/pulumi-stack-alias)
- [npm Package](https://www.npmjs.com/package/@egulatee/pulumi-stack-alias)
- [Issue Tracker](https://github.com/egulatee/pulumi-stack-alias/issues)
