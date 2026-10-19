import { pageDockAdapter } from './dock-adapters';
export interface DockStatus {
  active: boolean;
  reason?: string;
  width: number;
}
interface SavedStyle {
  element: HTMLElement;
  property: string;
  value: string;
  priority: string;
  applied: string;
}
interface Box {
  element: HTMLElement;
  rect: DOMRect;
  fixed: boolean;
}
export function dockWidth(
  requested: number,
  viewport: number,
): number | undefined {
  const width = Math.min(440, Math.max(240, Math.round(requested)));
  return viewport - width >= 480 ? width : undefined;
}

// A document-flow strategy, not a simulated browser viewport. No wrappers,
// transforms, scrolling containers or permanent site attributes are introduced.
export class DockingController {
  private saved: SavedStyle[] = [];
  private hadStyle = new Map<
    HTMLElement,
    { attribute: string | null; cssText: string }
  >();
  private observer?: MutationObserver;
  private frame = 0;
  private requested?: number;
  private failed = false;
  private root?: HTMLElement;
  private lastStatus = '';
  constructor(private changed: (status: DockStatus) => void) {}
  private set(element: HTMLElement, property: string, value: string) {
    if (!this.hadStyle.has(element))
      this.hadStyle.set(element, {
        attribute: element.getAttribute('style'),
        cssText: element.style.cssText,
      });
    let previous = this.saved.find(
      (s) => s.element === element && s.property === property,
    );
    if (!previous) {
      previous = {
        element,
        property,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
        applied: value,
      };
      this.saved.push(previous);
    }
    element.style.setProperty(property, value, 'important');
    // Chromium serializes fractional CSS pixels at a different precision from
    // DOMRect. Compare its normalized value when deciding ownership on undo.
    previous.applied = element.style.getPropertyValue(property);
  }
  private restore() {
    for (const s of this.saved.reverse()) {
      // Preserve a site's newer inline edit rather than replacing it with an
      // old snapshot. Only undo values that are still owned by this controller.
      if (
        s.element.style.getPropertyValue(s.property) === s.applied &&
        s.element.style.getPropertyPriority(s.property) === 'important'
      ) {
        if (s.value)
          s.element.style.setProperty(s.property, s.value, s.priority);
        else s.element.style.removeProperty(s.property);
      }
    }
    this.saved = [];
    for (const [element, original] of this.hadStyle) {
      if (element.style.cssText === original.cssText) {
        if (original.attribute === null) element.removeAttribute('style');
        else element.setAttribute('style', original.attribute);
      }
    }
    this.hadStyle.clear();
  }
  private status(status: DockStatus) {
    const key = JSON.stringify(status);
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      this.changed(status);
    }
  }
  private schedule = () => {
    if (!this.frame && this.requested !== undefined && !this.failed)
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.apply();
      });
  };
  dock(width: number) {
    if (this.requested === width && !this.failed) return;
    this.requested = width;
    this.failed = false;
    this.apply();
    window.addEventListener('resize', this.resized);
  }
  private resized = () => {
    this.failed = false;
    this.schedule();
  };
  retry() {
    if (this.requested !== undefined) {
      this.failed = false;
      this.apply();
    }
  }
  undock() {
    this.requested = undefined;
    this.failed = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.observer?.disconnect();
    this.observer = undefined;
    window.removeEventListener('resize', this.resized);
    this.restore();
    this.root = undefined;
    this.status({ active: false, width: 0 });
  }
  private reject(reason: string) {
    this.restore();
    this.failed = true;
    this.status({
      active: false,
      reason: `${reason} Use Hover overlay on this page.`,
      width: 0,
    });
  }
  private apply() {
    if (this.requested === undefined) return;
    this.observer?.disconnect();
    this.restore();
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) {
      this.observe(root);
      return;
    }
    this.root = root;
    const viewport = root.clientWidth;
    const previousOverflow = Math.max(0, root.scrollWidth - viewport);
    const width = dockWidth(this.requested, viewport);
    if (width === undefined) {
      this.reject('The window is too narrow to dock safely.');
      return;
    }
    const original = getComputedStyle(root);
    if (
      original.transform !== 'none' ||
      original.filter !== 'none' ||
      original.direction === 'rtl' ||
      parseFloat(original.marginLeft) !== 0 ||
      parseFloat(original.marginRight) !== 0 ||
      parseFloat(original.paddingLeft) !== 0 ||
      parseFloat(original.paddingRight) !== 0 ||
      !['1', 'normal'].includes(original.zoom)
    ) {
      this.reject('This page has an incompatible document layout.');
      return;
    }
    if (window.scrollX !== 0) {
      this.reject('Scroll this page fully left before docking.');
      return;
    }
    const boxes: Box[] = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
    let count = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (++count > 12000) {
        this.reject('This page is too complex to verify safe docking.');
        return;
      }
      if (!(node instanceof HTMLElement)) continue;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const fixed = style.position === 'fixed' && !this.containedFixed(node);
      if (fixed && (rect.bottom < 0 || rect.top > innerHeight)) continue;
      if (
        fixed ||
        (rect.width >= viewport * 0.95 && rect.width <= window.innerWidth + 3)
      )
        boxes.push({ element: node, rect, fixed });
    }
    this.set(root, 'box-sizing', 'border-box');
    const adapter = pageDockAdapter();
    adapter?.prepare((element, property, value) =>
      this.set(element, property, value),
    );
    this.set(root, 'margin-left', `${width}px`);
    this.set(root, 'margin-right', '0px');
    this.set(root, 'width', `calc(100% - ${width}px)`);
    this.set(root, 'min-width', '0px');
    this.set(root, 'max-width', `calc(100% - ${width}px)`);
    const available = root.getBoundingClientRect().width;
    const pageRight = width + available;
    const scale = available / viewport;
    // Fixed elements remain viewport-relative when html is narrowed. Remap
    // their horizontal boxes, keeping small controls at their original size.
    for (const box of boxes) {
      const { element, rect, fixed } = box;
      if (fixed) {
        const size = Math.min(
          rect.width >= viewport * 0.7 ? rect.width * scale : rect.width,
          available,
        );
        const left = Math.max(
          width,
          Math.min(width + rect.left * scale, pageRight - size),
        );
        this.set(element, 'box-sizing', 'border-box');
        this.set(element, 'left', `${left}px`);
        this.set(element, 'right', 'auto');
        this.set(element, 'width', `${size}px`);
        this.set(element, 'min-width', '0px');
        this.set(element, 'max-width', `${available}px`);
      } else if (element.getBoundingClientRect().width > available + 2) {
        this.set(element, 'box-sizing', 'border-box');
        this.set(element, 'max-width', '100%');
        this.set(element, 'min-width', '0px');
      }
    }
    const actual = root.getBoundingClientRect();
    const adapterFailure = adapter?.validate(width, pageRight);
    if (adapterFailure) {
      this.reject(adapterFailure);
      return;
    }
    if (
      Math.abs(actual.left - width) > 3 ||
      actual.right > pageRight + 3 ||
      body.getBoundingClientRect().left < width - 3 ||
      root.scrollWidth - root.clientWidth > Math.max(3, previousOverflow + 2) ||
      this.unsafeOverflow(body, width, pageRight)
    ) {
      this.reject('This page cannot fit beside the sidebar without clipping.');
      return;
    }
    this.status({ active: true, width });
    this.observe(root);
  }
  private containedFixed(element: HTMLElement) {
    for (
      let parent = element.parentElement;
      parent && parent !== document.documentElement;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent);
      if (
        style.transform !== 'none' ||
        style.filter !== 'none' ||
        style.perspective !== 'none' ||
        /paint|layout|strict|content/.test(style.contain)
      )
        return true;
    }
    return false;
  }
  private unsafeOverflow(body: HTMLElement, left: number, right: number) {
    const nodes = [
      body,
      ...Array.from(
        body.querySelectorAll<HTMLElement>(
          'main,header,nav,[role="main"],[role="banner"],body > *',
        ),
      ),
    ];
    return nodes.some((node) => {
      const rect = node.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        rect.top >= innerHeight ||
        getComputedStyle(node).visibility === 'hidden'
      )
        return false;
      if (rect.left >= left - 3 && rect.right <= right + 3) return false;
      for (
        let parent = node.parentElement;
        parent && parent !== document.documentElement;
        parent = parent.parentElement
      )
        if (
          /(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowX)
        ) {
          const clip = parent.getBoundingClientRect();
          if (clip.left >= left - 3 && clip.right <= right + 3) return false;
        }
      return true;
    });
  }
  private observe(root: HTMLElement | null) {
    this.observer ??= new MutationObserver((records) => {
      if (
        records.some((record) =>
          record.type === 'childList'
            ? [...record.addedNodes, ...record.removedNodes].some(
                (node) => node.nodeType === Node.ELEMENT_NODE,
              )
            : record.target === this.root ||
              record.target === document.body ||
              (record.target instanceof HTMLElement &&
                (this.hadStyle.has(record.target) ||
                  getComputedStyle(record.target).position === 'fixed')),
        )
      )
        this.schedule();
    });
    this.observer.observe(document, { childList: true });
    if (root)
      this.observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
  }
}
