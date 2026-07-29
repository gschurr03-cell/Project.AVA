import Foundation

public struct OfflineResultPackage: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let schemaVersion: Int
    public let accountID: UUID
    public let analysis: AnalysisRecord
    public let manifest: ActiveManifestSummary
    public let report: ReportSummary
    public let betaPayload: MobileBetaResultPackage?
    public let synchronizedAt: Date
    public let integrityFingerprint: String
    public let complete: Bool
    public init(id: UUID = UUID(), schemaVersion: Int = 1, accountID: UUID,
                analysis: AnalysisRecord, manifest: ActiveManifestSummary,
                report: ReportSummary, synchronizedAt: Date,
                integrityFingerprint: String, complete: Bool,
                betaPayload: MobileBetaResultPackage? = nil) {
        self.id = id; self.schemaVersion = schemaVersion; self.accountID = accountID
        self.analysis = analysis; self.manifest = manifest; self.report = report
        self.synchronizedAt = synchronizedAt
        self.integrityFingerprint = integrityFingerprint; self.complete = complete
        self.betaPayload = betaPayload
    }
}

public enum OfflinePackageError: Error, Equatable, Sendable {
    case incomplete, accountMismatch, analysisMismatch, fingerprintMismatch, unsupportedSchema
}

public actor OfflineResultPackageStore {
    private let root: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    public init(root: URL) {
        self.root = root
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }
    public func commit(_ package: OfflineResultPackage) throws {
        guard package.schemaVersion == 1 else { throw OfflinePackageError.unsupportedSchema }
        guard package.complete else { throw OfflinePackageError.incomplete }
        guard package.analysis.athleteID == package.manifest.athleteID,
              package.analysis.id == package.manifest.analysisID,
              package.report.analysisID == package.analysis.id,
              package.report.athleteID == package.analysis.athleteID else {
            throw OfflinePackageError.analysisMismatch
        }
        guard package.integrityFingerprint == package.manifest.integrityFingerprint,
              !package.integrityFingerprint.isEmpty else {
            throw OfflinePackageError.fingerprintMismatch
        }
        if let betaPayload = package.betaPayload {
            try MobileBetaPackageValidator.validate(betaPayload, activeManifest: package.manifest)
            guard betaPayload.accountID == package.accountID else {
                throw OfflinePackageError.accountMismatch
            }
        }
        let directory = accountDirectory(package.accountID)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = file(accountID: package.accountID, analysisID: package.analysis.id)
        let pending = destination.appendingPathExtension("pending")
        try encoder.encode(package).write(to: pending, options: [.atomic, .completeFileProtectionUnlessOpen])
        _ = try decoder.decode(OfflineResultPackage.self, from: Data(contentsOf: pending))
        if FileManager.default.fileExists(atPath: destination.path) {
            _ = try FileManager.default.replaceItemAt(destination, withItemAt: pending)
        } else {
            try FileManager.default.moveItem(at: pending, to: destination)
        }
    }
    public func load(accountID: UUID, analysisID: UUID) throws -> OfflineResultPackage? {
        let url = file(accountID: accountID, analysisID: analysisID)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let package = try decoder.decode(OfflineResultPackage.self, from: Data(contentsOf: url))
        guard package.accountID == accountID else { throw OfflinePackageError.accountMismatch }
        return package
    }
    private func accountDirectory(_ id: UUID) -> URL {
        root.appending(path: id.uuidString, directoryHint: .isDirectory)
    }
    private func file(accountID: UUID, analysisID: UUID) -> URL {
        accountDirectory(accountID).appending(path: "\(analysisID.uuidString).result-package.json")
    }
}

public enum SyncConflict: Equatable, Sendable {
    case serverProfileNewer, remoteAnalysisDeleted, activeManifestChanged
    case accountChanged, captureProtocolUnsupported, notificationTokenChanged
    case rolledBackManifest
}
public enum SyncConflictResolution: Equatable, Sendable {
    case acceptServer, preservePendingAction, quarantineLocalUpload
    case retainPreviousPackage, removeLocal
}
public enum SyncConflictResolver {
    public static func resolve(_ conflict: SyncConflict) -> SyncConflictResolution {
        switch conflict {
        case .serverProfileNewer, .remoteAnalysisDeleted: return .acceptServer
        case .activeManifestChanged, .rolledBackManifest: return .retainPreviousPackage
        case .accountChanged: return .quarantineLocalUpload
        case .captureProtocolUnsupported: return .preservePendingAction
        case .notificationTokenChanged: return .acceptServer
        }
    }
}
