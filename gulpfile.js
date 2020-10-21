let tmplFolder = 'tmpl'; //template folder
let srcFolder = 'src'; //source folder
let buildFolder = 'build';

let gulp = require('gulp');
let watch = require('gulp-watch');
let del = require('del');
let fs = require('fs');
let ts = require('typescript');
let concat = require('gulp-concat');
let combineTool = require('../magix-composer/index');
let removeESModuleReg = /"use strict";\s*Object\.defineProperty\(exports,\s*"__esModule",\s*\{\s*value:\s*true\s*\}\);?/g;

let exportsReg = /\bexports\.default\s*=/g;
let removeMiddleDefault = /(_\d+)\.default/g;
let cleanCode = code => {
    return code.replace(removeESModuleReg, '').replace(exportsReg, 'module.exports=').replace(removeMiddleDefault, '$1');
};
combineTool.config({
    debug: true,
    commonFolder: tmplFolder,
    compiledFolder: srcFolder,
    projectName: 'rd',
    loaderType: 'cmd_es',
    md5CssSelectorLen: 3,
    galleries: {
        mxRoot: 'gallery/',
        mxMap: {
            'mx-number': {
                _class: ' input pr'
            }
        }
    },
    scopedCss: [
        './tmpl/assets/index.less'
    ],
    compileJSStart(content) {
        var str = ts.transpileModule(content, {
            compilerOptions: {
                lib: ['es7'],
                target: 'es2018',
                module: ts.ModuleKind.None
            }
        });
        str = str.outputText;
        str = cleanCode(str);
        return str;
    },
    // compileJSEnd(content) {
    //     var str = ts.transpileModule(content, {
    //         compilerOptions: {
    //             lib: ['es7'],
    //             target: 'es3',
    //             module: ts.ModuleKind.None
    //         }
    //     });
    //     str = str.outputText;
    //     return str;
    // },
    progress({ completed, file, total }) {
        console.log(file, completed + '/' + total);
    },
});

gulp.task('cleanSrc', () => del(srcFolder));

gulp.task('combine', gulp.series('cleanSrc', () => {
    return combineTool.combine().then(() => {
        console.log('complete');
    }).catch(function (ex) {
        console.log('gulpfile:', ex);
        process.exit();
    });
}));

gulp.task('watch', gulp.series('combine', () => {
    watch(tmplFolder + '/**/*', e => {
        if (fs.existsSync(e.path)) {
            var c = combineTool.processFile(e.path);
            c.catch(function (ex) {
                console.log('ex', ex);
            });
        } else {
            combineTool.removeFile(e.path);
        }
    });
}));

let langReg = /@:\{lang#[\S\s]+?\}/g;
let chineseRegexp = /[\u4e00-\u9fa5]+/g;
gulp.task('lang-check', async () => {
    let c = combineTool.readFile('./tmpl/i18n/zh-cn.ts');
    let lMap = {}, missed = {};
    let needi18n = {};
    c.replace(langReg, m => {
        lMap[m] = 0;
    });
    combineTool.walk('./tmpl', f => {
        if (!f.includes('/lib/') &&
            !f.includes('/i18n/')) {
            let c = combineTool.readFile(f);
            c.replace(langReg, m => {
                //console.log(f,m,lMap.hasOwnProperty(m));
                if (lMap.hasOwnProperty(m)) {
                    lMap[m]++;
                } else {
                    missed[m] = 'missed';
                }
            });
            if (f.endsWith('.html')) {
                c.replace(chineseRegexp, m => {
                    needi18n[m] = f;
                });
            }
        }
    });
    combineTool.config({
        stringProcessor(content, from) {
            if (!from.includes('lib/') &&
                !from.includes('i18n/')) {
                content.replace(chineseRegexp, m => {
                    needi18n[m] = from;
                });
            }
        }
    });
    await combineTool.processString();
    for (let p in lMap) {
        if (lMap[p] > 0) {
            delete lMap[p];
        }
    }
    console.table(lMap);
    console.table(missed);
    console.table(needi18n);
});

let htmlIconReg = /(&#x)([0-9a-f]{4})/g;
let cssIconReg = /(['"])\\([0-9a-f]{4})\1/g;
let path = require('path');
let https = require('https');
gulp.task('icons-check', () => {
    let exts = {
        css: 1,
        less: 1,
        html: 1,
        js: 1,
        ts: 1,
        mx: 1
    };
    let icons = {};
    combineTool.walk('./tmpl', function (file) {
        let ext = path.extname(file);
        if (exts[ext.substring(1)]) {
            let reg;
            if (ext == '.css' ||
                ext == '.less') {
                reg = cssIconReg;
            } else {
                reg = htmlIconReg;
            }
            let c = combineTool.readFile(file);
            c.replace(reg, function (match, ignore, hex) {
                icons[hex] = 1;
            });
        }
    });
    https.get('https://www.iconfont.cn/open/project/detail.json?pid=890516', res => {
        let raw = '',
            unused = {};
        res.on('data', d => {
            raw += d;
        });
        res.on('end', () => {
            let json = JSON.parse(raw);
            for (let i of json.data.icons) {
                let n = parseInt(i.unicode).toString(16);
                if (!icons.hasOwnProperty(n)) {
                    unused[n] = 'unused';
                }
            }
            console.table(unused);
        });
    });
});

var terser = require('gulp-terser-scoped');
gulp.task('cleanBuild', () => {
    return del(buildFolder);
});

gulp.task('build', gulp.series('cleanBuild', 'cleanSrc', () => {
    combineTool.config({
        debug: false
    });
    return combineTool.combine().then(() => {
        gulp.src(srcFolder + '/**/*.js')
            .pipe(terser({
                compress: {
                    drop_console: true,
                    drop_debugger: true,
                    global_defs: {
                        DEBUG: false
                    }
                }
            }))
            .pipe(gulp.dest(buildFolder));
    }).catch(ex => {
        console.error(ex);
    });
}));

gulp.task('dist', gulp.series('cleanSrc', () => {
    combineTool.config({
        debug: false
    });
    return del('./dist').then(() => {
        return combineTool.combine();
    }).then(() => {
        return gulp.src([
            './src/iot.js',
            './src/gallery/**',
            './src/i18n/**',
            './src/util/**',
            './src/panels/**',
            './src/elements/**',
            '!./src/elements/**/printer.js',
            './src/designer/**'])
            .pipe(concat('iot.js'))
            .pipe(terser({
                compress: {
                    drop_console: true,
                    drop_debugger: true,
                    global_defs: {
                        DEBUG: false
                    }
                },
                output: {
                    ascii_only: true
                }
            }))
            .pipe(gulp.dest('./dist'));
    }).then(() => {
        return gulp.src([
            './src/printer.js',
            './src/i18n/**',
            './src/designer/service.js',
            './src/designer/transform.js',
            './src/elements/**',
            './src/gallery/mx-dialog/**',
            '!./src/elements/designer.js',
            '!./src/elements/**/designer.js',
            '!./src/elements/**/dshow.js',
            '!./src/elements/svg.js',
            '!./src/elements/flow.js',
            '!./src/elements/hod.js',
            '!./src/elements/hollow.js',
            '!./src/elements/normal.js',
            '!./src/elements/index.js',
            './src/printer/**'])
            .pipe(concat('printer.js'))
            .pipe(terser({
                compress: {
                    drop_console: true,
                    drop_debugger: true,
                    global_defs: {
                        DEBUG: false
                    }
                },
                output: {
                    ascii_only: true
                }
            }))
            .pipe(gulp.dest('./dist'));
    });
}));



gulp.task('cdist', () => {
    return gulp.src('./dist/*.js')
        .pipe(terser({
            compress: {
                drop_console: true,
                drop_debugger: true,
                global_defs: {
                    DEBUG: false
                }
            },
            output: {
                ascii_only: true
            }
        }))
        .pipe(gulp.dest('./dist'));
});
