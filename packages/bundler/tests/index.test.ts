import assert from "node:assert";
import { describe, it } from "node:test";
import { anonymousHandler } from "../src/lib/anonymous.js";
import { exportDefaultHandler } from "../src/lib/exportDefault.js";
import { duplicateHandlers } from "../src/lib/duplicate.js";
import { resolveJSONHandler } from "../src/lib/resolveJSON.js";
import type { DepsFile } from "@suseejs/type";

const jsonFile = "/tmp/project/src/config.json";
const consumerFile = "/tmp/project/src/main.ts";

function createBaseDeps(
	content = "import cfg from './config.json';\n",
): DepsFile[] {
	return [
		{
			file: jsonFile,
			content: JSON.stringify({ app: "bundler", count: 2 }),
			bytes: 30,
			moduleType: "json",
			fileExt: ".json",
		},
		{
			file: consumerFile,
			content,
			bytes: content.length,
			moduleType: "esm",
			fileExt: ".ts",
		},
	];
}

describe("resolveJSONHandler", () => {
	it("converts json dependency into js object module with default export", async () => {
		const deps = createBaseDeps();
		const resolved = await resolveJSONHandler(deps);
		const jsonDep = resolved.find((d) => d.file === jsonFile);

		assert.ok(jsonDep);
		assert.strictEqual(jsonDep?.moduleType, "esm");
		assert.match(jsonDep?.content as string, /const __jsonModule__/);
		assert.match(jsonDep?.content as string, /"app": "bundler"/);
		assert.match(jsonDep?.content as string, /export default __jsonModule__/);
	});

	it("rewrites default json imports to const bindings", async () => {
		const deps = createBaseDeps(
			"import cfg from './config.json';\nconsole.log(cfg.app);\n",
		);
		const resolved = await resolveJSONHandler(deps);
		const consumer = resolved.find((d) => d.file === consumerFile);

		assert.ok(consumer);
		assert.doesNotMatch(consumer?.content as string, /import\s+cfg\s+from/);
		assert.match(consumer?.content as string, /const cfg = __jsonModule__/);
		assert.match(consumer?.content as string, /console\.log\(cfg\.app\)/);
	});

	it("rewrites named and namespace json imports", async () => {
		const deps = createBaseDeps(
			"import * as cfg from './config.json';\nimport { app as appName } from './config.json';\nconsole.log(cfg.count, appName);\n",
		);
		const resolved = await resolveJSONHandler(deps);
		const consumer = resolved.find((d) => d.file === consumerFile);

		assert.ok(consumer);
		assert.doesNotMatch(consumer?.content as string, /from '\.\/config\.json'/);
		assert.match(consumer?.content as string, /const cfg = __jsonModule__/);
		assert.match(
			consumer?.content as string,
			/const appName = __jsonModule__[A-Za-z0-9_]*\.app/,
		);
	});

	it("rewrites require json calls to generated object binding", async () => {
		const deps = createBaseDeps(
			"const cfg = require('./config.json');\nmodule.exports = cfg;\n",
		);
		const resolved = await resolveJSONHandler(deps);
		const consumer = resolved.find((d) => d.file === consumerFile);

		assert.ok(consumer);
		assert.doesNotMatch(
			consumer?.content as string,
			/require\('\.\/config\.json'\)/,
		);
		assert.match(consumer?.content as string, /const cfg = __jsonModule__/);
		assert.match(consumer?.content as string, /module\.exports = cfg/);
	});

	it("returns original deps when no json module exists", async () => {
		const deps: DepsFile[] = [
			{
				file: consumerFile,
				content: "export const ok = true;\n",
				bytes: 24,
				moduleType: "esm",
				fileExt: ".ts",
			},
		];

		const resolved = await resolveJSONHandler(deps);
		assert.deepStrictEqual(resolved, deps);
	});
});

describe("anonymousHandler", () => {
	it("names anonymous default arrow export", async () => {
		const file = "/tmp/project/src/anon.ts";
		const deps: DepsFile[] = [
			{
				file,
				content: "export default () => 42;\n",
				bytes: 24,
				moduleType: "esm",
				fileExt: ".ts",
			},
		];

		const resolved = await anonymousHandler(deps, {});
		const anon = resolved[0]?.content as string;

		assert.match(anon, /const __anonymous__anon_\d+ = \(\) => 42/);
		assert.match(anon, /export default __anonymous__anon_\d+/);
	});
});

describe("exportDefaultHandler", () => {
	it("renames default-exported symbol and updates local usages", async () => {
		const file = "/tmp/project/src/exp.ts";
		const deps: DepsFile[] = [
			{
				file,
				content: "export default function hello() { return 1; }\nhello();\n",
				bytes: 57,
				moduleType: "esm",
				fileExt: ".ts",
			},
		];

		const resolved = await exportDefaultHandler(deps, {});
		const exp = resolved[0]?.content as string;

		assert.match(exp, /export default function __exportDefault__hello_\d+/);
		assert.match(exp, /__exportDefault__hello_\d+\(\)/);
		assert.doesNotMatch(exp, /\bhello\(\)/);
	});
});

describe("duplicateHandlers", () => {
	it("renamed updates duplicate top-level declarations", async () => {
		const deps: DepsFile[] = [
			{
				file: "/tmp/project/src/a.ts",
				content: "const value = 1;\nexport { value };\n",
				bytes: 33,
				moduleType: "esm",
				fileExt: ".ts",
			},
			{
				file: "/tmp/project/src/b.ts",
				content: "const value = 2;\nconsole.log(value);\n",
				bytes: 37,
				moduleType: "esm",
				fileExt: ".ts",
			},
		];

		const resolved = await duplicateHandlers.renamed(deps, {});
		const a = resolved[0]?.content as string;
		const b = resolved[1]?.content as string;

		assert.match(a, /const __duplicatesNames__value_\d+ = 1/);
		assert.match(b, /const __duplicatesNames__value_\d+ = 2/);
		assert.match(b, /console\.log\(__duplicatesNames__value_\d+\)/);
	});
});
