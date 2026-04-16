import fs from "node:fs";
import path from "node:path";
import data from "../../package.json" with { type: "json" };

/**
 * Returns the absolute path to tests/lcov.info for a package when it exists.
 * @param {string} packagePath
 * @returns {string | undefined}
 */
const getLcovFilePath = (packagePath) => {
  if (!packagePath || typeof packagePath !== "string") {
    return undefined;
  }

  const lcovFilePath = path.resolve(
    process.cwd(),
    packagePath,
    "tests",
    "lcov.info",
  );
  return fs.existsSync(lcovFilePath) ? lcovFilePath : undefined;
};

const normalizeSfPath = (sfPath) =>
  sfPath.trim().replace(/^\.\//, "").replace(/\\/g, "/");

async function lcovToCodecov() {
  const mergedChunks = [];
  for (const pkg of data.workspaces) {
    const lcovFile = getLcovFilePath(pkg);
    if (lcovFile) {
      const lcovContent = await fs.promises.readFile(lcovFile, "utf8");
      const records = lcovContent
        .split("end_of_record")
        .map((record) => record.trim())
        .filter(Boolean);
      /**
       * @type {{[file: string]: Record<number, number>}}
       */
      const _coverage = {};
      for (const record of records) {
        const lines = record
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        let file = "";
        /**
         * @type {Record<number, number>}
         */
        const lineHits = {};
        for (const line of lines) {
          if (line.startsWith("SF:")) {
            // file name
            file = normalizeSfPath(line.slice(3));
          } else if (line.startsWith("DA:")) {
            // DA:10,1
            const ln = line.slice(3).split(",").map(Number)[0];
            const hits = line.slice(3).split(",").map(Number)[1];
            lineHits[ln] = hits;
          }
        }
        if (file.startsWith("src")) {
          file = path.join(pkg, file);
          _coverage[file] = { ...lineHits };
          mergedChunks.push(_coverage);
        }
      } // ---
      await fs.promises.unlink(lcovFile);
    }
  } // --- pkg loop
  if (mergedChunks.length > 0) {
    let coverage = {};
    for (const chuck of mergedChunks) {
      const keys = Object.keys(chuck);
      keys.forEach((key) => {
        coverage[key] = chuck[key];
      });
    }
    const codecov = { coverage };
    const coverageDir = path.resolve(process.cwd(), "__tests__/coverage");
    if (!fs.existsSync(coverageDir)) {
      await fs.promises.mkdir(coverageDir, { recursive: true });
    }
    const coveragePath = path.join(coverageDir, "codecov.json");
    if (fs.existsSync(coveragePath)) {
      await fs.promises.unlink(coveragePath);
    }
    await fs.promises.writeFile(coveragePath, JSON.stringify(codecov));
  }
}

await lcovToCodecov();
