const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

config.server = config.server || {};
const origEnhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    if (req.url) {
      req.url = req.url.replace(/\\/g, "/");
    }
    return middleware(req, res, next);
  };
};

module.exports = withNativeWind(config, { input: "./src/global.css" });
