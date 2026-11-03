function focusable(element) {
  return Boolean(
    element?.isConnected &&
    !element.disabled &&
    !element.closest("[hidden]") &&
    element.getClientRects().length > 0,
  );
}

export function createDialogController({
  dialog,
  closeButton,
  initialFocus,
  fallbackFocus,
  beforeClose = () => true,
  onClose = () => {},
}) {
  let opener = null;
  let closing = false;

  function resolveFocusTarget(target) {
    return typeof target === "function" ? target() : target;
  }

  function restoreFocus() {
    const target = focusable(opener)
      ? opener
      : resolveFocusTarget(fallbackFocus);
    opener = null;
    if (focusable(target)) target.focus({ preventScroll: true });
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  async function requestClose() {
    if (!dialog.open || closing) return false;
    closing = true;
    try {
      if (await beforeClose() === false) return false;
      close();
      return true;
    } finally {
      closing = false;
    }
  }

  function open(trigger = document.activeElement, focusTarget = initialFocus) {
    opener = trigger instanceof HTMLElement ? trigger : null;
    if (!dialog.open) dialog.showModal();
    const target = resolveFocusTarget(focusTarget);
    if (focusable(target)) target.focus({ preventScroll: true });
  }

  closeButton?.addEventListener("click", () => void requestClose());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    void requestClose();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) void requestClose();
  });
  dialog.addEventListener("close", () => {
    onClose();
    restoreFocus();
  });

  return { open, close, requestClose };
}
