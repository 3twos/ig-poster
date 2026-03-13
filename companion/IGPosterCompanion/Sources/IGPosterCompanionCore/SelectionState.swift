import Foundation

public struct ApplePhotosCompanionSelectionAsset: Codable, Equatable, Sendable {
  public let order: Int
  public let localIdentifier: String?
  public let supportedContentTypes: [String]

  public init(order: Int, localIdentifier: String? = nil, supportedContentTypes: [String]) {
    self.order = order
    self.localIdentifier = localIdentifier
    self.supportedContentTypes = supportedContentTypes
  }
}

public struct ApplePhotosCompanionExportedAsset: Codable, Equatable, Sendable {
  public let id: String
  public let sourceLocalIdentifier: String?
  public let filename: String
  public let mediaType: ApplePhotosMediaType
  public let createdAt: String
  public let width: Int?
  public let height: Int?
  public let durationMs: Int?
  public let favorite: Bool
  public let albumNames: [String]
  public let exportPath: String
  public let contentType: String

  public init(
    id: String,
    sourceLocalIdentifier: String? = nil,
    filename: String,
    mediaType: ApplePhotosMediaType,
    createdAt: String,
    width: Int? = nil,
    height: Int? = nil,
    durationMs: Int? = nil,
    favorite: Bool = false,
    albumNames: [String] = [],
    exportPath: String,
    contentType: String
  ) {
    self.id = id
    self.sourceLocalIdentifier = sourceLocalIdentifier
    self.filename = filename
    self.mediaType = mediaType
    self.createdAt = createdAt
    self.width = width
    self.height = height
    self.durationMs = durationMs
    self.favorite = favorite
    self.albumNames = albumNames
    self.exportPath = exportPath
    self.contentType = contentType
  }

  public func bridgeRecord(host: String, port: Int) -> ApplePhotosImportedAssetRecord {
    ApplePhotosImportedAssetRecord(
      id: id,
      filename: filename,
      mediaType: mediaType,
      createdAt: createdAt,
      width: width,
      height: height,
      durationMs: durationMs,
      favorite: favorite,
      albumNames: albumNames,
      exportPath: exportPath,
      downloadURL: ApplePhotosCompanionBridge.exportDownloadURL(
        exportID: id,
        host: host,
        port: port
      ).absoluteString
    )
  }
}

public struct ApplePhotosCompanionSelectionSnapshot: Codable, Equatable, Sendable {
  public let updatedAt: String
  public let action: ApplePhotosCompanionBridge.LaunchAction?
  public let draftId: String?
  public let profile: String?
  public let returnTo: String?
  public let bridgeOrigin: String?
  public let assets: [ApplePhotosCompanionSelectionAsset]
  public let exportedAssets: [ApplePhotosCompanionExportedAsset]

  public init(
    updatedAt: String,
    action: ApplePhotosCompanionBridge.LaunchAction? = nil,
    draftId: String? = nil,
    profile: String? = nil,
    returnTo: String? = nil,
    bridgeOrigin: String? = nil,
    assets: [ApplePhotosCompanionSelectionAsset],
    exportedAssets: [ApplePhotosCompanionExportedAsset] = []
  ) {
    self.updatedAt = updatedAt
    self.action = action
    self.draftId = draftId
    self.profile = profile
    self.returnTo = returnTo
    self.bridgeOrigin = bridgeOrigin
    self.assets = assets
    self.exportedAssets = exportedAssets
  }

  public var summary: ApplePhotosBridgeSelectionSummary {
    ApplePhotosBridgeSelectionSummary(
      updatedAt: updatedAt,
      action: action,
      draftId: draftId,
      profile: profile,
      assetCount: exportedAssets.count
    )
  }

  public func pickResponse(host: String, port: Int) -> ApplePhotosPickResponse {
    ApplePhotosPickResponse(
      assets: exportedAssets.map { $0.bridgeRecord(host: host, port: port) },
      importedAt: updatedAt
    )
  }

  public func importResponse(
    ids: [String],
    host: String,
    port: Int
  ) -> ApplePhotosImportResponse {
    let requestedIDs = Set(ids)
    return ApplePhotosImportResponse(
      assets: exportedAssets
        .filter { requestedIDs.contains($0.id) }
        .map { $0.bridgeRecord(host: host, port: port) },
      importedAt: updatedAt
    )
  }
}

public struct ApplePhotosCompanionStateStore: Sendable {
  public let stateURL: URL

  public init(stateURL: URL? = nil) {
    if let stateURL {
      self.stateURL = stateURL
      return
    }

    let baseDirectory =
      FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? FileManager.default.homeDirectoryForCurrentUser
        .appending(path: "Library/Application Support", directoryHint: .isDirectory)
    let companionDirectory = baseDirectory.appending(
      path: "IGPosterCompanion",
      directoryHint: .isDirectory
    )
    self.stateURL = companionDirectory.appending(path: "selection-state.json")
  }

  public func load() -> ApplePhotosCompanionSelectionSnapshot? {
    do {
      let data = try Data(contentsOf: stateURL)
      return try JSONDecoder().decode(ApplePhotosCompanionSelectionSnapshot.self, from: data)
    } catch let error as NSError where error.domain == NSCocoaErrorDomain &&
        error.code == NSFileReadNoSuchFileError {
      return nil
    } catch {
      fputs(
        "IGPosterCompanion state store load failed for \(stateURL.path): \(error)\n",
        stderr
      )
      try? FileManager.default.removeItem(at: stateURL)
      return nil
    }
  }

  public func save(_ snapshot: ApplePhotosCompanionSelectionSnapshot) throws {
    let directoryURL = stateURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(
      at: directoryURL,
      withIntermediateDirectories: true,
      attributes: nil
    )

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(snapshot)
    try data.write(to: stateURL, options: [.atomic])
  }

  public func clear() throws {
    if FileManager.default.fileExists(atPath: stateURL.path) {
      try FileManager.default.removeItem(at: stateURL)
    }
  }
}
