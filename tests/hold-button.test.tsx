import { render, screen, userEvent } from '@testing-library/react-native';
import { HoldButton } from '../src/ui/HoldButton';

/** 길게 누르기 버튼: 정해진 시간을 다 눌러야 한 번 실행된다(주머니 속 오작동 방지) */
describe('HoldButton', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('holdMs 전에 떼면 실행하지 않는다', async () => {
    const onHold = jest.fn();
    render(<HoldButton label="길게 눌러 종료" onHold={onHold} tint="#000" />);
    await userEvent.setup().longPress(screen.getByRole('button', { name: '길게 눌러 종료' }), { duration: 500 });
    expect(onHold).not.toHaveBeenCalled();
  });

  it('holdMs를 넘겨 누르면 한 번 실행한다', async () => {
    const onHold = jest.fn();
    render(<HoldButton label="길게 눌러 종료" onHold={onHold} tint="#000" />);
    await userEvent.setup().longPress(screen.getByRole('button', { name: '길게 눌러 종료' }), { duration: 900 });
    expect(onHold).toHaveBeenCalledTimes(1);
  });
});
