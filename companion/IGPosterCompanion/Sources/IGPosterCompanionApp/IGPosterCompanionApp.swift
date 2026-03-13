import SwiftUI
import PhotosUI
import ImageIO
import UniformTypeIdentifiers
import IGPosterCompanionCore

struct CompanionBadge: View {
  let title: String

  var body: some View {
    Text(title)
      .font(.system(size: 12, weight: .semibold, design: .rounded))
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(
        RoundedRectangle(cornerRadius: 999, style: .continuous)
          .fill(Color.orange.opacity(0.12))
      )
      .overlay(
        RoundedRectangle(cornerRadius: 999, style: .continuous)
          .stroke(Color.orange.opacity(0.35), lineWidth: 1)
      )
  }
}

struct CompanionSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title)
        .font(.system(size: 15, weight: .semibold, design: .rounded))
      content
    }
    .padding(18)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .fill(Color.white.opacity(0.04))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(Color.white.opacity(0.08), lineWidth: 1)
    )
  }
}

private struct PickedAssetSummary: Identifiable {
  let id: String
  let order: Int
  let localIdentifier: String?
  let supportedContentTypes: [String]
}

private struct ExportedSelectionResult {
  let assets: [ApplePhotosCompanionExportedAsset]
  let failedCount: Int
}

private func companionTimestamp(_ date: Date = Date()) -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime]
  return formatter.string(from: date)
}

private func sanitizeFilenameComponent(_ value: String) -> String {
  let sanitized = value.replacingOccurrences(
    of: #"[^A-Za-z0-9._-]+"#,
    with: "-",
    options: .regularExpression
  )
  return sanitized.trimmingCharacters(in: CharacterSet(charactersIn: "-.")).isEmpty
    ? "asset"
    : sanitized
}

private func applePhotosExportCacheDirectory() -> URL {
  FileManager.default.homeDirectoryForCurrentUser
    .appending(path: "Library/Caches/IGPosterCompanion/PhotosExports", directoryHint: .isDirectory)
}

private func resetApplePhotosExportCache() throws -> URL {
  let directoryURL = applePhotosExportCacheDirectory()
  if FileManager.default.fileExists(atPath: directoryURL.path) {
    try FileManager.default.removeItem(at: directoryURL)
  }
  try FileManager.default.createDirectory(
    at: directoryURL,
    withIntermediateDirectories: true,
    attributes: nil
  )
  return directoryURL
}

private func imageDimensions(at url: URL) -> (width: Int?, height: Int?) {
  guard
    let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
  else {
    return (nil, nil)
  }

  return (
    properties[kCGImagePropertyPixelWidth] as? Int,
    properties[kCGImagePropertyPixelHeight] as? Int
  )
}

private func exportPickedAssets(
  from items: [PhotosPickerItem]
) async throws -> ExportedSelectionResult {
  let exportDirectory = try resetApplePhotosExportCache()
  var exportedAssets: [ApplePhotosCompanionExportedAsset] = []
  var failedCount = 0

  for (index, item) in items.enumerated() {
    try Task.checkCancellation()

    let contentType =
      item.supportedContentTypes.first(where: { $0.conforms(to: .movie) || $0.conforms(to: .image) })
      ?? item.supportedContentTypes.first
      ?? .data
    let mediaType: ApplePhotosMediaType = contentType.conforms(to: .movie) ? .video : .image
    let fileExtension =
      contentType.preferredFilenameExtension
      ?? (mediaType == .video ? "mov" : "jpg")
    let sourceIdentifier = item.itemIdentifier
    let filename = "\(sanitizeFilenameComponent(sourceIdentifier ?? "asset-\(index + 1)")).\(fileExtension)"
    let exportID = UUID().uuidString.lowercased()
    let exportURL = exportDirectory.appending(path: "\(exportID)-\(filename)")

    do {
      guard let data = try await item.loadTransferable(type: Data.self), !data.isEmpty else {
        failedCount += 1
        continue
      }

      try data.write(to: exportURL, options: [.atomic])
      let dimensions: (width: Int?, height: Int?) =
        mediaType == .image ? imageDimensions(at: exportURL) : (width: nil, height: nil)

      exportedAssets.append(
        ApplePhotosCompanionExportedAsset(
          id: exportID,
          sourceLocalIdentifier: sourceIdentifier,
          filename: filename,
          mediaType: mediaType,
          createdAt: companionTimestamp(),
          width: dimensions.width,
          height: dimensions.height,
          durationMs: nil,
          favorite: false,
          albumNames: [],
          exportPath: exportURL.path,
          contentType: contentType.preferredMIMEType ?? "application/octet-stream"
        )
      )
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      failedCount += 1
    }
  }

  return ExportedSelectionResult(assets: exportedAssets, failedCount: failedCount)
}

struct CompanionHomeView: View {
  private let stateStore = ApplePhotosCompanionStateStore()
  private let health = ApplePhotosCompanionBridge.healthResponse()
  private let samplePickLaunchURL = ApplePhotosCompanionBridge.launchURL(
    action: .pick,
    returnTo: "https://ig-poster.example.com/drafts/post_123",
    draftId: "post_123",
    profile: "default",
    bridgeOrigin: ApplePhotosCompanionBridge.urls().origin.absoluteString
  )
  @State private var activeLaunchRequest: ApplePhotosCompanionLaunchRequest?
  @State private var invalidLaunchURL: String?
  @State private var selectedPickerItems: [PhotosPickerItem] = []
  @State private var persistedSelectionSnapshot: ApplePhotosCompanionSelectionSnapshot?
  @State private var persistedSelectionError: String?
  @State private var exportTask: Task<Void, Never>?
  @State private var isExportingSelection = false
  @State private var exportStatusMessage: String?
  @State private var exportErrorMessage: String?

  private func handleIncomingURL(_ url: URL) {
    guard let request = ApplePhotosCompanionBridge.parseLaunchURL(url) else {
      activeLaunchRequest = nil
      invalidLaunchURL = url.absoluteString
      return
    }

    activeLaunchRequest = request
    invalidLaunchURL = nil
  }

  private var pickedAssets: [PickedAssetSummary] {
    selectedPickerItems.enumerated().map { index, item in
      let localIdentifier = item.itemIdentifier
      return PickedAssetSummary(
        id: localIdentifier ?? "selection-\(index)",
        order: index + 1,
        localIdentifier: localIdentifier,
        supportedContentTypes: item.supportedContentTypes.map(\.identifier)
      )
    }
  }

  private func persistSelectionSnapshot(
    exportedAssets: [ApplePhotosCompanionExportedAsset],
    updatedAt: String = companionTimestamp()
  ) {
    if activeLaunchRequest == nil && pickedAssets.isEmpty && exportedAssets.isEmpty {
      try? stateStore.clear()
      persistedSelectionSnapshot = nil
      persistedSelectionError = nil
      return
    }

    let snapshot = ApplePhotosCompanionSelectionSnapshot(
      updatedAt: updatedAt,
      action: activeLaunchRequest?.action,
      draftId: activeLaunchRequest?.draftId,
      profile: activeLaunchRequest?.profile,
      returnTo: activeLaunchRequest?.returnTo,
      bridgeOrigin: activeLaunchRequest?.bridgeOrigin ?? health.bridge.origin,
      assets: pickedAssets.map { asset in
        ApplePhotosCompanionSelectionAsset(
          order: asset.order,
          localIdentifier: asset.localIdentifier,
          supportedContentTypes: asset.supportedContentTypes
        )
      },
      exportedAssets: exportedAssets
    )

    do {
      try stateStore.save(snapshot)
      persistedSelectionSnapshot = snapshot
      persistedSelectionError = nil
    } catch {
      persistedSelectionSnapshot = stateStore.load()
      persistedSelectionError = "Could not write the shared state file."
    }
  }

  private func refreshExportedSelection() {
    exportTask?.cancel()

    if selectedPickerItems.isEmpty {
      try? FileManager.default.removeItem(at: applePhotosExportCacheDirectory())
      isExportingSelection = false
      exportStatusMessage = nil
      exportErrorMessage = nil
      persistSelectionSnapshot(exportedAssets: [])
      return
    }

    isExportingSelection = true
    exportStatusMessage = "Exporting selected Photos into the local companion cache..."
    exportErrorMessage = nil

    let items = selectedPickerItems
    exportTask = Task {
      do {
        let result = try await exportPickedAssets(from: items)
        try Task.checkCancellation()

        await MainActor.run {
          isExportingSelection = false
          if result.assets.isEmpty {
            exportStatusMessage = nil
            exportErrorMessage = "The companion could not export the current selection yet."
          } else if result.failedCount > 0 {
            exportStatusMessage = "\(result.assets.count) selected assets are ready to import."
            exportErrorMessage = "\(result.failedCount) selection item(s) could not be exported."
          } else {
            exportStatusMessage = "\(result.assets.count) selected assets are ready to import."
            exportErrorMessage = nil
          }
          persistSelectionSnapshot(exportedAssets: result.assets)
        }
      } catch is CancellationError {
        return
      } catch {
        await MainActor.run {
          isExportingSelection = false
          exportStatusMessage = nil
          exportErrorMessage = "The companion could not export the current selection yet."
          persistSelectionSnapshot(exportedAssets: [])
        }
      }
    }
  }

  private var heroSection: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(ApplePhotosCompanionBridge.appName)
        .font(.system(size: 34, weight: .bold, design: .rounded))

      Text("Native Apple Photos picker, export cache, and local bridge scaffold for IG Poster.")
        .font(.system(size: 15, weight: .medium, design: .rounded))
        .foregroundStyle(.secondary)

      HStack(spacing: 10) {
        CompanionBadge(title: "Web-first handoff")
        CompanionBadge(title: "CLI + MCP bridge")
        CompanionBadge(title: "macOS-only")
      }
    }
  }

  private var bridgeContractSection: some View {
    CompanionSection(title: "Bridge Contract") {
      Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 10) {
        GridRow {
          Text("Origin").foregroundStyle(.secondary)
          Text(health.bridge.origin)
            .textSelection(.enabled)
        }
        GridRow {
          Text("Health").foregroundStyle(.secondary)
          Text(health.bridge.healthURL)
            .textSelection(.enabled)
        }
        GridRow {
          Text("Token header").foregroundStyle(.secondary)
          Text(health.bridge.authTokenHeader)
            .textSelection(.enabled)
        }
        GridRow {
          Text("Launch URL").foregroundStyle(.secondary)
          Text(samplePickLaunchURL.absoluteString)
            .textSelection(.enabled)
        }
      }
      .font(.system(size: 13, weight: .regular, design: .monospaced))
    }
  }

  private var sharedStateSection: some View {
    CompanionSection(title: "Shared State") {
      if let persistedSelectionSnapshot {
        Text("The companion now persists launch context plus a bridge-ready export manifest so the browser, CLI, and MCP flows can discover importable Photos assets from one shared local snapshot.")
          .foregroundStyle(.secondary)

        if let persistedSelectionError {
          Text(persistedSelectionError)
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(Color.red.opacity(0.9))
        }

        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 10) {
          GridRow {
            Text("Updated").foregroundStyle(.secondary)
            Text(persistedSelectionSnapshot.updatedAt)
              .textSelection(.enabled)
          }
          GridRow {
            Text("Action").foregroundStyle(.secondary)
            Text(persistedSelectionSnapshot.action?.rawValue ?? "None")
          }
          GridRow {
            Text("Draft").foregroundStyle(.secondary)
            Text(persistedSelectionSnapshot.draftId ?? "None")
          }
          GridRow {
            Text("Profile").foregroundStyle(.secondary)
            Text(persistedSelectionSnapshot.profile ?? "Default")
          }
          GridRow {
            Text("Selected").foregroundStyle(.secondary)
            Text("\(persistedSelectionSnapshot.assets.count)")
          }
          GridRow {
            Text("Ready").foregroundStyle(.secondary)
            Text("\(persistedSelectionSnapshot.exportedAssets.count)")
          }
        }
        .font(.system(size: 13, weight: .regular, design: .monospaced))
      } else {
        Text("No shared selection snapshot has been persisted yet. Selecting Photos or loading a handoff will populate the local state store and export manifest for the bridge.")
          .foregroundStyle(.secondary)

        if let persistedSelectionError {
          Text(persistedSelectionError)
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(Color.red.opacity(0.9))
        }
      }
    }
  }

  private var incomingHandoffSection: some View {
    CompanionSection(title: "Incoming Handoff") {
      if let activeLaunchRequest {
        Text("The companion has accepted a web handoff and is now holding the context that the future Photos picker/import flow will use.")
          .foregroundStyle(.secondary)

        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 10) {
          GridRow {
            Text("Action").foregroundStyle(.secondary)
            Text(activeLaunchRequest.action.rawValue)
          }
          GridRow {
            Text("Draft").foregroundStyle(.secondary)
            Text(activeLaunchRequest.draftId ?? "None")
          }
          GridRow {
            Text("Profile").foregroundStyle(.secondary)
            Text(activeLaunchRequest.profile ?? "Default")
          }
          GridRow {
            Text("Return to").foregroundStyle(.secondary)
            Text(activeLaunchRequest.returnTo ?? "None")
              .textSelection(.enabled)
          }
          GridRow {
            Text("Bridge").foregroundStyle(.secondary)
            Text(activeLaunchRequest.bridgeOrigin ?? health.bridge.origin)
              .textSelection(.enabled)
          }
          GridRow {
            Text("Raw URL").foregroundStyle(.secondary)
            Text(activeLaunchRequest.url.absoluteString)
              .textSelection(.enabled)
          }
        }
        .font(.system(size: 13, weight: .regular, design: .monospaced))
      } else {
        Text("Waiting for a browser handoff from the web editor. Until packaging registers the URL scheme, you can still exercise the state change locally with the sample handoff button below.")
          .foregroundStyle(.secondary)
      }

      if let invalidLaunchURL {
        Text("Ignored unsupported handoff: \(invalidLaunchURL)")
          .font(.system(size: 13, weight: .medium, design: .rounded))
          .foregroundStyle(Color.red.opacity(0.9))
          .textSelection(.enabled)
      }

      HStack(spacing: 12) {
        Button("Load sample handoff") {
          handleIncomingURL(samplePickLaunchURL)
        }
        .buttonStyle(.borderedProminent)

        if activeLaunchRequest != nil || invalidLaunchURL != nil {
          Button("Clear") {
            activeLaunchRequest = nil
            invalidLaunchURL = nil
          }
          .buttonStyle(.bordered)
        }
      }
    }
  }

  private var nativePickerDescription: String {
    if activeLaunchRequest?.action == .pick {
      return "The companion is ready to collect Photos for the current draft. This slice wires in Apple’s native picker, exports the chosen assets into a managed cache, and persists a bridge-readable import manifest."
    }

    return "This slice now wires native Photos selection directly into a managed export cache so the web app can import the chosen files without asking people to manually export from Photos first."
  }

  private var nativePickerSection: some View {
    CompanionSection(title: "Native Picker Preview") {
      Text(nativePickerDescription)
        .foregroundStyle(.secondary)

      HStack(spacing: 12) {
        PhotosPicker(
          selection: $selectedPickerItems,
          maxSelectionCount: 10,
          selectionBehavior: .ordered,
          matching: .any(of: [.images, .videos])
        ) {
          Label("Choose from Photos", systemImage: "photo.on.rectangle.angled")
        }
        .buttonStyle(.borderedProminent)

        if !pickedAssets.isEmpty {
          Button("Clear selection") {
            selectedPickerItems = []
          }
          .buttonStyle(.bordered)
        }
      }

      if pickedAssets.isEmpty {
        Text("No assets selected yet. Choose items in the native picker to populate the local export cache and shared bridge manifest.")
          .font(.system(size: 13, weight: .medium, design: .rounded))
          .foregroundStyle(.secondary)
      } else {
        VStack(alignment: .leading, spacing: 12) {
          Text("Selected assets: \(pickedAssets.count)")
            .font(.system(size: 14, weight: .semibold, design: .rounded))

          if isExportingSelection, let exportStatusMessage {
            Text(exportStatusMessage)
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(.secondary)
          } else if let exportStatusMessage {
            Text(exportStatusMessage)
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(Color.green.opacity(0.9))
          }

          if let exportErrorMessage {
            Text(exportErrorMessage)
              .font(.system(size: 13, weight: .medium, design: .rounded))
              .foregroundStyle(Color.red.opacity(0.9))
          }

          ForEach(pickedAssets) { asset in
            pickedAssetCard(asset)
          }
        }
      }
    }
  }

  private func pickedAssetCard(_ asset: PickedAssetSummary) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("\(asset.order). \(asset.localIdentifier ?? "Pending Photos identifier")")
        .font(.system(size: 13, weight: .semibold, design: .monospaced))
        .textSelection(.enabled)

      Text(
        asset.supportedContentTypes.isEmpty
          ? "No advertised content types"
          : asset.supportedContentTypes.joined(separator: ", ")
      )
      .font(.system(size: 12, weight: .regular, design: .monospaced))
      .foregroundStyle(.secondary)
      .textSelection(.enabled)
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(Color.white.opacity(0.03))
    )
  }

  private var plannedOperationsSection: some View {
    CompanionSection(title: "Planned Operations") {
      Text("pick, recent, search, and import are defined in the shared contract now. The native picker now exports bridge-ready files into a managed cache; the next slice will consume this manifest from the browser and add deeper PhotoKit-backed enumeration.")
        .foregroundStyle(.secondary)

      HStack(spacing: 10) {
        ForEach(health.capabilities, id: \.rawValue) { capability in
          CompanionBadge(title: capability.rawValue)
        }
      }
    }
  }

  private var statusSection: some View {
    CompanionSection(title: "Status") {
      Text("This scaffold now stops after native selection and export. The companion still avoids broad PhotoKit enumeration, but it can hand bridge-readable files back to the rest of IG Poster.")
        .foregroundStyle(.secondary)
    }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        heroSection
        bridgeContractSection
        sharedStateSection
        incomingHandoffSection
        nativePickerSection
        plannedOperationsSection
        statusSection
      }
      .padding(24)
    }
    .background(
      LinearGradient(
        colors: [
          Color(red: 0.08, green: 0.09, blue: 0.13),
          Color(red: 0.11, green: 0.07, blue: 0.05),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
    )
    .onOpenURL(perform: handleIncomingURL)
    .task {
      persistedSelectionSnapshot = stateStore.load()
    }
    .onChange(of: activeLaunchRequest?.url.absoluteString) { _, _ in
      persistSelectionSnapshot(
        exportedAssets: persistedSelectionSnapshot?.exportedAssets ?? []
      )
    }
    .onChange(of: selectedPickerItems) { _, _ in
      refreshExportedSelection()
    }
  }
}

@main
struct IGPosterCompanionApp: App {
  var body: some Scene {
    WindowGroup {
      CompanionHomeView()
        .frame(minWidth: 760, minHeight: 520)
        .preferredColorScheme(.dark)
    }
    .windowResizability(.contentSize)
  }
}
