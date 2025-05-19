const path = require('path');
const webpack = require('webpack');
const {merge} = require("webpack-merge");

let config = {
    optimization: {
        minimize: true,
    },
    // Path to your entry point. From this file Webpack will begin his work
    // entry: ["babel-polyfill", path.resolve(__dirname, entrypoint)],
    resolve: {
        // Add '.ts' and '.tsx' as resolvable extensions.
        extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js", ".wasm", "..."],
        fallback: {
            "fs": false,
            "tls": false,
            "net": false,
            "path": require.resolve("path-browserify"),
            "zlib": false,
            "http": false,
            "https": false,
            "stream": require.resolve("stream-browserify"),
            "buffer": require.resolve("buffer"),
            "crypto": require.resolve("crypto-browserify"),
            "crypto-browserify": require.resolve("crypto-browserify"),
            "async_hooks": false,
            'process/browser': require.resolve('process/browser'),
            "util": require.resolve("util/"),
            "url": require.resolve("url/")
        }
    },
    module: {
        rules: [
            // All files with a '.ts' or '.tsx' extension will be handled by 'ts-loader'.
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
                exclude: ["/node_modules/", /\.d\.ts$/iu]
            },
            {
                test: /\.d\.ts$/,
                loader: 'ignore-loader'
            },
            // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
            {
                test: /\.js$/,
                use: [
                    "source-map-loader",
                    {
                        loader: "babel-loader",
                        options: {
                            presets: ["@babel/preset-env"],
                            sourceMaps: true
                        }
                    }
                ],
                exclude: /(node_modules)/
            },
            {
                test: /\.mjs$/,
                exclude: /(node_modules)/,
                type: "javascript/auto"
            },
            {
                test: /\.wasm$/,
                type: "asset/inline",
            },
        ],
        parser: {
            javascript: {
                dynamicImportMode: 'eager'
            }
        }
    },
    plugins: [
        // Work around for Buffer is undefined:
        // https://github.com/webpack/changelog-v5/issues/10
        new webpack.ProvidePlugin({
            Buffer: ["buffer", "Buffer"]
        }),
        new webpack.ProvidePlugin({
            process: "process/browser"
        })
    ],
    // ignoreWarnings: [/Failed to parse source map/],
    experiments: {
        asyncWebAssembly: true,
        topLevelAwait: true,
        syncWebAssembly: true,
        // futureDefaults: true,
    },
    mode: "production",
    devtool: "source-map"
};

let nodeConfigs = merge(config, {
    output: {
        path: path.resolve(__dirname, "./dist/server"),
        filename: "index.js"
    },
    resolve: {
        fallback: {}
    },
    target: "node",
    entry: ["babel-polyfill", path.resolve(__dirname, "./index.node.ts")],
    externals: [
        {
            'utf-8-validate': 'commonjs utf-8-validate',
            'bufferutil': 'commonjs bufferutil',
        },
    ],
});
let webConfigs = merge(config, {
    output: {
        path: path.resolve(__dirname, "./dist/browser/"),
        filename: "index.js"
    },
    plugins: [
        // new CopyPlugin({
        //     patterns: [{
        //         from: "./dist/browser/saito.js",
        //         to: "../../public/javascripts/saito.js",
        //     }]
        // })
    ],
    resolve: {
        fallback: {
            "bufferutil": false,
            "utf-8-validate": false
        }
    },
    target: "web",
    entry: ["babel-polyfill", path.resolve(__dirname, "./index.web.ts")],
});

module.exports = [nodeConfigs, webConfigs];
