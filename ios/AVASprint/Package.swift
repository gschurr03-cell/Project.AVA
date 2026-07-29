// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "AVASprint",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "AVASprintCore", targets: ["AVASprintCore"])],
    targets: [
        .target(name: "AVASprintCore"),
        .testTarget(name: "AVASprintCoreTests", dependencies: ["AVASprintCore"],
                    resources: [.copy("Fixtures")])
    ]
)

