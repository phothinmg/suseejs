import type { SuseePlugin } from "@suseejs/type";
import * as terser from "terser";

function suseeTerser(
	terserMinifyOptions?: terser.MinifyOptions | undefined,
): SuseePlugin {
	return {
		type: "post-process",
		async: true,
		name: "@suseejs/plugin-terser",
		func: async (code, _file) => {
			const _code = (await terser.minify(code, terserMinifyOptions)).code;
			if (_code) {
				code = _code;
			}
			return code;
		},
	};
}

export { suseeTerser };
