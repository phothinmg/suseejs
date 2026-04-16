import path from "node:path";
import tcolor from "@suseejs/color";
import ts from "typescript";

/**
 * Get the path of the configuration file.
 * If customConfigPath is provided and exists, use it.
 * If customConfigPath is not provided or does not exist, use the default configuration file.
 * @param {string | undefined} customConfigPath path of the custom configuration file.
 * @returns {string | undefined} path of the configuration file or undefined if customConfigPath does not exist.
 */
function getConfigPath(customConfigPath?: string | undefined) {
	let config_path: string | undefined;
	if (customConfigPath) {
		if (!ts.sys.fileExists(ts.sys.resolvePath(customConfigPath))) {
			console.error(
				`> ${tcolor.magenta(`Given custom file ${customConfigPath} does not exists`)}`,
			);
			ts.sys.exit(1);
		}
		config_path = customConfigPath;
		return config_path;
	} else {
		config_path = ts.findConfigFile(
			ts.sys.getCurrentDirectory(),
			ts.sys.fileExists,
		);
		return config_path;
	}
}

/**
 * Get the TypeScript compiler options for susee bundler.
 * @param {string | undefined} customConfigPath path of the custom configuration file.
 */
function getCompilerOptions(customConfigPath?: string | undefined): {
	commonjs: (out_dir?: string | undefined) => ts.CompilerOptions;
	esm: (out_dir?: string | undefined) => ts.CompilerOptions;
	defaultOptions: () => ts.CompilerOptions;
} {
	let tsconfig_opts: ts.CompilerOptions | undefined;
	const config_path = getConfigPath(customConfigPath);
	if (config_path) {
		const config = ts.readConfigFile(config_path, ts.sys.readFile);
		const basePath = path.dirname(config_path);
		const parsed = ts.parseJsonConfigFileContent(
			config.config,
			ts.sys,
			basePath,
		);
		tsconfig_opts = { ...parsed.options };
	}
	const commonjs = (out_dir?: string | undefined): ts.CompilerOptions => {
		const _out = out_dir ? out_dir : "dist";
		if (tsconfig_opts !== undefined) {
			const { rootDir, outDir, module, ...rest } = tsconfig_opts;
			return {
				outDir: _out,
				module: ts.ModuleKind.CommonJS,
				...rest,
			} as ts.CompilerOptions;
		} else {
			return {
				outDir: _out,
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.Latest,
			} as ts.CompilerOptions;
		}
	};
	const esm = (out_dir?: string | undefined): ts.CompilerOptions => {
		const _out = out_dir ? out_dir : "dist";
		if (tsconfig_opts !== undefined) {
			const { rootDir, outDir, module, ...rest } = tsconfig_opts;
			return {
				outDir: _out,
				module: ts.ModuleKind.ES2020,
				...rest,
			} as ts.CompilerOptions;
		} else {
			return {
				outDir: _out,
				module: ts.ModuleKind.ES2020,
				target: ts.ScriptTarget.Latest,
			} as ts.CompilerOptions;
		}
	};
	const defaultOptions = ts.getDefaultCompilerOptions;
	return { commonjs, esm, defaultOptions };
}

export { getCompilerOptions };
