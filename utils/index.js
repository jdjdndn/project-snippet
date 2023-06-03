/**
 * 获取资源真实路径
 * @param {*} resource 资源路径
 * @returns 资源真实路径
 */
function getRealResource(resource) {
  try {
    resource = decodeURIComponent(resource)
  } catch (error) {
  }
  let index = resource.indexOf('?')
  if (index !== -1) {
    resource = resource.slice(0, index)
  }

  index = resource.indexOf('#')
  if (index !== -1) {
    resource = resource.slice(0, index)
  }
  return resource
}

/**
 * 根据数组变成vscode可用的待选数组
 * @param {*} list
 * @param {*} prefix
 * @returns
 */
function getChooseList(list, options = {}) {
  let arr = list;
  if (options.prefix) {
    arr = list.filter(Boolean).map((it) => {
      if (it.match(/\s+/)) {
        return it;
      } else {
        return prefix + it;
      }
    });
  }
  return "${1|" + arr.join(",") + "|}";
}

module.exports = {
  getRealResource,
  getChooseList
}