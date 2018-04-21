const glob = require('glob');
const fs = require('fs');
const path = require('path');
const tsc = require('typescript');

module.exports = class CompileTypescriptPlugin {
    constructor(options = {}) {
        this.pluginOptions = options;
        this.compileOptions = Object.assign({
            typeRoots: [
                'node_modules/@types',
            ],
            types: [
                'node',
            ],
            // noImplicitAny: true,
            noEmitOnError: true,
            allowJs: true,
            target: tsc.ScriptTarget.ES2017,
            module: tsc.ModuleKind.CommonJS,
            lib: [
                'lib.es6.d.ts',
                'lib.es2017.full.d.ts',
            ],
            sourceMap: true,
            baseUrl: './',
            outDir: './build',
            exclude: [
                'node_modules',
                'build',
            ],
        }, (this.pluginOptions.compileOptions || {}));

        this.pluginOptions.src = this.pluginOptions.src || {};
        this.pluginOptions.src.root = this.pluginOptions.src.root || '';
        this.pluginOptions.src.folders = this.pluginOptions.src.folders || {};

        this.fileList = (Object.entries(this.pluginOptions.src.folders) || []).reduce((fileList, [sourcePattern, destinationPattern]) => {
            return [
                ...fileList,
                ...glob.sync(`./${this.pluginOptions.src.root}/${sourcePattern}.@(ts|tsx)`).map((file) => {
                    const fileName = path.basename(file);
                    const pathReplacer = `./${this.pluginOptions.src.root}${(sourcePattern.replace('/**', '').replace('/*', ''))}`;
                    const subPath = path.dirname(file).replace(pathReplacer, '');

                    return {
                        source: file,
                        destination: path.normalize(destinationPattern
                            .replace('/**', `/${subPath}`)
                            .replace('/*', `/${fileName}`)),
                    };
                }),
            ];
        }, []);
    }

    apply(compiler) {
        //
        // do some initialization after plugins added
        //
        compiler.plugin('after-plugins', () => {
            this.initFileWatcher();
            this.createServiceHost();
            if (this.pluginOptions.watch) {
                this.emitFiles(this.getWatchedFileNames());
            }
        });
        //
        // init emit event
        //
        compiler.plugin('emit', (compilation, callback) => {
            if (!this.pluginOptions.watch) {
                const fileNames = this.getWatchedFileNames();

                this.incrementFilesVersion(fileNames);
                this.emitFiles(fileNames);
            }
            callback();
        });
        //
        // init after-emit event
        //
        compiler.plugin('after-emit', (compilation, callback) => {
            if (this.errors.length > 0) {
                compilation.warnings = [...compilation.warnings, ...this.errors];
                this.errors = [];
            }
            callback();
        });
    }

    initFileWatcher() {
        this.watchedFiles = this.fileList.reduce((versionedFiles, fileName) => {
            return Object.assign(versionedFiles, {
                [fileName]: {
                    fileName,
                    version: 0,
                    watched: false,
                },
            });
        }, {});
        Object.entries(this.watchedFiles).forEach(([fileName]) => {
            if (this.pluginOptions.watch) {
                fs.watchFile(fileName,
                    { persistent: true, interval: 250 },
                    (curr, prev) => {
                        // Check timestamp
                        if (+curr.mtime <= +prev.mtime) {
                            return;
                        }
                        // throw new Error(`file has been changed: ${fileName}`);
                        // Update the version to signal a change in the file
                        this.incrementFilesVersion([fileName]);

                        // write the changes to disk
                        this.emitFile(fileName);
                    });
            }
        });
    }

    createServiceHost() {
        this.serviceHost = {
            getScriptFileNames: () => this.getWatchedFileNames(),
            getScriptVersion: fileName => this.watchedFiles[fileName] && this.watchedFiles[fileName].version.toString(),
            getScriptSnapshot: (fileName) => {
                if (!fs.existsSync(fileName)) {
                    return undefined;
                }

                return tsc.ScriptSnapshot.fromString(fs.readFileSync(fileName).toString());
            },
            getCurrentDirectory: () => process.cwd(),
            getCompilationSettings: () => this.compileOptions,
            getDefaultLibFileName: options => tsc.getDefaultLibFilePath(options),
            fileExists: tsc.sys.fileExists,
            readFile: tsc.sys.readFile,
            readDirectory: tsc.sys.readDirectory,
        };
        this.services = tsc.createLanguageService(this.serviceHost, tsc.createDocumentRegistry());
    }

    getWatchedFileNames() {
        return Object.entries(this.watchedFiles).map(([fileName]) => fileName);
    }

    incrementFilesVersion(fileNames) {
        (fileNames || []).forEach((fileName) => {
            this.watchedFiles[fileName].version += 1;
        });
    }

    emitFiles(fileNames) {
        this.errors = [];
        fileNames.forEach((fileName) => {
            this.emitFile(fileName);
        });
    }

    emitFile(fileName) {
        const output = this.services.getEmitOutput(fileName);

        if (!output.emitSkipped) {
            console.log(`Emitting ${fileName}`);
        } else {
            console.log(`Emitting ${fileName} failed`);
            this.logErrors(fileName);
        }

        output.outputFiles.forEach((o) => {
            this.constructor.mkDirByPathSync(this.constructor.getFolders(o.name));
            fs.writeFileSync(o.name, o.text, 'utf8');
        });
    }

    logErrors(fileName) {
        const allDiagnostics = this.services.getCompilerOptionsDiagnostics()
            .concat(this.services.getSyntacticDiagnostics(fileName))
            .concat(this.services.getSemanticDiagnostics(fileName));

        allDiagnostics.forEach((diagnostic) => {
            const message = tsc.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            let errorMsg = '';
            if (diagnostic.file) {
                const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

                errorMsg = `  Error ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
                this.errors.push(new Error(errorMsg));
            } else {
                errorMsg = `  Error: ${message}`;
                this.errors.push(new Error(errorMsg));
            }
        });
    }

    static getFolders(fileName) {
        const sep = path.sep;
        const folders = fileName.split(sep);
        return folders.slice(0, folders.length - 1).join(sep);
    }

    static mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
        const sep = path.sep;
        const initDir = path.isAbsolute(targetDir) ? sep : '';
        const baseDir = isRelativeToScript ? __dirname : '.';

        targetDir.split(sep).reduce((parentDir, childDir) => {
            const curDir = path.resolve(baseDir, parentDir, childDir);
            try {
                fs.mkdirSync(curDir);
            } catch (err) {
                if (err.code !== 'EEXIST') {
                    throw err;
                }
            }
            return curDir;
        }, initDir);
    }
};
