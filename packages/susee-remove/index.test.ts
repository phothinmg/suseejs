import assert from "node:assert";
import { describe, it } from "node:test";
import ts from "typescript";
import removeHandlers from "./src/index.mjs";

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

describe("Remove Handler Tests", () => {
	it("keeps qualified type names for type-only import-equals and emits namespace type import", async () => {
		const removedStatements: string[] = [];
		const [removeImports] = await removeHandlers(
			removedStatements,
			{} as ts.CompilerOptions,
		);

		const result = removeImports(
			createDep(
				"/virtual/types.ts",
				'import type Foo = require("foo");\ntype User = Foo.Bar;\nexport { User };\n',
			),
		);

		assert.match(result.sourceCode, /type User = Foo\.Bar;/);
		assert.match(
			removedStatements.join("\n"),
			/import type \* as Foo from "foo";/,
		);
	});

	it("converts non-type import-equals to default import", async () => {
		const removedStatements: string[] = [];
		const [removeImports] = await removeHandlers(
			removedStatements,
			{} as ts.CompilerOptions,
		);

		const result = removeImports(
			createDep(
				"/virtual/types.ts",
				'import Foo = require("foo");\ntype User = Foo.Bar;\n',
			),
		);

		assert.match(result.sourceCode, /type User = Foo\.Bar;/);
		assert.match(removedStatements.join("\n"), /import Foo from "foo";/);
	});
});