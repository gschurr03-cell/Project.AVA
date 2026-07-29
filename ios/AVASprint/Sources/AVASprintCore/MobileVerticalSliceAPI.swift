import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct MobileResponseMetadata: Codable, Equatable, Sendable {
    public let requestId: String
    public let serverTime: Date
    public let apiVersion: String
    public let resourceVersion: String?
    public let retryable: Bool
    public let retryAfterSeconds: Int?
}
public struct MobileAPIEnvelope<Value: Codable & Sendable>: Codable, Sendable {
    public let data: Value
    public let error: APIErrorResponse?
    public let meta: MobileResponseMetadata
}
public struct MobileAuthenticationPayload: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let accessToken: String
    public let refreshToken: String
    public let expiresAt: Date
    public let accountId: UUID
    public var session: AuthenticationSession {
        AuthenticationSession(contractVersion: contractVersion, accessToken: accessToken,
            refreshToken: refreshToken, expiresAt: expiresAt, accountID: accountId)
    }
}
public struct MobileCapabilities: Codable, Equatable, Sendable {
    public struct Upload: Codable, Equatable, Sendable {
        public let contentTypes: [String]
        public let maximumBytes: Int64
        public let signedUploadLifetimeSeconds: Int
    }
    public struct Capture: Codable, Equatable, Sendable {
        public let acceptedClasses: [String]
        public let minimumDetectedFps: Double
        public let analysisFps: Double
    }
    public let contractVersion: String
    public let upload: Upload
    public let capture: Capture
    public let analysisTypes: [String]
    public let unavailableMetrics: [String]
    public let minimumAppVersion: String
    public let serviceAvailable: Bool
    public let resultManifestVersion: String
}
public struct MobileUploadSession: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let id: UUID
    public let status: String
    public let uploadUrl: URL?
    public let expiresAt: Date
    public let expectedBytes: Int64
}
public struct MobileUploadCreateRequest: Codable, Equatable, Sendable {
    public struct Metadata: Codable, Equatable, Sendable {
        public let nominalFps: Double?
        public let measuredFps: Double?
        public let durationSeconds: Double
        public let width: Int
        public let height: Int

        public init(nominalFps: Double?, measuredFps: Double?, durationSeconds: Double,
                    width: Int, height: Int) {
            self.nominalFps = nominalFps
            self.measuredFps = measuredFps
            self.durationSeconds = durationSeconds
            self.width = width
            self.height = height
        }
    }

    public let filename: String
    public let contentType: String
    public let sizeBytes: Int64
    public let sha256: String
    public let idempotencyKey: UUID
    public let metadata: Metadata

    public init(filename: String, contentType: String, sizeBytes: Int64, sha256: String,
                idempotencyKey: UUID, metadata: Metadata) {
        self.filename = filename
        self.contentType = contentType
        self.sizeBytes = sizeBytes
        self.sha256 = sha256
        self.idempotencyKey = idempotencyKey
        self.metadata = metadata
    }
}
public struct MobileUploadStatus: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let id: UUID
    public let status: String
    public let expectedBytes: Int64
    public let actualBytes: Int64?
    public let expiresAt: Date
    public let analysisId: UUID?
    public let createdAt: Date
    public let completedAt: Date?
}
public struct MobileUploadCompletion: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let id: UUID
    public let status: String
    public let actualBytes: Int64?
    public let completedAt: Date?
}
public struct MobileSafeMetric: Codable, Equatable, Sendable {
    public let key: String
    public let value: Double
    public let state: String
}
public struct MobileSafeResult: Codable, Equatable, Sendable {
    public struct Manifest: Codable, Equatable, Sendable {
        public let analysisId: UUID
        public let sessionId: UUID
        public let analysisEngineVersion: String?
        public let poseVersion: String
        public let metricVersion: String?
        public let activatedAt: Date?
        public let fingerprint: String
    }
    public let contractVersion: String
    public let status: String
    public let manifest: Manifest
    public let metrics: [MobileSafeMetric]
    public let unavailableMetrics: [String]
    public let summary: String
    public let limitations: [String]
}

public actor NativeAuthenticationService: AuthenticationServicing {
    private let baseURL: URL
    private let urlSession: URLSession
    private let coordinator: SessionCoordinator
    public init(baseURL: URL, urlSession: URLSession = .shared, coordinator: SessionCoordinator) {
        self.baseURL = baseURL; self.urlSession = urlSession; self.coordinator = coordinator
    }
    public func restore() async -> AuthenticationSession? {
        try? await coordinator.restore()
        guard await coordinator.restoredSession() != nil else { return nil }
        do {
            _ = try await coordinator.validAccessToken()
            return await coordinator.restoredSession()
        }
        catch { return nil }
    }
    public func signIn(email: String, password: String) async throws -> AuthenticationSession {
        struct Body: Encodable { let email: String; let password: String }
        let payload: MobileAPIEnvelope<MobileAuthenticationPayload> = try await unauthenticated(
            path: "api/mobile/v1/auth/login", body: Body(email: email, password: password))
        try await coordinator.set(payload.data.session)
        return payload.data.session
    }
    public func signOut() async {
        if let token = try? await coordinator.validAccessToken() {
            var request = URLRequest(url: baseURL.appending(path: "api/mobile/v1/auth/logout"))
            request.httpMethod = "POST"; request.timeoutInterval = 15
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-ID")
            _ = try? await urlSession.data(for: request)
        }
        await coordinator.clear()
    }
    public func handleRedirect(_ url: URL) async throws { throw NetworkFailure.validation }
    public func requestPasswordRecovery(email: String) async throws { throw NetworkFailure.validation }
    public func requestAccountDeletion() async throws { throw NetworkFailure.validation }
    private func unauthenticated<Body: Encodable, Response: Decodable>(
        path: String, body: Body
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"; request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-ID")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode)
        else { throw NetworkFailure.unauthenticated }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Response.self, from: data)
    }
}

public struct MobileProfileService: AthleteProfileServicing {
    private let network: NetworkServing
    public init(network: NetworkServing) { self.network = network }
    public func currentAthlete() async throws -> AthleteSummary {
        let envelope: MobileAPIEnvelope<AthleteSummary> = try await network.send(
            APIRequest(method: .GET, path: "api/mobile/v1/athlete"))
        return envelope.data
    }
}

public struct MobileUploadAPI: Sendable {
    private let network: NetworkServing
    public init(network: NetworkServing) { self.network = network }

    public func initiate(_ request: MobileUploadCreateRequest) async throws -> MobileUploadSession {
        let encoder = JSONEncoder()
        let envelope: MobileAPIEnvelope<MobileUploadSession> = try await network.send(
            APIRequest(method: .POST, path: "api/mobile/v1/uploads",
                body: try encoder.encode(request), idempotencyKey: request.idempotencyKey))
        return envelope.data
    }

    public func status(uploadID: UUID) async throws -> MobileUploadStatus {
        let envelope: MobileAPIEnvelope<MobileUploadStatus> = try await network.send(
            APIRequest(method: .GET, path: "api/mobile/v1/uploads/\(uploadID)"))
        return envelope.data
    }

    public func confirm(uploadID: UUID, idempotencyKey: UUID) async throws -> MobileUploadCompletion {
        let envelope: MobileAPIEnvelope<MobileUploadCompletion> = try await network.send(
            APIRequest(method: .POST, path: "api/mobile/v1/uploads/\(uploadID)/complete",
                body: Data("{}".utf8), idempotencyKey: idempotencyKey))
        return envelope.data
    }
}

public struct MobileAnalysisService: AnalysisServicing {
    private let network: NetworkServing
    public init(network: NetworkServing) { self.network = network }
    public func submit(_ request: AnalysisSubmission) async throws -> AnalysisRecord {
        struct Body: Codable {
            let uploadId: UUID
            let idempotencyKey: UUID
            let analysisType: String
        }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let envelope: MobileAPIEnvelope<AnalysisRecord> = try await network.send(
            APIRequest(method: .POST, path: "api/mobile/v1/analyses",
                body: try encoder.encode(Body(uploadId: request.uploadReference,
                    idempotencyKey: request.idempotencyKey, analysisType: request.analysisType)),
                idempotencyKey: request.idempotencyKey))
        return envelope.data
    }
    public func status(analysisID: UUID) async throws -> PipelineStatus {
        let envelope: MobileAPIEnvelope<PipelineStatus> = try await network.send(
            APIRequest(method: .GET, path: "api/mobile/v1/analyses/\(analysisID)"))
        return envelope.data
    }
    public func result(analysisID: UUID) async throws -> MobileSafeResult {
        let envelope: MobileAPIEnvelope<MobileSafeResult> = try await network.send(
            APIRequest(method: .GET, path: "api/mobile/v1/analyses/\(analysisID)/result"))
        return envelope.data
    }
    public func delete(analysisID: UUID, idempotencyKey: UUID) async throws {
        struct Deleted: Codable, Sendable { let contractVersion: String; let status: String }
        let _: MobileAPIEnvelope<Deleted> = try await network.send(
            APIRequest(method: .DELETE, path: "api/mobile/v1/analyses/\(analysisID)",
                idempotencyKey: idempotencyKey))
    }
}

public enum NativeEnvironment {
    public static func validatedBaseURL(value: String, debug: Bool) throws -> URL {
        guard let url = URL(string: value), url.scheme == "https",
              let host = url.host, !host.isEmpty else { throw NetworkFailure.validation }
        if !debug && (host == "localhost" || host == "127.0.0.1") {
            throw NetworkFailure.validation
        }
        return url
    }
}
