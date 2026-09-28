// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

/*
 * 프로젝트 규칙(CLAUDE.md "경계 규칙")은 테스트가 아니라 린트로 막는다. 어기면 편집기에서 바로 보이고 CI에서 실패한다.
 * no-restricted-syntax는 파일마다 마지막으로 맞은 설정의 목록 하나만 쓰므로, 예외 파일에는 목록을 다시 조합해 넣는다.
 */

/** 화면 스택 규칙(src/ui/navigation.ts 머리 주석) */
const NAV_RULES = [
  {
    selector: "CallExpression[callee.object.name='router'][callee.property.name='push']",
    message: 'router.push 대신 router.navigate를 쓴다(연타해도 한 번만 쌓이게). src/ui/navigation.ts 참고',
  },
  {
    selector: "Literal[value='/run'], TemplateElement[value.raw='/run']",
    message: '기록 화면으로 직접 이동하지 않는다. _layout.tsx의 Stack.Protected 가드가 띄운다',
  },
  {
    selector: "Property[key.name='dangerouslySingular'], JSXAttribute[name.name='dangerouslySingular']",
    message: 'dangerouslySingular를 쓰지 않는다. 기록 화면은 가드가 하나만 남긴다',
  },
];

/** 홈으로는 goHome()으로만(navigation.ts만 예외) */
const GO_HOME_RULE = {
  selector:
    "CallExpression[callee.object.name='router'][callee.property.name=/^(replace|dismissTo|navigate)$/][arguments.0.value='/']",
  message: '홈으로는 goHome()으로만 간다. replace·dismissTo로 "/"에 가면 홈 아래에 화면이 남을 수 있다',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'coverage/*'],
  },
  {
    rules: {
      // TODO: 기존 화면 코드가 React Compiler 규칙 몇 개를 어긴다(렌더 중 Date.now, effect 안의 setState).
      // 동작을 바꾸는 수정이라 실기기 확인과 함께 따로 고친다. 그때까지 경고로 두어 새 코드에서는 보이게 한다.
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...NAV_RULES, GO_HOME_RULE],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-router',
              importNames: ['Redirect'],
              message: '<Redirect> 대신 가드(Stack.Protected)와 router.navigate를 쓴다',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/navigation.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NAV_RULES],
    },
  },
  {
    // src/core는 순수 TS. 계산 로직은 여기에 두고 Node에서 그대로 테스트한다
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(react|react-native|expo[\\w-]*|@expo/[\\w-]+)(/.*)?$',
              message: 'src/core는 react·react-native·expo를 import하지 않는다. 기기 기능은 src/services로',
            },
          ],
        },
      ],
    },
  },
]);
