import type { BundledHandler, DepsFile } from "@suseejs/type";
import ts from "typescript";
import { getFileKey, getModuleKeyFromSpecifier } from "./helpers.js";

const jsonPrefix = "__jsonModule__";

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
	const jsonObject = JSON.stringify(parsed, null, 2);
	return `const ${varName} = ${jsonObject};\nexport default ${varName};\n`;
};

const resolveJsonRequireHandler = (
	jsonModuleNames: Map<string, string>,
): BundledHandler => {
	return ({ file, content, ...rest }: DepsFile): DepsFile => {
		const sourceFile = ts.createSourceFile(
			file,
			content,
			ts.ScriptTarget.Latest,
			true,
		);
		const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
			const { factory } = context;
			return (rootNode) => {
				const nextStatements: ts.Statement[] = [];

				for (const stmt of rootNode.statements) {
					if (ts.isImportDeclaration(stmt)) {
						const moduleKey = getModuleKeyFromSpecifier(
							stmt.moduleSpecifier,
							sourceFile,
							file,
						);
						const jsonVarName = jsonModuleNames.get(moduleKey);
						if (!jsonVarName) {
							nextStatements.push(stmt);
							continue;
						}

						const importClause = stmt.importClause;
						if (!importClause || importClause.isTypeOnly) {
							continue;
						}

						if (importClause.name && ts.isIdentifier(importClause.name)) {
							nextStatements.push(
								factory.createVariableStatement(
									undefined,
									factory.createVariableDeclarationList(
										[
											factory.createVariableDeclaration(
												factory.createIdentifier(importClause.name.text),
												undefined,
												undefined,
												factory.createIdentifier(jsonVarName),
											),
										],
										ts.NodeFlags.Const,
									),
								),
							);
						}

						if (importClause.namedBindings) {
							if (ts.isNamespaceImport(importClause.namedBindings)) {
								nextStatements.push(
									factory.createVariableStatement(
										undefined,
										factory.createVariableDeclarationList(
											[
												factory.createVariableDeclaration(
													factory.createIdentifier(
														importClause.namedBindings.name.text,
													),
													undefined,
													undefined,
													factory.createIdentifier(jsonVarName),
												),
											],
											ts.NodeFlags.Const,
										),
									),
								);
							} else if (ts.isNamedImports(importClause.namedBindings)) {
								for (const el of importClause.namedBindings.elements) {
									if (el.isTypeOnly) {
										continue;
									}
									const importedName = (el.propertyName ?? el.name).text;
									nextStatements.push(
										factory.createVariableStatement(
											undefined,
											factory.createVariableDeclarationList(
												[
													factory.createVariableDeclaration(
														factory.createIdentifier(el.name.text),
														undefined,
														undefined,
														factory.createPropertyAccessExpression(
															factory.createIdentifier(jsonVarName),
															factory.createIdentifier(importedName),
														),
													),
												],
												ts.NodeFlags.Const,
											),
										),
									);
								}
							}
						}
						continue;
					}

					if (
						ts.isVariableStatement(stmt) &&
						stmt.declarationList.declarations.length === 1
					) {
						const decl = stmt.declarationList.declarations[0] as
							| ts.VariableDeclaration
							| undefined;
						const init = decl?.initializer;
						if (
							decl &&
							init &&
							ts.isCallExpression(init) &&
							ts.isIdentifier(init.expression) &&
							init.expression.text === "require" &&
							init.arguments.length > 0
						) {
							const arg = init.arguments[0];
							if (arg) {
								const moduleKey = getModuleKeyFromSpecifier(
									arg,
									sourceFile,
									file,
								);
								const jsonVarName = jsonModuleNames.get(moduleKey);
								if (jsonVarName) {
									const updatedDecl = factory.updateVariableDeclaration(
										decl,
										decl.name,
										decl.exclamationToken,
										decl.type,
										factory.createIdentifier(jsonVarName),
									);
									const updatedDeclList = factory.updateVariableDeclarationList(
										stmt.declarationList,
										[updatedDecl],
									);
									nextStatements.push(
										factory.updateVariableStatement(
											stmt,
											stmt.modifiers,
											updatedDeclList,
										),
									);
									continue;
								}
							}
						}
					}

					nextStatements.push(stmt);
				}

				return factory.updateSourceFile(rootNode, nextStatements);
			};
		};

		const transformed = ts.transform(sourceFile, [transformer]);
		const printer = ts.createPrinter({
			newLine: ts.NewLineKind.LineFeed,
			removeComments: false,
		});
		const output = printer.printFile(
			transformed.transformed[0] as ts.SourceFile,
		);
		transformed.dispose();
		return { file, content: output, ...rest };
	};
};

const resolveJSONHandler = async (deps: DepsFile[]): Promise<DepsFile[]> => {
	const jsonModuleNames = new Map<string, string>();
	const scopedNameCount = new Map<string, number>();

	let nextDeps = deps.map((dep): DepsFile => {
		if (dep.fileExt !== ".json" || dep.moduleType !== "json") {
			return dep;
		}

		const fileKey = getFileKey(dep.file);
		const keyName = toIdentifier(fileKey);
		const count = scopedNameCount.get(keyName) ?? 0;
		const jsonVarName = count === 0 ? keyName : `${keyName}_${count + 1}`;
		scopedNameCount.set(keyName, count + 1);
		jsonModuleNames.set(fileKey, jsonVarName);

		return {
			...dep,
			content: toJsonModuleCode(jsonVarName, dep.content, dep.file),
			moduleType: "esm" as const,
		};
	});

	if (jsonModuleNames.size === 0) {
		return deps;
	}

	const rewrite = resolveJsonRequireHandler(jsonModuleNames);
	nextDeps = nextDeps.map((dep) =>
		dep.fileExt === ".json" ? dep : rewrite(dep),
	);
	return nextDeps;
};

export { resolveJSONHandler };
