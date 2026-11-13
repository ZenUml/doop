import AppKit
import Foundation
import WebKit

@MainActor
private final class BoundaryHarness: NSObject, WKNavigationDelegate {
    let webview = WKWebView()
    let origin = "http://127.0.0.1:49152"
    var testedOtherPort = false

    override init() {
        super.init()
        webview.navigationDelegate = self
        origin.withCString { diagramlyStoreKitAttach(Unmanaged.passUnretained(webview).toOpaque(), $0) }
        webview.loadHTMLString("<!doctype html><body>Commerce boundary test</body>", baseURL: URL(string: origin))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task {
            do {
                let result = try await webview.callAsyncJavaScript("""
                    return await window.__DIAGRAMLY_STOREKIT__.request('invalid').then(() => 'allowed', e => String(e));
                    """, arguments: [:], in: nil, contentWorld: .page) as? String ?? ""
                if testedOtherPort {
                    precondition(result.contains("only in the main Diagramly window"), "Another port must fail the native gate: \(result)")
                    print("WebKit boundary: main-frame dispatch, opaque iframe denial, same-origin iframe denial and other-port denial passed")
                    exit(0)
                }
                precondition(result.contains("Unsupported purchase action"), "Expected allowed main frame: \(result)")
                for sandbox in ["allow-scripts", "allow-scripts allow-same-origin"] {
                    let response = try await webview.callAsyncJavaScript("""
                        return await new Promise(resolve => {
                          window.addEventListener('message', e => resolve(e.data), {once:true});
                          const frame = document.createElement('iframe');
                          frame.sandbox = sandbox;
                          frame.srcdoc = '<script>window.webkit.messageHandlers.diagramlyCommerce.postMessage({action:"invalid"}).then(()=>parent.postMessage("allowed","*"),e=>parent.postMessage(String(e),"*"))<\\/script>';
                          document.body.appendChild(frame);
                        });
                        """, arguments: ["sandbox": sandbox], in: nil, contentWorld: .page) as? String ?? ""
                    precondition(response.contains("only in the main Diagramly window"), "Iframe must fail native gate: \(response)")
                }
                testedOtherPort = true
                webview.loadHTMLString("<!doctype html><body>Other port</body>", baseURL: URL(string: "http://127.0.0.1:49153"))
            } catch {
                fputs("WebKit boundary failed: \(error)\n", stderr)
                exit(1)
            }
        }
    }
}

@main @MainActor struct WebKitBoundary {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let harness = BoundaryHarness()
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
            _ = harness
            fputs("WebKit boundary timed out\n", stderr)
            exit(1)
        }
        app.run()
    }
}
