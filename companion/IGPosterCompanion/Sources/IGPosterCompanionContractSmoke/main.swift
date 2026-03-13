import Foundation
import IGPosterCompanionCore

private func require(_ condition: @autoclosure () -> Bool, _ message: String) {
  if !condition() {
    fatalError(message)
  }
}

@main
struct IGPosterCompanionContractSmoke {
  static func main() {
    let urls = ApplePhotosCompanionBridge.urls()

    require(
      urls.origin.absoluteString == "http://127.0.0.1:43123",
      "unexpected default bridge origin"
    )
    require(
      urls.pick.absoluteString == "http://127.0.0.1:43123/\(ApplePhotosCompanionBridge.version)/photos/pick",
      "unexpected pick endpoint"
    )
    require(
      ApplePhotosCompanionBridge.exportDownloadURL(exportID: "export_123").absoluteString
        == "http://127.0.0.1:43123/\(ApplePhotosCompanionBridge.version)/photos/exports/export_123",
      "unexpected export download endpoint"
    )

    let launchURL = ApplePhotosCompanionBridge.launchURL(
      action: .pick,
      returnTo: "https://ig-poster.example.com/drafts/post_123",
      draftId: "post_123",
      profile: "default",
      bridgeOrigin: "http://localhost:43123/"
    )
    let components = URLComponents(url: launchURL, resolvingAgainstBaseURL: false)

    require(components?.scheme == ApplePhotosCompanionBridge.urlScheme, "unexpected URL scheme")
    require(components?.host == "photos", "unexpected URL host")
    require(components?.path == "/pick", "unexpected URL path")
    require(
      components?.queryItems?.first(where: { $0.name == "bridge_origin" })?.value
        == "http://localhost:43123",
      "unexpected bridge origin query"
    )
    let launchRequest = ApplePhotosCompanionBridge.parseLaunchURL(launchURL)
    require(launchRequest?.action == .pick, "unexpected launch action")
    require(
      launchRequest?.returnTo == "https://ig-poster.example.com/drafts/post_123",
      "unexpected returnTo query"
    )
    require(launchRequest?.draftId == "post_123", "unexpected draftId query")
    require(launchRequest?.profile == "default", "unexpected profile query")
    require(
      launchRequest?.bridgeOrigin == "http://localhost:43123",
      "unexpected normalized bridge origin"
    )
    require(
      ApplePhotosCompanionBridge.parseLaunchURL(
        URL(string: "https://ig-poster.example.com/drafts/post_123")!
      ) == nil,
      "unexpected parse result for non-companion URL"
    )

    let response = ApplePhotosCompanionBridge.healthResponse()
    require(response.appName == ApplePhotosCompanionBridge.appName, "unexpected app name")
    require(
      response.capabilities == [.pick, .recent, .search, .importAssets],
      "unexpected capabilities"
    )
    require(response.selection == nil, "unexpected default selection summary")

    let tempStateURL = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent(UUID().uuidString)
      .appendingPathComponent("selection-state.json")
    let stateStore = ApplePhotosCompanionStateStore(stateURL: tempStateURL)
    let snapshot = ApplePhotosCompanionSelectionSnapshot(
      updatedAt: "2026-03-13T15:30:00Z",
      action: .pick,
      draftId: "post_123",
      profile: "default",
      returnTo: "https://ig-poster.example.com/drafts/post_123",
      bridgeOrigin: "http://127.0.0.1:43123",
      assets: [
        ApplePhotosCompanionSelectionAsset(
          order: 1,
          localIdentifier: "A1",
          supportedContentTypes: ["public.jpeg"]
        ),
      ],
      exportedAssets: [
        ApplePhotosCompanionExportedAsset(
          id: "export_123",
          sourceLocalIdentifier: "A1",
          filename: "hero.jpg",
          mediaType: .image,
          createdAt: "2026-03-13T15:30:00Z",
          width: 1080,
          height: 1350,
          durationMs: nil,
          favorite: false,
          albumNames: [],
          exportPath: "/tmp/hero.jpg",
          contentType: "image/jpeg"
        ),
      ]
    )
    try? stateStore.save(snapshot)
    require(stateStore.load() == snapshot, "unexpected state store round trip")

    let responseWithSelection = ApplePhotosCompanionBridge.healthResponse(
      selection: stateStore.load()?.summary
    )
    require(responseWithSelection.selection?.assetCount == 1, "unexpected selection count")
    require(responseWithSelection.selection?.draftId == "post_123", "unexpected selection draft")
    let pickResponse = snapshot.pickResponse(
      host: ApplePhotosCompanionBridge.defaultHost,
      port: ApplePhotosCompanionBridge.defaultPort
    )
    require(pickResponse.assets.count == 1, "unexpected pick response count")
    require(
      pickResponse.assets.first?.downloadURL
        == "http://127.0.0.1:43123/\(ApplePhotosCompanionBridge.version)/photos/exports/export_123",
      "unexpected exported download URL"
    )
    try? stateStore.clear()

    print("IGPosterCompanion contract smoke passed")
  }
}
