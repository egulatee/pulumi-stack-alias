# @egulatee/pulumi-stack-alias

A generalized stack aliasing system for Pulumi that enables transparent stack references and environment mapping.

[![CI](https://github.com/egulatee/pulumi-stack-alias/actions/workflows/ci.yml/badge.svg)](https://github.com/egulatee/pulumi-stack-alias/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@egulatee%2Fpulumi-stack-alias.svg)](https://www.npmjs.com/package/@egulatee/pulumi-stack-alias)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Problem Statement

When managing infrastructure across multiple environments (dev, staging, prod), you often want:
- **Build infrastructure** (CI runners, build services) deployed once on a shared cluster
- **Application workloads** that reference environment-specific or shared infrastructure
- **Simple, predictable naming** without complex lookup logic

Traditional approaches require consumers to know which infrastructure stack to reference, leading to complex configuration management.

## Solution: Stack-Level Aliasing

This library enables **transparent stack aliasing** where:
- `infrastructure/dev` → aliases to → `infrastructure/shared`
- `infrastructure/staging` → aliases to → `infrastructure/shared`
- `infrastructure/prod` → uses → `infrastructure/prod` (or shared)

Consumer projects use simple, predictable patterns:
```typescript
const stack = pulumi.getStack();
const infraStack = new pulumi.StackReference(`${org}/infrastructure/${stack}`);
```

No lookup logic needed! The aliasing is handled transparently at the stack level.

## Installation

```bash
npm install @egulatee/pulumi-stack-alias
```

## Quick Start

### 1. Create an Alias Stack

**In your infrastructure project:**

```typescript
// index.ts
import * as pulumi from "@pulumi/pulumi";
import { createStackAlias } from "@egulatee/pulumi-stack-alias";

const config = new pulumi.Config();
const aliasTarget = config.get("aliasTarget");

if (aliasTarget) {
  // This is an alias stack - redirect to target
  const alias = createStackAlias({
    targetProject: "infrastructure",
    targetStack: aliasTarget,
    outputs: ["vpcId", "clusterName", "endpoint"],
  });

  export const vpcId = alias.vpcId;
  export const clusterName = alias.clusterName;
  export const endpoint = alias.endpoint;
} else {
  // This is a canonical stack - create actual resources
  export const vpcId = /* your actual VPC ID */;
  export const clusterName = pulumi.output("my-cluster");
  export const endpoint = pulumi.output("https://api.example.com");
}
```

**Configure stack aliases:**

```yaml
# Pulumi.shared.yaml
config:
  # No aliasTarget = canonical stack with actual resources

# Pulumi.dev.yaml
config:
  infrastructure:aliasTarget: shared

# Pulumi.staging.yaml
config:
  infrastructure:aliasTarget: shared
```

### 2. Deploy Stacks

```bash
# Deploy canonical stack first
pulumi up --stack shared

# Deploy alias stacks
pulumi up --stack dev
pulumi up --stack staging
```

### 3. Use in Consumer Projects

```typescript
// application.ts
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

const org = pulumi.getOrganization();
const stack = pulumi.getStack();

// Simple, predictable pattern - works for any stack!
const infraStack = new pulumi.StackReference(`${org}/infrastructure/${stack}`);
const vpcId = infraStack.requireOutput("vpcId");

const subnet = new aws.ec2.Subnet("app-subnet", {
  vpcId: vpcId,
  cidrBlock: "10.0.1.0/24",
});
```

When deployed:
- `application/dev` → references `infrastructure/dev` → aliases to `infrastructure/shared` ✅
- `application/staging` → references `infrastructure/staging` → aliases to `infrastructure/shared` ✅
- `application/prod` → references `infrastructure/prod` → uses `infrastructure/prod` ✅

## CLI Tool

The package includes a CLI tool for managing stack aliases:

```bash
# Create an alias
pulumi-alias create dev shared --outputs vpcId endpoint

# List all aliases
pulumi-alias list

# Show alias info
pulumi-alias info dev

# Remove an alias
pulumi-alias remove dev --force
```

## API Reference

### `createStackAlias(config: AliasConfig): AliasExports`

Creates a stack alias that re-exports outputs from a target stack.

**Parameters:**
- `config.targetProject` - Target project name (e.g., "infrastructure")
- `config.targetStack` - Target stack name (e.g., "shared")
- `config.outputs` - Array of output names to re-export
- `config.targetOrg` - (Optional) Target organization

**Returns:** Object mapping output names to their values

**Example:**
```typescript
const alias = createStackAlias({
  targetProject: "infrastructure",
  targetStack: "shared",
  outputs: ["vpcId", "clusterName"],
});

export const vpcId = alias.vpcId;
export const clusterName = alias.clusterName;
```

### `createConditionalAlias(config: ConditionalAliasConfig): AliasExports`

Creates an alias with pattern-based conditional logic.

**Example:**
```typescript
const alias = createConditionalAlias({
  targetProject: "infrastructure",
  patterns: [
    { pattern: "ci-system/*", target: "shared" },
    { pattern: "*/dev", target: "shared" },
    { pattern: "*/staging", target: "shared" },
    { pattern: "*/prod", target: "prod" },
  ],
  defaultTarget: "shared",
  outputs: ["vpcId"],
});
```

### `createSimpleAlias(targetProject, targetStack, outputs): AliasExports`

Convenience wrapper for simple aliasing scenarios.

## Architecture

### Stack Aliasing Pattern

```
┌──────────────────────────┐
│  infrastructure/shared   │  ← Canonical stack (actual resources)
└──────────────────────────┘
         ↑
         │ references
         │
    ┌────┴────┬────────────┐
    │         │            │
┌───┴───┐ ┌──┴────┐  ┌────┴────┐
│  dev  │ │staging│  │  prod   │  ← Alias stacks (re-export outputs)
└───────┘ └───────┘  └─────────┘
```

### Benefits

✅ **Transparent Aliasing** - Consumers use predictable naming
✅ **No Lookup Logic** - No need to query which stack to use
✅ **Centralized Control** - Resource projects manage aliases
✅ **Zero Consumer Changes** - Works with existing StackReference patterns
✅ **Flexible** - Easy to change mappings without touching consumers
✅ **Type-Safe** - Full TypeScript support

## Use Cases

### Shared Build Infrastructure

Deploy CI/CD infrastructure once on a shared cluster:

```typescript
// CI system always uses shared infrastructure
// Pulumi.shared.yaml, Pulumi.dev.yaml, Pulumi.staging.yaml all exist
// but dev/staging alias to shared
```

### Environment-Specific Databases

Production uses dedicated database, dev/staging share:

```yaml
# database/Pulumi.dev.yaml
config:
  database:aliasTarget: shared

# database/Pulumi.prod.yaml
config:
  # No alias - uses dedicated prod database
```

### Multi-Region Deployments

```yaml
# infrastructure/Pulumi.us-east-1.yaml
config:
  infrastructure:aliasTarget: us-east

# infrastructure/Pulumi.us-west-1.yaml
config:
  infrastructure:aliasTarget: us-west
```

## Migration Guide

### From Hardcoded Stack Names

**Before:**
```typescript
const infraStack = new pulumi.StackReference("myorg/infrastructure/prod");
```

**After:**
```typescript
const stack = pulumi.getStack();
const infraStack = new pulumi.StackReference(`${org}/infrastructure/${stack}`);
```

Then configure aliases in your infrastructure project.

### From Config-Based Lookup

**Before:**
```typescript
const config = new pulumi.Config();
const infraEnv = config.get("infraEnv") || stack;
const infraStack = new pulumi.StackReference(`${org}/infrastructure/${infraEnv}`);
```

**After:**
```typescript
// Remove all this logic!
const infraStack = new pulumi.StackReference(`${org}/infrastructure/${stack}`);
```

Configure aliases in the infrastructure project instead.

## Examples

See the [examples](./examples) directory for complete implementations:
- [Simple Alias](./examples/simple-alias) - Basic aliasing pattern
- [Conditional Alias](./examples/conditional-alias) - Config-driven behavior

## Contributing

Contributions are welcome! Please see the [GitHub issues](https://github.com/egulatee/pulumi-stack-alias/issues) for planned features and enhancements.

## License

MIT © Eric Gulatee

## Links

- [GitHub Repository](https://github.com/egulatee/pulumi-stack-alias)
- [npm Package](https://www.npmjs.com/package/@egulatee/pulumi-stack-alias)
- [Issue Tracker](https://github.com/egulatee/pulumi-stack-alias/issues)
