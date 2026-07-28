import Foundation
import CryptoKit

public struct MediaFingerprint: Codable, Equatable, Hashable, Sendable {
    public let algorithm: String
    public let digest: String
    public let byteCount: Int64
}

public enum MediaFingerprinter {
    public static func sha256(fileURL: URL, chunkSize: Int = 1_048_576) throws -> MediaFingerprint {
        guard fileURL.isFileURL, chunkSize > 0 else { throw NetworkFailure.validation }
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }
        var hasher = SHA256()
        var bytes: Int64 = 0
        while true {
            let data = try handle.read(upToCount: chunkSize) ?? Data()
            if data.isEmpty { break }
            bytes += Int64(data.count)
            hasher.update(data: data)
        }
        return MediaFingerprint(algorithm: "sha256",
                                digest: hasher.finalize().map { String(format: "%02x", $0) }.joined(),
                                byteCount: bytes)
    }
}

public struct StoredMedia: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let accountID: UUID
    public let relativeFileName: String
    public let source: MediaSource
    public let fingerprint: MediaFingerprint
    public let verified: VerifiedMediaProperties
    public let quality: RecordingQuality
    public let captureProtocolID: String
    public let captureProtocolVersion: Int
    public var lifecycle: LocalMediaState
    public var uploadID: UUID?
    public var analysisID: UUID?
    public var retainedByUser: Bool
    public let createdAt: Date
}

public enum LocalMediaStoreError: Error, Equatable, Sendable {
    case unsafeURL, accountMismatch, missingFile, duplicate(MediaFingerprint)
    case insufficientStorage, recordMissing
}

public actor LocalMediaStore {
    private let root: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(root: URL) {
        self.root = root
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func importVerifiedFile(from source: URL, accountID: UUID, mediaSource: MediaSource,
                                   verified: VerifiedMediaProperties, quality: RecordingQuality,
                                   captureProtocol: CaptureProtocol) throws -> StoredMedia {
        guard source.isFileURL else { throw LocalMediaStoreError.unsafeURL }
        let fingerprint = try MediaFingerprinter.sha256(fileURL: source)
        var records = try loadRecords(accountID: accountID)
        if records.contains(where: { $0.fingerprint == fingerprint }) {
            throw LocalMediaStoreError.duplicate(fingerprint)
        }
        let accountDirectory = directory(accountID)
        try FileManager.default.createDirectory(at: accountDirectory, withIntermediateDirectories: true)
        let identifier = UUID()
        let destinationName = "\(identifier.uuidString).mov"
        let destination = accountDirectory.appending(path: destinationName)
        try FileManager.default.copyItem(at: source, to: destination)
        #if os(iOS)
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: destination.path)
        #endif
        let stored = StoredMedia(
            id: identifier, accountID: accountID, relativeFileName: destinationName,
            source: mediaSource, fingerprint: fingerprint, verified: verified, quality: quality,
            captureProtocolID: captureProtocol.id, captureProtocolVersion: captureProtocol.version,
            lifecycle: .validatedLocalAsset, uploadID: nil, analysisID: nil,
            retainedByUser: false, createdAt: Date())
        records.append(stored)
        try save(records, accountID: accountID)
        return stored
    }

    public func records(accountID: UUID) throws -> [StoredMedia] { try loadRecords(accountID: accountID) }

    public func resolve(_ record: StoredMedia, accountID: UUID) throws -> URL {
        guard record.accountID == accountID else { throw LocalMediaStoreError.accountMismatch }
        let url = directory(accountID).appending(path: record.relativeFileName)
        guard url.deletingLastPathComponent().standardizedFileURL == directory(accountID).standardizedFileURL,
              FileManager.default.fileExists(atPath: url.path) else {
            throw LocalMediaStoreError.missingFile
        }
        return url
    }

    public func reconcile(accountID: UUID) throws -> [String] {
        let records = try loadRecords(accountID: accountID)
        let known = Set(records.map(\.relativeFileName)).union(["media-index.json"])
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory(accountID), includingPropertiesForKeys: nil)) ?? []
        return files.map(\.lastPathComponent).filter { !known.contains($0) }.sorted()
    }

    private func directory(_ accountID: UUID) -> URL {
        root.appending(path: accountID.uuidString, directoryHint: .isDirectory)
    }
    private func index(_ accountID: UUID) -> URL { directory(accountID).appending(path: "media-index.json") }
    private func loadRecords(accountID: UUID) throws -> [StoredMedia] {
        let url = index(accountID)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        return try decoder.decode([StoredMedia].self, from: Data(contentsOf: url))
    }
    private func save(_ records: [StoredMedia], accountID: UUID) throws {
        let accountDirectory = directory(accountID)
        try FileManager.default.createDirectory(at: accountDirectory, withIntermediateDirectories: true)
        try encoder.encode(records).write(to: index(accountID), options: [.atomic, .completeFileProtectionUnlessOpen])
    }
}

public struct StorageThresholds: Codable, Equatable, Sendable {
    public let warningBytes: Int64
    public let criticalBytes: Int64
    public let captureBlockedBytes: Int64
    public static let sprintV1 = StorageThresholds(
        warningBytes: 4_000_000_000, criticalBytes: 2_000_000_000,
        captureBlockedBytes: 1_500_000_000)
}
public enum StoragePressure: String, Codable, Sendable { case sufficient, warning, critical, captureBlocked }
public enum StoragePressurePolicy {
    public static func classify(availableBytes: Int64, thresholds: StorageThresholds) -> StoragePressure {
        if availableBytes < thresholds.captureBlockedBytes { return .captureBlocked }
        if availableBytes < thresholds.criticalBytes { return .critical }
        if availableBytes < thresholds.warningBytes { return .warning }
        return .sufficient
    }
}
