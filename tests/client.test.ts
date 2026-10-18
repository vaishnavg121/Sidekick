import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarClient } from '../lib/client';
function event<T extends (...args: never[]) => unknown>() {
  const callbacks: T[] = [];
  return {
    addListener: (fn: T) => callbacks.push(fn),
    emit: (...args: Parameters<T>) => callbacks.forEach((fn) => fn(...args)),
  };
}
function setup() {
  const ports: {
    onMessage: ReturnType<typeof event<(data: never) => void>>;
    onDisconnect: ReturnType<typeof event<() => void>>;
    postMessage: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const connect = vi.fn(() => {
    const port = {
      onMessage: event<(data: never) => void>(),
      onDisconnect: event<() => void>(),
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    };
    ports.push(port);
    return port;
  });
  const sendMessage = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('chrome', {
    runtime: { connect, sendMessage },
    windows: { getCurrent: async () => ({ id: 7 }) },
  });
  return { ports, connect, sendMessage };
}
describe('background connection', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('resubscribes with bounded backoff after worker disconnection and stops on disposal', async () => {
    vi.useFakeTimers();
    const { ports, connect } = setup();
    const connection = vi.fn();
    const client = new SidebarClient(vi.fn(), connection);
    await client.start(true);
    expect(ports[0]?.postMessage).toHaveBeenCalledWith({
      type: 'subscribe',
      windowId: 7,
    });
    ports[0]?.onDisconnect.emit();
    expect(connection).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(500);
    expect(connect).toHaveBeenCalledTimes(2);
    ports[1]?.onDisconnect.emit();
    vi.advanceTimersByTime(999);
    expect(connect).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(connect).toHaveBeenCalledTimes(3);
    ports[2]?.onDisconnect.emit();
    client.dispose();
    vi.runAllTimers();
    expect(connect).toHaveBeenCalledTimes(3);
    expect(ports[2]?.disconnect).toHaveBeenCalledOnce();
  });
  it('reports failed commands and scopes requests to the native window', async () => {
    const { sendMessage } = setup();
    const client = new SidebarClient(vi.fn(), vi.fn());
    await client.start(true);
    await client.command({ type: 'tab.create' });
    expect(sendMessage).toHaveBeenCalledWith({
      channel: 'sidekick',
      windowId: 7,
      command: { type: 'tab.create' },
    });
    sendMessage.mockResolvedValue({ ok: false, error: 'Tab moved' });
    await expect(
      client.command({ type: 'tab.close', tabId: 2 }),
    ).rejects.toThrow('Tab moved');
    client.dispose();
  });
});
