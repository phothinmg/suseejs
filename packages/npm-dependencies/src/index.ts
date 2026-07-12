import path from "node:path";
import fs from "node:fs";
import { builtinModules } from "node:module";

type ExpSub = {
  commonjsExport?: string;
  esmExport?: string;
  typesExport?: string;
  defaultExport?: string;
};
type ModuleExport = {
  type: "module_export_type";
  commonjsExport?: string;
  esmExport?: string;
  typesExport?: string;
  defaultExport?: string;
};
type PathExport = {
  type: "path_export_type";
  commonjsExport?: string;
  esmExport?: string;
  typesExport?: string;
  defaultExport?: string;
  subPathExport?: Record<string, ExpSub>;
};
type ExpResult = ModuleExport | PathExport;

const root = process.cwd();

async function getLocalDeps(): Promise<string[]> {
  let local_dependencies: string[] = [];
  const local_packageJsonPath = path.resolve(root, "package.json");
  const local_pkgContent = await fs.promises.readFile(
    local_packageJsonPath,
    "utf8",
  );
  const local_pkgData = JSON.parse(local_pkgContent);
  const local_dependencies_obj = local_pkgData["dependencies"];
  const local_devDependencies_obj = local_pkgData["devDependencies"];
  if (local_dependencies_obj) {
    const local_deps = Object.keys(local_dependencies_obj) as string[];
    if (local_deps.length > 0) {
      local_dependencies = [...local_dependencies, ...local_deps];
    }
  }
  if (local_devDependencies_obj) {
    const local_devDeps = Object.keys(local_devDependencies_obj) as string[];
    if (local_devDeps.length > 0) {
      local_dependencies = [...local_dependencies, ...local_devDeps];
    }
  }
  return local_dependencies;
}

const isNodeModules = (str: string) =>
  str.startsWith("node:") || builtinModules.includes(str);
const isLocalModules = (str: string) =>
  str.startsWith("./") || str.startsWith("../");
const isTypesPackage = (str: string) => str.startsWith("@types/");
const isTypeScript = (str: string) => str === "typescript";
const isScopePackage = (str: string) =>
  str.startsWith("@") && !isTypesPackage(str) && str.split("/").length > 1;

const isCleanPath = (str: string) =>
  !isNodeModules(str) &&
  !isLocalModules(str) &&
  !isTypesPackage(str) &&
  !isTypeScript(str);

const isInstalled = (cleanPath: string, modules: string[]) =>
  modules.includes(cleanPath);

const singlePathObj = (str: string) => {
  const isClean = isCleanPath(str);
  if (!isClean) return;
  let modPath = str;
  let subPath: string | null = null;
  const s = str.split("/");
  let lastPath = "";
  if (isScopePackage(str)) {
    if (s.length > 2) {
      modPath = s.slice(0, 2).join("/");
      lastPath = s.slice(2).join("/");
      subPath = `./${lastPath}`;
    } else {
      modPath = str;
    }
  } else {
    if (s.length > 1) {
      modPath = s.slice(0, 1).join("/");
      lastPath = s.slice(1).join("/");
      subPath = `./${lastPath}`;
    } else {
      modPath = str;
    }
  }
  return { modPath, subPath };
};
/**
 * Check npm dependency from graph
 *
 * @param npmPath
 *
 * @returns modules path and sub path export
 */
async function finalLocalCheck(npmPath: string) {
  const modules = await getLocalDeps();
  const pathObj = singlePathObj(npmPath);
  if (!pathObj) return;
  if (!isInstalled(pathObj.modPath, modules)) {
    console.error(
      `${pathObj.modPath} dose not exists in your package.json or dose not installed.!`,
    );
    process.exit(1);
  }
  const modPath = path.resolve(root, "node_modules", pathObj.modPath);
  return {
    modPath,
    subPath: pathObj.subPath,
    modName: pathObj.modPath,
  };
}

function getExportObjType(expObj: Record<string, any>) {
  const keysType: string[] = [
    "require",
    "import",
    "module-sync",
    "node",
    "default",
    "types",
  ];
  const isDE = keysType.some((k) => k in expObj);
  return isDE ? "module_export_type" : "path_export_type";
}

function getKeysResult(expObj: Record<string, any>, resolvedPath: string) {
  const keys = Object.keys(expObj);
  let result = {} as ExpResult;
  result.type = getExportObjType(expObj);
  if (result.type === "path_export_type") {
    result.subPathExport = {};
  }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (result.type === "module_export_type") {
      const isLastKey = i === keys.length - 1;
      let getTypes = false;
      let getCommonjs = false;
      let getESM = false;
      if (key === "types" && typeof expObj[key] === "string") {
        result.typesExport = path.join(resolvedPath, expObj[key]);
        getTypes = true;
      }
      if (key === "require") {
        if (typeof expObj[key] === "string") {
          result.commonjsExport = path.join(resolvedPath, expObj[key]);
          getCommonjs = true;
        } else {
          if (expObj[key].default) {
            result.commonjsExport = path.join(
              resolvedPath,
              expObj[key].default,
            );
            getCommonjs = true;
          }

          if (expObj[key].types && isLastKey && !getTypes)
            result.typesExport = path.join(resolvedPath, expObj[key].types);
        }
      }
      if (key === "import") {
        if (typeof expObj[key] === "string") {
          result.esmExport = path.join(resolvedPath, expObj[key]);
          getESM = true;
        } else {
          if (expObj[key].default) {
            result.esmExport = path.join(resolvedPath, expObj[key].default);
            getESM = true;
          }

          if (expObj[key].types && isLastKey && !getTypes)
            result.typesExport = path.join(resolvedPath, expObj[key].types);
        }
      }
      if (isLastKey && !getCommonjs && !getESM && key === "default") {
        result.defaultExport = path.join(resolvedPath, expObj[key]);
      }
    }
    if (result.type === "path_export_type") {
      if (key === ".") {
        if (typeof expObj[key] === "string") {
          result.defaultExport = path.join(resolvedPath, expObj[key]);
        } else {
          const obj2 = expObj[key];
          const keys2 = Object.keys(obj2);
          let getTypes2 = false;
          let getCommonjs2 = false;
          let getESM2 = false;
          for (let j = 0; j < keys2.length; j++) {
            const key2 = keys2[j];
            const isLastKey2 = j === keys2.length - 1;
            if (key2 === "types" && typeof obj2[key2] === "string") {
              result.typesExport = path.join(resolvedPath, obj2[key2]);
              getTypes2 = true;
            } // 1
            if (key2 === "require") {
              if (typeof obj2[key2] === "string") {
                result.commonjsExport = path.join(resolvedPath, obj2[key2]);
                getCommonjs2 = true;
              } else {
                if (obj2[key2].default) {
                  result.commonjsExport = path.join(
                    resolvedPath,
                    obj2[key2].default,
                  );
                  getCommonjs2 = true;
                }

                if (obj2[key2].types && isLastKey2 && !getTypes2)
                  result.typesExport = path.join(
                    resolvedPath,
                    obj2[key2].types,
                  );
              }
            } // 2
            if (key2 === "import") {
              if (typeof obj2[key2] === "string") {
                result.esmExport = path.join(resolvedPath, obj2[key2]);
                getESM2 = true;
              } else {
                if (obj2[key2].default) {
                  result.esmExport = path.join(
                    resolvedPath,
                    obj2[key2].default,
                  );
                  getESM2 = true;
                }

                if (obj2[key2].types && isLastKey2 && !getTypes2)
                  result.typesExport = path.join(
                    resolvedPath,
                    obj2[key2].types,
                  );
              }
            } // 3
            if (isLastKey2 && !getCommonjs2 && !getESM2 && key2 === "default") {
              result.defaultExport = path.join(resolvedPath, obj2[key2]);
            } // 4
          }
        }
      } else {
        let supExp = {} as ExpSub;
        if (typeof expObj[key as string] === "string") {
          supExp["defaultExport"] = path.join(
            resolvedPath,
            expObj[key as string],
          );
        } else {
          const obj3 = expObj[key as string];
          const keys3 = Object.keys(obj3);
          let getTypes3 = false;
          let getCommonjs3 = false;
          let getESM3 = false;
          for (let k = 0; k < keys3.length; k++) {
            const key3 = keys3[k];
            const isLastKey3 = k === keys3.length - 1;
            if (key3 === "types" && typeof obj3[key3] === "string") {
              supExp.typesExport = path.join(resolvedPath, obj3[key3]);
              getTypes3 = true;
            } // 1
            if (key3 === "require") {
              if (typeof obj3[key3] === "string") {
                supExp.commonjsExport = path.join(resolvedPath, obj3[key3]);
                getCommonjs3 = true;
              } else {
                if (obj3[key3].default) {
                  supExp.commonjsExport = path.join(
                    resolvedPath,
                    obj3[key3].default,
                  );
                  getCommonjs3 = true;
                }

                if (obj3[key3].types && isLastKey3 && !getTypes3)
                  supExp.typesExport = path.join(
                    resolvedPath,
                    obj3[key3].types,
                  );
              }
            } // 2
            if (key3 === "import") {
              if (typeof obj3[key3] === "string") {
                supExp.esmExport = path.join(resolvedPath, obj3[key3]);
                getESM3 = true;
              } else {
                if (obj3[key3].default) {
                  supExp.esmExport = path.join(
                    resolvedPath,
                    obj3[key3].default,
                  );
                  getESM3 = true;
                }

                if (obj3[key3].types && isLastKey3 && !getTypes3)
                  supExp.typesExport = path.join(
                    resolvedPath,
                    obj3[key3].types,
                  );
              }
            } // 3
            if (isLastKey3 && !getCommonjs3 && !getESM3 && key3 === "default") {
              supExp.defaultExport = path.join(resolvedPath, obj3[key3]);
            } // 4
          }
        }
        if (result.subPathExport) {
          result.subPathExport[key as string] = supExp;
        }
      }
    }
  }
  return result;
}

function resolveSubPathExport(
  subPath: string,
  subPathExport: Record<string, ExpSub>,
) {
  const exactMatch = subPathExport[subPath];
  if (exactMatch) return exactMatch;

  const hasNestedExplicitMatch = Object.keys(subPathExport).some(
    (exportPath) =>
      !exportPath.includes("*") && exportPath.startsWith(`${subPath}/`),
  );
  if (hasNestedExplicitMatch) {
    return;
  }

  for (const [exportPath, exportValue] of Object.entries(subPathExport)) {
    const wildcardIndex = exportPath.indexOf("*");
    if (wildcardIndex === -1) continue;

    const prefix = exportPath.slice(0, wildcardIndex);
    const suffix = exportPath.slice(wildcardIndex + 1);
    if (!subPath.startsWith(prefix) || !subPath.endsWith(suffix)) continue;

    const wildcardValue = subPath.slice(
      prefix.length,
      subPath.length - suffix.length,
    );
    if (wildcardValue.length === 0 || wildcardValue.includes("/")) continue;

    const resolvedExport = {} as ExpSub;
    if (exportValue.commonjsExport) {
      resolvedExport.commonjsExport = exportValue.commonjsExport.replace(
        "*",
        wildcardValue,
      );
    }
    if (exportValue.esmExport) {
      resolvedExport.esmExport = exportValue.esmExport.replace(
        "*",
        wildcardValue,
      );
    }
    if (exportValue.typesExport) {
      resolvedExport.typesExport = exportValue.typesExport.replace(
        "*",
        wildcardValue,
      );
    }
    if (exportValue.defaultExport) {
      resolvedExport.defaultExport = exportValue.defaultExport.replace(
        "*",
        wildcardValue,
      );
    }
    return resolvedExport;
  }
}

async function getNodeModuleData(
  resolvePath: string,
  modName: string,
  subPath?: string | null,
) {
  const node_packageJsonPath = path.join(resolvePath, "package.json");
  const node_package_content = await fs.promises.readFile(
    node_packageJsonPath,
    "utf8",
  );
  const node_package_data = JSON.parse(node_package_content);
  let result = {} as ExpResult;
  const module_type: "module" | "commonjs" =
    node_package_data["type"] ?? "commonjs";
  const main_export: string | undefined = node_package_data["main"];
  const module_export: string | undefined = node_package_data["module"];
  const types_export: string | undefined = node_package_data["types"];
  const exports_obj: Record<string, any> | undefined =
    node_package_data["exports"];
  if (exports_obj) {
    const keyResult = getKeysResult(exports_obj, resolvePath);
    result.type = keyResult.type;
    if (
      subPath &&
      keyResult.type === "path_export_type" &&
      keyResult.subPathExport
    ) {
      const selectedSubPath = resolveSubPathExport(
        subPath,
        keyResult.subPathExport,
      );
      if (!selectedSubPath) {
        console.error(`No exported subpath ${subPath} found in ${modName}`);
        process.exit(1);
      }
      return {
        exports: {
          type: "module_export_type",
          ...selectedSubPath,
        },
        type: module_type,
      };
    }
    // ---
    if (main_export) {
      result.commonjsExport = path.join(resolvePath, main_export);
    } else if (keyResult.commonjsExport) {
      result.commonjsExport = keyResult.commonjsExport;
    } else {
      console.warn(`No commonjs export found in ${modName}`);
    }
    // --
    if (module_export) {
      result.esmExport = path.join(resolvePath, module_export);
    } else if (keyResult.esmExport) {
      result.esmExport = keyResult.esmExport;
    } else {
      console.warn(`No esm export found in ${modName}`);
    }
    //--
    if (types_export) {
      result.typesExport = path.join(resolvePath, types_export);
    } else if (keyResult.typesExport) {
      result.typesExport = keyResult.typesExport;
    } else {
      console.warn(`No types export found in ${modName}`);
    }
    // --
    if (keyResult.defaultExport) {
      result.defaultExport = keyResult.defaultExport;
    }
    // ---
    if (
      keyResult.type === "path_export_type" &&
      keyResult.subPathExport &&
      result.type === "path_export_type"
    ) {
      result.subPathExport = keyResult.subPathExport;
    }
  } else {
    if (main_export) {
      result.commonjsExport = path.join(resolvePath, main_export);
    }
    if (module_export) {
      result.esmExport = path.join(resolvePath, module_export);
    }
    if (types_export) {
      result.typesExport = path.join(resolvePath, types_export);
    }
  }
  if (
    !result.commonjsExport &&
    !result.esmExport &&
    !result.defaultExport &&
    !(result as PathExport).subPathExport
  ) {
    console.error(`Any exported modules from imported ${modName}`);
    process.exit(1);
  }
  return { exports: result, type: module_type };
}

async function resolveNmpModules(npmPath: string) {
  const lc = await finalLocalCheck(npmPath);
  if (lc) {
    const rs = await getNodeModuleData(lc.modPath, lc.modName, lc.subPath);
    if (lc.subPath) {
      const spe = (rs.exports as PathExport).subPathExport;
      if (spe) {
        if (!(lc.subPath in spe)) {
          console.error("No submodule export found.");
          process.exit(1);
        }
      }
    }
    return rs;
  }
}
