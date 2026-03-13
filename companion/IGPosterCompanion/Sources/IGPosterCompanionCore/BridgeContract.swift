import Foundation

public enum ApplePhotosBridgeErrorCode: String, CaseIterable, Codable, Equatable, Sendable {
  case unsupportedPlatform = "UNSUPPORTED_PLATFORM"
  case macosCompanionRequired = "MACOS_COMPANION_REQUIRED"
  case macosBridgeUnavailable = "MACOS_BRIDGE_UNAVAILABLE"
  case photosPermissionRequired = "PHOTOS_PERMISSION_REQUIRED"
}

public enum ApplePhotosMediaType: String, Codable, Equatable, Sendable {
  case image
  case video
  case livePhoto = "live-photo"
}

public enum ApplePhotosBridgeCapability: String, CaseIterable, Codable, Equatable, Sendable {
  case pick
  case recent
  case search
  case importAssets = "import"
}

public struct ApplePhotosBridgePaths: Codable, Equatable, Sendable {
  public let health: String
  public let recent: String
  public let search: String
  public let pick: String
  public let importPath: String
  public let openCompanion: String

  public init(
    health: String = "\(ApplePhotosCompanionBridge.versionPathPrefix)/health",
    recent: String = "\(ApplePhotosCompanionBridge.versionPathPrefix)/photos/recent",
    search: String = "\(ApplePhotosCompanionBridge.versionPathPrefix)/photos/search",
    pick: String = "\(ApplePhotosCompanionBridge.versionPathPrefix)/photos/pick",
    importPath: String = "\(ApplePhotosCompanionBridge.versionPathPrefix)/photos/import",
    openCompanion: String = "\(ApplePhotosCompanionBridge.versionPathPrefix)/companion/open"
  ) {
    self.health = health
    self.recent = recent
    self.search = search
    self.pick = pick
    self.importPath = importPath
    self.openCompanion = openCompanion
  }

  enum CodingKeys: String, CodingKey {
    case health
    case recent
    case search
    case pick
    case importPath = "import"
    case openCompanion = "openCompanion"
  }
}

public struct ApplePhotosBridgeURLs: Equatable, Sendable {
  public let origin: URL
  public let health: URL
  public let recent: URL
  public let search: URL
  public let pick: URL
  public let importURL: URL
  public let openCompanionURL: URL
}

public struct ApplePhotosBridgeInfo: Codable, Equatable, Sendable {
  public let origin: String
  public let authTokenHeader: String
  public let healthURL: String
  public let recentURL: String
  public let searchURL: String
  public let pickURL: String
  public let importURL: String
  public let openCompanionURL: String

  enum CodingKeys: String, CodingKey {
    case origin
    case authTokenHeader
    case healthURL = "healthUrl"
    case recentURL = "recentUrl"
    case searchURL = "searchUrl"
    case pickURL = "pickUrl"
    case importURL = "importUrl"
    case openCompanionURL = "openCompanionUrl"
  }
}

public struct ApplePhotosCompanionAppInfo: Codable, Equatable, Sendable {
  public let installed: Bool
  public let bundlePath: String?

  public init(installed: Bool, bundlePath: String? = nil) {
    self.installed = installed
    self.bundlePath = bundlePath
  }
}

public struct ApplePhotosBridgeHealthResponse: Codable, Equatable, Sendable {
  public let appName: String
  public let version: String
  public let bridge: ApplePhotosBridgeInfo
  public let capabilities: [ApplePhotosBridgeCapability]
  public let companionApp: ApplePhotosCompanionAppInfo
  public let selection: ApplePhotosBridgeSelectionSummary?
}

public struct ApplePhotosBridgeSelectionSummary: Codable, Equatable, Sendable {
  public let updatedAt: String
  public let action: ApplePhotosCompanionBridge.LaunchAction?
  public let draftId: String?
  public let profile: String?
  public let assetCount: Int
}

public struct ApplePhotosAssetRecord: Codable, Equatable, Sendable {
  public let id: String
  public let filename: String
  public let mediaType: ApplePhotosMediaType
  public let createdAt: String
  public let width: Int?
  public let height: Int?
  public let durationMs: Int?
  public let favorite: Bool
  public let albumNames: [String]

  public init(
    id: String,
    filename: String,
    mediaType: ApplePhotosMediaType,
    createdAt: String,
    width: Int? = nil,
    height: Int? = nil,
    durationMs: Int? = nil,
    favorite: Bool,
    albumNames: [String]
  ) {
    self.id = id
    self.filename = filename
    self.mediaType = mediaType
    self.createdAt = createdAt
    self.width = width
    self.height = height
    self.durationMs = durationMs
    self.favorite = favorite
    self.albumNames = albumNames
  }
}

public enum ApplePhotosBridgeQueryMode: String, Codable, Equatable, Sendable {
  case recent
  case search
}

public struct ApplePhotosAssetQuery: Codable, Equatable, Sendable {
  public let mode: ApplePhotosBridgeQueryMode
  public let since: String?
  public let limit: Int
  public let album: String?
  public let mediaType: ApplePhotosMediaType?
  public let favorite: Bool?

  public init(
    mode: ApplePhotosBridgeQueryMode,
    since: String? = nil,
    limit: Int,
    album: String? = nil,
    mediaType: ApplePhotosMediaType? = nil,
    favorite: Bool? = nil
  ) {
    self.mode = mode
    self.since = since
    self.limit = limit
    self.album = album
    self.mediaType = mediaType
    self.favorite = favorite
  }
}

public struct ApplePhotosAssetListResponse: Codable, Equatable, Sendable {
  public let assets: [ApplePhotosAssetRecord]
  public let fetchedAt: String
  public let query: ApplePhotosAssetQuery

  public init(
    assets: [ApplePhotosAssetRecord],
    fetchedAt: String,
    query: ApplePhotosAssetQuery
  ) {
    self.assets = assets
    self.fetchedAt = fetchedAt
    self.query = query
  }
}

public struct ApplePhotosImportedAssetRecord: Codable, Equatable, Sendable {
  public let id: String
  public let filename: String
  public let mediaType: ApplePhotosMediaType
  public let createdAt: String
  public let width: Int?
  public let height: Int?
  public let durationMs: Int?
  public let favorite: Bool
  public let albumNames: [String]
  public let exportPath: String
  public let downloadURL: String

  enum CodingKeys: String, CodingKey {
    case id
    case filename
    case mediaType
    case createdAt
    case width
    case height
    case durationMs
    case favorite
    case albumNames
    case exportPath
    case downloadURL = "downloadUrl"
  }
}

public struct ApplePhotosPickRequest: Codable, Equatable, Sendable {
  public let returnTo: String?
  public let draftId: String?
  public let profile: String?

  public init(returnTo: String? = nil, draftId: String? = nil, profile: String? = nil) {
    self.returnTo = returnTo
    self.draftId = draftId
    self.profile = profile
  }
}

public struct ApplePhotosPickResponse: Codable, Equatable, Sendable {
  public let assets: [ApplePhotosImportedAssetRecord]
  public let importedAt: String
}

public struct ApplePhotosImportRequest: Codable, Equatable, Sendable {
  public let ids: [String]
  public let destinationFolder: String?

  public init(ids: [String], destinationFolder: String? = nil) {
    self.ids = ids
    self.destinationFolder = destinationFolder
  }
}

public struct ApplePhotosImportResponse: Codable, Equatable, Sendable {
  public let assets: [ApplePhotosImportedAssetRecord]
  public let importedAt: String
}

public struct ApplePhotosCompanionLaunchRequest: Equatable, Sendable {
  public let url: URL
  public let action: ApplePhotosCompanionBridge.LaunchAction
  public let returnTo: String?
  public let draftId: String?
  public let profile: String?
  public let bridgeOrigin: String?
}

public struct ApplePhotosCompanionOpenRequest: Codable, Equatable, Sendable {
  public let action: ApplePhotosCompanionBridge.LaunchAction
  public let returnTo: String?
  public let draftId: String?
  public let profile: String?

  public init(
    action: ApplePhotosCompanionBridge.LaunchAction = .pick,
    returnTo: String? = nil,
    draftId: String? = nil,
    profile: String? = nil
  ) {
    self.action = action
    self.returnTo = returnTo
    self.draftId = draftId
    self.profile = profile
  }
}

public struct ApplePhotosCompanionOpenResponse: Codable, Equatable, Sendable {
  public let launchedAt: String
  public let launchURL: String
  public let companionApp: ApplePhotosCompanionAppInfo

  public init(
    launchedAt: String,
    launchURL: String,
    companionApp: ApplePhotosCompanionAppInfo
  ) {
    self.launchedAt = launchedAt
    self.launchURL = launchURL
    self.companionApp = companionApp
  }

  enum CodingKeys: String, CodingKey {
    case launchedAt
    case launchURL = "launchUrl"
    case companionApp
  }
}

public enum ApplePhotosCompanionBridge {
  public static let appName = "IG Poster Companion"
  public static let version = "v1"
  public static let versionPathPrefix = "/\(version)"
  public static let urlScheme = "igposter-companion"
  public static let defaultHost = "127.0.0.1"
  public static let defaultPort = 43123
  public static let tokenHeader = "X-IG-Poster-Bridge-Token"
  public static let paths = ApplePhotosBridgePaths()

  public enum LaunchAction: String, Codable, Sendable {
    case open
    case pick
  }

  public static func urls(
    host: String = defaultHost,
    port: Int = defaultPort
  ) -> ApplePhotosBridgeURLs {
    var originComponents = URLComponents()
    originComponents.scheme = "http"
    originComponents.host = host
    originComponents.port = port

    let origin: URL
    if let url = originComponents.url ?? URL(string: "http://\(host):\(port)") {
      origin = url
    } else {
      preconditionFailure(
        "ApplePhotosCompanionBridge.urls(host:port:) could not form a valid URL from host '\(host)' and port \(port)"
      )
    }

    return ApplePhotosBridgeURLs(
      origin: origin,
      health: origin.appending(path: paths.health),
      recent: origin.appending(path: paths.recent),
      search: origin.appending(path: paths.search),
      pick: origin.appending(path: paths.pick),
      importURL: origin.appending(path: paths.importPath),
      openCompanionURL: origin.appending(path: paths.openCompanion)
    )
  }

  public static func healthResponse(
    host: String = defaultHost,
    port: Int = defaultPort,
    companionApp: ApplePhotosCompanionAppInfo = ApplePhotosCompanionAppInfo(installed: false),
    selection: ApplePhotosBridgeSelectionSummary? = nil
  ) -> ApplePhotosBridgeHealthResponse {
    let bridgeURLs = urls(host: host, port: port)

    return ApplePhotosBridgeHealthResponse(
      appName: appName,
      version: version,
      bridge: ApplePhotosBridgeInfo(
        origin: bridgeURLs.origin.absoluteString,
        authTokenHeader: tokenHeader,
        healthURL: bridgeURLs.health.absoluteString,
        recentURL: bridgeURLs.recent.absoluteString,
        searchURL: bridgeURLs.search.absoluteString,
        pickURL: bridgeURLs.pick.absoluteString,
        importURL: bridgeURLs.importURL.absoluteString,
        openCompanionURL: bridgeURLs.openCompanionURL.absoluteString
      ),
      capabilities: [.pick, .recent, .search, .importAssets],
      companionApp: companionApp,
      selection: selection
    )
  }

  public static func exportDownloadPath(exportID: String) -> String {
    "\(versionPathPrefix)/photos/exports/\(exportID)"
  }

  public static func exportDownloadURL(
    exportID: String,
    host: String = defaultHost,
    port: Int = defaultPort
  ) -> URL {
    let bridgeURLs = urls(host: host, port: port)
    return bridgeURLs.origin.appending(path: exportDownloadPath(exportID: exportID))
  }

  public static func launchURL(
    action: LaunchAction,
    returnTo: String? = nil,
    draftId: String? = nil,
    profile: String? = nil,
    bridgeOrigin: String? = nil
  ) -> URL {
    var components = URLComponents()
    components.scheme = urlScheme
    components.host = "photos"
    components.path = "/\(action.rawValue)"

    var queryItems: [URLQueryItem] = []
    if let returnTo {
      queryItems.append(URLQueryItem(name: "return_to", value: returnTo))
    }
    if let draftId {
      queryItems.append(URLQueryItem(name: "draft_id", value: draftId))
    }
    if let profile {
      queryItems.append(URLQueryItem(name: "profile", value: profile))
    }
    if let bridgeOrigin {
      queryItems.append(
        URLQueryItem(
          name: "bridge_origin",
          value: bridgeOrigin.hasSuffix("/")
            ? String(bridgeOrigin.dropLast())
            : bridgeOrigin
        )
      )
    }
    components.queryItems = queryItems.isEmpty ? nil : queryItems

    return components.url
      ?? URL(string: "\(urlScheme)://photos/\(action.rawValue)")!
  }

  public static func parseLaunchURL(_ url: URL) -> ApplePhotosCompanionLaunchRequest? {
    guard
      let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      components.scheme == urlScheme,
      components.host == "photos"
    else {
      return nil
    }

    let normalizedPath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    guard let action = LaunchAction(rawValue: normalizedPath) else {
      return nil
    }

    func queryValue(_ name: String) -> String? {
      let value = components.queryItems?.first(where: { $0.name == name })?.value
      guard let value, !value.isEmpty else {
        return nil
      }
      return value
    }

    let bridgeOrigin = queryValue("bridge_origin").map { origin in
      origin.hasSuffix("/") ? String(origin.dropLast()) : origin
    }

    return ApplePhotosCompanionLaunchRequest(
      url: url,
      action: action,
      returnTo: queryValue("return_to"),
      draftId: queryValue("draft_id"),
      profile: queryValue("profile"),
      bridgeOrigin: bridgeOrigin
    )
  }
}
