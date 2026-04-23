import path from "node:path";
import type { BundledHandler, DepsFile, NamesSets } from "@suseejs/type";
import { utils } from "@suseejs/utilities";
import ts from "typescript";
import { getFileKey, jsonExtToTs } from "./helpers.js";

const jsonPrefix = "__jsonModule__";

const jsonModuleExportNameMap: NamesSets = [];
const jsonModuleImportNameMap: NamesSets = [];

const toIdentifier = (input: string) => {
	const cleaned = input.replace(/[^A-Za-z0-9_$]/g, "_");
	const startsValid = /^[A-Za-z_$]/.test(cleaned);
	return `${jsonPrefix}${startsValid ? cleaned : `_${cleaned}`}`;
};

const toJsonModuleCode = (varName: string, content: string, file: string) => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		throw new Error(`Invalid JSON syntax in dependency file: ${file}`);
	}
	const jsonObject = JSON.stringify(parsed);
	return `const ${varName} = ${jsonObject};\nexport default ${varName}`;
};

const resolveJSONHandler = async (deps: DepsFile[]): Promise<DepsFile[]> => {
	const scopedNameCount = new Map<string, number>();

	const nextDeps = deps.map((dep): DepsFile => {
		if (dep.moduleType !== "json" || dep.fileExt !== ".json") {
			return dep;
		}
		const fileName = path.basename(dep.file).split(".")[0] as string;
		const fileKey = getFileKey(dep.file);
		const keyName = toIdentifier(fileKey);
		const count = scopedNameCount.get(keyName) ?? 0;
		const jsonVarName = count === 0 ? keyName : `${keyName}_${count + 1}`;
		scopedNameCount.set(keyName, count + 1);

		jsonModuleExportNameMap.push({
			base: jsonVarName,
			file: fileName,
			newName: jsonVarName,
			isEd: true,
		});
		return {
			...dep,
			content: toJsonModuleCode(jsonVarName, dep.content, dep.file),
			moduleType: "esm" as const,
		};
	});
	return nextDeps;
};

//--
function jsonModuleImportHandler(
	compilerOptions: ts.CompilerOptions,
): BundledHandler {
	return ({ file, content, fileExt, ...rest }: DepsFile): DepsFile => {
		const sourceFile = ts.createSourceFile(
			jsonExtToTs(file),
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;
			function visitor(node: ts.Node): ts.Node {
				if (ts.isImportDeclaration(node)) {
					const fileName = node.moduleSpecifier.getText(sourceFile);
					const _name = (
						path.basename(fileName).split(".")[0] as string
					).trim();
					// check only import default expression
					if (
						node.importClause?.name &&
						ts.isIdentifier(node.importClause.name)
					) {
						const base = node.importClause.name.text.trim();
						const mapping = jsonModuleExportNameMap.find(
							(v) => v.file === _name,
						);
						if (mapping) {
							jsonModuleImportNameMap.push({
								base,
								file,
								newName: mapping.newName,
								isEd: true,
							});
							const newImportClause = factory.updateImportClause(
								node.importClause,
								node.importClause.phaseModifier,
								factory.createIdentifier(mapping.newName),
								node.importClause.namedBindings,
							);
							return factory.updateImportDeclaration(
								node,
								node.modifiers,
								newImportClause,
								node.moduleSpecifier,
								node.attributes,
							);
						}
					}
				}
				return ts.visitEachChild(node, visitor, context);
			}
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		const _content = utils.gen.transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, fileExt, ...rest };
	};
}
//--
function jsonModuleCallExpressionHandler(
	compilerOptions: ts.CompilerOptions,
): BundledHandler {
	return ({ file, content, fileExt, ...rest }: DepsFile): DepsFile => {
		const sourceFile = ts.createSourceFile(
			jsonExtToTs(file),
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;
			function visitor(node: ts.Node): ts.Node {
				if (ts.isCallExpression(node)) {
					if (ts.isIdentifier(node.expression)) {
						const base = node.expression.text;
						const mapping = jsonModuleImportNameMap.find(
							(m) => m.base === base && m.file === file,
						);
						if (mapping) {
							return factory.updateCallExpression(
								node,
								factory.createIdentifier(mapping.newName),
								node.typeArguments,
								node.arguments,
							);
						}
					}
				} else if (ts.isPropertyAccessExpression(node)) {
					if (ts.isIdentifier(node.expression)) {
						const base = node.expression.text;
						const mapping = jsonModuleImportNameMap.find(
							(m) => m.base === base && m.file === file,
						);
						if (mapping) {
							return factory.updatePropertyAccessExpression(
								node,
								factory.createIdentifier(mapping.newName),
								node.name,
							);
						}
					}
				} else if (ts.isNewExpression(node)) {
					if (ts.isIdentifier(node.expression)) {
						const base = node.expression.text;
						const mapping = jsonModuleImportNameMap.find(
							(m) => m.base === base && m.file === file,
						);
						if (mapping) {
							return factory.updateNewExpression(
								node,
								factory.createIdentifier(mapping.newName),
								node.typeArguments,
								node.arguments,
							);
						}
					}
					// for export specifier it is focus on entry file
				} else if (ts.isExportSpecifier(node)) {
					if (ts.isIdentifier(node.name)) {
						const base = node.name.text;
						const mapping = jsonModuleImportNameMap.find(
							(m) => m.base === base && m.file === file,
						);
						if (mapping) {
							return factory.updateExportSpecifier(
								node,
								node.isTypeOnly,
								node.propertyName,
								factory.createIdentifier(mapping.newName),
							);
						}
					}
				}

				return ts.visitEachChild(node, visitor, context);
			}
			return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
		};
		const _content = utils.gen.transformFunction(
			transformer,
			sourceFile,
			compilerOptions,
		);
		return { file, content: _content, fileExt, ...rest };
	};
}
//--

async function jsonModuleHandlers(
	deps: DepsFile[],
	compilerOptions: ts.CompilerOptions,
) {
	deps = await resolveJSONHandler(deps);
	deps = deps.map((dep) => jsonModuleImportHandler(compilerOptions)(dep));
	deps = deps.map((dep) =>
		jsonModuleCallExpressionHandler(compilerOptions)(dep),
	);
	return deps;
}

export { jsonModuleHandlers };
