const CompileTypescriptFilesPlugin = require('./index.js');
const tsc = require('typescript');

module.exports = {
    watch: true,
    mode: 'development',
    entry: "./src/test.ts",
    plugins: [
        new CompileTypescriptFilesPlugin({
            watch: true,
            src: {
                root: 'src/',
                folders: {
                    'server/**/*': 'server/*',
                    'shared/**/*': 'shared/**/*'
                },
            },
            compileOptions: {
                outDir: './dist',
                target: tsc.ScriptTarget.ES2015,
            },
        }),]
};