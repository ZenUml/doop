// Run through the opt-in local StoreKit test script, never against production.
import Foundation
import StoreKit
import StoreKitTest

@main struct StoreKitTesting {
    static func main() async throws {
        let configuration = URL(fileURLWithPath: CommandLine.arguments[1])
        let session = try SKTestSession(contentsOf: configuration)
        session.disableDialogs = true
        session.clearTransactions()
        defer { session.clearTransactions() }
        // Exercise the local-only API first. If Xcode's StoreKit test service
        // is unavailable, stop before asking StoreKit for any real products.
        let probe = try await session.buyProduct(identifier: "ai.diagramly.desktop.pro.monthly")
        precondition(probe.environment == .xcode)
        session.clearTransactions()
        let products = try await Product.products(for: CommercePolicy.products)
        precondition(Set(products.map(\.id)) == CommercePolicy.products)
        precondition(products.allSatisfy { !$0.displayPrice.isEmpty && $0.subscription != nil })
        let token = UUID()
        guard case let .success(result) = try await products[0].purchase(options: [.appAccountToken(token)]),
              case let .verified(transaction) = result else { fatalError("Expected local verified purchase") }
        precondition(transaction.appAccountToken == token)
        precondition(!result.jwsRepresentation.isEmpty)
        var unfinished = false
        for await item in Transaction.unfinished {
            if case let .verified(pending) = item, pending.id == transaction.id { unfinished = true }
        }
        precondition(unfinished, "A purchase must remain recoverable before backend delivery")
        try session.refundTransaction(identifier: UInt(transaction.id))
        print("StoreKit Testing: product fetch, localized prices, verified purchase, account token, unfinished recovery and refund passed")
    }
}
