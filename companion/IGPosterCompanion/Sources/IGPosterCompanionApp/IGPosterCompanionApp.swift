import SwiftUI
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

struct CompanionHomeView: View {
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

  private func handleIncomingURL(_ url: URL) {
    guard let request = ApplePhotosCompanionBridge.parseLaunchURL(url) else {
      invalidLaunchURL = url.absoluteString
      return
    }

    activeLaunchRequest = request
    invalidLaunchURL = nil
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
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

        CompanionSection(title: "Planned Operations") {
          Text("pick, recent, search, and import are defined in the shared contract now. The next slice will bind them to PhotosPicker, PhotoKit, and a localhost listener.")
            .foregroundStyle(.secondary)

          HStack(spacing: 10) {
            ForEach(health.capabilities, id: \.rawValue) { capability in
              CompanionBadge(title: capability.rawValue)
            }
          }
        }

        CompanionSection(title: "Status") {
          Text("This scaffold intentionally stops before reading the Photos library. The repo now has one native codepath to iterate on instead of only docs and web fallback copy.")
            .foregroundStyle(.secondary)
        }
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
