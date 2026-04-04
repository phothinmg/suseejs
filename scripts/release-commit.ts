import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { executeCommand } from "./execute-command.js";

type RootPackageJson = {
  version?: string;
};

async function getCommandOutput(command: string): Promise<string> {
  return await new Promise<string>((resolveOutput, reject) => {
    exec(command, (error, stdoutData) => {
      if (error) {
        reject(error);
        return;
      }
      resolveOutput(stdoutData.trim());
    });
  });
}

async function getNextCommitNumber(): Promise<number> {
  const subjects = await getCommandOutput('git log --all --format="%s"');
  const matches = subjects.match(/\(#(\d+)\)/g) ?? [];
  let maxNumber = 0;

  for (const match of matches) {
    const numberMatch = match.match(/\d+/);
    if (!numberMatch) {
      continue;
    }
    const value = Number.parseInt(numberMatch[0], 10);
    if (!Number.isNaN(value) && value > maxNumber) {
      maxNumber = value;
    }
  }

  return maxNumber + 1;
}

async function getRootVersion(): Promise<string> {
  const packageJsonPath = resolve(process.cwd(), "package.json");
  const packageJsonText = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonText) as RootPackageJson;

  if (!packageJson.version?.trim()) {
    throw new Error("Cannot find root version in package.json");
  }

  return packageJson.version.trim();
}

async function getCurrentBranch(): Promise<string> {
  const branch = await getCommandOutput("git branch --show-current");
  if (!branch) {
    throw new Error("Could not determine current branch.");
  }
  return branch;
}

async function releaseCommit() {
  const version = await getRootVersion();
  const nextCommitNumber = await getNextCommitNumber();
  const branch = await getCurrentBranch();
  const commitMessage = `📦 Release: v${version} (#${nextCommitNumber})`;

  await executeCommand("git add -A");
  await executeCommand(`git commit -m "${commitMessage}"`);
  await executeCommand(`git push origin ${branch}`);

  console.log(`Pushed ${branch} with release commit: ${commitMessage}`);
}

releaseCommit().catch((error) => {
  const text = error instanceof Error ? error.message : String(error);
  console.error(text);
  process.exit(1);
});