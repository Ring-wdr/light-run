// Jest 설정. 프리셋은 Expo 권장 jest-expo(https://docs.expo.dev/develop/unit-testing/)
const { expo } = require('./app.json');

/** jest-expo가 JS·TS에 쓰는 babel-jest 변환 키(프리셋과 같아야 덮어쓴다) */
const JS = '\\.[jt]sx?$';

/*
 * React Compiler는 babel-preset-expo가 호출한 쪽(caller)의 supportsReactCompiler를 보고 켠다.
 * Metro는 app.json의 experiments.reactCompiler로 켜 주지만 jest-expo는 넘기지 않는다.
 * 앱과 같은 코드(컴파일된 코드)를 테스트하도록 같은 설정 값을 caller에 넣는다. 나머지는 프리셋 그대로.
 */
const reactCompiler = expo.experiments?.reactCompiler === true;

/** 앱이 두 플랫폼으로 나가므로 테스트도 두 플랫폼 프리셋으로 돈다(jest-expo README "Platforms") */
module.exports = {
  projects: ['android', 'ios'].map((platform) => {
    const preset = `jest-expo/${platform}`;
    const [babelJest, options] = require(`${preset}/jest-preset`).transform[JS];
    return {
      preset,
      setupFilesAfterEnv: ['<rootDir>/tests/setup.tsx'],
      transform: {
        [JS]: [babelJest, { ...options, caller: { ...options.caller, supportsReactCompiler: reactCompiler } }],
      },
    };
  }),
};
