const glob = require('glob');
const fs = require('fs');
const path = require('path');
const tsc = require('typescript');
const chokidar = require('chokidar');
const minimatch = require("minimatch");

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

        this.fileList = []; //this.buildFileList();
    }

    getSrcFolders() {
        return (Object.entries(this.pluginOptions.src.folders) || []).reduce((srcFolders, [sourcePattern, destinationPattern]) => {
            return [
                ...srcFolders,
                ...[{
                    sourcePattern,
                    destinationPattern,
                    filePattern: path.normalize(`./${this.pluginOptions.src.root}/${sourcePattern}.@(ts|tsx)`)
                }],
            ];
        }, []);
    }

    getFilePatterns() {
        return this.getSrcFolders().map(({ sourcePattern, destinationPattern, filePattern }) => filePattern)
    }

    getPatternsByPath(path) {
        return this.getSrcFolders()
            .find(srcFoler => minimatch(path, srcFoler.filePattern));
    }

    createListedFile(filePath, patterns = {}) {
        const { destinationPattern, sourcePattern } = patterns;
        const pathReplacer = path.normalize(`./${this.pluginOptions.src.root}${(sourcePattern.replace('/**', '').replace('/*', ''))}`);
        const subPath = `${path.dirname(filePath)}/`.replace(pathReplacer, '');
        const destination = path.normalize(`${this.compileOptions.outDir}/${destinationPattern.replace('/**', `/${subPath}`).replace('/*', '/')}`)
        return {
            invalidated: false,
            version: 0,
            watched: false,
            source: filePath,
            destination,
        };
    }

    apply(compiler) {
        //
        // do some initialization after plugins added
        //
        compiler.plugin('after-plugins', () => {
            this.initSourceWatcher();
            this.initFileWatcher(this.fileList);
            this.createServiceHost();
            if (this.pluginOptions.watch) {
                this.emitFiles(this.fileList);
            }
        });
        //
        // init emit event
        //
        compiler.plugin('emit', (compilation, callback) => {
            if (!this.pluginOptions.watch) {
                this.incrementFilesVersion(this.fileList);
                this.emitFiles(this.fileList);
                this.srcWatcher.close();
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

    initSourceWatcher() {
        this.srcWatcher = chokidar.watch(this.getFilePatterns(), {
            persistent: true, interval: 250,
        });
        this.srcWatcher
            .on('add', (path, arg2) => {
                this.addToFileList(path);
            })
            .on('unlink', (removedPath) => {
                this.removeFileFromList(this.getFileByName(removedPath));
            })
    }

    initFileWatcher(files) {
        if (this.pluginOptions.watch) {
            files.forEach((file) => {
                file.watched = true;
                fs.watchFile(file.source,
                    { persistent: true, interval: 250 },
                    (curr, prev) => {
                        // Check timestamp
                        if (+curr.mtime <= +prev.mtime) {
                            return;
                        }
                        // throw new Error(`file has been changed: ${fileName}`);
                        // Update the version to signal a change in the file
                        this.incrementFilesVersion([file]);

                        // write the changes to disk
                        this.emitFile(file);
                    });
            });
        }
    }

    createServiceHost() {
        if ( this.serviceHost && this.services ) return;
        this.serviceHost = {
            getScriptFileNames: () => this.getFileNames(),
            getScriptVersion: fileName => this.getFileVersionByName(fileName),
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

    getFileVersionByName(fileName) {
        const file = this.getFileByName(fileName);
        return file ? file.version.toString() : false;
    }

    getFileByName(fileName) {
        const file = this.fileList.find(file => file.source === fileName);
        return file;
    }

    getFileNames() {
        const fileNames = this.fileList.map((file) => file.source);
        return fileNames;
    }

    incrementFilesVersion(files) {
        (files || []).forEach((file) => {
            file.version += 1;
        });
    }

    emitFiles(files) {
        this.errors = [];
        files.forEach((file) => {
            this.emitFile(file);
        });
    }

    emitFile(file) {
        const isFileRemoved = this.removeInvalidatedFilesFromList(file);
        if (!isFileRemoved) {
            this.compileFile(file);
        }
    }

    compileFile(file) {
        this.createServiceHost();
        const sourceFileName = file.source;
        const output = this.services.getEmitOutput(sourceFileName);

        if (!output.emitSkipped) {
            console.log(`Emitting ${sourceFileName}`);
        } else {
            console.log(`Emitting ${sourceFileName} failed`);
            this.logErrors(sourceFileName);
        }

        output.outputFiles.forEach((o) => {
            const outFileName = path.basename(o.name);
            const outPath = `${file.destination}${outFileName}`;
            this.constructor.mkDirByPathSync(this.constructor.getFolders(outPath));
            fs.writeFileSync(outPath, o.text, 'utf8');
        });
    }

    removeFileFromList(file) {
        this.fileList = this.fileList.filter((listedFile) => {
            return listedFile.source !== file.source;
        });
        fs.unwatchFile(file.source);
        console.log(`file ${file.source} has been removed from the list`);
    }

    removeInvalidatedFilesFromList(currentFile) {
        [...this.fileList].reduce((isCurrentFileRemoved, file) => {
            let currentIsRemovedAsListed = false;
            if (!fs.existsSync(file.source)) {
                this.removeFileFromList(file);
                currentIsRemovedAsListed = currentFile.source === file.source;
            }
            return isCurrentFileRemoved || currentIsRemovedAsListed;
        }, false);
    }

    addToFileList(path) {
        const existingFile = this.getFileByName(path);

        if (!existingFile) {
            const patterns = this.getPatternsByPath(path);
            const newFile = this.createListedFile(path, patterns);

            this.fileList.push(newFile);
            this.initFileWatcher([newFile]);
            if (this.pluginOptions.watch) {
                this.emitFiles([newFile]);
            }        
        }
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
