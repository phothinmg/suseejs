import { bundler } from "./src/index.js";
import { SuseeCompilers } from "@suseejs/compiler";
import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve(process.cwd(), "dist");
const code = await bundler("src/index.ts");
const commonjs = SuseeCompilers.toCommonJS({
  sourceCode: code,
  declare: true,
  sourceMap: true,
  fileExt: "ts",
  file_name: "index",
});
const esm = SuseeCompilers.toESM({
  sourceCode: code,
  declare: true,
  sourceMap: true,
  fileExt: "ts",
  file_name: "index",
});

if (!fs.existsSync(outDir)) {
  await fs.promises.mkdir(outDir);
}

// commonjs
let commonjsCode = commonjs.code;
const commonjsPath = path.join(outDir, "index.cjs");
const commonjsDTSPath = path.join(outDir, "index.d.cts");
const commonjsMapPath = path.join(outDir, "index.cjs.map");
if (fs.existsSync(commonjsPath)) await fs.promises.unlink(commonjsPath);
if (fs.existsSync(commonjsDTSPath)) await fs.promises.unlink(commonjsDTSPath);
if (fs.existsSync(commonjsMapPath)) await fs.promises.unlink(commonjsMapPath);
commonjsCode = commonjsCode.replace(/index.js.map/gm, "index.cjs.map");
await fs.promises.writeFile(commonjsPath, commonjsCode);
if (commonjs.dts) await fs.promises.writeFile(commonjsDTSPath, commonjs.dts);
if (commonjs.map) await fs.promises.writeFile(commonjsMapPath, commonjs.map);

// esm
let esmCode = esm.code;
const esmPath = path.join(outDir, "index.mjs");
const esmDTSPath = path.join(outDir, "index.d.mts");
const esmMapPath = path.join(outDir, "index.mjs.map");
if (fs.existsSync(esmPath)) await fs.promises.unlink(esmPath);
if (fs.existsSync(esmDTSPath)) await fs.promises.unlink(esmDTSPath);
if (fs.existsSync(esmMapPath)) await fs.promises.unlink(esmMapPath);
esmCode = esmCode.replace(/index.js.map/gm, "index.mjs.map");
await fs.promises.writeFile(esmPath, esmCode);
if (esm.dts) await fs.promises.writeFile(esmDTSPath, esm.dts);
if (esm.map) await fs.promises.writeFile(esmMapPath, esm.map);
