import assert from "node:assert";
import { describe, it } from "node:test";
import { suseeCompiler } from "../src/index.js";
import ts from "typescript";

describe("SuseeCompilers", () => {
	it("compiles TypeScript to CommonJS", () => {
		const result = suseeCompiler({
			sourceCode: "export const sum = (a: number, b: number) => a + b;",
			fileName: "susee.ts",
			compilerOptions: { module: ts.ModuleKind.CommonJS, outDir: "dist" },
		});

		assert.match(result.code, /"use strict"/);
		assert.match(result.code, /exports\.sum/);
		assert.strictEqual(result.dts, undefined);
		assert.strictEqual(result.map, undefined);
		assert.strictEqual(result.file_name, "susee");
		assert.strictEqual(result.out_dir, "dist");
	});

	it("compiles TypeScript to ESM", () => {
		const result = suseeCompiler({
			sourceCode: "export const sum = (a: number, b: number) => a + b;",
			fileName: "susee.ts",
			compilerOptions: { module: ts.ModuleKind.ES2020 },
		});

		assert.doesNotMatch(result.code, /exports\./);
		assert.match(result.code, /export const sum/);
		assert.strictEqual(result.dts, undefined);
		assert.strictEqual(result.map, undefined);
	});

	it("emits declaration and source map when enabled", () => {
		const result = suseeCompiler({
			sourceCode: "export const value = 1;",
			fileName: "src/index.ts",
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				declaration: true,
				sourceMap: true,
			},
		});

		assert.ok(result.dts);
		assert.ok(result.map);
		assert.match(result.dts as string, /export declare const value = 1/);
		assert.match(result.map as string, /"version":\s*3/);
		assert.strictEqual(result.file_name, "index");
	});
});
