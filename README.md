# project-snippet
同时支持webpack和vite的插件，收集文件导出变量、函数、对象，给与输入提示

# config

```js
const options = {
  dirs: ["src/**/*"], // 一个符合 fast-glob 匹配模式的数组，默认会匹配src下的所有文件，首次执行会将dirs下所有文件导出变量收集起来
  ...chokidarOptions, // 监听文件的变化，收集变化文件的导出变量，支持chokidar的所有配置
};
```
