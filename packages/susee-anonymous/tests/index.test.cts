import assert = require("node:assert");
import NodeTest = require("node:test");
import ts = require("typescript");
import anonymousHandlers = require("../src/index.cjs");

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

describe("Anonymous Handler Tests", () => {
  /**
   * Ensures anonymous default function exports are renamed and that importer
   * identifiers, call sites, and export specifiers are rewritten consistently.
   */
  it("renames anonymous default export and updates importer usages", async () => {
    const deps = [
      createDep(
        "/virtual/foo.ts",
        "export default function () { return 1; }\n",
      ),
      createDep(
        "/virtual/main.ts",
        "import foo from './foo.js';\nconst value = foo();\nexport { foo, value };\n",
      ),
    ];

    const result = await anonymousHandlers(deps, {} as ts.CompilerOptions);
    const output = result.map((entry) => entry.sourceCode).join("\n");

    assert.match(output, /export default function __anonymous__foo_\d+\(\)/);
    assert.match(output, /import __anonymous__foo_\d+ from '\.\/foo\.js';/);
    assert.match(output, /const value = __anonymous__foo_\d+\(\);/);
    assert.match(output, /export \{ __anonymous__foo_\d+, value \};/);
  });

  /**
   * Verifies export-assignment object defaults are hoisted to a named const and
   * that property access in importing modules is updated to the generated name.
   */
  it("rewrites imported anonymous default usage in property access", async () => {
    const deps = [
      createDep("/virtual/data.ts", "export default { a: 1 };\n"),
      createDep(
        "/virtual/main.ts",
        "import data from './data.js';\nconst value = data.a;\nexport { value };\n",
      ),
    ];

    const result = await anonymousHandlers(deps, {} as ts.CompilerOptions);
    const output = result.map((entry) => entry.sourceCode).join("\n");

    assert.match(output, /const __anonymous__data_\d+ = \{ a: 1 \};/);
    assert.match(output, /export default __anonymous__data_\d+;/);
    assert.match(output, /import __anonymous__data_\d+ from '\.\/data\.js';/);
    assert.match(output, /const value = __anonymous__data_\d+\.a;/);
  });

  /**
   * Confirms anonymous default class exports are renamed and that importer
   * bindings, constructor calls, and re-exports use the generated identifier.
   */
  it("renames anonymous default class and updates importer new expression", async () => {
    const deps = [
      createDep("/virtual/model.ts", "export default class {}\n"),
      createDep(
        "/virtual/main.ts",
        "import Model from './model.js';\nconst instance = new Model();\nexport { Model, instance };\n",
      ),
    ];

    const result = await anonymousHandlers(deps, {} as ts.CompilerOptions);
    const output = result.map((entry) => entry.sourceCode).join("\n");

    assert.match(output, /export default class __anonymous__model_\d+/);
    assert.match(output, /import __anonymous__model_\d+ from '\.\/model\.js';/);
    assert.match(output, /const instance = new __anonymous__model_\d+\(\);/);
    assert.match(output, /export \{ __anonymous__model_\d+, instance \};/);
  });

  /**
   * Covers export-assignment arrow defaults and verifies the transform creates
   * a named const export while importer call sites are rewritten to that name.
   */
  it("renames anonymous default arrow function export and updates importer calls", async () => {
    const deps = [
      createDep("/virtual/make.ts", "export default () => 7;\n"),
      createDep(
        "/virtual/main.ts",
        "import make from './make.js';\nconst value = make();\nexport { make, value };\n",
      ),
    ];

    const result = await anonymousHandlers(deps, {} as ts.CompilerOptions);
    const output = result.map((entry) => entry.sourceCode).join("\n");

    assert.match(output, /const __anonymous__make_\d+ = \(\) => 7;/);
    assert.match(output, /export default __anonymous__make_\d+;/);
    assert.match(output, /import __anonymous__make_\d+ from '\.\/make\.js';/);
    assert.match(output, /const value = __anonymous__make_\d+\(\);/);
    assert.match(output, /export \{ __anonymous__make_\d+, value \};/);
  });

  /**
   * Confirms the internal rename maps and generator state are reset between
   * handler runs so equivalent inputs produce deterministic outputs.
   */
  it("resets anonymous rename state between runs", async () => {
    const deps = [
      createDep(
        "/virtual/foo.ts",
        "export default function () { return 1; }\n",
      ),
      createDep(
        "/virtual/main.ts",
        "import foo from './foo.js';\nconst value = foo();\nexport { foo, value };\n",
      ),
    ];

    const first = await anonymousHandlers(deps, {} as ts.CompilerOptions);
    const second = await anonymousHandlers(deps, {} as ts.CompilerOptions);

    assert.deepStrictEqual(
      second.map((entry) => entry.sourceCode),
      first.map((entry) => entry.sourceCode),
    );
  });
});
