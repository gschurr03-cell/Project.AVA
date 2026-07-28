import Foundation

public enum UploadNetworkPolicy: String, Codable, Sendable {
    case wifiOnly, wifiPreferred, wifiAndCellular
}
public struct NetworkPathState: Equatable, Sendable {
    public let connected: Bool
    public let wifi: Bool
    public let expensive: Bool
    public let constrained: Bool
    public init(connected: Bool, wifi: Bool, expensive: Bool, constrained: Bool) {
        self.connected = connected; self.wifi = wifi
        self.expensive = expensive; self.constrained = constrained
    }
}
public enum NetworkPolicyDecision: Equatable, Sendable {
    case allow, wait(reason: String)
}
public enum UploadNetworkPolicyEvaluator {
    public static func evaluate(_ policy: UploadNetworkPolicy,
                                path: NetworkPathState) -> NetworkPolicyDecision {
        guard path.connected else { return .wait(reason: "Waiting for a network connection.") }
        if path.constrained { return .wait(reason: "Waiting because Low Data Mode is active.") }
        switch policy {
        case .wifiOnly:
            return path.wifi ? .allow : .wait(reason: "Waiting for Wi-Fi.")
        case .wifiPreferred:
            return path.wifi || !path.expensive ? .allow : .wait(reason: "Waiting for Wi-Fi to avoid a large cellular transfer.")
        case .wifiAndCellular:
            return .allow
        }
    }
}

public enum UploadFailureKind: String, Codable, Sendable {
    case offline, connectionInterrupted, timeout, serverUnavailable, rateLimited
    case authorizationExpired, sessionExpired, fileMissing, fileChanged, integrityMismatch
    case authenticationExpired, unauthorized, unsupportedMedia, storageQuota, cancelled
    case permanentValidation
}
public struct UploadRetryDecision: Equatable, Sendable {
    public let retry: Bool
    public let delaySeconds: TimeInterval?
    public let terminal: Bool
}
public enum UploadRetryPolicy {
    public static let maximumAttempts = 5
    public static func decision(for failure: UploadFailureKind, attempt: Int,
                                retryAfter: TimeInterval? = nil,
                                jitterUnit: Double = 0.5) -> UploadRetryDecision {
        let transient: Set<UploadFailureKind> = [
            .offline, .connectionInterrupted, .timeout, .serverUnavailable,
            .rateLimited, .authorizationExpired, .sessionExpired, .authenticationExpired
        ]
        guard transient.contains(failure), attempt < maximumAttempts else {
            return UploadRetryDecision(retry: false, delaySeconds: nil, terminal: !transient.contains(failure))
        }
        let base = retryAfter ?? min(60, pow(2, Double(max(0, attempt))))
        let boundedJitter = min(1, max(0, jitterUnit))
        return UploadRetryDecision(retry: true, delaySeconds: base * (0.75 + boundedJitter * 0.5),
                                   terminal: false)
    }
}

public enum OperatingSystemUploadState: Equatable, Sendable {
    case missing, active(taskIdentifier: Int, sentBytes: Int64), completed
}
public enum ServerUploadState: Equatable, Sendable {
    case unknown, open(uploadedBytes: Int64, expiresAt: Date), complete, integrityMismatch, cancelled
}
public enum UploadReconciliationAction: Equatable, Sendable {
    case keepWaiting, adoptTask(Int), persistProgress(Int64), acknowledgeCompletion
    case renewSession, restart, fail(UploadFailureKind), quarantineForeignTask
}
public enum UploadReconciler {
    public static func reconcile(local: PersistedUpload, os: OperatingSystemUploadState,
                                 server: ServerUploadState, localFileExists: Bool,
                                 signedInAccountID: UUID?, now: Date) -> UploadReconciliationAction {
        guard signedInAccountID == local.accountID else { return .quarantineForeignTask }
        guard localFileExists || server == .complete else { return .fail(.fileMissing) }
        if server == .integrityMismatch { return .fail(.integrityMismatch) }
        if server == .complete { return .acknowledgeCompletion }
        if case let .open(_, expiration) = server, expiration <= now { return .renewSession }
        if case let .active(task, sent) = os {
            return sent > local.uploadedBytes ? .persistProgress(sent) : .adoptTask(task)
        }
        if local.state == .uploading && os == .missing { return .restart }
        return .keepWaiting
    }
}

#if os(iOS)
public final class BackgroundUploadSession: NSObject, URLSessionTaskDelegate,
                                            URLSessionDataDelegate, @unchecked Sendable {
    public let identifier: String
    private let events: @Sendable (Int, Int64, Int64, Error?) -> Void
    public lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.background(withIdentifier: identifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        configuration.waitsForConnectivity = true
        configuration.allowsCellularAccess = false
        return URLSession(configuration: configuration, delegate: self,
                          delegateQueue: OperationQueue())
    }()
    public init(environment: String,
                events: @escaping @Sendable (Int, Int64, Int64, Error?) -> Void) {
        self.identifier = "com.placeholder.avasprint.\(environment).media-upload"
        self.events = events
        super.init()
    }
    public func upload(file: URL, to request: URLRequest) -> Int {
        let task = session.uploadTask(with: request, fromFile: file)
        task.taskDescription = file.lastPathComponent
        task.resume()
        return task.taskIdentifier
    }
    public func activeTasks() async -> [URLSessionTask] { await session.allTasks }
    public func urlSession(_ session: URLSession, task: URLSessionTask,
                           didSendBodyData bytesSent: Int64, totalBytesSent: Int64,
                           totalBytesExpectedToSend: Int64) {
        events(task.taskIdentifier, totalBytesSent, totalBytesExpectedToSend, nil)
    }
    public func urlSession(_ session: URLSession, task: URLSessionTask,
                           didCompleteWithError error: Error?) {
        events(task.taskIdentifier, task.countOfBytesSent, task.countOfBytesExpectedToSend, error)
    }
}
#endif
