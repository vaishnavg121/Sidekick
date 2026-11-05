import type { TabItem } from './tabs';
/** Latest request per feature/window wins; never apply an answer to changed input. */
export class InferenceGuard {
  private latest = new Map<string, symbol>();
  begin(key: string, workspaceId: string, tabs: TabItem[]) {
    const token = Symbol();
    this.latest.set(key, token);
    if (this.latest.size > 200)
      this.latest.delete(this.latest.keys().next().value!);
    const inputs = tabs.map((t) => ({ id: t.id, url: t.url, title: t.title }));
    return (current: { workspaceId: string; tabs: TabItem[] }) => {
      if (
        this.latest.get(key) !== token ||
        workspaceId !== current.workspaceId ||
        inputs.some(
          (t) =>
            !current.tabs.some(
              (n) => n.id === t.id && n.url === t.url && n.title === t.title,
            ),
        )
      )
        throw Error(
          'Tabs or workspace changed while Jev was evaluating. Review the current workspace and try again.',
        );
    };
  }
}
