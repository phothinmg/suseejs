import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const CHECK_ONLY = process.argv.includes("--check-only");

function fail(message) {
  console.error(`\n[release:ws] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[release:ws] ${message}`);
}

function run(command, options = {}) {
  execSync(command, { stdio: "inherit", ...options });
}

function capture(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateWorkspaceVersions(rootPackageJson) {
  const workspacePaths = Array.isArray(rootPackageJson.workspaces)
    ? rootPackageJson.workspaces
    : [];

  if (workspacePaths.length === 0) {
    fail("No workspaces found in root package.json.");
  }

  const packages = workspacePaths.map((workspacePath) => {
    const manifestPath = join(workspacePath, "package.json");
    const manifest = readJson(manifestPath);

    if (!manifest.name) {
      fail(`Missing package name in ${manifestPath}.`);
    }

    if (!manifest.version) {
      fail(`Missing package version in ${manifestPath}.`);
    }

    return {
      path: workspacePath,
      manifestPath,
      name: manifest.name,
      version: manifest.version,
      manifest,
    };
  });

  const workspaceNames = new Set(packages.map((pkg) => pkg.name));

  for (const pkg of packages) {
    const dependencySets = [
      pkg.manifest.dependencies || {},
      pkg.manifest.peerDependencies || {},
      pkg.manifest.optionalDependencies || {},
    ];

    for (const deps of dependencySets) {
      for (const [depName, depRange] of Object.entries(deps)) {
        if (typeof depRange !== "string" || !depRange.startsWith("workspace:")) {
          continue;
        }

        if (!workspaceNames.has(depName)) {
          fail(
            `Package ${pkg.name} references ${depName} with workspace protocol, but ${depName} is not in root workspaces.`
          );
        }

        const workspaceSpecifier = depRange.slice("workspace:".length);
        if (workspaceSpecifier.length === 0) {
          fail(`Package ${pkg.name} has invalid workspace specifier for ${depName}.`);
        }
      }
    }
  }

  info(`Validated ${packages.length} workspace package version(s) and internal workspace dependency references.`);
}

function ensureCleanGitTree() {
  const status = capture("git status --porcelain");
  if (status) {
    fail("Working tree is not clean. Commit or stash changes before release.");
  }

  info("Git working tree is clean.");
}

function ensureNpmAuth() {
  try {
    const user = capture("npm whoami");
    if (!user) {
      fail("Could not determine npm user.");
    }

    info(`Authenticated to npm as ${user}.`);
  } catch {
    fail("npm authentication check failed. Run npm login and try again.");
  }
}

function main() {
  const rootPackageJson = readJson("package.json");

  ensureCleanGitTree();
  ensureNpmAuth();
  validateWorkspaceVersions(rootPackageJson);

  info("Building workspaces...");
  run("npm run build");

  if (CHECK_ONLY) {
    info("Check-only mode enabled. Skipping publish.");
    return;
  }

  info("Publishing workspaces...");
  run("npm run publish:ws");

  info("Workspace release completed.");
}

main();
