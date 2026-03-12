import Foundation
import Network
import IGPosterCompanionCore

private struct BridgeOptions {
  let port: UInt16
  let once: Bool
  let printHealth: Bool
}

private struct HTTPRequest {
  let method: String
  let path: String
}

private final class ApplePhotosBridgeServer: @unchecked Sendable {
  private let listener: NWListener
  private let queue = DispatchQueue(label: "IGPosterCompanionBridgeServer")
  private let port: UInt16
  private let serveOnce: Bool
  private let stopHandler: @Sendable () -> Void
  private let healthJSON: Data
  private let completedRequestsLock = NSLock()
  private var completedRequests = 0

  init(options: BridgeOptions, stopHandler: @escaping @Sendable () -> Void) throws {
    guard let nwPort = NWEndpoint.Port(rawValue: options.port) else {
      throw NSError(domain: "IGPosterCompanionBridge", code: 1)
    }

    port = options.port
    serveOnce = options.once
    self.stopHandler = stopHandler

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    healthJSON = try encoder.encode(
      ApplePhotosCompanionBridge.healthResponse(
        port: Int(options.port)
      )
    )

    let parameters = NWParameters.tcp
    parameters.allowLocalEndpointReuse = true
    listener = try NWListener(using: parameters, on: nwPort)
  }

  func start() {
    listener.stateUpdateHandler = { [weak self] state in
      guard let self else { return }

      switch state {
      case .ready:
        print(
          "IGPosterCompanion bridge listening on http://\(ApplePhotosCompanionBridge.defaultHost):\(self.port)"
        )
      case .failed(let error):
        fputs("IGPosterCompanion bridge failed: \(error)\n", stderr)
        self.stopHandler()
      case .cancelled:
        self.stopHandler()
      default:
        break
      }
    }

    listener.newConnectionHandler = { [weak self] connection in
      self?.handle(connection)
    }

    listener.start(queue: queue)
  }

  private func handle(_ connection: NWConnection) {
    connection.start(queue: queue)
    receive(on: connection, buffer: Data())
  }

  private func receive(on connection: NWConnection, buffer: Data) {
    connection.receive(
      minimumIncompleteLength: 1,
      maximumLength: 65_536
    ) { [weak self] data, _, isComplete, error in
      guard let self else {
        connection.cancel()
        return
      }

      var accumulated = buffer
      if let data {
        accumulated.append(data)
      }

      if error != nil || isComplete || self.hasCompleteHTTPRequest(in: accumulated) {
        self.respond(to: accumulated, on: connection)
        return
      }

      self.receive(on: connection, buffer: accumulated)
    }
  }

  private func hasCompleteHTTPRequest(in data: Data) -> Bool {
    data.range(of: Data("\r\n\r\n".utf8)) != nil
  }

  private func respond(to requestData: Data, on connection: NWConnection) {
    let request = parseRequest(from: requestData)
    let response = responseData(for: request)

    connection.send(content: response, completion: .contentProcessed { [weak self] _ in
      connection.cancel()
      self?.finishRequest()
    })
  }

  private func finishRequest() {
    guard serveOnce else { return }

    completedRequestsLock.lock()
    completedRequests += 1
    let shouldStop = completedRequests >= 1
    completedRequestsLock.unlock()

    if shouldStop {
      listener.cancel()
    }
  }

  private func parseRequest(from data: Data) -> HTTPRequest? {
    guard
      let requestText = String(data: data, encoding: .utf8),
      let requestLine = requestText.components(separatedBy: "\r\n").first
    else {
      return nil
    }

    let parts = requestLine.split(separator: " ", omittingEmptySubsequences: true)
    guard parts.count >= 2 else { return nil }

    let method = String(parts[0]).uppercased()
    let rawPath = String(parts[1])
    let path = URLComponents(
      string:
        "http://\(ApplePhotosCompanionBridge.defaultHost):\(port)\(rawPath)"
    )?.path ?? rawPath

    return HTTPRequest(method: method, path: path)
  }

  private func responseData(for request: HTTPRequest?) -> Data {
    guard let request else {
      return httpResponse(
        status: "400 Bad Request",
        body: errorBody(
          code: "BAD_REQUEST",
          message: "The bridge could not parse the incoming HTTP request."
        )
      )
    }

    if request.method == "OPTIONS" {
      return httpResponse(status: "204 No Content", body: Data())
    }

    if request.method == "GET", request.path == ApplePhotosCompanionBridge.paths.health {
      return httpResponse(status: "200 OK", body: healthJSON)
    }

    if request.method == "GET",
       [ApplePhotosCompanionBridge.paths.recent, ApplePhotosCompanionBridge.paths.search]
       .contains(request.path) {
      return httpResponse(
        status: "501 Not Implemented",
        body: errorBody(
          code: "NOT_IMPLEMENTED",
          message: "The companion bridge only serves /v1/health in this slice."
        )
      )
    }

    if request.method == "POST",
       [ApplePhotosCompanionBridge.paths.pick, ApplePhotosCompanionBridge.paths.importPath]
       .contains(request.path) {
      return httpResponse(
        status: "501 Not Implemented",
        body: errorBody(
          code: "NOT_IMPLEMENTED",
          message: "The companion bridge only serves /v1/health in this slice."
        )
      )
    }

    return httpResponse(
      status: "404 Not Found",
      body: errorBody(
        code: "NOT_FOUND",
        message: "The requested Apple Photos bridge route does not exist."
      )
    )
  }

  private func errorBody(code: String, message: String) -> Data {
    let payload = [
      "ok": false,
      "error": code,
      "message": message,
    ] as [String : Any]

    return (try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]))
      ?? Data("{}".utf8)
  }

  private func httpResponse(status: String, body: Data) -> Data {
    let headers = [
      "HTTP/1.1 \(status)",
      "Content-Type: application/json",
      "Content-Length: \(body.count)",
      "Access-Control-Allow-Origin: *",
      "Access-Control-Allow-Headers: Content-Type, \(ApplePhotosCompanionBridge.tokenHeader)",
      "Access-Control-Allow-Methods: GET, POST, OPTIONS",
      "Cache-Control: no-store",
      "Connection: close",
      "",
      "",
    ].joined(separator: "\r\n")

    var response = Data(headers.utf8)
    response.append(body)
    return response
  }
}

private func parseOptions() throws -> BridgeOptions {
  var port = UInt16(ApplePhotosCompanionBridge.defaultPort)
  var once = false
  var printHealth = false

  var index = 0
  let arguments = Array(CommandLine.arguments.dropFirst())
  while index < arguments.count {
    switch arguments[index] {
    case "--port":
      index += 1
      guard
        index < arguments.count,
        let parsedPort = UInt16(arguments[index])
      else {
        throw NSError(domain: "IGPosterCompanionBridge", code: 2)
      }
      port = parsedPort
    case "--once":
      once = true
    case "--print-health":
      printHealth = true
    default:
      throw NSError(domain: "IGPosterCompanionBridge", code: 3)
    }
    index += 1
  }

  return BridgeOptions(port: port, once: once, printHealth: printHealth)
}

@main
struct IGPosterCompanionBridgeMain {
  static func main() throws {
    let options = try parseOptions()

    if options.printHealth {
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
      let payload = ApplePhotosCompanionBridge.healthResponse(
        port: Int(options.port)
      )
      let data = try encoder.encode(payload)
      FileHandle.standardOutput.write(data)
      FileHandle.standardOutput.write(Data("\n".utf8))
      return
    }

    let semaphore = DispatchSemaphore(value: 0)
    let server = try ApplePhotosBridgeServer(options: options) {
      semaphore.signal()
    }

    server.start()

    if options.once {
      semaphore.wait()
      return
    }

    dispatchMain()
  }
}
