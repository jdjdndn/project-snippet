const path = require("path");
const fs = require('fs')
const { getRealResource, getChooseList } = require('../utils/index')
const Watcher = require('../lib/watcher.js')
const PLUGIN_NAME = "ProjectSniappet";
const JAVASCRIPT_MODULE_TYPE_AUTO = "javascript/auto";
const JAVASCRIPT_MODULE_TYPE_DYNAMIC = "javascript/dynamic";
const JAVASCRIPT_MODULE_TYPE_ESM = "javascript/esm";

const EXPORT_DEFAULE = "export default";
const EXPORT_SINGLE_NAME = "export single name"; // eg: export const a
const EXPORT_SINGLE_LIST = 'export single name list' // eg: export const name; export const age => export default {name,age}

class ProjectSniappet {
  /**
   * Apply the plugin
   * @param {Compiler} compiler the compiler instance
   * @returns {void}
   */
  constructor(options = {}) {
    this.options = options;
    this.context = __dirname;
    this.aliasMap = {};
    // 存放 export default 导出的所有，可能一个文件中同时存在全量到处和单独导出，所有单独存放，防止放一起会被相同文件路径的key覆盖掉
    this.mapObj = {}
    // 收集零散的 exprt const ; export function
    this.collectMap = {}
    this.watcher = null
    // 首次执行编译是否完成
    this.firstCompilation = false
  }

  /**
   *  转换路径
   *  读取 webpack.config.js 配置中的alias，将路径转换为以alias为基准的相对路径
   *  @ 和 @src顺序转换，以免想用 @src 转换，结果用 @ 转了
   * @param {*} context
   * @param {*} alias
   */
  setAliasMap(context, alias = {}) {
    this.context = context;
    const aliasKeys = Object.keys(alias).map(it => ({ len: it.length, origin: it })).sort((a, b) => b.len - a.len).map(it => it.origin)
    for (let i = 0; i < aliasKeys.length; i++) {
      const key = aliasKeys[i]
      this.aliasMap[key] = alias[key]
    }
  }

  apply(compiler) {
    if (compiler.options.mode !== 'development') return
    const srcContext = compiler.context;
    // 默认忽略打包之后的文件夹
    this.options.ignored = Array.isArray(this.options.ignored) ? this.options.ignored.concat([compiler.options.output.path]) : [this.options.ignored].concat([compiler.options.output.path])
    this.setAliasMap(srcContext, compiler.options.resolve.alias);
    this.watchFileChange(srcContext, this.options)

    compiler.hooks.compilation.tap(
      PLUGIN_NAME,
      (compilation, { normalModuleFactory }) => {
        const handler = (parser) => {
          parser.hooks.export.tap(PLUGIN_NAME, (statement) => {
            this.parseExportDefault(statement, parser);
          });

          // parser.hooks.exportImport.tap(PLUGIN_NAME, (statement, source) => {
          //   // TODO 暂未发现需要处理的地方
          // });

          parser.hooks.exportDeclaration.tap(PLUGIN_NAME, (statement, declaration) => {
            this.parseExport(declaration, parser);
          });

          // parser.hooks.exportSpecifier.tap(PLUGIN_NAME, (statement, identifierName, exportName, index) => {
          //   this.parseExportSpecifier(statement, identifierName, exportName, index, parser);
          // });
        };
        normalModuleFactory.hooks.parser
          .for(JAVASCRIPT_MODULE_TYPE_AUTO)
          .tap(PLUGIN_NAME, handler);
        normalModuleFactory.hooks.parser
          .for(JAVASCRIPT_MODULE_TYPE_DYNAMIC)
          .tap(PLUGIN_NAME, handler);
        normalModuleFactory.hooks.parser
          .for(JAVASCRIPT_MODULE_TYPE_ESM)
          .tap(PLUGIN_NAME, handler);
      }
    );

    compiler.hooks.afterCompile.tap(PLUGIN_NAME, this.afterCompile.bind(this))

    compiler.hooks.watchClose.tap(PLUGIN_NAME, () => {
      this.watcher && this.watcher.close()
    })
  }

  /**
   * 处理未被webpack依赖收集的文件监听
   * @param {*} context
   * @param {*} options
   */
  watchFileChange(context, options) {
    // const _this = this
    this.watcher = new Watcher(context, (filePath, mtime, explanation) => {
      // 首次编译完成不处理事件，防止项目中有脚本生成新文件
      if (!this.firstCompilation) return
      const bodyPath = this.getPath(filePath)
      if (!explanation || explanation === 'null') {
        console.log(`remove ${filePath}`);
        delete this.mapObj && this.mapObj[bodyPath]
        delete this.collectMap && this.collectMap[bodyPath]
      } else if (explanation.includes('file')) {
        const fileName = this.getFileName(filePath)
        const content = fs.readFileSync(filePath, { encoding: 'utf-8' })
        if (content) {
          const names = []
          content.replace(/export\s+(?:var|const|let|class|function)\s+([A-Za-z0-9_]*)(?!\s{\(=)/g, (a, b) => {
            names.push(b)
          })
          content.replace(/module\.exports\.(.*?)\s*=/g, (a, b) => { names.push(b) })
          if (names.length) {
            this.collectMap[bodyPath] = {
              name: names,
              type: EXPORT_SINGLE_LIST,
              fileName,
              path: bodyPath
            }
          }
          if (content.match(/export\s+default\s+/g) || content.match(/module\.exports\s+/g)) {
            const fileExtname = path.extname(bodyPath)
            this.mapObj[bodyPath] = {
              type: EXPORT_DEFAULE,
              fileName,
              name: path.basename(bodyPath, fileExtname),
              path: bodyPath,
            }
          }
          this.afterCompile()
        }
      } else if (explanation.includes('dir')) {
        // console.log('dir change');
      }
    }, options)
  }

  /**
   * 根据配置对象，生成全局 sniappet 文件
   * @param {*} map
   */
  generateSniappet(map) {
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
  afterCompile() {
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
          map[uniqName].body = getChooseList([item.name, `import ${item.name} from "${item.path}";`,])
          break;
        case EXPORT_SINGLE_NAME:
          map[uniqName].body = getChooseList([item.name, `import { ${item.name} } from "${item.path}";`,])
          break;
        case EXPORT_SINGLE_LIST:
          const newList = item.name.map(it => item.fileName + '.' + it)
          map[uniqName].body = getChooseList([item.fileName, newList.join(","), `import { ${item.name.join("\\, ")} } from "${item.path}";`, `import ${item.fileName} from "${item.path}";`])
          break;
      }
    })
    this.generateSniappet(map)
  }

  /**
   * 解析export default expression
   * @param {*} declaration
   * @param {*} parser webpack parser解析器
   * @returns
   */
  parseExportSpecifier(statement, identifierName, exportName, index, parser) {
    const { resource, error, dependencies, blocks, context, _source } =
      parser.state.current;
    if (error) return;
    // console.log(Object.keys(statement), identifierName, exportName, index, resource);
    // const { declarations, id } = declaration
  }

  /**
   * 解析export
   * @param {*} declaration
   * @param {*} parser webpack parser解析器
   */
  parseExport(declaration, parser) {
    const { resource, error, dependencies, blocks, context, _source } =
      parser.state.current;
    if (error) return;
    const bodyPath = this.getPath(resource)
    const fileName = this.getFileName(resource)
    const { declarations, id } = declaration
    if (!this.collectMap[bodyPath]) {
      this.collectMap[bodyPath] = { name: [], path: bodyPath, fileName }
    }
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
      const item = {
        type: EXPORT_SINGLE_NAME,
        fileName,
        name: id.name,
        path: bodyPath,
      }
      this.collectMap[bodyPath].name.push(item.name)
    }

  }

  /**
   * 解析export default
   * @param {*} statement ast节点
   * @param {*} parser webpack parser解析器
   */
  parseExportDefault(statement, parser) {
    // TODO dependencies ,blocks 可以用来将依赖中的依赖也收集起来，方便其他地方使用
    // _source.source() 源代码
    const { resource, error, dependencies, blocks, context, _source } =
      parser.state.current;
    if (error) return;
    const { declaration = {} } = statement;
    const bodyPath = this.getPath(resource)
    const fileName = this.getFileName(resource)
    if (declaration) {
      const { name, properties, type } = declaration;
      // console.log(statement, resource);
      if (name) {
        // 这种情况好像没用，暂时不处理
        if (type === 'Identifier' && name === 'mod') return
        this.mapObj[bodyPath] = {
          type: EXPORT_DEFAULE,
          fileName,
          name,
          path: bodyPath,
        }
      } else if (properties && properties.length) { }
    } else {
      const resourcePath = getRealResource(resource)
      if (resourcePath === resource) return
      const fileExtname = path.extname(resourcePath).slice(1)
      const ignoreExtNameList = ['vue']
      if (ignoreExtNameList.includes(fileExtname)) {
        this.mapObj[bodyPath] = {
          type: EXPORT_DEFAULE,
          fileName,
          name: path.basename(resourcePath, '.' + fileExtname),
          path: this.getPath(resourcePath),
        }
      }
    }
  }

  /**
   * 根据导出路径，改为根据alias配置后的路径
   * @param {*} resource
   */
  getPath(resource) {
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
  getFileName(resource) {
    const resourcePath = getRealResource(resource)
    const fileExtname = path.extname(resourcePath)
    return path.basename(resourcePath, fileExtname)
  }
}

module.exports = ProjectSniappet;
