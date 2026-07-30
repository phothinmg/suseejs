import type { SuseePlugin } from "@suseejs/type";
import * as terser from "terser";
declare function suseeTerser(terserMinifyOptions?: terser.MinifyOptions | undefined): SuseePlugin;
export { suseeTerser };
