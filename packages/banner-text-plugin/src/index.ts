import type { SuseePlugin } from "@suseejs/type";

function suseeBannerText(bannerText: string): SuseePlugin {
	return {
		type: "post-process",
		async: false,
		name: "@suseejs/banner-text-plugin",
		func: (code, _file) => {
			return `${bannerText}\n\n${code}`;
		},
	};
}

export { suseeBannerText };
