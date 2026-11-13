/** Remove the document paper, retaining participants, messages and other ink. */
export const TRANSPARENT_DIAGRAM_STYLE = `
html,body,[data-doop-diagram-mount],.sequence-diagram,
[data-doop-diagram-mount] > .zenuml > .bg-skin-canvas,
[data-doop-diagram-mount] > .zenuml > .bg-skin-canvas > .frame.bg-skin-frame,
[data-doop-diagram-mount] > .zenuml > .bg-skin-canvas > .frame.bg-skin-frame > div > .header.bg-skin-title {
  background: transparent !important;
}`
