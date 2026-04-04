import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import exportDefaultHandlers from "../src/index.mjs";

function createDep(fileName: string, sourceCode: string) {
	return {
		fileName,
		sourceCode,
		sourceFile: ts.createSourceFile(
			fileName,
			sourceCode,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		),
	};
}

describe("Export Default Handler Tests", () => {
	it("renames named default function export and updates importer usages", async () => {
		const deps = [
			createDep(
				"/virtual/foo.ts",
				"export default function foo() { return 1; }\n",
			),
			createDep(
				"/virtual/main.ts",
				"import foo from './foo.js';\nconst value = foo();\nexport { foo, value };\n",
			),
		];

		const result = await exportDefaultHandlers(deps, {} as ts.CompilerOptions);
		const output = result.map((entry) => entry.sourceCode).join("\n");

		assert.match(
			output,
			/export default function __exportDefault__foo_\d+\(\) \{ return 1; \}/,
		);
		assert.match(
			output,
			/import __exportDefault__foo_\d+ from '\.\/foo\.js';/,
		);
		assert.match(output, /const value = __exportDefault__foo_\d+\(\);/);
		assert.match(output, /export \{ __exportDefault__foo_\d+, value \};/);
	});

	it("renames named default class export and updates new expression", async () => {
		const deps = [
			createDep("/virtual/model.ts", "export default class Model {}\n"),
			createDep(
				"/virtual/main.ts",
				"import Model from './model.js';\nconst instance = new Model();\nexport { Model, instance };\n",
			),
		];

		const result = await exportDefaultHandlers(deps, {} as ts.CompilerOptions);
		const output = result.map((entry) => entry.sourceCode).join("\n");

		assert.match(output, /export default class __exportDefault__Model_\d+ \{/);
		assert.match(
			output,
			/import __exportDefault__Model_\d+ from '\.\/model\.js';/,
		);
		assert.match(output, /const instance = new __exportDefault__Model_\d+\(\);/);
		assert.match(output, /export \{ __exportDefault__Model_\d+, instance \};/);
	});

	it("rewrites imported default identifier in property access", async () => {
		const deps = [
			createDep(
				"/virtual/foo.ts",
				"export default function foo() { return 1; }\n",
			),
			createDep(
				"/virtual/main.ts",
				"import foo from './foo.js';\nconst name = foo.name;\nexport { name };\n",
			),
		];

		const result = await exportDefaultHandlers(deps, {} as ts.CompilerOptions);
		const output = result.map((entry) => entry.sourceCode).join("\n");

		assert.match(output, /import __exportDefault__foo_\d+ from '\.\/foo\.js';/);
		assert.match(output, /const name = __exportDefault__foo_\d+\.name;/);
	});

	it("resets export-default rename state between runs", async () => {
		const deps = [
			createDep(
				"/virtual/foo.ts",
				"export default function foo() { return 1; }\n",
			),
			createDep(
				"/virtual/main.ts",
				"import foo from './foo.js';\nconst value = foo();\nexport { foo, value };\n",
			),
		];

		const first = await exportDefaultHandlers(deps, {} as ts.CompilerOptions);
		const second = await exportDefaultHandlers(deps, {} as ts.CompilerOptions);

		assert.deepStrictEqual(
			second.map((entry) => entry.sourceCode),
			first.map((entry) => entry.sourceCode),
		);
	});
});
