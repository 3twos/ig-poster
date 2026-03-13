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
  ],
)
