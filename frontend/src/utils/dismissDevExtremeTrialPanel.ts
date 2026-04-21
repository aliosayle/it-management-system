/**
 * DevExtreme trial UI (`dx-license`, orange bar) applies inline `!important` styles, so CSS alone may not win.
 * The library’s close control sets `DxLicense.closed` and hides the panel — we trigger it a few times without observers.
 */
export function dismissDevExtremeTrialPanel(): () => void {
  const tryClickClose = () => {
    document.querySelectorAll("dx-license").forEach((host) => {
      const last = host.lastElementChild as HTMLElement | undefined;
      if (last) {
        last.click();
      }
    });
  };

  const delays = [0, 120, 400, 1200];
  const ids: number[] = [];
  delays.forEach((ms) => {
    ids.push(window.setTimeout(tryClickClose, ms));
  });

  return () => {
    ids.forEach((id) => window.clearTimeout(id));
  };
}
