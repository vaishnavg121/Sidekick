export interface DockAdapter {
  prepare(
    write: (element: HTMLElement, property: string, value: string) => void,
  ): void;
  validate(left: number, right: number): string | undefined;
}
// YouTube's absolute app canvas ignores a narrower static document root. Give
// its verified Home layout a containing block without transforming the page or
// changing fixed elements' viewport reference. Other layouts fail explicitly.
export function pageDockAdapter(): DockAdapter | undefined {
  if (
    !/(^|\.)youtube\.com$/.test(location.hostname) ||
    !document.querySelector('ytd-app')
  )
    return;
  return {
    prepare(write) {
      if (getComputedStyle(document.documentElement).position === 'static')
        write(document.documentElement, 'position', 'relative');
    },
    validate(left, right) {
      const home = document.querySelector('ytd-browse[page-subtype="home"]');
      const manager = document.querySelector('ytd-page-manager');
      const rect = manager?.getBoundingClientRect();
      if (
        !home ||
        !home.getBoundingClientRect().width ||
        getComputedStyle(home).display === 'none' ||
        !rect ||
        !rect.width ||
        rect.left < left - 2 ||
        rect.right > right + 2
      )
        return 'This YouTube layout is not verified for docking.';
    },
  };
}
