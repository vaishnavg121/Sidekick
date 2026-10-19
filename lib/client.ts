import {
  PORT_NAME,
  type Command,
  type Reply,
  type ServerEvent,
} from './protocol';
import { focusAddress, pageControls } from './page-controls';

export class SidebarClient {
  private port?: chrome.runtime.Port;
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private retryDelay = 500;
  private windowId?: number;
  private queryDraft?: string;
  constructor(
    private receive: (event: ServerEvent) => void,
    private connection: (connected: boolean) => void,
  ) {}
  async start(nativePanel: boolean): Promise<void> {
    try {
      if (nativePanel) this.windowId = (await chrome.windows.getCurrent()).id;
      this.connect();
    } catch {
      this.receive({
        type: 'error',
        error: 'Unable to connect. Reload this page or reopen the side panel.',
      });
    }
  }
  private connect() {
    if (this.disposed) return;
    try {
      this.port = chrome.runtime.connect({ name: PORT_NAME });
      this.port.onMessage.addListener((event: ServerEvent) => {
        if (this.disposed) return;
        this.retryDelay = 500;
        this.connection(true);
        if (event.type === 'focus') {
          if (event.address) focusAddress();
          else pageControls.dispatchEvent(new Event('reveal'));
          return;
        }
        if (event.type === 'snapshot') {
          this.windowId = event.windowId;
          if (event.windowState.query === this.queryDraft)
            this.queryDraft = undefined;
          if (this.queryDraft !== undefined)
            event = {
              ...event,
              windowState: { ...event.windowState, query: this.queryDraft },
            };
        }
        this.receive(event);
      });
      this.port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        this.connection(false);
        if (!this.disposed) {
          this.timer = setTimeout(() => this.connect(), this.retryDelay);
          this.retryDelay = Math.min(15000, this.retryDelay * 2);
        }
      });
      this.port.postMessage({ type: 'subscribe', windowId: this.windowId });
    } catch {
      this.connection(false);
      if (!chrome.runtime.id)
        pageControls.dispatchEvent(new Event('invalidated'));
      this.receive({
        type: 'error',
        error:
          'Extension updated or disconnected. Reload this page to reconnect.',
      });
    }
  }
  async request(command: Command): Promise<Extract<Reply, { ok: true }>> {
    const reply = (await chrome.runtime.sendMessage({
      channel: 'sidekick',
      command,
      windowId: this.windowId,
    })) as Reply | undefined;
    if (!reply?.ok)
      throw new Error(
        reply && 'error' in reply
          ? reply.error
          : 'Sidekick is reconnecting. Try again.',
      );
    return reply;
  }
  async command(command: Command): Promise<void> {
    await this.request(command);
  }
  async search(query: string): Promise<void> {
    this.queryDraft = query;
    try {
      await this.command({ type: 'search.update', query });
    } catch (error) {
      if (this.queryDraft === query) this.queryDraft = undefined;
      throw error;
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.port?.disconnect();
  }
}
