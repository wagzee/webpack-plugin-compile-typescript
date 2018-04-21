# Typescript complier for Webpack

This plugin allows to compile and copy TS files using webpack.

##### Usage
Create new plugin for your webpack.config.js
```sh
new CompileTypescriptFilesPlugin({
    watch: true,
    src: {
        root: '/',
        folders: {
            'shared/**/*': '/**/*',
            'nodeserver/**/*': '/**/*'
        },
    },
})
```

##### Options
**src:** *object*

allow to configure source path and folders to watch.

 - `root`: the root of the source path

 - `folders`: object where the property keys are the source folders to watch, and the values are the destination folders

**watch:** *boolean*

if its true only the changed files will be compiled on webpack emit. if its false all the TS files will be compiled on every webpack emit.

**compileOptions:** *object*

Config object for typescript compile settings.

**Example:**
```
{
    noImplicitAny: true,
    noEmitOnError: true,
    target: tsc.ScriptTarget.ES2017,
    module: tsc.ModuleKind.CommonJS,
    sourceMap: true,
    baseUrl: './',
    outDir: './build',
}
```
