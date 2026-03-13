import Foundation

public enum ApplePhotosCompanionBridgeRuntime {
  public static func listeningPorts(primaryPort: Int, once: Bool) -> [Int] {
    if once || primaryPort == ApplePhotosCompanionBridge.defaultPort {
      return [primaryPort]
    }

    return [ApplePhotosCompanionBridge.defaultPort, primaryPort]
  }
}
