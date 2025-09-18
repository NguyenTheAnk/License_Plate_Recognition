const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Ensure proper path resolution
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.modules = [
        path.resolve(__dirname, 'src'),
        path.resolve(__dirname, 'node_modules')
      ];
      
      // Fix for HTML template path resolution
      const HtmlWebpackPlugin = webpackConfig.plugins.find(
        plugin => plugin.constructor.name === 'HtmlWebpackPlugin'
      );
      
      if (HtmlWebpackPlugin) {
        HtmlWebpackPlugin.options.template = path.resolve(__dirname, 'public/index.html');
      }
      
      return webpackConfig;
    }
  }
};
