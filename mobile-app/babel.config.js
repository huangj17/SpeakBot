module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo', 'nativewind/babel'],
    plugins: [
      // react-native-reanimated 插件必须放在最后
      'react-native-reanimated/plugin',
    ],
  };
};
