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

    print("IGPosterCompanion contract smoke passed")
  }
}
