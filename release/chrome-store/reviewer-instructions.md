# Reviewer test instructions

Diagramly Capture captures page content locally without an extension login. Importing the result requires signing into Diagramly and opening a canvas with edit access.

1. Open a normal HTTPS webpage (not a Chrome internal page or the Chrome Web Store).
2. Click the Diagramly Capture toolbar icon, then Select a section.
3. Move the pointer over page elements; a blue outline indicates the section. Click a section.
4. In the capture toolbar, click Copy to Diagramly. Wait for the Copied confirmation.
5. Sign in to the configured review deployment and open or create an editable canvas.
6. Click the canvas background, then press Cmd+V on macOS or Ctrl+V elsewhere. Expect a new editable HTML frame.
7. Undo removes the imported frame.
8. Repeat using Capture entire page. Only content currently loaded by the website is captured; scrolling first may load additional lazy content.
9. Escape cancels section selection. Close dismisses the capture toolbar.

No background capture, remote executable code, clipboard reading, or automated content upload is performed by the extension. Images remain remote references and may be unavailable if they require authentication. Unsupported content and capture size limits are described in the listing.

Release gate: configure the review deployment and verify steps 5–7 before submitting these instructions. Do not provide reviewer credentials until a dedicated test account is available if Google requires one.
