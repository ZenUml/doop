import Foundation

let origin = URL(string: "http://127.0.0.1:49152")!
func allowed(_ main: Bool = true, _ scheme: String = "http", _ host: String = "127.0.0.1", _ port: Int = 49152) -> Bool {
    CommercePolicy.allows(mainFrame: main, scheme: scheme, host: host, port: port, origin: origin)
}
precondition(allowed())
precondition(!allowed(false), "A same-origin child frame must be denied")
precondition(!allowed(true, "http", "127.0.0.1", 49153), "Another local app must be denied")
precondition(!allowed(true, "https", "diagramly.ai", 443))
precondition(!allowed(true, "", "", 0), "Opaque sandboxed frames must be denied")
precondition(!allowed(true, "http", "localhost", 49152))
let receipt = Data(#"{"delivered":true,"transactionId":"123"}"#.utf8)
precondition(CommercePolicy.delivered(receipt, status: 200, transactionID: "123"))
precondition(!CommercePolicy.delivered(receipt, status: 503, transactionID: "123"))
precondition(!CommercePolicy.delivered(receipt, status: 200, transactionID: "456"))
precondition(!CommercePolicy.delivered(Data(#"{"delivered":false,"transactionId":"123"}"#.utf8), status: 200, transactionID: "123"))
precondition(!CommercePolicy.delivered(Data("not JSON".utf8), status: 200, transactionID: "123"))
print("Commerce policy: 11 origin/delivery cases passed")
