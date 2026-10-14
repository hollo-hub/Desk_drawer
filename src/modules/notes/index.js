let panel;
let handler;
let saveButton;

function updateState(message) {
  panel.querySelector('#notesStatus').textContent = message;
}

export function mount(element) {
  panel = element;
  panel.hidden = true;
}

export function unmount(element) {
  element.hidden = true;
}

export async function start(ctx) {
  const editor = panel.querySelector('#scratchNotes');
  editor.value = (await ctx.loadSettings()).notes ?? '';
  saveButton = panel.querySelector('#saveScratchNotes');
  handler = async () => {
    saveButton.disabled = true;
    try {
      await ctx.invoke('save_scratch_notes', { notes: editor.value });
      updateState('Saved locally on this device.');
      ctx.events.emit('tool.used', { id: 'notes', action: 'saved' });
    } catch (error) {
      updateState(`Could not save notes: ${error}`);
    } finally {
      saveButton.disabled = false;
    }
  };
  saveButton.addEventListener('click', handler);
  updateState('Notes are stored locally and are not sent anywhere.');
}

export function stop() {
  saveButton.removeEventListener('click', handler);
  handler = undefined;
  saveButton = undefined;
}
