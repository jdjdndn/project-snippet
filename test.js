const os = require('os')
const path = require('path')
const fs = require('fs')
/**
 * npm install --save-dev @babel/core
 * const babel = require("@babel/core");

babel.transformSync("code", optionsObject);
 */

/**
 * npm install --save-dev @babel/plugin-transform-typescript
 * {
  "plugins": ["@babel/plugin-transform-typescript"]
}
 */

function tryStatSync(file) {
  try {
    console.log('fs.statSync(file, { throwIfNoEntry: false }) :>> ', fs.statSync(file, { throwIfNoEntry: false }));
    return fs.statSync(file, { throwIfNoEntry: false })
  } catch (error) {
    console.log('error :>> ', error);
  }
}

/**
 * 向上查找所有的目录
 * @param {*} dir 目录
 * @param {*} fileNames 文件名列表
 * @returns 父级目录列表
 */
function lookupDirs(
  dir,
  fileNames,
) {
  const parentDirs = []
  while (dir) {
    for (const fileName of fileNames) {
      const fullPath = path.join(dir, fileName)
      if (tryStatSync(fullPath)?.isFile()) {
        parentDirs.push(dir)
      }
    }
    const parentDir = path.dirname(dir)
    if (parentDir === dir) return parentDirs

    dir = parentDir
  }
}

console.log(lookupDirs(__dirname, ['package.json']));