/* What every screen shares: the linked worlds, what each last answered, where the person is, and the few functions the
   screens call back into (filled in by main.js, so the screen modules never import it). */
export const app = {
  links: [],
  live: new Map(),  // link id -> { d, names, at, err }
  view: { name: 'home', id: null, tab: null },
  ui: new Map(),    // link id -> what a screen remembers: the chart shown, the console filter, the console's lines
  render: () => {},
  refresh: async () => {},
  go: () => {},
  save: async () => true,
};
export function uiOf(id) {
  if (!app.ui.has(id)) app.ui.set(id, {});
  return app.ui.get(id);
}
