const CompileTypescriptFilesPlugin = require('./index.js');
const tsc = require('typescript');

module.exports = {
    watch: true,
    mode: 'development',
    entry: "./src/index.js",
    plugins: [
        new CompileTypescriptFilesPlugin({
            watch: true,
            src: {
                root: '/',
                folders: {
                    'shared/**/*': '/**/*',
                    'nodeserver/**/*': '/**/*'
                },
            },
            compileOptions: {
                outDir: './dist',
                target: tsc.ScriptTarget.ES2015,
            },
        }),]
};
