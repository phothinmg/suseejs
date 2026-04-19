import path from "node:path";
import process from "node:process";
import tcolor from "@suseejs/color";
import { files } from "@suseejs/files";
import { generateGraph } from "@suseejs/graph";
import type { DependenciesTree, ValidExts } from "@suseejs/type";
import { utils } from "@suseejs/utilities";

const validExtensions = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".json"];

async function generateDependencies(entry: string): Promise<DependenciesTree> {
	const graph = generateGraph(entry);
	const sorted = graph.sort();
	const npm = graph.npm();
	const nodes = graph.node();
	const warns = graph.warn();
	const tree: DependenciesTree = {
		entry,
		npm,
		nodes,
		warns,
		depFiles: [],
	};
	for (const file of sorted) {
		const fileExt = path.extname(file);
		if (!validExtensions.includes(fileExt)) {
			console.error(
				`Unsupported file extensions "${tcolor.magenta(fileExt)}" found in your dependencies tree.`,
			);
			process.exit(1);
		}
		const read = await files.readFile(file);
		const content = read.str;
		const bytes = read.bytes;
		const mt = utils.checks.moduleType(content, file);
		const moduleType =
			fileExt === ".json" ? "json" : mt.isCommonJs ? "cjs" : "esm";
		const isJsx = utils.checks.isJsxContent(content);
		if (isJsx) {
			console.error(
				`JSX syntax found in ${tcolor.magenta(file)} of your dependencies tree, its currently unsupported.`,
			);
			process.exit(1);
		}
		tree.depFiles.push({
			file,
			content,
			bytes,
			moduleType,
			fileExt: fileExt as ValidExts,
		});
	}
	return tree;
}

export { generateDependencies };
