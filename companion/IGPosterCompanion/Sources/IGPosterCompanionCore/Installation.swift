import Foundation

public enum ApplePhotosCompanionInstallation {
  public static let bundleName = "\(ApplePhotosCompanionBridge.appName).app"
  public static let executableName = "ig-poster-companion"
  public static let bundlePathEnvVar = "IG_POSTER_COMPANION_APP_BUNDLE"
  public static let applicationsDirectoryEnvVar = "IG_POSTER_COMPANION_APPS_DIR"

  public static func appBundleURL(
    processInfo: ProcessInfo = .processInfo,
    fileManager: FileManager = .default
  ) -> URL? {
    for candidate in candidateBundleURLs(processInfo: processInfo, fileManager: fileManager) {
      let bundleURL = candidate.standardizedFileURL
      var isDirectory = ObjCBool(false)
      if fileManager.fileExists(atPath: bundleURL.path, isDirectory: &isDirectory),
         isDirectory.boolValue,
         fileManager.isExecutableFile(
           atPath: appExecutableURL(bundleURL: bundleURL).path
         ) {
        return bundleURL
      }
    }

    return nil
  }

  public static func appInfo(
    processInfo: ProcessInfo = .processInfo,
    fileManager: FileManager = .default
  ) -> ApplePhotosCompanionAppInfo {
    guard let bundleURL = appBundleURL(processInfo: processInfo, fileManager: fileManager) else {
      return ApplePhotosCompanionAppInfo(installed: false)
    }

    return ApplePhotosCompanionAppInfo(
      installed: true,
      bundlePath: bundleURL.path
    )
  }

  private static func candidateBundleURLs(
    processInfo: ProcessInfo,
    fileManager: FileManager
  ) -> [URL] {
    let environment = processInfo.environment
    var candidates: [URL] = []

    if let explicitBundlePath = normalizedEnvironmentPath(environment[bundlePathEnvVar]) {
      candidates.append(URL(fileURLWithPath: explicitBundlePath, isDirectory: true))
    }

    if let applicationsDirectory = normalizedEnvironmentPath(environment[applicationsDirectoryEnvVar]) {
      candidates.append(
        URL(fileURLWithPath: applicationsDirectory, isDirectory: true)
          .appending(path: bundleName, directoryHint: .isDirectory)
      )
    }

    let homeDirectory = homeDirectoryURL(processInfo: processInfo, fileManager: fileManager)
    candidates.append(
      homeDirectory
        .appending(path: "Applications", directoryHint: .isDirectory)
        .appending(path: bundleName, directoryHint: .isDirectory)
    )
    candidates.append(
      URL(fileURLWithPath: "/Applications", isDirectory: true)
        .appending(path: bundleName, directoryHint: .isDirectory)
    )

    return candidates
  }

  private static func appExecutableURL(bundleURL: URL) -> URL {
    bundleURL
      .appending(path: "Contents", directoryHint: .isDirectory)
      .appending(path: "MacOS", directoryHint: .isDirectory)
      .appending(path: executableName, directoryHint: .notDirectory)
  }

  private static func homeDirectoryURL(
    processInfo: ProcessInfo,
    fileManager: FileManager
  ) -> URL {
    if let homePath = normalizedEnvironmentPath(processInfo.environment["HOME"]) {
      return URL(fileURLWithPath: homePath, isDirectory: true)
    }

    return fileManager.homeDirectoryForCurrentUser
  }

  private static func normalizedEnvironmentPath(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
      return nil
    }

    return trimmed
  }
}
