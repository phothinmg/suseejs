import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import ts from "typescript";
import { getCompilerOptions } from "../src/index.js";

function createTempTsConfig(compilerOptions: Record<string, unknown>): string {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "suseejs-tsoptions-"));
	const configPath = path.join(tempDir, "tsconfig.json");
	fs.writeFileSync(
		configPath,
		JSON.stringify({ compilerOptions }, null, 2),
		"utf8",
	);
	return configPath;
}

describe("Ts Options Tests", () => {
	it("Get error when custom config path", () => {
		const originalExit = ts.sys.exit;
		let exitCode: number | undefined;

		ts.sys.exit = ((code?: number) => {
			exitCode = code;
			throw new Error("TS_SYS_EXIT");
		}) as typeof ts.sys.exit;

		try {
			assert.throws(() => getCompilerOptions("./config.json"), /TS_SYS_EXIT/);
			assert.strictEqual(exitCode, 1);
		} finally {
			ts.sys.exit = originalExit;
		}
	});

	it("Does not exit when custom config path exists", () => {
		const configPath = createTempTsConfig({ strict: true, target: "ES2020" });
		const originalExit = ts.sys.exit;
		let exitCode: number | undefined;

		ts.sys.exit = ((code?: number) => {
			exitCode = code;
			throw new Error("TS_SYS_EXIT");
		}) as typeof ts.sys.exit;

		try {
			assert.doesNotThrow(() => getCompilerOptions(configPath));
			assert.strictEqual(exitCode, undefined);
		} finally {
			ts.sys.exit = originalExit;
			fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
		}
	});

	it("Builds commonjs and esm options from custom tsconfig", () => {
		const configPath = createTempTsConfig({
			strict: true,
			target: "ES2020",
			rootDir: "src",
			outDir: "build",
			module: "ES2020",
		});

		try {
			const opts = getCompilerOptions(configPath);
			const commonjs = opts.commonjs("dist-cjs");
			const esm = opts.esm();

			assert.strictEqual(commonjs.module, ts.ModuleKind.CommonJS);
			assert.strictEqual(commonjs.outDir, "dist-cjs");
			assert.strictEqual(commonjs.strict, true);
			assert.strictEqual(commonjs.rootDir, undefined);

			assert.strictEqual(esm.module, ts.ModuleKind.ES2020);
			assert.strictEqual(esm.outDir, "dist");
			assert.strictEqual(esm.strict, true);
		} finally {
			fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
		}
	});

	it("Returns TypeScript default compiler options", () => {
		const opts = getCompilerOptions();
		assert.deepStrictEqual(
			opts.defaultOptions(),
			ts.getDefaultCompilerOptions(),
		);
	});

	it("Falls back to built-in defaults when no tsconfig is found", () => {
		const originalCwd = process.cwd();
		const tempDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "suseejs-no-config-"),
		);

		try {
			process.chdir(tempDir);
			const opts = getCompilerOptions();
			const commonjs = opts.commonjs();
			const esm = opts.esm();

			assert.strictEqual(commonjs.module, ts.ModuleKind.CommonJS);
			assert.strictEqual(commonjs.outDir, "dist");
			assert.strictEqual(commonjs.target, ts.ScriptTarget.Latest);

			assert.strictEqual(esm.module, ts.ModuleKind.ES2020);
			assert.strictEqual(esm.outDir, "dist");
			assert.strictEqual(esm.target, ts.ScriptTarget.Latest);
		} finally {
			process.chdir(originalCwd);
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
