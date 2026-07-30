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
export { suseeBannerText };
//# sourceMappingURL=index.mjs.map