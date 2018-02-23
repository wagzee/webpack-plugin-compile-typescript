# Typescript complier for Webpack

This plugin allows to compile and copy TS files using webpack.

##### Usage
Create new plugin for your webpack.config.js
```sh
new CompileTypescriptFilesPlugin({
    watch: true,
    folders: [
        'foldersToScan',
    ],
})
```

##### Options
**folders:** *string[]*

list the routes what would you like to scan for typescript files (recursive).

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
