import Foundation
import Photos

public enum ApplePhotosLibraryError: Error, Equatable, Sendable {
  case invalidFilter(String)
  case invalidSince(String)
  case invalidLimit(Int)
  case photosPermissionRequired
}

public func applePhotosTimestamp(_ date: Date = Date()) -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  return formatter.string(from: date)
}

public struct ApplePhotosLibrary: Sendable {
  public init() {}

  public func recent(query: ApplePhotosAssetQuery) async throws -> ApplePhotosAssetListResponse {
    try await listAssets(query: query)
  }

  public func search(query: ApplePhotosAssetQuery) async throws -> ApplePhotosAssetListResponse {
    try await listAssets(query: query)
  }

  private func listAssets(
    query: ApplePhotosAssetQuery
  ) async throws -> ApplePhotosAssetListResponse {
    guard query.limit > 0 else {
      throw ApplePhotosLibraryError.invalidLimit(query.limit)
    }

    guard await hasPhotoLibraryAccess() else {
      throw ApplePhotosLibraryError.photosPermissionRequired
    }

    let sinceDate = try parseSinceDate(query.since)
    let assets = fetchAssets(query: query, sinceDate: sinceDate)

    return ApplePhotosAssetListResponse(
      assets: assets,
      fetchedAt: applePhotosTimestamp(),
      query: query
    )
  }

  private func hasPhotoLibraryAccess() async -> Bool {
    let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    switch status {
    case .authorized, .limited:
      return true
    case .notDetermined:
      return await withCheckedContinuation { continuation in
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { nextStatus in
          continuation.resume(returning: nextStatus == .authorized || nextStatus == .limited)
        }
      }
    default:
      return false
    }
  }

  private func fetchAssets(
    query: ApplePhotosAssetQuery,
    sinceDate: Date?
  ) -> [ApplePhotosAssetRecord] {
    if let album = normalizedOptionalString(query.album) {
      return fetchAssets(
        in: matchingCollections(named: album),
        query: query,
        sinceDate: sinceDate
      )
    }

    let fetchResult = PHAsset.fetchAssets(with: buildFetchOptions(query: query, sinceDate: sinceDate))
    return records(from: fetchResult, query: query)
  }

  private func fetchAssets(
    in collections: [PHAssetCollection],
    query: ApplePhotosAssetQuery,
    sinceDate: Date?
  ) -> [ApplePhotosAssetRecord] {
    guard !collections.isEmpty else {
      return []
    }

    var assetsByIdentifier: [String: PHAsset] = [:]
    let options = buildFetchOptions(query: query, sinceDate: sinceDate)

    for collection in collections {
      let fetchResult = PHAsset.fetchAssets(in: collection, options: options)
      fetchResult.enumerateObjects { asset, _, stop in
        guard self.matches(asset: asset, mediaType: query.mediaType) else {
          return
        }

        if assetsByIdentifier[asset.localIdentifier] == nil {
          assetsByIdentifier[asset.localIdentifier] = asset
        }

        if assetsByIdentifier.count >= query.limit {
          stop.pointee = true
        }
      }
    }

    return assetsByIdentifier.values
      .sorted(by: compareAssetsDescending)
      .prefix(query.limit)
      .map(makeAssetRecord)
  }

  private func records(
    from fetchResult: PHFetchResult<PHAsset>,
    query: ApplePhotosAssetQuery
  ) -> [ApplePhotosAssetRecord] {
    var records: [ApplePhotosAssetRecord] = []

    fetchResult.enumerateObjects { asset, _, stop in
      guard self.matches(asset: asset, mediaType: query.mediaType) else {
        return
      }

      records.append(self.makeAssetRecord(asset))
      if records.count >= query.limit {
        stop.pointee = true
      }
    }

    return records
  }

  private func buildFetchOptions(
    query: ApplePhotosAssetQuery,
    sinceDate: Date?
  ) -> PHFetchOptions {
    let options = PHFetchOptions()
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]

    var predicates: [NSPredicate] = []
    if let sinceDate {
      predicates.append(NSPredicate(format: "creationDate >= %@", sinceDate as NSDate))
    }
    if query.favorite == true {
      predicates.append(NSPredicate(format: "favorite == YES"))
    }

    switch query.mediaType {
    case .image:
      predicates.append(NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue))
    case .video:
      predicates.append(NSPredicate(format: "mediaType == %d", PHAssetMediaType.video.rawValue))
    case .livePhoto:
      predicates.append(NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue))
    case nil:
      break
    }

    if !predicates.isEmpty {
      options.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
    }

    return options
  }

  private func matchingCollections(named name: String) -> [PHAssetCollection] {
    var collections: [PHAssetCollection] = []

    for collectionType in [PHAssetCollectionType.album, .smartAlbum] {
      let fetchResult = PHAssetCollection.fetchAssetCollections(
        with: collectionType,
        subtype: .any,
        options: nil
      )

      fetchResult.enumerateObjects { collection, _, _ in
        guard let title = collection.localizedTitle else { return }
        guard title.localizedCaseInsensitiveContains(name) else { return }
        collections.append(collection)
      }
    }

    return collections.sorted { lhs, rhs in
      let lhsTitle = lhs.localizedTitle ?? ""
      let rhsTitle = rhs.localizedTitle ?? ""
      let lhsExact = lhsTitle.compare(name, options: .caseInsensitive) == .orderedSame
      let rhsExact = rhsTitle.compare(name, options: .caseInsensitive) == .orderedSame
      if lhsExact != rhsExact {
        return lhsExact
      }
      return lhsTitle.localizedCaseInsensitiveCompare(rhsTitle) == .orderedAscending
    }
  }

  private func matches(
    asset: PHAsset,
    mediaType: ApplePhotosMediaType?
  ) -> Bool {
    guard let mediaType else {
      return true
    }

    switch mediaType {
    case .image:
      return asset.mediaType == .image && !asset.mediaSubtypes.contains(.photoLive)
    case .video:
      return asset.mediaType == .video
    case .livePhoto:
      return asset.mediaType == .image && asset.mediaSubtypes.contains(.photoLive)
    }
  }

  private func makeAssetRecord(_ asset: PHAsset) -> ApplePhotosAssetRecord {
    let mediaType: ApplePhotosMediaType =
      asset.mediaType == .video
      ? .video
      : (asset.mediaSubtypes.contains(.photoLive) ? .livePhoto : .image)
    let filename = PHAssetResource.assetResources(for: asset).first?.originalFilename
      ?? asset.localIdentifier
    let durationMs =
      asset.mediaType == .video && asset.duration > 0
      ? Int((asset.duration * 1000).rounded())
      : nil

    return ApplePhotosAssetRecord(
      id: asset.localIdentifier,
      filename: filename,
      mediaType: mediaType,
      createdAt: applePhotosTimestamp(asset.creationDate ?? Date.distantPast),
      width: asset.pixelWidth > 0 ? asset.pixelWidth : nil,
      height: asset.pixelHeight > 0 ? asset.pixelHeight : nil,
      durationMs: durationMs,
      favorite: asset.isFavorite,
      albumNames: albumNames(for: asset)
    )
  }

  private func albumNames(for asset: PHAsset) -> [String] {
    var names = Set<String>()

    for collectionType in [PHAssetCollectionType.album, .smartAlbum] {
      let collections = PHAssetCollection.fetchAssetCollectionsContaining(
        asset,
        with: collectionType,
        options: nil
      )

      collections.enumerateObjects { collection, _, _ in
        guard let title = collection.localizedTitle, !title.isEmpty else { return }
        names.insert(title)
      }
    }

    return names.sorted()
  }

  private func parseSinceDate(_ rawValue: String?) throws -> Date? {
    guard let value = normalizedOptionalString(rawValue) else {
      return nil
    }

    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) {
      return date
    }

    formatter.formatOptions = [.withInternetDateTime]
    if let date = formatter.date(from: value) {
      return date
    }

    let pattern = /^(\d+)([mhdw])$/
    guard let match = value.wholeMatch(of: pattern) else {
      throw ApplePhotosLibraryError.invalidSince(value)
    }

    guard let amount = Double(match.output.1) else {
      throw ApplePhotosLibraryError.invalidSince(value)
    }

    let secondsPerUnit: Double
    switch String(match.output.2) {
    case "m":
      secondsPerUnit = 60
    case "h":
      secondsPerUnit = 60 * 60
    case "d":
      secondsPerUnit = 60 * 60 * 24
    case "w":
      secondsPerUnit = 60 * 60 * 24 * 7
    default:
      throw ApplePhotosLibraryError.invalidSince(value)
    }

    return Date(timeIntervalSinceNow: -(amount * secondsPerUnit))
  }
}

private func normalizedOptionalString(_ value: String?) -> String? {
  guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
    return nil
  }

  return trimmed
}

private func compareAssetsDescending(_ lhs: PHAsset, _ rhs: PHAsset) -> Bool {
  switch (lhs.creationDate, rhs.creationDate) {
  case let (left?, right?):
    if left != right {
      return left > right
    }
  case (.some, .none):
    return true
  case (.none, .some):
    return false
  case (.none, .none):
    break
  }

  return lhs.localIdentifier < rhs.localIdentifier
}
