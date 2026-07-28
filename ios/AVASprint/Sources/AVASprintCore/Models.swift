import Foundation

public enum LoadState<Value: Sendable>: Sendable {
    case idle, loading, loaded(Value), empty, offline(Value?), recoverableFailure(String), terminalFailure(String), authenticationRequired
}
public struct APIErrorResponse: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let requestID: String
    public let code: String
    public let message: String
    public let retryAfterSeconds: Int?
}
public struct AuthenticationSession: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let accessToken: String
    public let refreshToken: String
    public let expiresAt: Date
    public let accountID: UUID
}
public struct AthleteSummary: Codable, Equatable, Identifiable, Sendable {
    public let contractVersion: String
    public let id: UUID
    public let displayName: String
}
public enum MediaSource: String, Codable, Sendable { case camera, photoLibrary, fileImport }
public struct RecordingMetadata: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let source: MediaSource
    public let nominalFrameRate: Double?
    public let measuredFrameRate: Double?
    public let width: Int
    public let height: Int
    public let durationSeconds: Double
    public let orientation: String
    public let codec: String
    public let fileSizeBytes: Int64
    public let captureDeviceModel: String?
    public let stabilizationMode: String?
}
public struct UploadSession: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let id: UUID
    public let uploadURL: URL
    public let expiresAt: Date
    public let uploadedBytes: Int64
    public let expectedBytes: Int64
}
public enum UploadState: String, Codable, CaseIterable, Sendable {
    case queued, preparing, waitingForConnectivity, uploading, paused, verifying, uploaded
    case submissionPending, complete, recoverableFailure, terminalFailure, cancelled
}
public struct PersistedUpload: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let accountID: UUID
    public let athleteID: UUID
    public let localFileName: String
    public let source: MediaSource
    public var state: UploadState
    public var uploadedBytes: Int64
    public let expectedBytes: Int64
    public let sha256: String
    public let idempotencyKey: UUID
    public var serverSessionID: UUID?
    public var updatedAt: Date
}
public struct AnalysisSubmission: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let uploadReference: UUID
    public let athleteID: UUID
    public let analysisType: String
    public let recording: RecordingMetadata
    public let clientRequestID: UUID
    public let idempotencyKey: UUID
    public let appVersion: String
    public let source: MediaSource
}
public struct AnalysisRecord: Codable, Equatable, Identifiable, Sendable {
    public let contractVersion: String
    public let id: UUID
    public let athleteID: UUID
    public let state: String
}
public enum MobilePipelineState: String, Codable, Sendable {
    case queued, validating, processing, awaitingActivation = "awaiting_activation"
    case completed, failed, unsupported, deletionPending = "deletion_pending"
}
public struct PipelineStatus: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let analysisID: UUID
    public let state: MobilePipelineState
    public let retryAfterSeconds: Int?
    public let userMessage: String?
}
public struct ActiveManifestSummary: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let manifestID: UUID
    public let analysisID: UUID
    public let athleteID: UUID
    public let pipelineVersion: String
    public let status: String
    public let authoritative: Bool
    public let integrityFingerprint: String
    public let snapshotIndex: [String: SnapshotReference]
}
public struct SnapshotReference: Codable, Equatable, Sendable {
    public let snapshotID: UUID
    public let engineID: String
    public let engineVersion: String
    public let contractVersion: String
    public let fingerprint: String
}
public struct ReportSummary: Codable, Equatable, Identifiable, Sendable {
    public let contractVersion: String
    public let id: UUID
    public let analysisID: UUID
    public let athleteID: UUID
    public let title: String
    public let summary: String
    public let generatedAt: Date
}
public struct FeatureFlags: Codable, Equatable, Sendable {
    public var captureEnabled = false
    public var videoImportEnabled = false
    public var uploadEnabled = false
    public var analysisSubmissionEnabled = false
    public var reportViewingEnabled = true
    public var offlineModeEnabled = true
    public var pushRegistrationEnabled = false
    public var diagnosticsEnabled = false
    public var internalFeaturesEnabled = false
    public var stagingFixturesEnabled = false
    public var homeDashboardEnabled = false
    public var coachReportEnabled = false
    public var recommendationsEnabled = false
    public var rootCauseEnabled = false
    public var optimizationEnabled = false
    public var coachingStateEnabled = false
    public var benchmarksEnabled = false
    public var projectionsEnabled = false
    public var digitalTwinEnabled = false
    public var progressChartsEnabled = false
    public var evidenceEnabled = false
    public var reportSharingEnabled = false
    public var internalFeedbackEnabled = false
    public init() {}
}
