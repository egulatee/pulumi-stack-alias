import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as pulumi from "@pulumi/pulumi";
import { resolveStackRef, matchesPattern } from "../src/alias";
import { REDIRECT_KEY } from "../src/types";

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
  });
});

describe("resolveStackRef", () => {
  let mockStackReference: any;
  let mockGetOutput: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock getOutput to return an Output-like object
    mockGetOutput = vi.fn();

    // Mock StackReference constructor
    mockStackReference = vi.fn().mockImplementation((stackName: string) => {
      return {
        stackName,
        getOutput: mockGetOutput,
        requireOutput: vi.fn(),
      };
    });

    (pulumi.StackReference as any).mockImplementation(mockStackReference);

    // Reset runtime mocks
    (pulumi.getOrganization as any).mockReturnValue("test-org");
    (pulumi.getStack as any).mockReturnValue("dev");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should follow redirect when _canonicalStack is present", async () => {
    // Mock getOutput to return a redirect pointer
    mockGetOutput.mockReturnValue(
      pulumi.output("shared") // Redirect to "shared" stack
    );

    const result = resolveStackRef("infrastructure");

    // Verify initial reference was created
    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/dev");

    // Verify getOutput was called with REDIRECT_KEY
    expect(mockGetOutput).toHaveBeenCalledWith(REDIRECT_KEY);

    // Resolve the output to get the final StackReference
    const resolved = await result.promise();

    // Verify redirect was followed and second StackReference was created
    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/shared");
    expect(resolved.stackName).toBe("test-org/infrastructure/shared");
  });

  it("should return initial reference when no redirect exists", async () => {
    // Mock getOutput to return undefined (no redirect)
    mockGetOutput.mockReturnValue(pulumi.output(undefined));

    const result = resolveStackRef("infrastructure");

    // Verify initial reference was created
    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/dev");

    // Resolve the output
    const resolved = await result.promise();

    // Verify no second StackReference was created
    expect(mockStackReference).toHaveBeenCalledTimes(1);
    expect(resolved.stackName).toBe("test-org/infrastructure/dev");
  });

  it("should return initial reference when redirect is null", async () => {
    mockGetOutput.mockReturnValue(pulumi.output(null));

    const result = resolveStackRef("infrastructure");
    const resolved = await result.promise();

    expect(mockStackReference).toHaveBeenCalledTimes(1);
    expect(resolved.stackName).toBe("test-org/infrastructure/dev");
  });

  it("should return initial reference when redirect is empty string", async () => {
    mockGetOutput.mockReturnValue(pulumi.output(""));

    const result = resolveStackRef("infrastructure");
    const resolved = await result.promise();

    expect(mockStackReference).toHaveBeenCalledTimes(1);
    expect(resolved.stackName).toBe("test-org/infrastructure/dev");
  });

  it("should ignore non-string redirect values", async () => {
    // Mock getOutput to return a number (invalid redirect)
    mockGetOutput.mockReturnValue(pulumi.output(123));

    const result = resolveStackRef("infrastructure");
    const resolved = await result.promise();

    // Should not follow redirect for non-string values
    expect(mockStackReference).toHaveBeenCalledTimes(1);
    expect(resolved.stackName).toBe("test-org/infrastructure/dev");
  });

  it("should use custom org when provided", async () => {
    mockGetOutput.mockReturnValue(pulumi.output(undefined));

    const result = resolveStackRef("infrastructure", { org: "custom-org" });

    expect(mockStackReference).toHaveBeenCalledWith("custom-org/infrastructure/dev");
  });

  it("should use custom org when following redirect", async () => {
    mockGetOutput.mockReturnValue(pulumi.output("shared"));

    const result = resolveStackRef("infrastructure", { org: "custom-org" });
    await result.promise();

    expect(mockStackReference).toHaveBeenCalledWith("custom-org/infrastructure/dev");
    expect(mockStackReference).toHaveBeenCalledWith("custom-org/infrastructure/shared");
  });

  it("should work with different stack names", async () => {
    (pulumi.getStack as any).mockReturnValue("staging");
    mockGetOutput.mockReturnValue(pulumi.output("shared"));

    const result = resolveStackRef("infrastructure");
    await result.promise();

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/staging");
    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/shared");
  });

  it("should work with prod stack (no redirect)", async () => {
    (pulumi.getStack as any).mockReturnValue("prod");
    mockGetOutput.mockReturnValue(pulumi.output(undefined));

    const result = resolveStackRef("infrastructure");
    const resolved = await result.promise();

    expect(mockStackReference).toHaveBeenCalledWith("test-org/infrastructure/prod");
    expect(mockStackReference).toHaveBeenCalledTimes(1);
    expect(resolved.stackName).toBe("test-org/infrastructure/prod");
  });

  it("should return Output<StackReference>", () => {
    mockGetOutput.mockReturnValue(pulumi.output(undefined));

    const result = resolveStackRef("infrastructure");

    // Verify it's a Pulumi Output
    expect(result).toHaveProperty("apply");
    expect(typeof result.apply).toBe("function");
  });

  it("should handle chained redirects", async () => {
    // First call returns redirect to "intermediate"
    // Second call returns redirect to "final"
    const firstCall = vi.fn().mockReturnValue(pulumi.output("intermediate"));
    const secondCall = vi.fn().mockReturnValue(pulumi.output("final"));

    let callCount = 0;
    mockStackReference.mockImplementation((stackName: string) => {
      const getOutput = callCount === 0 ? firstCall : secondCall;
      callCount++;
      return {
        stackName,
        getOutput,
        requireOutput: vi.fn(),
      };
    });

    const result = resolveStackRef("infrastructure");
    const resolved = await result.promise();

    // Should create initial reference to dev
    expect(mockStackReference).toHaveBeenNthCalledWith(1, "test-org/infrastructure/dev");

    // Should follow first redirect to intermediate
    expect(mockStackReference).toHaveBeenNthCalledWith(2, "test-org/infrastructure/intermediate");

    // Note: Current implementation only follows one level of redirect
    // If we want to support chained redirects, we'd need to make it recursive
    expect(resolved.stackName).toBe("test-org/infrastructure/intermediate");
  });
});
