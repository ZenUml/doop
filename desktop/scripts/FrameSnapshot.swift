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
    let transparent: Bool?
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
        if request.transparent == true {
            view.underPageBackgroundColor = .clear
            window.isOpaque = false
            window.backgroundColor = .clear
        }
        window.contentView = view
        view.navigationDelegate = self
    }

    func start() {
        let html: String
        if request.transparent == true {
            // Trusted renderer surfaces only; diagram shapes retain their own fills.
            html = request.html + "<style>html,body,.sequence-diagram{background:transparent!important}</style>"
        } else {
            html = request.html
        }
        view.loadHTMLString(html, baseURL: request.origin)
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

        func snapshot(paper: String? = nil) async throws -> CGImage {
            if let paper {
                _ = try await view.callAsyncJavaScript("""
                let style = document.getElementById('doop-capture-paper');
                if (!style) { style = document.createElement('style'); style.id = 'doop-capture-paper'; document.documentElement.append(style); }
                style.textContent = `html,body{background:${paper}!important}.sequence-diagram{background:transparent!important}*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`;
                // Hidden windows may never receive animation frames. Force
                // layout, then bound the two-frame wait before software capture.
                document.documentElement.getBoundingClientRect();
                await Promise.race([
                    new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                    new Promise(resolve => setTimeout(resolve, 80)),
                ]);
                """, arguments: ["paper": paper], in: nil, contentWorld: .defaultClient)
            }
            let config = WKSnapshotConfiguration()
            config.rect = CGRect(x: 0, y: 0, width: request.width, height: request.captureHeight)
            config.snapshotWidth = NSNumber(value: Double(request.outputWidth) / window.backingScaleFactor)
            let image = try await view.takeSnapshot(configuration: config)
            guard let result = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                fail("WebKit did not produce an image")
            }
            return result
        }
        let pixels: CGImage
        if request.transparent == true {
            // macOS software snapshots are opaque. Two deterministic public-API
            // captures recover coverage alpha, preserving white shapes and ink.
            let black = try await snapshot(paper: "black")
            let white = try await snapshot(paper: "white")
            guard black.width == white.width, black.height == white.height,
                  let space = CGColorSpace(name: CGColorSpace.sRGB) else { fail("Mismatched transparent captures") }
            let width = black.width, height = black.height
            let bitmapInfo = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
            func rgba(_ image: CGImage) -> [UInt8] {
                var bytes = [UInt8](repeating: 0, count: width * height * 4)
                bytes.withUnsafeMutableBytes { buffer in
                    guard let context = CGContext(data: buffer.baseAddress, width: width, height: height,
                        bitsPerComponent: 8, bytesPerRow: width * 4, space: space, bitmapInfo: bitmapInfo) else { fail("Could not allocate capture pixels") }
                    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
                }
                return bytes
            }
            var output = rgba(black)
            let overWhite = rgba(white)
            for pixel in stride(from: 0, to: output.count, by: 4) {
                let delta = (0..<3).map { max(0, Int(overWhite[pixel + $0]) - Int(output[pixel + $0])) }.max() ?? 0
                let alpha = UInt8(255 - delta)
                for channel in 0..<3 { output[pixel + channel] = min(output[pixel + channel], alpha) }
                output[pixel + 3] = alpha
            }
            guard let provider = CGDataProvider(data: Data(output) as CFData),
                  let result = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
                    bytesPerRow: width * 4, space: space, bitmapInfo: CGBitmapInfo(rawValue: bitmapInfo),
                    provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent) else {
                fail("Could not encode the transparent capture")
            }
            pixels = result
        } else {
            pixels = try await snapshot()
        }
        guard let png = NSBitmapImageRep(cgImage: pixels).representation(using: .png, properties: [:]) else {
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
