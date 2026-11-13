# Diagramly Desktop

Diagramly keeps a local library of editable diagram documents. A document contains boards, each board contains diagrams, and each diagram contains its own pages.

## Language

**Document**:
A saved collection of boards and their diagrams, shown as one item in the library.
_Avoid_: Canvas, project

**Board**:
A space within a document for arranging related diagrams.
_Avoid_: Page, artboard, canvas

**Diagram**:
An editable diagram with one or more pages that belong to it.
_Avoid_: Frame, layer

**Page**:
One view within a diagram, with its own source and styles. One page is current for viewing, editing and image export.
_Avoid_: Board when referring to a page inside a diagram
