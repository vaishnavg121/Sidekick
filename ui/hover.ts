// One shared timer for the strip and panel prevents a gap from causing flicker.
export class HoverController {
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private show: (open: boolean) => void) {}
  enter(delay: number) {
    this.schedule(true, delay);
  }
  leave(delay: number) {
    this.schedule(false, delay);
  }
  cancel() {
    clearTimeout(this.timer);
  }
  close() {
    this.cancel();
    this.show(false);
  }
  private schedule(open: boolean, delay: number) {
    this.cancel();
    this.timer = setTimeout(() => this.show(open), delay);
  }
}
