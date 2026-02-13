import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as pulumi from "@pulumi/pulumi";
import {
  matchesPattern,
  createStackAlias,
  createConditionalAlias,
  createSimpleAlias,
} from "../src/alias";

// Mock Pulumi runtime functions
vi.mock("@pulumi/pulumi", async () => {
  const actual = await vi.importActual("@pulumi/pulumi");
  return {
    ...actual,
    getOrganization: vi.fn(() => "test-org"),
    getProject: vi.fn(() => "test-project"),
    getStack: vi.fn(() => "dev"),
    StackReference: vi.fn(),
    Output: actual.Output,
    output: actual.output,
  };
});

describe("Pattern Matching", () => {
  describe("matchesPattern", () => {
    it("should match exact project and stack", () => {
      expect(matchesPattern("myproject/dev", "myproject", "dev")).toBe(true);
      expect(matchesPattern("myproject/dev", "myproject", "prod")).toBe(false);
      expect(matchesPattern("myproject/dev", "other", "dev")).toBe(false);
    });

    it("should match project wildcard", () => {
      expect(matchesPattern("*/dev", "myproject", "dev")).toBe(true);
      expect(matchesPattern("*/dev", "otherproject", "dev")).toBe(true);
      expect(matchesPattern("*/dev", "anyproject", "prod")).toBe(false);
    });

    it("should match stack wildcard", () => {
      expect(matchesPattern("myproject/*", "myproject", "dev")).toBe(true);
      expect(matchesPattern("myproject/*", "myproject", "prod")).toBe(true);
      expect(matchesPattern("myproject/*", "myproject", "staging")).toBe(true);
      expect(matchesPattern("myproject/*", "other", "dev")).toBe(false);
    });

    it("should match double wildcard", () => {
      expect(matchesPattern("*/*", "anyproject", "anystack")).toBe(true);
      expect(matchesPattern("*/*", "project", "stack")).toBe(true);
    });

    it("should match suffix wildcard patterns", () => {
      expect(matchesPattern("*/*-dev", "myproject", "app-dev")).toBe(true);
      expect(matchesPattern("*/*-dev", "myproject", "service-dev")).toBe(true);
      expect(matchesPattern("*/*-dev", "myproject", "dev")).toBe(false); // "dev" doesn't end with "-dev"
      expect(matchesPattern("*/*-dev", "myproject", "prod")).toBe(false);
      expect(matchesPattern("*/*-dev", "myproject", "development")).toBe(false);
    });

    it("should match prefix wildcard patterns", () => {
      expect(matchesPattern("*/prod-*", "myproject", "prod-us")).toBe(true);
      expect(matchesPattern("*/prod-*", "myproject", "prod-eu")).toBe(true);
      expect(matchesPattern("*/prod-*", "myproject", "prod")).toBe(false); // "prod" doesn't start with "prod-"
      expect(matchesPattern("*/prod-*", "myproject", "staging-prod")).toBe(false);
      expect(matchesPattern("*/prod-*", "myproject", "dev")).toBe(false);
    });

    it("should match complex wildcard combinations", () => {
      expect(matchesPattern("app-*/staging-*", "app-service", "staging-v1")).toBe(true);
      expect(matchesPattern("app-*/*-prod", "app-api", "service-prod")).toBe(true);
      expect(matchesPattern("*-infra/*-shared", "my-infra", "vpc-shared")).toBe(true);
    });

    it("should be case-sensitive", () => {
      expect(matchesPattern("MyProject/Dev", "MyProject", "Dev")).toBe(true);
      expect(matchesPattern("MyProject/Dev", "myproject", "dev")).toBe(false);
    });

    it("should throw error for invalid pattern format", () => {
      expect(() => matchesPattern("invalid", "project", "stack")).toThrow(
        'Invalid pattern format: "invalid". Expected "projectPattern/stackPattern".'
      );
      expect(() => matchesPattern("project/", "project", "stack")).toThrow(
        'Invalid pattern format: "project/". Expected "projectPattern/stackPattern".'
      );
      expect(() => matchesPattern("/stack", "project", "stack")).toThrow(
        'Invalid pattern format: "/stack". Expected "projectPattern/stackPattern".'
      );
    });
  });
});

describe("createStackAlias", () => {
  let mockStackReference: any;
  let mockRequireOutput: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireOutput = vi.fn();

    mockStackReference = vi.fn().mockImplementation((stackName: string) => {
      return {
        stackName,
        requireOutput: mockRequireOutput,
      };
    });

    (pulumi.StackReference as any).mockImplementation(mockStackReference);
    (pulumi.getOrganization as any).mockReturnValue("test-org");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create StackReference with correct full name", () => {
    mockRequireOutput.mockReturnValue(pulumi.output("test-value"));

    createStackAlias({
      targetProject: "infrastructure",
      targetStack: "shared",
      outputs: ["vpcId"],
    });

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/shared");
  });

  it("should use custom org when provided", () => {
    mockRequireOutput.mockReturnValue(pulumi.output("test-value"));

    createStackAlias({
      targetOrg: "custom-org",
      targetProject: "infrastructure",
      targetStack: "shared",
      outputs: ["vpcId"],
    });

    expect(mockStackReference).toHaveBeenCalledWith("custom-org/infrastructure/shared");
  });

  it("should re-export all specified outputs", () => {
    mockRequireOutput.mockReturnValue(pulumi.output("test-value"));

    createStackAlias({
      targetProject: "infrastructure",
      targetStack: "shared",
      outputs: ["vpcId", "endpoint", "clusterName"],
    });

    expect(mockRequireOutput).toHaveBeenCalledWith("vpcId");
    expect(mockRequireOutput).toHaveBeenCalledWith("endpoint");
    expect(mockRequireOutput).toHaveBeenCalledWith("clusterName");
    expect(mockRequireOutput).toHaveBeenCalledTimes(3);
  });

  it("should return Pulumi Outputs", () => {
    const outputValue = pulumi.output("test-value");
    mockRequireOutput.mockReturnValue(outputValue);

    const result = createStackAlias({
      targetProject: "infrastructure",
      targetStack: "shared",
      outputs: ["vpcId"],
    });

    expect(result.vpcId).toBe(outputValue);
  });

  it("should handle empty outputs array", () => {
    const result = createStackAlias({
      targetProject: "infrastructure",
      targetStack: "shared",
      outputs: [],
    });

    expect(result).toEqual({});
    expect(mockRequireOutput).not.toHaveBeenCalled();
  });

  it("should work with single output", () => {
    mockRequireOutput.mockReturnValue(pulumi.output("test-value"));

    const result = createStackAlias({
      targetProject: "infrastructure",
      targetStack: "shared",
      outputs: ["vpcId"],
    });

    expect(Object.keys(result)).toHaveLength(1);
    expect(result.vpcId).toBeDefined();
  });

  it("should work with many outputs", () => {
    mockRequireOutput.mockReturnValue(pulumi.output("test-value"));

    const result = createStackAlias({
      targetProject: "infrastructure",
      targetStack: "shared",
      outputs: ["output1", "output2", "output3", "output4", "output5"],
    });

    expect(Object.keys(result)).toHaveLength(5);
    expect(mockRequireOutput).toHaveBeenCalledTimes(5);
  });

  it("should use requireOutput instead of getOutput", () => {
    mockRequireOutput.mockReturnValue(pulumi.output("test-value"));

    createStackAlias({
      targetProject: "infrastructure",
      targetStack: "shared",
      outputs: ["vpcId"],
    });

    // Verify requireOutput was called (not getOutput)
    expect(mockRequireOutput).toHaveBeenCalled();
  });
});

describe("createConditionalAlias", () => {
  let mockStackReference: any;
  let mockRequireOutput: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireOutput = vi.fn().mockReturnValue(pulumi.output("test-value"));

    mockStackReference = vi.fn().mockImplementation((stackName: string) => {
      return {
        stackName,
        requireOutput: mockRequireOutput,
      };
    });

    (pulumi.StackReference as any).mockImplementation(mockStackReference);
    (pulumi.getOrganization as any).mockReturnValue("test-org");
    (pulumi.getProject as any).mockReturnValue("test-project");
    (pulumi.getStack as any).mockReturnValue("dev");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should use first matching pattern", () => {
    createConditionalAlias({
      targetProject: "infrastructure",
      patterns: [
        { pattern: "*/dev", target: "shared" },
        { pattern: "*/staging", target: "shared" },
        { pattern: "*/prod", target: "prod" },
      ],
      outputs: ["vpcId"],
    });

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/shared");
  });

  it("should evaluate patterns in order", () => {
    (pulumi.getStack as any).mockReturnValue("prod");

    createConditionalAlias({
      targetProject: "infrastructure",
      patterns: [
        { pattern: "*/staging", target: "shared" },
        { pattern: "*/prod", target: "prod" },
        { pattern: "*/*", target: "fallback" },
      ],
      outputs: ["vpcId"],
    });

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/prod");
  });

  it("should use defaultTarget when no pattern matches", () => {
    (pulumi.getStack as any).mockReturnValue("unknown-stack");

    createConditionalAlias({
      targetProject: "infrastructure",
      patterns: [
        { pattern: "*/dev", target: "shared" },
        { pattern: "*/prod", target: "prod" },
      ],
      defaultTarget: "fallback",
      outputs: ["vpcId"],
    });

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/fallback");
  });

  it("should throw error when no pattern matches and no defaultTarget", () => {
    (pulumi.getStack as any).mockReturnValue("unknown-stack");

    expect(() => {
      createConditionalAlias({
        targetProject: "infrastructure",
        patterns: [
          { pattern: "*/dev", target: "shared" },
          { pattern: "*/prod", target: "prod" },
        ],
        outputs: ["vpcId"],
      });
    }).toThrow("No matching pattern found for test-project/unknown-stack");
  });

  it("should work with complex pattern rules", () => {
    (pulumi.getProject as any).mockReturnValue("app-service");
    (pulumi.getStack as any).mockReturnValue("feature-ephemeral");

    createConditionalAlias({
      targetProject: "infrastructure",
      patterns: [
        { pattern: "app-*/*-ephemeral", target: "shared" },
        { pattern: "*/prod", target: "prod" },
      ],
      outputs: ["vpcId"],
    });

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/shared");
  });

  it("should support custom organization", () => {
    createConditionalAlias({
      targetProject: "infrastructure",
      targetOrg: "custom-org",
      patterns: [{ pattern: "*/dev", target: "shared" }],
      outputs: ["vpcId"],
    });

    expect(mockStackReference).toHaveBeenCalledWith("custom-org/infrastructure/shared");
  });

  it("should re-export all specified outputs", () => {
    createConditionalAlias({
      targetProject: "infrastructure",
      patterns: [{ pattern: "*/dev", target: "shared" }],
      outputs: ["vpcId", "endpoint", "clusterName"],
    });

    expect(mockRequireOutput).toHaveBeenCalledWith("vpcId");
    expect(mockRequireOutput).toHaveBeenCalledWith("endpoint");
    expect(mockRequireOutput).toHaveBeenCalledWith("clusterName");
  });

  it("should work with different stack contexts", () => {
    (pulumi.getStack as any).mockReturnValue("staging");

    createConditionalAlias({
      targetProject: "infrastructure",
      patterns: [
        { pattern: "*/dev", target: "dev" },
        { pattern: "*/staging", target: "staging-canonical" },
        { pattern: "*/prod", target: "prod" },
      ],
      outputs: ["vpcId"],
    });

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/staging-canonical");
  });

  it("should delegate to createStackAlias", () => {
    const result = createConditionalAlias({
      targetProject: "infrastructure",
      patterns: [{ pattern: "*/dev", target: "shared" }],
      outputs: ["vpcId"],
    });

    // Verify it returns the same shape as createStackAlias
    expect(result).toHaveProperty("vpcId");
    expect(result.vpcId).toBeDefined();
  });

  it("should match using current project and stack", () => {
    (pulumi.getProject as any).mockReturnValue("specific-project");
    (pulumi.getStack as any).mockReturnValue("specific-stack");

    createConditionalAlias({
      targetProject: "infrastructure",
      patterns: [
        { pattern: "specific-project/specific-stack", target: "matched" },
        { pattern: "*/*", target: "fallback" },
      ],
      outputs: ["vpcId"],
    });

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/matched");
  });
});

describe("createSimpleAlias", () => {
  let mockStackReference: any;
  let mockRequireOutput: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireOutput = vi.fn().mockReturnValue(pulumi.output("test-value"));

    mockStackReference = vi.fn().mockImplementation((stackName: string) => {
      return {
        stackName,
        requireOutput: mockRequireOutput,
      };
    });

    (pulumi.StackReference as any).mockImplementation(mockStackReference);
    (pulumi.getOrganization as any).mockReturnValue("test-org");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should create alias with simplified API", () => {
    createSimpleAlias("infrastructure", "shared", ["vpcId"]);

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/shared");
    expect(mockRequireOutput).toHaveBeenCalledWith("vpcId");
  });

  it("should use current organization", () => {
    (pulumi.getOrganization as any).mockReturnValue("my-org");

    createSimpleAlias("infrastructure", "shared", ["vpcId"]);

    expect(mockStackReference).toHaveBeenCalledWith("my-org/infrastructure/shared");
  });

  it("should work with single output", () => {
    const result = createSimpleAlias("infrastructure", "shared", ["vpcId"]);

    expect(Object.keys(result)).toHaveLength(1);
    expect(result.vpcId).toBeDefined();
  });

  it("should work with many outputs", () => {
    const result = createSimpleAlias("infrastructure", "shared", [
      "vpcId",
      "endpoint",
      "clusterName",
    ]);

    expect(Object.keys(result)).toHaveLength(3);
    expect(result.vpcId).toBeDefined();
    expect(result.endpoint).toBeDefined();
    expect(result.clusterName).toBeDefined();
  });

  it("should return Pulumi Outputs", () => {
    const result = createSimpleAlias("infrastructure", "shared", ["vpcId"]);

    expect(result.vpcId).toBeDefined();
    expect(mockRequireOutput).toHaveBeenCalledWith("vpcId");
  });

  it("should delegate to createStackAlias", () => {
    const result = createSimpleAlias("infrastructure", "shared", ["vpcId"]);

    // Verify it returns the same shape as createStackAlias
    expect(result).toHaveProperty("vpcId");
    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/shared");
  });
});
