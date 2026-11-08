import { Directive, ElementRef, OnInit, DestroyRef, inject } from '@angular/core';

/**
 * Ett innehåll som inte ryms i sin ruta rullar ner, väntar, och rullar upp igen. Skärmen har
 * ingen mus, så annars skulle allt under kanten aldrig synas. Rutan måste ha en bestämd höjd och
 * `overflow-hidden`.
 */
@Directive({ selector: '[appAutoScroll]', standalone: false })
export class AutoScroll implements OnInit {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private dir: 1 | -1 = 1;
  private resumeAt = Date.now() + 6000;

  ngOnInit() {
    const timer = setInterval(() => this.step(), 50);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private step() {
    const el = this.el;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 2) {
      el.scrollTop = 0;
      return;
    }
    const now = Date.now();
    if (now < this.resumeAt) return;
    el.scrollTop += this.dir * 1.2;
    if ((this.dir === 1 && el.scrollTop >= max - 1) || (this.dir === -1 && el.scrollTop <= 1)) {
      this.dir = this.dir === 1 ? -1 : 1;
      this.resumeAt = now + 6000;
    }
  }
}
