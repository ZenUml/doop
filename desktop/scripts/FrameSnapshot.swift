import AppKit
import WebKit

private struct Request: Decodable {
    let html: String
    let origin: URL
    let width: Int
    let height: Int
    let captureHeight: Int
    let outputWidth: Int
    let diagram: Bool
}

private func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

@MainActor
private final class Snapshot: NSObject, WKNavigationDelegate {
    private let request: Request
    private let window: NSWindow
    private let view: WKWebView
    private var initialNavigation = true

    init(_ request: Request) {
        self.request = request
        let rect = NSRect(x: 0, y: 0, width: request.width, height: request.height)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        view = WKWebView(frame: rect, configuration: config)
        window = NSWindow(contentRect: rect, styleMask: .borderless, backing: .buffered, defer: false)
        super.init()
        // Attach for layout and snapshotting without showing or focusing the window.
        window.contentView = view
        view.navigationDelegate = self
    }

    func start() {
        view.loadHTMLString(request.html, baseURL: request.origin)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard initialNavigation, action.targetFrame?.isMainFrame == true,
              action.request.url == request.origin || action.request.url?.absoluteString == "about:blank" else {
            return .cancel
        }
        initialNavigation = false
        return .allow
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            do {
                try await capture()
            } catch {
                fail(error.localizedDescription)
            }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        fail(error.localizedDescription)
    }

    private func capture() async throws {
        let ready = try await view.callAsyncJavaScript("""
        if (diagram) {
            const root = document.documentElement;
            await new Promise(resolve => {
                if (root.hasAttribute('data-doop-diagram-state')) return resolve();
                const observer = new MutationObserver(() => {
                    if (!root.hasAttribute('data-doop-diagram-state')) return;
                    observer.disconnect();
                    resolve();
                });
                observer.observe(root, {attributeFilter: ['data-doop-diagram-state']});
            });
            if (root.getAttribute('data-doop-diagram-state') !== 'rendered') return false;
        }
        await document.fonts.ready;
        return true;
        """, arguments: ["diagram": request.diagram], in: nil, contentWorld: .defaultClient)
        guard ready as? Bool == true else { fail("The diagram did not render") }

        let config = WKSnapshotConfiguration()
        config.rect = CGRect(x: 0, y: 0, width: request.width, height: request.captureHeight)
        config.snapshotWidth = NSNumber(value: Double(request.outputWidth) / window.backingScaleFactor)
        let image = try await view.takeSnapshot(configuration: config)
        guard let pixels = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
              let png = NSBitmapImageRep(cgImage: pixels).representation(using: .png, properties: [:]) else {
            fail("WebKit did not produce a PNG")
        }
        FileHandle.standardOutput.write(png)
        exit(0)
    }
}

@main
private enum Main {
    @MainActor
    static func main() {
        let input = FileHandle.standardInput.readDataToEndOfFile()
        guard let request = try? JSONDecoder().decode(Request.self, from: input) else {
            fail("Invalid screenshot request")
        }
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let snapshot = Snapshot(request)
        snapshot.start()
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { fail("WebKit screenshot timed out") }
        withExtendedLifetime(snapshot) { app.run() }
    }
}
