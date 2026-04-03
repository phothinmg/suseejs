import ts = require("typescript");
import resolves = require("@phothinmaung/resolves");
import transformFunction = require("susee-transform");
import type SuseeTypes = require("susee-types");
import utils = require("susee-utils");

/**
 * Finds all the properties accessed in the given node.
 * @param {ts.Node} node - The node to search through.
 * @returns {string[]} - An array of all the properties accessed.
 */
function findProperty(node: ts.Node): string[] {
	const properties: string[] = [];
	function walk(n: ts.Node) {
		if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression)) {
			properties.push(n.expression.text);
		}
		n.forEachChild(walk);
	}
	walk(node);
	return properties;
}

/**
 * Transforms a commonjs file into an ES module.
 * It detects all the requires and then generates import statements based on the requires.
 * @param {ts.CompilerOptions} compilerOptions - The compiler options.
 * @returns {SuseeTypes.BundleHandler} - A bundle handler that transforms a commonjs file into an ES module.
 */
function commonjsImportsHandler(
	compilerOptions: ts.CompilerOptions,
): SuseeTypes.BundleHandler {
	let properties: string[] = [];
	const removedStatements: string[] = [];
	return (deps: SuseeTypes.DependenciesFile) => {
		if (
			deps.moduleType === "cjs" &&
			(deps.fileExt === ".js" || deps.fileExt === ".cjs")
		) {
			const sourceFile = ts.createSourceFile(
				deps.file,
				deps.content,
				ts.ScriptTarget.Latest,
				true,
			);
			// collect all property-access roots first so we can detect namespace usage
			properties = [];
			for (const stmt of sourceFile.statements) {
				properties = [...properties, ...findProperty(stmt)];
			}

			const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
				const { factory } = context;
				const visitor = (node: ts.Node): ts.Node => {
					const obj: SuseeTypes.RequireImportObject = {
						isNamespace: false,
						isTypeOnly: false,
						isTypeNamespace: false,
						source: "",
						importedString: undefined,
						importedObject: undefined,
					};

					if (ts.isVariableStatement(node)) {
						const decls = node.declarationList.declarations;
						if (decls.length === 1) {
							const decl = decls[0] as ts.VariableDeclaration;
							//
							if (decl.initializer) {
								// const foo = require "foo"
								if (
									ts.isCallExpression(decl.initializer) &&
									ts.isIdentifier(decl.initializer.expression) &&
									decl.initializer.expression.escapedText === "require"
								) {
									// imported from
									const arg = decl.initializer.arguments[0] as ts.Expression;
									if (ts.isStringLiteral(arg)) {
										obj.source = arg.text;
									}
									if (ts.isIdentifier(decl.name)) {
										const _n = decl.name.text;
										obj.importedString = _n;
										if (properties.includes(_n)) {
											obj.isNamespace = true;
										}
									} else if (ts.isObjectBindingPattern(decl.name)) {
										const _names: string[] = [];
										for (const ele of decl.name.elements) {
											if (ts.isIdentifier(ele.name)) {
												_names.push(ele.name.text);
											}
										}
										if (_names.length > 0) {
											obj.importedObject = _names;
										}
									}
									let tt: string | undefined;
									if (obj.importedString && !obj.importedObject) {
										if (obj.isNamespace) {
											tt = `import * as ${obj.importedString} from "${obj.source}";`;
										} else {
											tt = `import ${obj.importedString} from "${obj.source}";`;
										}
									}
									if (!obj.importedString && obj.importedObject) {
										tt = `import { ${obj.importedObject.join(", ")} } from "${obj.source}";`;
									}
									if (tt) {
										removedStatements.push(tt);
										return factory.createEmptyStatement();
									}
									// const foo = require "foo"
								}
							}
						}
					} // VariableStatement
					/* ----------------------Returns for visitor function------------------------------- */
					return ts.visitEachChild(node, visitor, context);
				};
				/* --------------------Returns for transformer function--------------------------------- */
				return (rootNode) => ts.visitNode(rootNode, visitor) as ts.SourceFile;
			};
			/* --------------------Returns for main handler function--------------------------------- */
			let _content = transformFunction(
				transformer,
				sourceFile,
				compilerOptions,
			);
			_content = `${removedStatements.join("\n")}\n${_content}`;
			_content = _content.replace(/^s*;\s*$/gm, "").trim();
			const { file, content, ...rest } = deps;
			return {
				file,
				content: _content,
				...rest,
			} as SuseeTypes.DependenciesFile;
		} else {
			return deps;
		}
	};
}

/**
 * Transforms a commonjs file into an ES module.
 * @param {ts.CompilerOptions} compilerOptions - The compiler options.
 * @returns {SuseeTypes.BundleHandler} - A bundle handler that transforms a commonjs file into an ES module.
 */
function commonjsExportsHandler(
	compilerOptions: ts.CompilerOptions,
): SuseeTypes.BundleHandler {
	return (deps: SuseeTypes.DependenciesFile) => {
		if (
			deps.moduleType === "cjs" &&
			(deps.fileExt === ".js" || deps.fileExt === ".cjs")
		) {
			const sourceFile = ts.createSourceFile(
				deps.file,
				deps.content,
				ts.ScriptTarget.Latest,
				true,
			);
			const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
				const { factory } = context;
				const visitor = (node: ts.Node): ts.Node => {
					// for const foo = exports.foo = expression
					if (ts.isVariableStatement(node)) {
						const decls = node.declarationList;
						const vdl = decls.declarations.find(
							(del) => del.initializer !== undefined,
						);
						if (
							vdl?.initializer &&
							ts.isBinaryExpression(vdl.initializer) &&
							ts.isIdentifier(vdl.name)
						) {
							const name_1 = vdl.name.text;
							const init = vdl.initializer;
							if (
								ts.isPropertyAccessExpression(init.left) &&
								ts.isIdentifier(init.left.expression) &&
								init.left.expression.text === "exports" &&
								ts.isIdentifier(init.left.name)
							) {
								const name_2 = init.left.name.text;
								if (name_1 === name_2) {
									return factory.createVariableStatement(
										[factory.createToken(ts.SyntaxKind.ExportKeyword)],
										factory.createVariableDeclarationList(
											[
												factory.createVariableDeclaration(
													name_1,
													undefined,
													undefined,
													init.right,
												),
											],
											ts.NodeFlags.Const,
										),
									);
								}
							}
						}
					} else if (
						ts.isExpressionStatement(node) &&
						ts.isBinaryExpression(node.expression) &&
						ts.isPropertyAccessExpression(node.expression.left)
					) {
						const leftExpression = node.expression.left.expression;
						const leftIdentifierName = node.expression.left.name;
						const rn = node.expression.right;
						if (
							ts.isIdentifier(leftExpression) &&
							ts.isIdentifier(leftIdentifierName)
						) {
							const exprName = leftExpression.text;
							const leftName = leftIdentifierName.text;
							const _exportKeyword = factory.createModifier(
								ts.SyntaxKind.ExportKeyword,
							);
							const _defaultKeyword = factory.createModifier(
								ts.SyntaxKind.DefaultKeyword,
							);
							if (exprName === "module" && leftName === "exports") {
								if (ts.isFunctionExpression(rn)) {
									return factory.createFunctionDeclaration(
										[_exportKeyword, _defaultKeyword],
										rn.asteriskToken,
										rn.name ?? undefined,
										rn.typeParameters,
										rn.parameters,
										rn.type,
										rn.body,
									);
								} else if (ts.isClassExpression(rn)) {
									return factory.createClassDeclaration(
										[_exportKeyword, _defaultKeyword],
										rn.name ?? undefined,
										rn.typeParameters,
										rn.heritageClauses,
										rn.members,
									);
								} else if (ts.isExpression(rn)) {
									return factory.createExportAssignment(undefined, false, rn);
								}
							}
							// ================================================================================== //
							else if (exprName === "exports") {
								if (ts.isIdentifier(rn)) {
									return factory.createExportDeclaration(
										undefined,
										false,
										factory.createNamedExports([
											factory.createExportSpecifier(false, undefined, rn),
										]),
										undefined,
										undefined,
									);
								} else {
									const _name = factory.createIdentifier(leftName);

									// function
									if (ts.isFunctionExpression(rn)) {
										return factory.createFunctionDeclaration(
											[_exportKeyword],
											rn.asteriskToken,
											_name,
											rn.typeParameters,
											rn.parameters,
											rn.type,
											rn.body,
										);
									} else if (ts.isClassExpression(rn)) {
										return factory.createClassDeclaration(
											[_exportKeyword],
											_name,
											rn.typeParameters,
											rn.heritageClauses,
											rn.members,
										);
									} else if (ts.isExpression(rn)) {
										const varDecl = factory.createVariableDeclaration(
											_name,
											undefined,
											undefined,
											rn,
										);
										return factory.createVariableStatement(
											[_exportKeyword],
											factory.createVariableDeclarationList(
												[varDecl],
												ts.NodeFlags.Const,
											),
										);
									}
								}
							}
						}
					}
					/* ----------------------Returns for visitor function------------------------------- */
					return ts.visitEachChild(node, visitor, context);
				};
				/* --------------------Returns for transformer function--------------------------------- */
				return (rootNode) => {
					const visited = ts.visitNode(rootNode, visitor) as ts.SourceFile;
					const nonDefaultStatements: ts.Statement[] = [];
					const defaultStatements: ts.Statement[] = [];

					for (const stmt of visited.statements) {
						if (ts.isExportAssignment(stmt)) {
							defaultStatements.push(stmt);
							continue;
						}

						if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
							const hasExport = stmt.modifiers?.some(
								(m) => m.kind === ts.SyntaxKind.ExportKeyword,
							);
							const hasDefault = stmt.modifiers?.some(
								(m) => m.kind === ts.SyntaxKind.DefaultKeyword,
							);
							if (hasExport && hasDefault) {
								defaultStatements.push(stmt);
								continue;
							}
						}

						nonDefaultStatements.push(stmt);
					}
					// default statement to the last of file
					return factory.updateSourceFile(visited, [
						...nonDefaultStatements,
						...defaultStatements,
					]);
				};
			};
			let _content = transformFunction(
				transformer,
				sourceFile,
				compilerOptions,
			);
			_content = _content.replace(/^s*;\s*$/gm, "").trim();
			const { file, content, ...rest } = deps;
			return {
				file,
				content: _content,
				...rest,
			} as SuseeTypes.DependenciesFile;
		} else {
			return deps;
		}
	};
}

/**
 * A Susee plugin that transforms commonjs exports and imports into ES modules.
 * @returns {SuseeTypes.SuseePlugin} - A Susee plugin.
 */
function suseeCommonJS(): SuseeTypes.SuseePlugin {
	return {
		type: "dependency",
		async: true,
		name: "@suseejs/plugin-commonjs",
		func: async (deps, compilerOptions) => {
			const resolvedHandler = resolves([
				[commonjsExportsHandler, compilerOptions],
				[commonjsImportsHandler, compilerOptions],
			]);
			const resolved = await resolvedHandler.series();
			for (const res of resolved) {
				await utils.wait(500);
				deps = deps.map((dep) => {
					dep = res(dep);
					dep.moduleType = "esm";
					return dep;
				});
				await utils.wait(500);
			}

			return deps;
		},
	};
}

export = suseeCommonJS;
