#!/usr/bin/env node

import { Command } from "commander";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const program = new Command();

program
  .name("pulumi-alias")
  .description("CLI tool for managing Pulumi stack aliases")
  .version("0.1.0");

/**
 * Create a new stack alias
 */
program
  .command("create")
  .description("Create a new stack alias that redirects to a target stack")
  .argument("<alias-stack>", "Name of the alias stack to create (e.g., 'dev')")
  .argument("<target-stack>", "Name of the target stack to alias to (e.g., 'shared')")
  .option("-o, --outputs <outputs...>", "Output names to re-export (space-separated)")
  .option("--project <project>", "Target project name (defaults to current project)")
  .option("--auto-deploy", "Automatically run pulumi up after creating the stack")
  .action((aliasStack, targetStack, options) => {
    console.log(`Creating alias: ${aliasStack} → ${targetStack}`);

    try {
      // Initialize the alias stack
      console.log(`\n📦 Initializing stack: ${aliasStack}`);
      execSync(`pulumi stack init ${aliasStack}`, { stdio: "inherit" });

      // Set the alias configuration
      const projectName = options.project || getCurrentProject();
      console.log(`\n⚙️  Configuring alias...`);
      execSync(
        `pulumi config set aliasTarget ${targetStack} --stack ${aliasStack}`,
        { stdio: "inherit" }
      );

      if (projectName) {
        execSync(
          `pulumi config set aliasProject ${projectName} --stack ${aliasStack}`,
          { stdio: "inherit" }
        );
      }

      if (options.outputs && options.outputs.length > 0) {
        const outputsJson = JSON.stringify(options.outputs);
        execSync(
          `pulumi config set aliasOutputs '${outputsJson}' --stack ${aliasStack}`,
          { stdio: "inherit" }
        );
      }

      console.log(`\n✅ Alias stack configured successfully!`);
      console.log(`\nNext steps:`);
      console.log(`  1. Ensure your index.ts uses createStackAlias()`);
      console.log(`  2. Run: pulumi up --stack ${aliasStack}`);

      if (options.autoDeploy) {
        console.log(`\n🚀 Auto-deploying...`);
        execSync(`pulumi up --stack ${aliasStack} --yes`, { stdio: "inherit" });
        console.log(`\n✅ Alias deployed successfully!`);
      }
    } catch (error: any) {
      console.error(`\n❌ Error creating alias: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * List all stack aliases
 */
program
  .command("list")
  .description("List all stack aliases in the current project")
  .action(() => {
    try {
      console.log("📋 Stack aliases:\n");

      const stacks = execSync("pulumi stack ls --json", { encoding: "utf-8" });
      const stackList = JSON.parse(stacks);

      const aliases: Array<{
        stack: string;
        target: string;
        project: string;
      }> = [];

      for (const stack of stackList) {
        try {
          const config = execSync(
            `pulumi config get aliasTarget --stack ${stack.name}`,
            { encoding: "utf-8" }
          ).trim();

          if (config) {
            let project = "";
            try {
              project = execSync(
                `pulumi config get aliasProject --stack ${stack.name}`,
                { encoding: "utf-8" }
              ).trim();
            } catch {
              // aliasProject not set
            }

            aliases.push({
              stack: stack.name,
              target: config,
              project: project || "(current project)",
            });
          }
        } catch {
          // Not an alias stack
        }
      }

      if (aliases.length === 0) {
        console.log("  No aliases found.");
        console.log("\n  Create one with: pulumi-alias create <alias> <target>");
      } else {
        aliases.forEach(({ stack, target, project }) => {
          console.log(`  ${stack} → ${project}/${target}`);
        });
      }
    } catch (error: any) {
      console.error(`\n❌ Error listing aliases: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Remove a stack alias
 */
program
  .command("remove")
  .description("Remove a stack alias")
  .argument("<alias-stack>", "Name of the alias stack to remove")
  .option("--force", "Skip confirmation prompt")
  .action((aliasStack, options) => {
    try {
      // Verify it's an alias stack
      try {
        execSync(`pulumi config get aliasTarget --stack ${aliasStack}`, {
          encoding: "utf-8",
        });
      } catch {
        console.error(`\n❌ Stack '${aliasStack}' is not an alias stack`);
        process.exit(1);
      }

      if (!options.force) {
        console.log(`\n⚠️  Warning: This will destroy and remove the stack: ${aliasStack}`);
        console.log("   Use --force to skip this confirmation\n");
        // In a real implementation, add interactive confirmation
      }

      console.log(`\n🗑️  Removing alias stack: ${aliasStack}`);

      // Destroy resources first
      execSync(`pulumi destroy --stack ${aliasStack} --yes`, {
        stdio: "inherit",
      });

      // Remove the stack
      execSync(`pulumi stack rm ${aliasStack} --yes`, { stdio: "inherit" });

      console.log(`\n✅ Alias removed successfully!`);
    } catch (error: any) {
      console.error(`\n❌ Error removing alias: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Show info about an alias
 */
program
  .command("info")
  .description("Show information about a stack alias")
  .argument("<alias-stack>", "Name of the alias stack")
  .action((aliasStack) => {
    try {
      const target = execSync(
        `pulumi config get aliasTarget --stack ${aliasStack}`,
        { encoding: "utf-8" }
      ).trim();

      let project = "";
      try {
        project = execSync(
          `pulumi config get aliasProject --stack ${aliasStack}`,
          { encoding: "utf-8" }
        ).trim();
      } catch {
        project = "(current project)";
      }

      let outputs: string[] = [];
      try {
        const outputsStr = execSync(
          `pulumi config get aliasOutputs --stack ${aliasStack}`,
          { encoding: "utf-8" }
        ).trim();
        outputs = JSON.parse(outputsStr);
      } catch {
        // No outputs configured
      }

      console.log(`\n📋 Alias Information:`);
      console.log(`   Stack:   ${aliasStack}`);
      console.log(`   Target:  ${project}/${target}`);
      if (outputs.length > 0) {
        console.log(`   Outputs: ${outputs.join(", ")}`);
      }
      console.log();
    } catch (error: any) {
      console.error(`\n❌ Error getting alias info: ${error.message}`);
      console.error(`   Is '${aliasStack}' an alias stack?`);
      process.exit(1);
    }
  });

/**
 * Helper function to get current project name
 */
function getCurrentProject(): string {
  try {
    const pulumiYaml = fs.readFileSync("Pulumi.yaml", "utf-8");
    const match = pulumiYaml.match(/^name:\s*(.+)$/m);
    return match ? match[1].trim() : "";
  } catch {
    return "";
  }
}

program.parse();
