const path = require("path");
const fs = require('fs')
const fg = require('fast-glob');
const babel = require("@babel/core");
const traverse = require("@babel/traverse").default;
const ts = require('typescript')
const { getRealResource, getChooseList, camelize, lookupDirs } = require('../utils/index')
const Watcher = require('../lib/watcher.js')
const PLUGIN_NAME = "ProjectSniappet";
const WEBPACK = 'webpack'
const VITE = "VITE"

const EXPORT_DEFAULE = "export default";
const EXPORT_SINGLE_NAME = "export single name"; // eg: export const a
const EXPORT_SINGLE_LIST = 'export single name list' // eg: export const name; export const age => export default {name,age}
let pluginType = null
let pluginThis = null

/**
 * 解析export
 * @param {*} node
 * @param {*} resource 文件路径
 */
function parseExport(node, resource) {
  const bodyPath = this.getPath(resource)
  const fileName = this.getFileName(resource)
  if (!this.collectMap[bodyPath]) {
    this.collectMap[bodyPath] = { name: [], path: bodyPath, fileName }
  }
  const { declaration, specifiers } = node
  if (specifiers && specifiers.length) {
    specifiers.forEach(specifier => {
      this.collectMap[bodyPath].name.push(specifier.exported.name)
    })
  }
  if (!declaration) return
  const { declarations, id } = declaration
  if (declarations) {
    if (Array.isArray(declarations)) {
      declarations.forEach(declarationItem => {
        const { id } = declarationItem
        if (id && id.name) {
          const item = {
            type: EXPORT_SINGLE_NAME,
            fileName,
            name: id.name,
            path: bodyPath,
          }
          this.collectMap[bodyPath].name.push(item.name)
        }
      })
    } else if (id && id.name || declarations && declarations.id && declarations.id.name) {
      this.collectMap[bodyPath].name.push(id.name)
    }
  } else if (declaration.specifiers && declaration.specifiers.length) {
    declaration.specifiers.forEach(specifier => {
      this.collectMap[bodyPath].name.push(specifier.exported.name)
    })
  } else if (id && id.name) {
    this.collectMap[bodyPath].name.push(id.name)
  }
}

/**
 * 解析export default
 * @param {*} statement ast节点
 * @param {*} parser webpack parser解析器
 */
function parseExportDefault(statement, resource) {
  const { declaration = {} } = statement;
  const bodyPath = this.getPath(resource)
  const fileName = this.getFileName(resource)
  if (!this.collectMap[bodyPath]) {
    this.collectMap[bodyPath] = { name: [], path: bodyPath, fileName }
  }
  if (declaration) {
    const { name, properties, property, id } = declaration;
    if (name) {
      this.mapObj[bodyPath] = {
        type: EXPORT_DEFAULE,
        fileName,
        name,
        path: bodyPath,
      }
    } else if (properties && properties.length) {
      properties.forEach(property => {
        this.collectMap[bodyPath].name.push(property.key.name)
      })
      this.mapObj[bodyPath] = {
        type: EXPORT_DEFAULE,
        fileName,
        name: fileName,
        path: bodyPath,
      }
    } else if (property && property.name) {
      this.mapObj[bodyPath] = {
        type: EXPORT_DEFAULE,
        fileName,
        name: property.name,
        path: bodyPath,
      }
    } else if (id && id.name) {
      this.mapObj[bodyPath] = {
        type: EXPORT_DEFAULE,
        fileName,
        name: id.name,
        path: bodyPath,
      }
    } else {
      this.mapObj[bodyPath] = {
        type: EXPORT_DEFAULE,
        fileName,
        name: fileName,
        path: bodyPath,
      }
    }
  }
}

/**
 * 根据导出路径，改为根据alias配置后的路径
 * @param {*} resource
 */
function getPath(resource) {
  let findAliasPath = false;
  let execPath = "";
  for (const key in this.aliasMap) {
    const value = this.aliasMap[key];
    try {
      if (resource.startsWith(value)) {
        const realtivePath = path.relative(value, resource);
        execPath = path.join(key, realtivePath);
        findAliasPath = true;
        break;
      }
    } catch (error) {
      console.log(error);
    }
  }
  // TODO 没有设置路径别名的时候可能显示为 a/b/c.js，不能正常显示
  // 或许可以通过在 loader处理的时候，将 a/b/c.js 转换为 正常可使用的路径
  if (!findAliasPath) {
    execPath = path.relative(this.context, resource);
  }
  // TODO 暂时直接将 packages\\autocomplete\\index.js =》 packages/autocomplete/index.js
  execPath = execPath.replace(/\\/g, "/");
  return execPath;
}

/**
 * 获取文件名
 * @param {*} resource 资源路径
 * @returns 文件名称，不带后缀
 */
function getFileName(resource) {
  const resourcePath = getRealResource(resource)
  const fileExtname = path.extname(resourcePath)
  return path.basename(resourcePath, fileExtname)
}

/**
 * 根据配置文件的配置，返回normalize之后的配置
 * @param {*} config
 * @returns
 */
function normalizeConfig(config) {
  if (pluginType === VITE) {
    const { root, resolve } = config
    // webpack 跟 vite 的匹配模式不一致，待后续处理
    // const { alias } = resolve
    return { alias: {}, context: root }
  } else if (pluginType === WEBPACK) {
    return { alias: config.resolve.alias, context: config.context }
  }
}

/**
 *  转换路径
 *  读取 webpack.config.js 配置中的alias，将路径转换为以alias为基准的相对路径
 *  @ 和 @src顺序转换，以免想用 @src 转换，结果用 @ 转了
 * @param {*} context
 * @param {*} alias
 */
function setAliasMap(context, alias = {}) {
  this.context = context;
  const aliasKeys = Object.keys(alias).map(it => ({ len: it.length, origin: it })).sort((a, b) => b.len - a.len).map(it => it.origin)
  for (let i = 0; i < aliasKeys.length; i++) {
    const key = aliasKeys[i]
    this.aliasMap[key] = alias[key]
  }
}

/**
 * 根据配置对象，生成全局 sniappet 文件
 * @param {*} map
 */
function generateSniappet(map) {
  const dir = '.vscode'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
  fs.writeFile(path.join(dir, 'snipints.code-snippets'), JSON.stringify(map, null, 2), (err) => {
    err && console.log(err);
    this.firstCompilation = true
  })
}

/**
 * 编译结束，或者需要重新执行时调用
 */
function afterCompile() {
  const map = {}
  const mapList = []
  let qid = 0
  for (const key in this.collectMap) {
    const exportItem = this.collectMap[key]
    if (exportItem.name.length <= 1) {
      mapList.push(exportItem)
    } else {
      mapList.push({ ...exportItem, type: EXPORT_SINGLE_LIST })
      exportItem.name.forEach((itemName) => {
        mapList.push({ ...exportItem, name: itemName, type: EXPORT_SINGLE_NAME })
      })
    }
  }
  for (const key in this.mapObj) {
    mapList.push(this.mapObj[key])
  }
  mapList.forEach(item => {
    let uniqName = Array.isArray(item.name) ? item.fileName : item.name
    let originName = uniqName
    while (map[uniqName]) {
      uniqName = uniqName + qid++
    }
    map[uniqName] = {
      prefix: originName,
      body: '',
      description: item.path
    }
    switch (item.type) {
      case EXPORT_DEFAULE:
        const itemDefaultName = camelize(item.name)
        map[uniqName].body = getChooseList([itemDefaultName, `import ${itemDefaultName} from "${item.path}";`,])
        break;
      case EXPORT_SINGLE_NAME:
        const itemSingleName = camelize(item.name)
        map[uniqName].body = getChooseList([itemSingleName, `import { ${itemSingleName} } from "${item.path}";`,])
        break;
      case EXPORT_SINGLE_LIST:
        const newList = item.name.map(it => camelize(item.fileName) + '.' + it)
        map[uniqName].body = getChooseList([camelize(item.fileName), newList.join(","), `import { ${item.name.join("\\, ")} } from "${item.path}";`, `import ${camelize(item.fileName)} from "${item.path}";`])
        break;
    }
  })
  this.generateSniappet(map)
}


function ProjectSniappet(options = {}) {
  // vite环境下的项目根目录
  let projectContext = null
  return {
    name: 'vite:project-snippet',
    context: __dirname,
    collectMap: {},
    mapObj: {},
    aliasMap: {},
    configResolved(resolvedConfig) {
      // 存储最终解析的配置
      const { context, alias = {} } = normalizeConfig(resolvedConfig)
      projectContext = context
      pluginThis = ProjectSniappet()
      pluginThis.setAliasMap(context, alias)
      options.dirs = (Array.isArray(options.dirs) ? options.dirs : [options.dirs]).filter(Boolean)
      const entries = fg.sync(['src/**/*', ...options.dirs], { dot: false, absolute: true, unique: true, ...options });
      compilerAll.bind(pluginThis)(entries)
    },
    configureServer(server) {
      if (!pluginThis) return
      server.watcher
        .on('change', relativePath => {
          const paths = Array.isArray(relativePath) ? relativePath : [relativePath]
          const entries = []
          paths.forEach(itemPath => {
            try {
              let stat = null
              if ((stat = fs.statSync(itemPath)) && stat.isFile()) {
                entries.push(itemPath)
              }
            } catch (error) {
              // console.log('change error :>> ', error);
            }
          })
          compilerAll.bind(pluginThis)(entries)
          console.log('collectMap :>> ', Object.keys(pluginThis.collectMap).map(itemPath => {
            return {
              name: pluginThis.collectMap[itemPath].name,
              itemPath
            }
          }));
          console.log('mapObj :>> ', Object.keys(pluginThis.mapObj).map(itemPath => {
            return {
              name: pluginThis.mapObj[itemPath].name,
              itemPath
            }
          }));
        }).on('unlink', relativePath => {
          const entries = Array.isArray(relativePath) ? relativePath : [relativePath]
          try {
            entries.forEach(bodyPath => {
              delete pluginThis.collectMap && pluginThis.collectMap[bodyPath]
              delete pluginThis.mapObj && pluginThis.mapObj[bodyPath]
            })
          } catch (error) {
            // console.log('unlink error :>> ', error);
          }
        });
    },
    apply(compiler, viteConfig) {
      if (viteConfig) {
        pluginType = VITE
        return viteConfig.command === 'serve'
      } else {
        pluginType = WEBPACK
      }
      const { context, alias = {} } = normalizeConfig(compiler.options)
      this.setAliasMap(context, alias)
      options.dirs = (Array.isArray(options.dirs) ? options.dirs : [options.dirs]).filter(Boolean)
      const entries = fg.sync(['src/**/*', ...options.dirs], { dot: false, absolute: true, unique: true, ...options });
      compilerAll.bind(this)(entries)
      new Watcher(context, options, (entries) => {
        // console.log('collectMap :>> ', Object.keys(this.collectMap).map(itemPath => {
        //   return {
        //     name: this.collectMap[itemPath].name,
        //     itemPath
        //   }
        // }));
        // console.log('mapObj :>> ', Object.keys(this.mapObj).map(itemPath => {
        //   return {
        //     name: this.mapObj[itemPath].name,
        //     itemPath
        //   }
        // }));
        compilerAll.bind(this)(entries)
      }, (entries) => {
        entries.forEach(bodyPath => {
          delete this.collectMap && this.collectMap[bodyPath]
          delete this.mapObj && this.mapObj[bodyPath]
        })
      })
    },
    setAliasMap,
    getPath,
    getFileName,
    parseExport,
    parseExportDefault,
    generateSniappet,
    afterCompile
  }
}


function compilerAll(entries = []) {

  const _this = this

  function parseCode(content, filePath) {
    const ast = babel.parseSync(content, {
      sourceType: "module",
      // plugins: ['@babel/plugin-syntax-jsx']
      // plugins: ['babel-plugin-syntax-jsx']
    });
    try {
      traverse(ast, {
        enter(path) {
          const { node } = path;
          // console.log(Object.keys(node));
          if (node.type === 'ExportNamedDeclaration') {
            _this.parseExport(node, filePath)
          } else if (node.type === 'ExportDefaultDeclaration') {
            _this.parseExportDefault(node, filePath)
            // console.log('filePath :>> ', filePath, node);
          }
        },
      });
    } catch (error) {
      console.log(error, filePath);
    }
  }
  for (let i = 0; i < entries.length; i++) {
    const filePath = entries[i];
    if (/\.tsx?/.test(filePath)) {
      console.log('ts文件');
      const content = fs.readFileSync(filePath, { encoding: 'utf8' })
      let { outputText } = ts.transpileModule(content, {
        compilerOptions: { rootDir: undefined },
        // transformers: '',
        reportDiagnostics: true,
        // fileName,
      });
      // console.log('object :>> ', outputText);
      // 替换不需要的代码
      outputText = outputText.replace(/Object.defineProperty\(exports,\s*"__esModule",\s*\{\s*value:\s*true\s*\}\)/g, '')
      let matches = outputText.match(/exports\.(.*?)(?=\s*=)/g)
      if (matches) {
        const bodyPath = this.getPath(filePath)
        const fileName = this.getFileName(filePath)
        matches = [...new Set(matches)].map(it => it.replace(/exports\./g, '').replace(/\s+/g, ''))
        const defaultIndex = matches.indexOf('default')
        if (defaultIndex > -1) {
          matches.splice(defaultIndex, 1)
          this.mapObj[bodyPath] = {
            type: EXPORT_DEFAULE,
            fileName,
            name: fileName,
            path: bodyPath,
          }
        }
        if (!this.collectMap[bodyPath]) {
          this.collectMap[bodyPath] = { name: matches, path: bodyPath, fileName }
        }
      }
      // parseCode(outputText, filePath)
    } else if (/\.jsx?/.test(filePath)) {
      const content = fs.readFileSync(filePath, { encoding: 'utf8' })
      parseCode(content, filePath)
    } else {
      const resourcePath = getRealResource(filePath)
      if (resourcePath === filePath) return
      const fileExtname = path.extname(resourcePath).slice(1)
      this.mapObj[bodyPath] = {
        type: EXPORT_DEFAULE,
        fileName,
        name: path.basename(resourcePath, '.' + fileExtname),
        path: this.getPath(resourcePath),
      }
    }
  }
  this.afterCompile()
}

module.exports = ProjectSniappet;
export default ProjectSniappet
