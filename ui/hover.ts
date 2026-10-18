// One shared timer for the strip and panel prevents a gap from causing flicker.
export class HoverController {
  // A manual Hidden-to-Hover activation outlives an older settings snapshot.
  private manualReveal = false;
  get revealRequested() {
    return this.manualReveal;
  }
  requestReveal() {
    this.manualReveal = true;
  }
  cancelReveal() {
    this.manualReveal = false;
  }
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
