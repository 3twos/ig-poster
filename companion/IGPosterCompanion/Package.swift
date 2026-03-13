// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "IGPosterCompanion",
  platforms: [
    .macOS(.v14),
  ],
  products: [
    .library(
      name: "IGPosterCompanionCore",
      targets: ["IGPosterCompanionCore"],
    ),
    .executable(
      name: "ig-poster-companion",
      targets: ["IGPosterCompanionApp"],
    ),
    .executable(
      name: "ig-poster-companion-contract-smoke",
      targets: ["IGPosterCompanionContractSmoke"],
    ),
    .executable(
      name: "ig-poster-companion-bridge",
      targets: ["IGPosterCompanionBridge"],
    ),
  ],
  targets: [
    .target(
      name: "IGPosterCompanionCore",
    ),
    .executableTarget(
      name: "IGPosterCompanionApp",
      dependencies: ["IGPosterCompanionCore"],
    ),
    .executableTarget(
      name: "IGPosterCompanionContractSmoke",
      dependencies: ["IGPosterCompanionCore"],
    ),
    .executableTarget(
      name: "IGPosterCompanionBridge",
      dependencies: ["IGPosterCompanionCore"],
    ),
  ],
)
