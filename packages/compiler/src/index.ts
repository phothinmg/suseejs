import path from "node:path";
import ts from "typescript";
export interface CompilerPrams {
	sourceCode: string;
	fileName: string;
	compilerOptions: ts.CompilerOptions;
}
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

function suseeCompiler({
	sourceCode,
	fileName,
	compilerOptions,
}: CompilerPrams) {
	// create host
	const _host = createHost(sourceCode, fileName);
	const createdFiles: Record<string, string> = _host.createdFiles;
	const host = _host.host;
	const program = ts.createProgram([fileName], compilerOptions, host);
	program.emit();
	let dts: string | undefined;
	let map: string | undefined;
	let code: string = "";
	let file_name: string = "";
	let out_dir: string = "";
	for (const key of Object.keys(createdFiles)) {
		if (key.endsWith(".js")) code = createdFiles[key] as string;
		if (key.endsWith(".d.ts")) dts = createdFiles[key] as string;
		if (key.endsWith(".js.map")) map = createdFiles[key] as string;
		file_name = path.basename(key).split(".")[0] as string;
		out_dir = path.dirname(key);
	}
	return { code, file_name, out_dir, dts, map };
}

export { suseeCompiler };
