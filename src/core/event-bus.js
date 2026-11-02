const EVENT_NAME = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/;

export function createEventBus() {
  const listeners = new Map();
  const allListeners = new Set();

  return {
    on(name, listener) {
      if (!EVENT_NAME.test(name)) throw new TypeError(`Invalid event name: ${name}`);
      if (typeof listener !== 'function') throw new TypeError('Event listener must be a function');
      const group = listeners.get(name) ?? new Set();
      group.add(listener);
      listeners.set(name, group);
      return () => {
        group.delete(listener);
        if (group.size === 0) listeners.delete(name);
      };
    },
    onAny(listener) {
      if (typeof listener !== 'function') throw new TypeError('Event listener must be a function');
      allListeners.add(listener);
      return () => allListeners.delete(listener);
    },
    emit(name, payload) {
      if (!EVENT_NAME.test(name)) throw new TypeError(`Invalid event name: ${name}`);
      for (const listener of [...allListeners]) listener(name, payload);
      for (const listener of [...(listeners.get(name) ?? [])]) listener(payload);
    },
  };
}
