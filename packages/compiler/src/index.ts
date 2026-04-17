import ts from "typescript";

namespace SuseeCompilers {
	const exts = ["js", "ts", "cjs", "mjs", "cts", "mts", "tsx", "jsx"] as const;
	export interface CompilerPrams {
		sourceCode: string;
		declare?: boolean;
		sourceMap?: boolean;
		fileExt?: (typeof exts)[number];
		isNodeJS?: boolean;
		file_name?: string;
	}
	const is_jsx = (ext: (typeof exts)[number]) => ext === "tsx" || ext === "jsx";
	const is_js = (ext: (typeof exts)[number]) =>
		ext === "js" || ext === "mjs" || ext === "cjs";
	/**
	 * Creates a ts.CompilerHost that can be used with the typescript compiler.
	 * This host is designed to be used with in-memory compilation and will
	 * return the source file for the given fileName and will write all output
	 * files to the createdFiles object.
	 * @param {string} sourceCode - the source code to compile
	 * @param {string} fileName - the name of the file to compile
	 * @returns {{createdFiles: Record<string, string>, host: ts.CompilerHost}}
	 */
	function createHost(
		sourceCode: string,
		fileName: string,
	): {
		createdFiles: Record<string, string>;
		host: ts.CompilerHost;
	} {
		const createdFiles: Record<string, string> = {};
		const host: ts.CompilerHost = {
			getSourceFile: (file, languageVersion) => {
				if (file === fileName) {
					return ts.createSourceFile(file, sourceCode, languageVersion);
				}
				return undefined;
			},
			writeFile: (fileName, contents) => {
				createdFiles[fileName] = contents;
			},
			getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
			getCurrentDirectory: () => "",
			getDirectories: () => [],
			fileExists: (file) => file === fileName,
			readFile: (file) => (file === fileName ? sourceCode : undefined),
			getCanonicalFileName: (file) => file,
			useCaseSensitiveFileNames: () => true,
			getNewLine: () => "\n",
		};
		return { createdFiles, host };
	}
	/**
	 * Compiles a given source code into a CommonJS module.
	 * The compilation happens in-memory and returns the compiled code, declaration file, and source map.
	 * @param {CompilerPrams} params - the parameters for the compilation
	 * @returns {{code: string, dts: string | undefined, map: string | undefined}}
	 */
	export function toCommonJS({
		sourceCode,
		declare = false,
		sourceMap = false,
		fileExt = "ts",
		isNodeJS = false,
		file_name = "susee",
	}: CompilerPrams): {
		code: string;
		dts: string | undefined;
		map: string | undefined;
	} {
		const fileName = `${file_name}.${fileExt}`;
		const isJS = is_js(fileExt) ? { allowJs: true } : {};
		const isJSX = is_jsx(fileExt)
			? { allowJs: true, lib: ["DOM", "2020"], jsx: ts.JsxEmit.ReactJSX }
			: {};
		const is_node = isNodeJS ? { types: ["node"] } : { types: [] };
		const compilerOptions: ts.CompilerOptions = {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
			forceConsistentCasingInFileNames: true,
			strict: true,
			skipLibCheck: true,
			esModuleInterop: true,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			declaration: declare,
			sourceMap,
			...isJS,
			...isJSX,
			...is_node,
		};

		// create host
		const _host = createHost(sourceCode, fileName);
		const createdFiles: Record<string, string> = _host.createdFiles;
		const host = _host.host;
		const program = ts.createProgram([fileName], compilerOptions, host);
		program.emit();
		let dts: string | undefined;
		let map: string | undefined;
		let code: string = "";
		for (const key of Object.keys(createdFiles)) {
			//The output-file detection used broad regex patterns, so matching was unreliable

			if (key.endsWith(".js")) code = createdFiles[key] as string;
			if (key.endsWith(".d.ts")) dts = createdFiles[key] as string;
			if (key.endsWith(".js.map")) map = createdFiles[key] as string;
		}
		return { code, dts, map };
	}

	/**
	 * Compiles a given source code into an ES module.
	 * The compilation happens in-memory and returns the compiled code, declaration file, and source map.
	 * @param {CompilerPrams} params - the parameters for the compilation
	 * @returns {{code: string, dts: string | undefined, map: string | undefined}}
	 */
	export function toESM({
		sourceCode,
		declare = false,
		sourceMap = false,
		fileExt = "ts",
		isNodeJS = false,
		file_name = "susee",
	}: CompilerPrams): {
		code: string;
		dts: string | undefined;
		map: string | undefined;
	} {
		const fileName = `${file_name}.${fileExt}`;
		const isJS = is_js(fileExt) ? { allowJs: true } : {};
		const isJSX = is_jsx(fileExt)
			? { allowJs: true, lib: ["DOM", "2020"], jsx: ts.JsxEmit.ReactJSX }
			: {};
		const is_node = isNodeJS ? { types: ["node"] } : { types: [] };
		const compilerOptions: ts.CompilerOptions = {
			module: ts.ModuleKind.ES2020,
			target: ts.ScriptTarget.ES2020,
			forceConsistentCasingInFileNames: true,
			strict: true,
			skipLibCheck: true,
			esModuleInterop: true,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			declaration: declare,
			sourceMap,
			...isJS,
			...isJSX,
			...is_node,
		};

		// create host
		const _host = createHost(sourceCode, fileName);
		const createdFiles: Record<string, string> = _host.createdFiles;
		const host = _host.host;
		const program = ts.createProgram([fileName], compilerOptions, host);
		program.emit();
		let dts: string | undefined;
		let map: string | undefined;
		let code: string = "";
		for (const key of Object.keys(createdFiles)) {
			//The output-file detection used broad regex patterns, so matching was unreliable

			if (key.endsWith(".js")) code = createdFiles[key] as string;
			if (key.endsWith(".d.ts")) dts = createdFiles[key] as string;
			if (key.endsWith(".js.map")) map = createdFiles[key] as string;
		}
		return { code, dts, map };
	}
}

export { SuseeCompilers };
