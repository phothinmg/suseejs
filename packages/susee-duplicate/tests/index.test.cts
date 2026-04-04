import assert = require("node:assert");
import NodeTest = require("node:test");
import ts = require("typescript");
import duplicateHandlers = require("../src/index.cjs");
const describe = NodeTest.describe;
const it = NodeTest.it;

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

describe("Duplicate Handler Tests", () => {
  it("renames duplicate identifiers in non-call expressions", async () => {
    const deps = [
      createDep(
        "/virtual/a.ts",
        "export const foo = 1;\nexport const value = foo;\n",
      ),
      createDep(
        "/virtual/b.ts",
        "export const foo = 2;\nexport const obj = { foo };\nexport const arr = [foo];\n",
      ),
    ];

    const result = await duplicateHandlers.renamed(
      deps,
      {} as ts.CompilerOptions,
    );
    const output = result.map((entry) => entry.sourceCode).join("\n");

    assert.match(output, /export const __duplicatesNames__foo_\d+ = 1;/);
    assert.match(output, /export const value = __duplicatesNames__foo_\d+;/);
    assert.match(output, /export const __duplicatesNames__foo_\d+ = 2;/);
    assert.match(
      output,
      /export const obj = \{\s*foo: __duplicatesNames__foo_\d+\s*\};/,
    );
    assert.match(output, /export const arr = \[__duplicatesNames__foo_\d+\];/);
  });

  it("resets duplicate rename state between runs", async () => {
    const deps = [
      createDep(
        "/virtual/a.ts",
        "export const foo = 1;\nexport const value = foo;\n",
      ),
      createDep(
        "/virtual/b.ts",
        "export const foo = 2;\nexport const value = foo;\n",
      ),
    ];

    const first = await duplicateHandlers.renamed(
      deps,
      {} as ts.CompilerOptions,
    );
    const second = await duplicateHandlers.renamed(
      deps,
      {} as ts.CompilerOptions,
    );

    assert.deepStrictEqual(
      second.map((entry) => entry.sourceCode),
      first.map((entry) => entry.sourceCode),
    );
  });
});
