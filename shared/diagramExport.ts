/** Remove the document paper, retaining participants, messages and other ink. */
export const TRANSPARENT_DIAGRAM_STYLE = `
html,body,[data-diagramly-diagram-mount],.sequence-diagram,
[data-diagramly-diagram-mount] > .zenuml > .bg-skin-canvas,
[data-diagramly-diagram-mount] > .zenuml > .bg-skin-canvas > .frame.bg-skin-frame,
[data-diagramly-diagram-mount] > .zenuml > .bg-skin-canvas > .frame.bg-skin-frame > div > .header.bg-skin-title {
  background: transparent !important;
}`
