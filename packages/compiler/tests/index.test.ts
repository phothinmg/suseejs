import assert from "node:assert";
import { describe, it } from "node:test";
import { SuseeCompilers } from "../src/index.js";

describe("SuseeCompilers", () => {
	it("compiles TypeScript to CommonJS", () => {
		const result = SuseeCompilers.toCommonJS({
			sourceCode: "export const sum = (a: number, b: number) => a + b;",
		});

		assert.match(result.code, /"use strict"/);
		assert.match(result.code, /exports\.sum/);
		assert.strictEqual(result.dts, undefined);
		assert.strictEqual(result.map, undefined);
	});

	it("compiles TypeScript to ESM", () => {
		const result = SuseeCompilers.toESM({
			sourceCode: "export const sum = (a: number, b: number) => a + b;",
		});

		assert.doesNotMatch(result.code, /exports\./);
		assert.match(result.code, /export const sum/);
		assert.strictEqual(result.dts, undefined);
		assert.strictEqual(result.map, undefined);
	});

	it("emits declaration and source map when enabled", () => {
		const result = SuseeCompilers.toCommonJS({
			sourceCode: "export const value = 1;",
			declare: true,
			sourceMap: true,
			file_name: "index",
		});

		assert.ok(result.dts);
		assert.ok(result.map);
		assert.match(result.dts as string, /export declare const value = 1/);
		assert.match(result.map as string, /"version":\s*3/);
	});

	it("uses custom file name in source map output", () => {
		const fileName = "custom-output";
		const result = SuseeCompilers.toESM({
			sourceCode: "export default 42;",
			file_name: fileName,
			sourceMap: true,
		});

		assert.ok(result.map);
		assert.match(result.map as string, new RegExp(`\"${fileName}\\.ts\"`));
	});

	it("compiles TSX input with JSX file extension", () => {
		const result = SuseeCompilers.toESM({
			sourceCode: "const view = <div>ok</div>; export { view };",
			fileExt: "tsx",
		});

		assert.match(result.code, /jsx-runtime/);
		assert.match(result.code, /export \{ view \}/);
	});

	it("does not throw on invalid TypeScript input for CommonJS", () => {
		const badSource = "export const broken: number = ;";

		assert.doesNotThrow(() => {
			const cjs = SuseeCompilers.toCommonJS({ sourceCode: badSource });
			assert.strictEqual(typeof cjs.code, "string");
		});
	});

	it("does not throw on invalid TypeScript input for ESM", () => {
		const badSource = "export const broken: number = ;";

		assert.doesNotThrow(() => {
			const esm = SuseeCompilers.toESM({ sourceCode: badSource });
			assert.strictEqual(typeof esm.code, "string");
		});
	});
});
