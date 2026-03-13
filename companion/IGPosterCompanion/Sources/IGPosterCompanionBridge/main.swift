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
  let queryItems: [String: String]
  let body: Data
}

private final class ApplePhotosBridgeServer: @unchecked Sendable {
  private let listener: NWListener
  private let queue = DispatchQueue(label: "IGPosterCompanionBridgeServer")
  private let port: UInt16
  private let serveOnce: Bool
  private let stopHandler: @Sendable () -> Void
  private let stateStore = ApplePhotosCompanionStateStore()
  private let photoLibrary = ApplePhotosLibrary()
  private let completedRequestsLock = NSLock()
  private var completedRequests = 0

  init(options: BridgeOptions, stopHandler: @escaping @Sendable () -> Void) throws {
    guard let nwPort = NWEndpoint.Port(rawValue: options.port) else {
      throw NSError(domain: "IGPosterCompanionBridge", code: 1)
    }

    port = options.port
    serveOnce = options.once
    self.stopHandler = stopHandler

    let parameters = NWParameters.tcp
    parameters.allowLocalEndpointReuse = true
    parameters.requiredInterfaceType = .loopback
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
    Task {
      let response = await responseData(for: request)

      connection.send(content: response, completion: .contentProcessed { [weak self] _ in
        connection.cancel()
        self?.finishRequest()
      })
    }
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
    guard let separatorRange = data.range(of: Data("\r\n\r\n".utf8)) else {
      return nil
    }

    let headerData = data.subdata(in: data.startIndex..<separatorRange.lowerBound)
    let body = data.subdata(in: separatorRange.upperBound..<data.endIndex)
    guard
      let requestText = String(data: headerData, encoding: .utf8),
      let requestLine = requestText.components(separatedBy: "\r\n").first
    else {
      return nil
    }

    let parts = requestLine.split(separator: " ", omittingEmptySubsequences: true)
    guard parts.count >= 2 else { return nil }

    let method = String(parts[0]).uppercased()
    let rawPath = String(parts[1])
    let components = URLComponents(
      string:
        "http://\(ApplePhotosCompanionBridge.defaultHost):\(port)\(rawPath)"
    )
    let path = components?.path ?? rawPath
    let queryPairs: [(String, String)] = (components?.queryItems ?? []).compactMap { item in
        guard let value = item.value else { return nil }
        return (item.name, value)
      }
    let queryItems = Dictionary(
      queryPairs,
      uniquingKeysWith: { _, latest in latest }
    )

    return HTTPRequest(method: method, path: path, queryItems: queryItems, body: body)
  }

  private func responseData(for request: HTTPRequest?) async -> Data {
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
      return httpResponse(status: "200 OK", body: healthResponseData())
    }

    if request.method == "GET",
       request.path.hasPrefix(ApplePhotosCompanionBridge.exportDownloadPath(exportID: "")) {
      return exportedAssetResponse(for: request.path)
    }

    if request.method == "GET",
       request.path == ApplePhotosCompanionBridge.paths.recent {
      return await recentResponseData(for: request)
    }

    if request.method == "GET",
       request.path == ApplePhotosCompanionBridge.paths.search {
      return await searchResponseData(for: request)
    }

    if request.method == "POST",
       request.path == ApplePhotosCompanionBridge.paths.pick {
      return pickResponseData()
    }

    if request.method == "POST",
       request.path == ApplePhotosCompanionBridge.paths.importPath {
      return importResponseData(for: request)
    }

    return httpResponse(
      status: "404 Not Found",
      body: errorBody(
        code: "NOT_FOUND",
        message: "The requested Apple Photos bridge route does not exist."
      )
    )
  }

  private func healthResponseData() -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]

    let payload = ApplePhotosCompanionBridge.healthResponse(
      port: Int(port),
      selection: stateStore.load()?.summary
    )

    if let encodedPayload = try? encoder.encode(payload) {
      return encodedPayload
    }

    let fallbackPayload = ApplePhotosCompanionBridge.healthResponse(port: Int(port))
    return (try? encoder.encode(fallbackPayload))
      ?? errorBody(
        code: "HEALTH_ENCODING_FAILED",
        message: "The companion bridge could not encode its health payload."
      )
  }

  private func recentResponseData(for request: HTTPRequest) async -> Data {
    do {
      let query = try assetQuery(
        for: .recent,
        queryItems: request.queryItems
      )

      let payload = try await photoLibrary.recent(query: query)
      return encodedResponse(status: "200 OK", payload: payload)
    } catch let error as ApplePhotosLibraryError {
      return responseData(for: error)
    } catch {
      return httpResponse(
        status: "500 Internal Server Error",
        body: errorBody(
          code: "UNEXPECTED_ERROR",
          message: "The companion bridge could not enumerate recent Photos assets."
        )
      )
    }
  }

  private func searchResponseData(for request: HTTPRequest) async -> Data {
    do {
      let query = try assetQuery(
        for: .search,
        queryItems: request.queryItems
      )

      let payload = try await photoLibrary.search(query: query)
      return encodedResponse(status: "200 OK", payload: payload)
    } catch let error as ApplePhotosLibraryError {
      return responseData(for: error)
    } catch {
      return httpResponse(
        status: "500 Internal Server Error",
        body: errorBody(
          code: "UNEXPECTED_ERROR",
          message: "The companion bridge could not search the local Photos library."
        )
      )
    }
  }

  private func pickResponseData() -> Data {
    guard let snapshot = stateStore.load(), !snapshot.exportedAssets.isEmpty else {
      return httpResponse(
        status: "409 Conflict",
        body: errorBody(
          code: "NO_SELECTION",
          message: "The companion does not have any exported Photos selection ready to import yet."
        )
      )
    }

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let payload = snapshot.pickResponse(
      host: ApplePhotosCompanionBridge.defaultHost,
      port: Int(port)
    )

    return encodedResponse(status: "200 OK", payload: payload, encoder: encoder)
  }

  private func importResponseData(for request: HTTPRequest) -> Data {
    guard
      let body = try? JSONDecoder().decode(ApplePhotosImportRequest.self, from: request.body)
    else {
      return httpResponse(
        status: "400 Bad Request",
        body: errorBody(
          code: "BAD_REQUEST",
          message: "The bridge expected a JSON import body with one or more Photos asset ids."
        )
      )
    }

    guard let snapshot = stateStore.load(), !snapshot.exportedAssets.isEmpty else {
      return httpResponse(
        status: "409 Conflict",
        body: errorBody(
          code: "NO_SELECTION",
          message: "The companion does not have any exported Photos selection ready to import yet."
        )
      )
    }

    let payload = snapshot.importResponse(
      ids: body.ids,
      host: ApplePhotosCompanionBridge.defaultHost,
      port: Int(port)
    )

    guard !payload.assets.isEmpty else {
      return httpResponse(
        status: "404 Not Found",
        body: errorBody(
          code: "ASSETS_NOT_FOUND",
          message: "The requested Photos ids do not match the current exported selection."
        )
      )
    }

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    return encodedResponse(status: "200 OK", payload: payload, encoder: encoder)
  }

  private func exportedAssetResponse(for path: String) -> Data {
    let prefix = ApplePhotosCompanionBridge.exportDownloadPath(exportID: "")
    let exportID = String(path.dropFirst(prefix.count))

    guard
      let snapshot = stateStore.load(),
      let asset = snapshot.exportedAssets.first(where: { $0.id == exportID })
    else {
      return httpResponse(
        status: "404 Not Found",
        body: errorBody(
          code: "ASSET_NOT_FOUND",
          message: "The requested exported Photos asset is no longer available."
        )
      )
    }

    guard FileManager.default.fileExists(atPath: asset.exportPath) else {
      return httpResponse(
        status: "410 Gone",
        body: errorBody(
          code: "ASSET_EXPIRED",
          message: "The requested exported Photos asset is no longer present in the companion cache."
        )
      )
    }

    guard let body = try? Data(contentsOf: URL(fileURLWithPath: asset.exportPath)) else {
      return httpResponse(
        status: "500 Internal Server Error",
        body: errorBody(
          code: "ASSET_READ_FAILED",
          message: "The companion could not read the exported Photos asset from disk."
        )
      )
    }

    return httpResponse(
      status: "200 OK",
      body: body,
      contentType: asset.contentType,
      extraHeaders: [
        "Content-Disposition: inline; filename=\"\(asset.filename)\""
      ]
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

  private func responseData(for error: ApplePhotosLibraryError) -> Data {
    switch error {
    case .invalidFilter(let rawValue):
      return httpResponse(
        status: "400 Bad Request",
        body: errorBody(
          code: "INVALID_INPUT",
          message: "Unsupported Photos filter: \(rawValue)"
        )
      )
    case .invalidSince(let rawValue):
      return httpResponse(
        status: "400 Bad Request",
        body: errorBody(
          code: "INVALID_INPUT",
          message: "Unsupported Photos since filter: \(rawValue)"
        )
      )
    case .invalidLimit(let limit):
      return httpResponse(
        status: "400 Bad Request",
        body: errorBody(
          code: "INVALID_INPUT",
          message: "Photos limit must be greater than zero; received \(limit)."
        )
      )
    case .photosPermissionRequired:
      return httpResponse(
        status: "403 Forbidden",
        body: errorBody(
          code: ApplePhotosBridgeErrorCode.photosPermissionRequired.rawValue,
          message: "The companion needs Photos permission before it can enumerate the local library."
        )
      )
    }
  }

  private func assetQuery(
    for mode: ApplePhotosBridgeQueryMode,
    queryItems: [String: String]
  ) throws -> ApplePhotosAssetQuery {
    let limit = try parseLimit(queryItems["limit"])
    return ApplePhotosAssetQuery(
      mode: mode,
      since: normalizedOptionalString(queryItems["since"]),
      limit: limit,
      album: normalizedOptionalString(queryItems["album"]),
      mediaType: try parseMediaType(queryItems["media"]),
      favorite: try parseFavorite(queryItems["favorite"])
    )
  }

  private func parseLimit(_ rawValue: String?) throws -> Int {
    guard let rawValue = normalizedOptionalString(rawValue) else {
      return 20
    }

    guard let parsed = Int(rawValue), parsed > 0 else {
      throw ApplePhotosLibraryError.invalidLimit(Int(rawValue) ?? 0)
    }

    return min(parsed, 200)
  }

  private func parseMediaType(_ rawValue: String?) throws -> ApplePhotosMediaType? {
    guard let rawValue = normalizedOptionalString(rawValue) else {
      return nil
    }

    guard let mediaType = ApplePhotosMediaType(rawValue: rawValue) else {
      throw ApplePhotosLibraryError.invalidFilter("media=\(rawValue)")
    }

    return mediaType
  }

  private func parseFavorite(_ rawValue: String?) throws -> Bool? {
    guard let rawValue = normalizedOptionalString(rawValue) else {
      return nil
    }

    switch rawValue.lowercased() {
    case "1", "true", "yes":
      return true
    case "0", "false", "no":
      return false
    default:
      throw ApplePhotosLibraryError.invalidFilter("favorite=\(rawValue)")
    }
  }

  private func encodedResponse<T: Encodable>(
    status: String,
    payload: T,
    encoder: JSONEncoder? = nil
  ) -> Data {
    let responseEncoder = encoder ?? {
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.sortedKeys]
      return encoder
    }()

    return httpResponse(
      status: status,
      body: (try? responseEncoder.encode(payload)) ?? Data("{}".utf8)
    )
  }

  private func httpResponse(
    status: String,
    body: Data,
    contentType: String = "application/json",
    extraHeaders: [String] = []
  ) -> Data {
    let headerLines: [String] = [
      "HTTP/1.1 \(status)",
      "Content-Type: \(contentType)",
      "Content-Length: \(body.count)",
      "Access-Control-Allow-Origin: *",
      "Access-Control-Allow-Headers: Content-Type, \(ApplePhotosCompanionBridge.tokenHeader)",
      "Access-Control-Allow-Methods: GET, POST, OPTIONS",
      "Cache-Control: no-store",
    ] + extraHeaders + [
      "Connection: close",
      "",
      "",
    ]
    let headers = headerLines.joined(separator: "\r\n")

    var response = Data(headers.utf8)
    response.append(body)
    return response
  }
}

private func normalizedOptionalString(_ value: String?) -> String? {
  guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
    return nil
  }

  return trimmed
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
        port: Int(options.port),
        selection: ApplePhotosCompanionStateStore().load()?.summary
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
