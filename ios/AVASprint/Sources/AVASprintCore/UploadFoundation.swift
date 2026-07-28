import Foundation

public enum UploadFoundationError: Error, Equatable, Sendable {
    case invalidDestination
    case expiredDestination
    case unsafeHeader
    case invalidProgress
    case staleAttempt
    case accountMismatch
}

public struct UploadAuthorization: Codable, Equatable, Sendable {
    public let uploadID: UUID
    public let destination: URL
    public let requiredHeaders: [String: String]
    public let expiresAt: Date
    public let expectedBytes: Int64

    public init(uploadID: UUID, destination: URL, requiredHeaders: [String: String],
                expiresAt: Date, expectedBytes: Int64) {
        self.uploadID = uploadID
        self.destination = destination
        self.requiredHeaders = requiredHeaders
        self.expiresAt = expiresAt
        self.expectedBytes = expectedBytes
    }

    public func validate(now: Date) throws {
        guard destination.scheme?.lowercased() == "https",
              destination.host?.isEmpty == false,
              expectedBytes > 0 else {
            throw UploadFoundationError.invalidDestination
        }
        guard expiresAt > now else { throw UploadFoundationError.expiredDestination }
        let forbidden = Set(["authorization", "cookie", "proxy-authorization"])
        guard requiredHeaders.keys.allSatisfy({ !forbidden.contains($0.lowercased()) }) else {
            throw UploadFoundationError.unsafeHeader
        }
    }
}

public struct UploadProgress: Equatable, Sendable {
    public let sentBytes: Int64
    public let totalBytes: Int64
    public var fraction: Double {
        guard totalBytes > 0 else { return 0 }
        return min(1, Double(sentBytes) / Double(totalBytes))
    }
}

public actor UploadProgressTracker {
    private var attemptID: UUID?
    private var progress = UploadProgress(sentBytes: 0, totalBytes: 0)

    public init() {}

    @discardableResult
    public func begin(totalBytes: Int64) throws -> UUID {
        guard totalBytes > 0 else { throw UploadFoundationError.invalidProgress }
        let identifier = UUID()
        attemptID = identifier
        progress = UploadProgress(sentBytes: 0, totalBytes: totalBytes)
        return identifier
    }

    public func update(attempt: UUID, sentBytes: Int64,
                       totalBytes: Int64) throws -> UploadProgress {
        guard attempt == attemptID else { throw UploadFoundationError.staleAttempt }
        guard totalBytes == progress.totalBytes, sentBytes >= progress.sentBytes,
              sentBytes >= 0, sentBytes <= totalBytes else {
            throw UploadFoundationError.invalidProgress
        }
        progress = UploadProgress(sentBytes: sentBytes, totalBytes: totalBytes)
        return progress
    }

    public func cancel(attempt: UUID) throws {
        guard attempt == attemptID else { throw UploadFoundationError.staleAttempt }
        attemptID = nil
    }
}

public actor JSONUploadStore: UploadPersisting {
    private let root: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    public init(root: URL) {
        self.root = root
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    public func upsert(_ upload: PersistedUpload) throws {
        var values = try records(accountID: upload.accountID)
        if let index = values.firstIndex(where: { $0.id == upload.id }) {
            guard values[index].accountID == upload.accountID else {
                throw UploadFoundationError.accountMismatch
            }
            values[index] = upload
        } else {
            values.append(upload)
        }
        try save(values, accountID: upload.accountID)
    }

    public func pending(accountID: UUID, limit: Int) throws -> [PersistedUpload] {
        guard limit > 0 else { return [] }
        let terminal: Set<UploadState> = [.complete, .terminalFailure, .cancelled]
        return try records(accountID: accountID)
            .filter { !terminal.contains($0.state) }
            .sorted { $0.updatedAt < $1.updatedAt }
            .prefix(limit)
            .map { $0 }
    }

    public func remove(id: UUID) throws {
        let accountDirectories = (try? FileManager.default.contentsOfDirectory(
            at: root, includingPropertiesForKeys: nil)) ?? []
        for directory in accountDirectories {
            guard let accountID = UUID(uuidString: directory.lastPathComponent) else { continue }
            var values = try records(accountID: accountID)
            let oldCount = values.count
            values.removeAll { $0.id == id }
            if values.count != oldCount {
                try save(values, accountID: accountID)
                return
            }
        }
    }

    private func directory(_ accountID: UUID) -> URL {
        root.appending(path: accountID.uuidString, directoryHint: .isDirectory)
    }

    private func index(_ accountID: UUID) -> URL {
        directory(accountID).appending(path: "uploads.json")
    }

    private func records(accountID: UUID) throws -> [PersistedUpload] {
        let path = index(accountID)
        guard FileManager.default.fileExists(atPath: path.path) else { return [] }
        return try decoder.decode([PersistedUpload].self, from: Data(contentsOf: path))
    }

    private func save(_ values: [PersistedUpload], accountID: UUID) throws {
        try FileManager.default.createDirectory(at: directory(accountID),
                                                withIntermediateDirectories: true)
        try encoder.encode(values).write(to: index(accountID), options: .atomic)
    }
}
