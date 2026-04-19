import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import process from "node:process";
import tcolor from "@suseejs/color";
import ts from "typescript";

namespace utils {
	export namespace checks {
		export const moduleType = (content: string, file: string) => {
			let _esmCount = 0;
			let cjsCount = 0;
			let unknownCount = 0;

			const sourceFile = ts.createSourceFile(
				file,
				content,
				ts.ScriptTarget.Latest,
				true,
			);

			try {
				let hasESMImports = false;
				let hasCommonJS = false;

				// Walk through the AST to detect module syntax
				function walk(node: ts.Node) {
					// Check for ESM import/export syntax
					if (
						ts.isImportDeclaration(node) ||
						ts.isImportEqualsDeclaration(node) ||
						ts.isExportDeclaration(node) ||
						ts.isExportSpecifier(node) ||
						ts.isExportAssignment(node)
					) {
						hasESMImports = true;
					}

					// Check for export modifier on declarations
					if (
						(ts.isVariableStatement(node) ||
							ts.isFunctionDeclaration(node) ||
							ts.isInterfaceDeclaration(node) ||
							ts.isTypeAliasDeclaration(node) ||
							ts.isEnumDeclaration(node) ||
							ts.isClassDeclaration(node)) &&
						node.modifiers?.some(
							(mod) => mod.kind === ts.SyntaxKind.ExportKeyword,
						)
					) {
						hasESMImports = true;
					}

					// Check for CommonJS require/exports
					if (ts.isCallExpression(node)) {
						if (
							ts.isIdentifier(node.expression) &&
							node.expression.text === "require" &&
							node.arguments.length > 0
						) {
							hasCommonJS = true;
						}
					}

					// Check for module.exports or exports.xxx
					if (ts.isPropertyAccessExpression(node)) {
						const text = node.getText(sourceFile);
						if (
							text.startsWith("module.exports") ||
							text.startsWith("exports.")
						) {
							hasCommonJS = true;
						}
					}

					// Continue walking the AST
					ts.forEachChild(node, walk);
				} //---
				walk(sourceFile);

				// Determine the module format based on what we found
				if (hasESMImports && !hasCommonJS) {
					_esmCount++;
				} else if (hasCommonJS && !hasESMImports) {
					cjsCount++;
				} else if (hasESMImports && hasCommonJS) {
					// Mixed - probably ESM with dynamic imports or similar
					_esmCount++;
				}
			} catch (error) {
				console.error(
					tcolor.magenta(
						`Error checking module format for ${file} : \n ${error}`,
					),
				);
				unknownCount++;
			}
			if (unknownCount > 0) {
				console.error(tcolor.magenta(`Error checking module format.`));
				ts.sys.exit(1);
			}

			return {
				isCommonJs: cjsCount > 0,
				isEsm: _esmCount > 0,
			};
		};
		/**
		 * Checks if the given code string contains JSX syntax.
		 * @param code The content of the file as a string.
		 * @returns true if the file contains JSX, false otherwise.
		 */
		export function isJsxContent(code: string): boolean {
			const sourceFile = ts.createSourceFile(
				"file.tsx",
				code,
				ts.ScriptTarget.Latest,
				/*setParentNodes*/ true,
				ts.ScriptKind.TSX,
			);

			let containsJsx = false;

			function visitor(node: ts.Node) {
				// Check for JSX Elements, Self Closing Elements, or JSX Fragments
				if (
					ts.isJsxElement(node) ||
					ts.isJsxSelfClosingElement(node) ||
					ts.isJsxFragment(node)
				) {
					containsJsx = true;
					return;
				}
				ts.forEachChild(node, visitor);
			}

			visitor(sourceFile);

			return containsJsx;
		}
		/**
		 * Checks if a given node is inside a namespace declaration.
		 * It does this by traversing up the parent nodes until it finds a module declaration with the namespace flag set.
		 * @param n The node to check.
		 * @returns true if the node is inside a namespace declaration, false otherwise.
		 */
		export const isInsideNamespace = (n: ts.Node): boolean => {
			let current: ts.Node | undefined = n.parent;
			while (current) {
				if (
					ts.isModuleDeclaration(current) &&
					current.flags === ts.NodeFlags.Namespace
				) {
					return true;
				}
				current = current.parent;
			}
			return false;
		};
		/**
		 * Check if a given module is a Node.js built-in module.
		 * @param {string} input - The module to check.
		 * @returns {boolean} True if the module is a Node.js built-in module, false otherwise.
		 */
		export const isNodeBuiltinModule = (input: string): boolean => {
			const nodeModuleSpecifier: string = "node:";
			const nodeBuiltinModules = new Set<string>(module.builtinModules);
			return (
				input.startsWith(nodeModuleSpecifier) || nodeBuiltinModules.has(input)
			);
		};
	} // namespace checks
	export namespace promises {
		// biome-ignore-start lint/suspicious/noExplicitAny: unknown
		type Fun<T> = (...arg: any) => T;
		type Param<T> = [Fun<T>, ...any[]];

		function isPromiseFun<T>(fun: Fun<T>): boolean {
			return (
				Object.prototype.toString.call(fun) === "[object AsyncFunction]" ||
				fun.constructor.name === "AsyncFunction"
			);
		}

		function walkPromise<T>(param: Param<T>) {
			const fn = param[0];
			const args = param.slice(1);
			if (isPromiseFun(fn)) {
				return async () => await fn(...args);
			} else {
				return async () => fn(...args);
			}
		}

		export function resolve<R extends any[]>(
			params: {
				[K in keyof R]: Param<R[K]>;
			},
		) {
			const funs = params.map((w) => walkPromise(w));

			const series = async () => {
				const results: any[] = [];
				for (const [index, task] of funs.entries()) {
					try {
						const result = await task();
						results.push(result);
					} catch (error) {
						console.error(`Error in task ${index + 1}`);
						throw error;
					}
				}
				return results;
			};

			const concurrent = async () => {
				try {
					return await Promise.all(funs.map((f) => f()));
				} catch (error) {
					console.error("One of the functions rejected:", error);
					throw error;
				}
			};

			const allSettled = async () => {
				try {
					const settled = await Promise.allSettled(funs.map((f) => f()));
					const fulfilled = settled.filter(
						(re): re is PromiseFulfilledResult<any> =>
							re.status === "fulfilled",
					);
					const rejected = settled.filter(
						(re): re is PromiseRejectedResult => re.status === "rejected",
					);
					if (rejected.length > 0) {
						console.warn("One of the functions rejected:", rejected[0]?.reason);
						process.exit(1);
					}
					return fulfilled.map((re) => re.value);
				} catch (error) {
					console.error("One of the functions rejected:", error);
					throw error;
				}
			};
			return {
				series: series as () => Promise<R>,
				concurrent: concurrent as () => Promise<R>,
				allSettled: allSettled as () => Promise<R>,
			};
		}

		export async function run<T = any>(
			fun: (...args: any[]) => T,
			time: number | undefined,

			...args: any[]
		): Promise<T> {
			return new Promise<T>((resolve, reject) => {
				try {
					const t = time ? 0 : time;
					const result: T = fun(...args);
					setTimeout(() => resolve(result), t);
				} catch (error) {
					reject(error);
				}
			});
		}
		// biome-ignore-end lint/suspicious/noExplicitAny: unknown
	} // namespace promises
	export namespace gen {
		export const mergeStringArr = (input: string[][]): string[] => {
			return input.reduce((prev, curr) => prev.concat(curr), []);
		};
		export function splitCamelCase(str: string): string {
			const splitString = str
				.replace(/([a-z])([A-Z])/g, "$1 $2")
				.replace(/(_|-|\/)([a-z] || [A-Z])/g, " ")
				.replace(/([A-Z])/g, (match) => match.toLowerCase())
				.replace(/^([a-z])/, (match) => match.toUpperCase());
			return splitString;
		}
		export function packageJson() {
			const packageContent = fs.readFileSync(
				path.resolve(process.cwd(), "package.json"),
				"utf8",
			);
			const pkg = JSON.parse(packageContent);
			const name = pkg.name ?? "";
			const version = pkg.version ?? "";
			/**
			 * Get package name and version
			 * @returns {string}
			 */
			const pkgNameVersion = (): string => {
				let pkg_nv = "";
				if (name !== "" && version !== "") {
					pkg_nv = `${name}@${version}`;
				} else if (name !== "" && version === "") {
					pkg_nv = `${name}`;
				} else if (name === "" && version !== "") {
					pkg_nv = `the project@${version}`;
				} else {
					pkg_nv = "the project";
				}
				return pkg_nv;
			};
			const dependencies = (): string[] => {
				const deps = Object.keys(pkg.dependencies ?? {});
				const devDeps = Object.keys(pkg.devDependencies ?? {});
				return [...deps, ...devDeps];
			};

			// -----------------------------------------
			return { pkgNameVersion, dependencies };
		}
		/**
		 * Merge a list of import statements into a minimal set of import statements.
		 * The algorithm works by grouping imports by module path and then merging them into a single import statement.
		 * Type imports are processed first, and then regular imports are processed.
		 * The resulting import statements are sorted alphabetically by module path.
		 * @param imports - A list of import statements to merge.
		 * @returns A list of merged import statements.
		 */
		export function mergeImportsStatement(imports: string[]): string[] {
			const importMap = new Map<string, Set<string>>();
			const typeImportMap = new Map<string, Set<string>>();
			const defaultImports = new Map<string, Set<string>>();
			const typeDefaultImports = new Map<string, Set<string>>();
			const namespaceImports = new Map<string, Set<string>>();

			// Parse each import statement
			for (const importStr of imports) {
				const importMatch = importStr.match(
					/import\s+(?:type\s+)?(?:(.*?)\s+from\s+)?["']([^"']+)["'];?/,
				);
				if (!importMatch) continue;

				const [, importClause, _modulePath] = importMatch;
				const isTypeImport = importStr.includes("import type");
				const modulePath = _modulePath as string;

				if (!importClause) {
					// Default import or side-effect import
					const defaultMatch = importStr.match(/import\s+(?:type\s+)?(\w+)/);
					if (defaultMatch) {
						const importName = defaultMatch[1] as string;
						const targetMap = isTypeImport
							? typeDefaultImports
							: defaultImports;
						if (!targetMap.has(modulePath))
							targetMap.set(modulePath, new Set());
						targetMap.get(modulePath)?.add(importName);
					}
					continue;
				}

				if (importClause.startsWith("{")) {
					// Named imports: import { a, b } from 'module'
					const targetMap = isTypeImport ? typeImportMap : importMap;
					if (!targetMap.has(modulePath)) targetMap.set(modulePath, new Set());

					const names = importClause
						.replace(/[{}]/g, "")
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean);
					// biome-ignore  lint/suspicious/useIterableCallbackReturn : just add name for names each
					names.forEach((name) => targetMap.get(modulePath)?.add(name));
				} else if (importClause.startsWith("* as")) {
					// Namespace import: import * as name from 'module'
					const namespaceMatch = importClause.match(/\*\s+as\s+(\w+)/);
					if (namespaceMatch) {
						const namespaceName = namespaceMatch[1] as string;
						if (!namespaceImports.has(modulePath))
							namespaceImports.set(modulePath, new Set());
						namespaceImports.get(modulePath)?.add(namespaceName);
					}
				} else {
					// Default import: import name from 'module'
					const targetMap = isTypeImport ? typeDefaultImports : defaultImports;
					if (!targetMap.has(modulePath)) targetMap.set(modulePath, new Set());
					targetMap.get(modulePath)?.add(importClause.trim());
				}
			}

			const mergedImports: string[] = [];

			// Process named imports - remove type imports that have regular imports
			for (const [modulePath, regularNames] of importMap) {
				const typeNames = typeImportMap.get(modulePath) || new Set();

				// Only include type names that don't have regular imports
				const finalNames = new Set([...regularNames]);
				for (const typeName of typeNames) {
					if (!regularNames.has(typeName)) {
						finalNames.add(typeName);
					}
				}

				if (finalNames.size > 0) {
					const importNames = Array.from(finalNames).sort().join(", ");
					mergedImports.push(`import { ${importNames} } from "${modulePath}";`);
				}
			}

			// Add remaining type-only imports (where no regular imports exist for the module)
			for (const [modulePath, typeNames] of typeImportMap) {
				if (!importMap.has(modulePath) && typeNames.size > 0) {
					const importNames = Array.from(typeNames).sort().join(", ");
					mergedImports.push(
						`import type { ${importNames} } from "${modulePath}";`,
					);
				}
			}

			// Process default imports - remove type default imports that have regular default imports
			for (const [modulePath, regularDefaultNames] of defaultImports) {
				const typeDefaultNames =
					typeDefaultImports.get(modulePath) || new Set();

				// Only include type default names that don't have regular default imports
				const finalNames = new Set([...regularDefaultNames]);
				for (const typeName of typeDefaultNames) {
					if (!regularDefaultNames.has(typeName)) {
						finalNames.add(typeName);
					}
				}

				if (finalNames.size > 0) {
					const importNames = Array.from(finalNames).join(", ");
					mergedImports.push(`import ${importNames} from "${modulePath}";`);
				}
			}

			// Add remaining type-only default imports
			for (const [modulePath, typeDefaultNames] of typeDefaultImports) {
				if (!defaultImports.has(modulePath) && typeDefaultNames.size > 0) {
					const importNames = Array.from(typeDefaultNames).join(", ");
					mergedImports.push(
						`import type ${importNames} from "${modulePath}";`,
					);
				}
			}

			// Process namespace imports
			for (const [modulePath, names] of namespaceImports) {
				if (names.size > 0) {
					const importNames = Array.from(names).join(", ");
					mergedImports.push(
						`import * as ${importNames} from "${modulePath}";`,
					);
				}
			}

			return mergedImports.sort();
		} //--
		/**
		 * Applies a given transformer to a source file and returns the modified code.
		 * @param transformer A transformer factory that will be called with the source file.
		 * @param sourceFile The source file to which the transformer will be applied.
		 * @param compilerOptions Compiler options to use when applying the transformer.
		 * @returns The modified code after applying the transformer.
		 */
		export function transformFunction(
			transformer: ts.TransformerFactory<ts.SourceFile>,
			sourceFile: ts.SourceFile,
			compilerOptions: ts.CompilerOptions,
		) {
			const transformationResult = ts.transform(
				sourceFile,
				[transformer],
				compilerOptions,
			);
			const transformedSourceFile = transformationResult.transformed[0];
			const printer = ts.createPrinter({
				newLine: ts.NewLineKind.LineFeed,
				removeComments: false,
			});
			const modifiedCode = printer.printFile(
				transformedSourceFile as ts.SourceFile,
			);
			transformationResult.dispose();
			return modifiedCode;
		} //--
		/**
		 * Finds all the properties accessed in the given node.
		 * @param {ts.Node} node - The node to search through.
		 * @returns {string[]} - An array of all the properties accessed.
		 */
		export function findProperty(node: ts.Node): string[] {
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
	} // namespace gen
} // namespace utils

export { utils };
