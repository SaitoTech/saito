const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const merge = require('webpack-merge');
const common = require('./webpack.config.js');

module.exports = merge(common, {
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',   // or 'static' to emit an HTML file
      openAnalyzer: true,
      defaultSizes: 'parsed'    // try 'gzip' or 'stat' too)
  })],
  mode: 'production'
});
