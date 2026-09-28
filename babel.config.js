const path = require('node:path');

/** React Compiler를 적용할 앱 코드. 테스트·모의 모듈(tests/)은 앱이 아니라서 컴파일하지 않는다 */
const APP_SOURCE = path.join(__dirname, 'src') + path.sep;

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // 켜고 끄는 것은 app.json의 experiments.reactCompiler. 여기서는 대상 파일만 정한다
          'react-compiler': { sources: (filename) => filename.startsWith(APP_SOURCE) },
        },
      ],
    ],
  };
};
