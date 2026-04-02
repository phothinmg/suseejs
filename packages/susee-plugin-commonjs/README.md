<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<div align="center">
<img src="https://susee.phothin.dev/logo/susee.webp" width="160" height="160" alt="susee" />
  <h1>Susee Plugin CommonJs</h1>
</div>

A Susee plugin that transforms commonjs exports and imports into ES modules.

## Install

```sh
npm i -D susee-plugin-commonjs
```

## Use

In your `susee.config.ts`

```ts
import type { SuSeeConfig } from "susee";
import suseeCommonJS from "susee-plugin-commonjs";

export default {
  entryPoints: [
    {
      entry: "src/index.ts",
      format: ["esm"],
      exportPath: ".",
    },
  ],
  plugins: [suseeCommonJS()],
} as SuSeeConfig;
```
