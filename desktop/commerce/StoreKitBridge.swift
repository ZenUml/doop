import AppKit
import Foundation
import StoreKit
import WebKit

private enum CommerceError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(text) = self { return text }; return nil }
}

// Do not follow redirects with a one-use delivery ticket, including redirects
// from loopback to a public site. URLSession has a separate cookie jar from WK.
private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

@MainActor
private final class StoreKitBridge: NSObject, WKScriptMessageHandlerWithReply {
    private let origin: URL
    private var verified: [String: (Transaction, String, [String: Any])] = [:]
    private var listener: Task<Void, Never>?
    private var purchasing = false

    init(origin: URL) {
        self.origin = origin
        super.init()
        listener = Task { [weak self] in
            for await update in Transaction.updates {
                guard !Task.isCancelled else { return }
                _ = try? self?.remember(update)
                // Keep unfinished until the authenticated cloud backend has
                // durably delivered it; reload/relaunch uses .unfinished too.
            }
        }
    }

    deinit { listener?.cancel() }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        let security = message.frameInfo.securityOrigin
        guard CommercePolicy.allows(mainFrame: message.frameInfo.isMainFrame,
                                    scheme: security.protocol, host: security.host,
                                    port: security.port, origin: origin),
              message.webView?.url?.scheme == origin.scheme,
              message.webView?.url?.host == origin.host,
              message.webView?.url?.port == origin.port,
              let request = message.body as? [String: Any],
              let action = request["action"] as? String
        else { replyHandler(nil, "Purchases are available only in the main Diagramly window."); return }
        let payload = request["payload"] as? [String: Any] ?? [:]
        Task {
            do { replyHandler(try await perform(action, payload), nil) }
            catch { replyHandler(nil, error.localizedDescription) }
        }
    }

    private func remember(_ result: VerificationResult<Transaction>) throws -> [String: Any] {
        guard case let .verified(transaction) = result,
              CommercePolicy.products.contains(transaction.productID)
        else { throw CommerceError.message("Apple could not verify this Diagramly purchase.") }
        let id = String(transaction.id)
        var value: [String: Any] = [
            "transactionId": id, "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID, "signedTransaction": result.jwsRepresentation,
        ]
        if let token = transaction.appAccountToken { value["appAccountToken"] = token.uuidString }
        if let expiry = transaction.expirationDate { value["expiresAt"] = expiry.ISO8601Format() }
        if let revoked = transaction.revocationDate { value["revokedAt"] = revoked.ISO8601Format() }
        verified[id] = (transaction, result.jwsRepresentation, value)
        return value
    }

    private func transactions() async -> [[String: Any]] {
        var records: [String: [String: Any]] = [:]
        for await item in Transaction.currentEntitlements {
            if let record = try? remember(item), let id = record["transactionId"] as? String { records[id] = record }
        }
        for await item in Transaction.unfinished {
            if let record = try? remember(item), let id = record["transactionId"] as? String { records[id] = record }
        }
        // Listener updates include revocations no longer in currentEntitlements.
        for (id, (_, _, record)) in verified where records[id] == nil {
            records[id] = record
        }
        return records.values.sorted { ($0["transactionId"] as? String ?? "") < ($1["transactionId"] as? String ?? "") }
    }

    private func perform(_ action: String, _ payload: [String: Any]) async throws -> Any {
        switch action {
        case "products":
            return ["products": try await Product.products(for: CommercePolicy.products).map { product in
                var value: [String: Any] = ["id": product.id, "displayName": product.displayName,
                                           "description": product.description, "displayPrice": product.displayPrice]
                if let period = product.subscription?.subscriptionPeriod {
                    value["subscriptionPeriod"] = ["value": period.value, "unit": String(describing: period.unit)]
                }
                return value
            }]
        case "purchase":
            guard !purchasing else { throw CommerceError.message("A purchase is already in progress.") }
            guard let id = payload["productId"] as? String, CommercePolicy.products.contains(id),
                  let tokenText = payload["appAccountToken"] as? String, let token = UUID(uuidString: tokenText)
            else { throw CommerceError.message("Sign in to Diagramly before purchasing a supported plan.") }
            purchasing = true
            defer { purchasing = false }
            guard let product = try await Product.products(for: [id]).first else {
                throw CommerceError.message("This plan is unavailable in the App Store. Try again later.")
            }
            switch try await product.purchase(options: [.appAccountToken(token)]) {
            case let .success(result): return ["status": "purchased", "transaction": try remember(result)]
            case .pending: return ["status": "pending"]
            case .userCancelled: return ["status": "cancelled"]
            @unknown default: throw CommerceError.message("The App Store returned an unknown purchase result.")
            }
        case "transactions": return ["transactions": await transactions()]
        case "restore":
            try await AppStore.sync() // Explicit user action only; may show Apple authentication.
            return ["transactions": await transactions()]
        case "deliver":
            guard let id = payload["transactionId"] as? String,
                  let ticket = payload["deliveryTicket"] as? String, (16...512).contains(ticket.count),
                  let (transaction, jws, _) = verified[id]
            else { throw CommerceError.message("Refresh purchases and sign in before restoring access.") }
            var request = URLRequest(url: origin.appendingPathComponent("api/diagramly/apple/deliver"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "transactionId": id, "signedTransaction": jws, "deliveryTicket": ticket,
            ])
            request.timeoutInterval = 30
            let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
            defer { session.invalidateAndCancel() }
            let (data, response) = try await session.data(for: request)
            guard let response = response as? HTTPURLResponse,
                  CommercePolicy.delivered(data, status: response.statusCode, transactionID: id)
            else { throw CommerceError.message("Purchase is saved by Apple. Diagramly could not confirm access yet; retry Restore Purchases after signing in.") }
            await transaction.finish()
            return ["delivered": true, "transactionId": id]
        case "manage":
            guard let url = URL(string: "https://apps.apple.com/account/subscriptions"), NSWorkspace.shared.open(url)
            else { throw CommerceError.message("Could not open Apple's subscription settings.") }
            return ["opened": true]
        default: throw CommerceError.message("Unsupported purchase action.")
        }
    }
}

// Called on the UI thread from Rust after WKWebView creation. WebKit retains
// the handler; no global account token or signed transaction is injected.
@_cdecl("diagramly_storekit_attach")
public func diagramlyStoreKitAttach(_ pointer: UnsafeMutableRawPointer, _ originText: UnsafePointer<CChar>) {
    MainActor.assumeIsolated {
        guard let origin = URL(string: String(cString: originText)) else { return }
        let webview = Unmanaged<WKWebView>.fromOpaque(pointer).takeUnretainedValue()
        let controller = webview.configuration.userContentController
        controller.addScriptMessageHandler(StoreKitBridge(origin: origin), contentWorld: .page, name: "diagramlyCommerce")
        controller.addUserScript(WKUserScript(source: """
            if (window === window.top) {
              Object.defineProperty(window, '__DIAGRAMLY_STOREKIT__', { value: Object.freeze({
                request: (action, payload = {}) => window.webkit.messageHandlers.diagramlyCommerce.postMessage({action, payload})
              }), writable: false, configurable: false });
            }
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
}
