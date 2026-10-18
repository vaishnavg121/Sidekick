import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoverController } from '../ui/hover';
describe('hover timing', () => {
  afterEach(() => vi.useRealTimers());
  it('opens after its delay and cancels close when entering the panel', () => {
    vi.useFakeTimers();
    const show = vi.fn();
    const hover = new HoverController(show);
    hover.enter(180);
    vi.advanceTimersByTime(179);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(show).toHaveBeenLastCalledWith(true);
    hover.leave(350);
    vi.advanceTimersByTime(100);
    hover.enter(0);
    vi.runAllTimers();
    expect(show).not.toHaveBeenCalledWith(false);
    hover.leave(350);
    vi.advanceTimersByTime(350);
    expect(show).toHaveBeenLastCalledWith(false);
  });
  it('cancels pending activation on teardown and collapse', () => {
    vi.useFakeTimers();
    const show = vi.fn();
    const hover = new HoverController(show);
    hover.enter(100);
    hover.cancel();
    vi.runAllTimers();
    expect(show).not.toHaveBeenCalled();
    hover.enter(100);
    hover.close();
    vi.runAllTimers();
    expect(show).toHaveBeenCalledExactlyOnceWith(false);
  });
});
