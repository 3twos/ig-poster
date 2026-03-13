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

public struct ApplePhotosCompanionSelectionSnapshot: Codable, Equatable, Sendable {
  public let updatedAt: String
  public let action: ApplePhotosCompanionBridge.LaunchAction?
  public let draftId: String?
  public let profile: String?
  public let returnTo: String?
  public let bridgeOrigin: String?
  public let assets: [ApplePhotosCompanionSelectionAsset]

  public init(
    updatedAt: String,
    action: ApplePhotosCompanionBridge.LaunchAction? = nil,
    draftId: String? = nil,
    profile: String? = nil,
    returnTo: String? = nil,
    bridgeOrigin: String? = nil,
    assets: [ApplePhotosCompanionSelectionAsset]
  ) {
    self.updatedAt = updatedAt
    self.action = action
    self.draftId = draftId
    self.profile = profile
    self.returnTo = returnTo
    self.bridgeOrigin = bridgeOrigin
    self.assets = assets
  }

  public var summary: ApplePhotosBridgeSelectionSummary {
    ApplePhotosBridgeSelectionSummary(
      updatedAt: updatedAt,
      action: action,
      draftId: draftId,
      profile: profile,
      assetCount: assets.count
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

    let baseDirectory = FileManager.default.homeDirectoryForCurrentUser
      .appending(path: "Library/Application Support/IGPosterCompanion", directoryHint: .isDirectory)
    self.stateURL = baseDirectory.appending(path: "selection-state.json")
  }

  public func load() -> ApplePhotosCompanionSelectionSnapshot? {
    do {
      let data = try Data(contentsOf: stateURL)
      return try JSONDecoder().decode(ApplePhotosCompanionSelectionSnapshot.self, from: data)
    } catch let error as NSError where error.domain == NSCocoaErrorDomain &&
        error.code == NSFileReadNoSuchFileError {
      return nil
    } catch {
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
