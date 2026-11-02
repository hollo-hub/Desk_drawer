export class ModuleRegistry {
  constructor(definitions, { persistEnabled, onChange }) {
    this.definitions = definitions;
    this.persistEnabled = persistEnabled;
    this.onChange = onChange;
    this.active = new Map();
    this.enabled = new Map();
  }

  list() {
    return this.definitions.map((definition) => ({
      ...definition,
      enabled: this.enabled.get(definition.id) ?? definition.defaultEnabled,
    }));
  }

  async initialize(savedEnabled, context) {
    const activated = [];
    try {
      for (const definition of this.definitions) {
        const enabled = savedEnabled[definition.id] ?? definition.defaultEnabled;
        this.enabled.set(definition.id, enabled);
        if (enabled) {
          await this.activate(definition, context);
          activated.push(definition.id);
        }
      }
    } catch (error) {
      const cleanupErrors = [];
      for (const id of activated.reverse()) {
        try {
          await this.deactivate(id);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      for (const definition of this.definitions) this.enabled.set(definition.id, false);
      this.onChange(this.list());
      if (cleanupErrors.length) {
        throw new AggregateError([error, ...cleanupErrors], 'Module initialization failed and cleanup was incomplete');
      }
      throw error;
    }
    this.onChange(this.list());
  }

  async setEnabled(id, enabled, context) {
    const definition = this.definitions.find((item) => item.id === id);
    if (!definition) throw new Error(`Unknown module: ${id}`);
    if (this.enabled.get(id) === enabled) return;

    if (enabled) {
      await this.activate(definition, context);
      try {
        await this.persistEnabled(id, true);
      } catch (error) {
        try {
          await this.deactivate(id);
        } catch (cleanupError) {
          this.onChange(this.list());
          throw new AggregateError([error, cleanupError], `Could not enable or cleanly stop module "${id}"`);
        }
        this.onChange(this.list());
        throw error;
      }
    } else {
      await this.persistEnabled(id, false);
      try {
        await this.deactivate(id);
      } catch (error) {
        this.onChange(this.list());
        throw error;
      }
    }

    this.enabled.set(id, enabled);
    this.onChange(this.list());
  }

  async activate(definition, context) {
    const implementation = await definition.load();
    const panel = document.getElementById(definition.panelId);
    if (!panel) throw new Error(`Panel not found for module "${definition.id}"`);

    let mounted = false;
    try {
      implementation.mount(panel);
      mounted = true;
      await implementation.start(context);
    } catch (error) {
      const cleanupErrors = [];
      try {
        await implementation.stop();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (mounted) {
        try {
          implementation.unmount(panel);
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length) {
        const messages = [error, ...cleanupErrors]
          .map((item) => item?.message ?? String(item))
          .join(' | cleanup: ');
        throw new Error(`Module "${definition.id}" failed to start and cleanup was incomplete: ${messages}`);
      }
      throw error;
    }

    this.active.set(definition.id, { implementation, panel });
    this.enabled.set(definition.id, true);
  }

  async deactivate(id) {
    const entry = this.active.get(id);
    if (!entry) {
      this.enabled.set(id, false);
      return;
    }
    this.active.delete(id);
    this.enabled.set(id, false);
    try {
      await entry.implementation.stop();
    } finally {
      entry.implementation.unmount(entry.panel);
    }
  }
}
