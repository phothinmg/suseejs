"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suseeBannerText = suseeBannerText;
function suseeBannerText(bannerText) {
    return {
        type: "post-process",
        async: false,
        name: "@suseejs/banner-text-plugin",
        func: (code, _file) => {
            return `${bannerText}\n\n${code}`;
        },
    };
}
//# sourceMappingURL=index.cjs.map