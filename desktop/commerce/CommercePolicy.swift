import Foundation

enum CommercePolicy {
    static let products = Set(["ai.diagramly.desktop.pro.monthly", "ai.diagramly.desktop.pro.yearly"])

    // The native caller supplies the launch origin, never the page. Even another
    // localhost port is untrusted. Opaque/sandboxed diagram frames fail this check.
    static func allows(mainFrame: Bool, scheme: String, host: String, port: Int, origin: URL) -> Bool {
        mainFrame && scheme == origin.scheme && host == origin.host && port == origin.port
            && scheme == "http" && host == "127.0.0.1"
    }

    static func delivered(_ data: Data, status: Int, transactionID: String) -> Bool {
        guard (200..<300).contains(status),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return false }
        return value["delivered"] as? Bool == true && value["transactionId"] as? String == transactionID
    }
}
