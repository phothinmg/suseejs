import { suseeCompiler } from "@suseejs/compiler";
import { getCompilerOptions } from "@suseejs/tsoptions";
import path from "node:path";
import fs from "node:fs";
import { files } from "./src/index.js";

const entryPath = path.resolve(process.cwd(), "src/index.ts");
const code = await fs.promises.readFile(entryPath, "utf8");

const opts = getCompilerOptions();
const commonjs = suseeCompiler({
	sourceCode: code,
	fileName: "src/index.ts",
	compilerOptions: opts.commonjs("dist"),
});
const esm = suseeCompiler({
	sourceCode: code,
	fileName: "src/index.ts",
	compilerOptions: opts.esm("dist"),
});
// commonjs
let commonjsCode = commonjs.code;
const commonjsPath = path.join(commonjs.out_dir, `${commonjs.file_name}.cjs`);
const commonjsDTSPath = path.join(
	commonjs.out_dir,
	`${commonjs.file_name}.d.cts`,
);
const commonjsMapPath = path.join(
	commonjs.out_dir,
	`${commonjs.file_name}.cjs.map`,
);
commonjsCode = commonjsCode.replace(
	new RegExp(`${commonjs.file_name}.js.map`, "gm"),
	`${commonjs.file_name}.cjs.map`,
);
await files.writeFile(commonjsPath, commonjsCode);
if (commonjs.dts) await files.writeFile(commonjsDTSPath, commonjs.dts);
if (commonjs.map) await files.writeFile(commonjsMapPath, commonjs.map);

// esm
let esmCode = esm.code;
const esmPath = path.join(esm.out_dir, `${esm.file_name}.mjs`);
const esmDTSPath = path.join(esm.out_dir, `${esm.file_name}.d.mts`);
const esmMapPath = path.join(esm.out_dir, `${esm.file_name}.mjs.map`);
esmCode = esmCode.replace(
	new RegExp(`${esm.file_name}.js.map`, "gm"),
	`${esm.file_name}.mjs.map`,
);
await files.writeFile(esmPath, esmCode);
if (esm.dts) await files.writeFile(esmDTSPath, esm.dts);
if (esm.map) await files.writeFile(esmMapPath, esm.map);
