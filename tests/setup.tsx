/*
 * 모든 테스트 파일 앞에 실행된다(package.json jest.setupFilesAfterEnv).
 * jest-expo가 Expo SDK 네이티브 모듈은 흉내 내 주지만, 서드파티 네이티브 뷰는 직접 바꿔 끼워야 한다.
 * 여기에는 "Node에서는 원래 못 그리는 것"만 둔다. 동작을 정하는 가짜(저장소·위치)는 각 테스트 파일에서 명시한다.
 */

// 지도는 네이티브 뷰라 Node에 없다. 화면 흐름 테스트에서 상세 화면을 그릴 수 있게 빈 View로 바꾼다
jest.mock('react-native-maps', () => {
  const { forwardRef, useImperativeHandle } = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const MapView = forwardRef<unknown, { children?: React.ReactNode }>(function MapView({ children }, ref) {
    useImperativeHandle(ref, () => ({ fitToCoordinates: () => {} }));
    return <View testID="map">{children}</View>;
  });
  return {
    __esModule: true,
    default: MapView,
    Marker: () => null,
    Polyline: () => null,
    PROVIDER_GOOGLE: 'google',
  };
});

// iOS의 Modal은 닫히고 나서 onDismiss를 부른다(Android는 부르지 않는다). MoreMenu는 iOS에서 이때 동작을 실행한다.
// RN 프리셋의 Modal 모의 객체는 onDismiss를 부르지 않아서, 같은 규칙으로 부르는 Modal로 바꾼다
// (jest.mock 팩토리는 바깥 이름을 못 쓴다. mock으로 시작하는 이름만 예외)
type MockModalProps = import('react-native').ModalProps & { children?: React.ReactNode };
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const { createElement, useEffect, useRef } = require('react') as typeof import('react');
  function Modal(props: MockModalProps) {
    const wasVisible = useRef(props.visible !== false);
    useEffect(() => {
      const visible = props.visible !== false;
      const { Platform } = require('react-native') as typeof import('react-native');
      if (Platform.OS === 'ios' && wasVisible.current && !visible) props.onDismiss?.();
      wasVisible.current = visible;
    });
    if (props.visible === false) return null;
    // 프리셋과 같이 'Modal' 호스트 요소로 그린다(RNTL이 모달로 알아본다)
    return createElement('Modal', props, props.children);
  }
  return { __esModule: true, default: Modal };
});

// Node에는 레이아웃이 없다. RN 프리셋의 View는 measureInWindow가 아무것도 하지 않는 jest.fn이라
// 위치를 재고 나서 여는 화면(MoreMenu 등)이 열리지 않는다. 원점에 크기 0으로 잰 것으로 알려 준다
type Measure = (x: number, y: number, width: number, height: number) => void;
const { View } = jest.requireActual<typeof import('react-native')>('react-native');
jest
  .mocked((View as unknown as { prototype: { measureInWindow: (cb: Measure) => void } }).prototype.measureInWindow)
  .mockImplementation((cb) => cb(0, 0, 0, 0));
