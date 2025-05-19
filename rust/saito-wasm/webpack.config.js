// const path = require('path');
// const HtmlWebpackPlugin = require('html-webpack-plugin');
// const webpack = require('webpack');
// const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin");
// const {merge} = require("webpack-merge");
// const CopyPlugin = require("copy-webpack-plugin");
//
// let common = {
//     devtool: 'eval',
//     optimization: {
//         minimize: false,
//     },
//     experiments: {
//         asyncWebAssembly: true,
//         // topLevelAwait: true,
//         // syncWebAssembly: true,
//     },
//     mode: "development",
//     stats: {errorDetails: true}
// };
//
// let nodeConfigs = merge(common, {
//     entry: [
//         'babel-regenerator-runtime',
//         path.resolve(__dirname, "./index.node.ts"),
//     ],
//     module: {
//         rules: [
//             {
//                 test: /\.js$/,
//                 use: [
//                     "source-map-loader",
//                     {
//                         loader: "babel-loader",
//                         options: {
//                             presets: ["@babel/preset-env"],
//                             sourceMaps: true
//                         }
//                     }
//                 ],
//                 exclude: /(node_modules)/
//             },
//             {
//                 test: /\.mjs$/,
//                 include: /node_modules/,
//                 type: "javascript/auto"
//             },
//             {
//                 test: /\.tsx?$/,
//                 loader: "ts-loader",
//                 exclude: /(node_modules)/
//             },
//
//         ],
//
//     },
//     resolve: {
//         extensions: ['.ts', '.tsx', '.js', ".mjs", '...'],
//         fallback: {
//             "buffer": require.resolve("buffer"),
//             "path": require.resolve("path-browserify"),
//             // "fs": false,
//         }
//     },
//     plugins: [
//         // new HtmlWebpackPlugin(),
//         new WasmPackPlugin({
//             crateDirectory: path.resolve(__dirname, '.'),
//             outDir: "./pkg/node",
//             extraArgs: '--target bundler'
//         }),
//         new webpack.ProvidePlugin({
//             TextDecoder: ['text-encoding', 'TextDecoder'],
//             TextEncoder: ['text-encoding', 'TextEncoder']
//         }),
//         new CopyPlugin({
//             patterns: [{
//                 from: "./pkg/node/index.d.ts",
//                 to: "./index.d.ts"
//             }]
//         })
//     ],
//     output: {
//         path: path.resolve(__dirname, "dist/server"),
//         filename: "index.js",
//         library: {
//             type: "commonjs2"
//         },
//     },
//     target: "node",
//
// });
// let webConfigs = merge(common, {
//     entry: [
//         'babel-regenerator-runtime',
//         path.resolve(__dirname, "./index.web.ts"),
//     ],
//     module: {
//         rules: [
//             {
//                 test: /\.js$/,
//                 use: [
//                     "source-map-loader",
//                     {
//                         loader: "babel-loader",
//                         options: {
//                             presets: ["@babel/preset-env"],
//                             sourceMaps: true
//                         }
//                     }
//                 ],
//                 exclude: /(node_modules)/
//             },
//             {
//                 test: /\.mjs$/,
//                 include: /node_modules/,
//                 type: "javascript/auto"
//             },
//             {
//                 test: /\.tsx?$/,
//                 loader: "ts-loader",
//                 exclude: /(node_modules)/
//             },
//             {
//                 test: /\.wasm$/,
//                 loader: "file-loader"
//             },
//         ],
//         parser: {
//             javascript: {
//                 dynamicImportMode: 'eager'
//             }
//         }
//     },
//     resolve: {
//         extensions: ['.ts', '.tsx', '.js', '.wasm', ".mjs", '...'],
//         fallback: {
//             "buffer": require.resolve("buffer"),
//             "path": require.resolve("path-browserify"),
//             "fs": false,
//         }
//     },
//     plugins: [
//         new WasmPackPlugin({
//             crateDirectory: path.resolve(__dirname, '.'),
//             outDir: "./pkg/web",
//             extraArgs: '--target web'
//         }),
//         new webpack.ProvidePlugin({
//             TextDecoder: ['text-encoding', 'TextDecoder'],
//             TextEncoder: ['text-encoding', 'TextEncoder']
//         }),
//         new webpack.ProvidePlugin({
//             Buffer: ["buffer", "Buffer"]
//         }),
//         new webpack.ProvidePlugin({
//             process: "process/browser"
//         }),
//         new CopyPlugin({
//             patterns: [{
//                 from: "./pkg/web/index.d.ts",
//                 to: "./index.d.ts"
//             }
//             ]
//         })
//     ],
//     output: {
//         path: path.resolve(__dirname, "dist/browser"),
//         filename: "index.js",
//         library: {
//             type: "commonjs2"
//         },
//     },
//     target: "web",
// });
//
// module.exports = [nodeConfigs, webConfigs];
