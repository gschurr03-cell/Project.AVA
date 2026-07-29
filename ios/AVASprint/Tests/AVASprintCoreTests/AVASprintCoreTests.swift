import Foundation
import Testing
@testable import AVASprintCore

let analysisID=UUID(uuidString:"22222222-2222-2222-2222-222222222222")!
let athleteID=UUID(uuidString:"33333333-3333-3333-3333-333333333333")!
func decode<T:Decodable>(_ name:String,as:T.Type)throws->T{
    let url=Bundle.module.url(forResource:name,withExtension:"json",subdirectory:"Fixtures")!
    let decoder=JSONDecoder();decoder.dateDecodingStrategy = .iso8601
    return try decoder.decode(T.self,from:Data(contentsOf:url))
}
@Test func contractFixturesAndManifestValidation()throws{
    let manifest=try decode("manifest-summary",as:ActiveManifestSummary.self)
    let report=try decode("report-summary",as:ReportSummary.self)
    #expect(report.analysisID==analysisID)
    try ManifestValidator.validate(manifest,analysisID:analysisID,athleteID:athleteID,
      supportedContracts:["ava-mobile-manifest-v1"],supportedPipelines:["intelligence-pipeline-v1"])
}
@Test func shadowAndStagedManifestRejected()throws{
    let active=try decode("manifest-summary",as:ActiveManifestSummary.self)
    let shadow=ActiveManifestSummary(contractVersion:active.contractVersion,manifestID:active.manifestID,
      analysisID:active.analysisID,athleteID:active.athleteID,pipelineVersion:active.pipelineVersion,
      status:"shadow",authoritative:false,integrityFingerprint:active.integrityFingerprint,snapshotIndex:active.snapshotIndex)
    #expect(throws:ManifestValidationError.self){
      try ManifestValidator.validate(shadow,analysisID:analysisID,athleteID:athleteID,
        supportedContracts:["ava-mobile-manifest-v1"],supportedPipelines:["intelligence-pipeline-v1"])
    }
}
@Test func uploadStateAndTerminalBehavior(){
    #expect(UploadStateMachine.transition(from: .queued, event: .prepare) == UploadState.preparing)
    #expect(UploadStateMachine.transition(from: .preparing, event: .progress(1)) == UploadState.uploading)
    #expect(UploadStateMachine.transition(from: .uploading, event: .uploadFinished) == UploadState.verifying)
    #expect(UploadStateMachine.transition(from: .terminalFailure, event: .prepare) == UploadState.terminalFailure)
}
@Test func featureFlagsFailClosed(){
    let flags=FeatureFlags();#expect(!flags.captureEnabled);#expect(!flags.uploadEnabled)
    #expect(!flags.analysisSubmissionEnabled);#expect(!flags.pushRegistrationEnabled)
}
@Test func deepLinkAndNotificationRouting(){
    let id=UUID();#expect(DeepLinkRouter.parse(URL(string:"avasprint://host/report/\(id)")!) == .report(id))
    #expect(NotificationRouter.route(SafeNotificationPayload(contractVersion:"invalid",
      kind:.analysisCompleted,analysisID:id,route:"report")) == .unknown)
}
@Test func offlineStoreAccountIsolation()async throws{
    let directory=FileManager.default.temporaryDirectory.appending(path:UUID().uuidString)
    let store=JSONOfflineStore(directory:directory),first=UUID(),second=UUID()
    var envelope=try await store.load(accountID:first)
    envelope.reports=[try decode("report-summary",as:ReportSummary.self)]
    try await store.save(envelope)
    #expect(try await store.load(accountID:first).reports.count==1)
    #expect(try await store.load(accountID:second).reports.count==0)
    try await store.clear(accountID:first);try? FileManager.default.removeItem(at:directory)
}
@Test func mediaDeletionRequiresServerVerification(){
    let record=LocalMediaRecord(id:UUID(),accountID:UUID(),fileName:"video.mov",
      state:.awaitingServerVerification,byteCount:10,createdAt:Date())
    #expect(!MediaCleanupPolicy.canDelete(record,storagePressure:true))
}

@Test func deterministicCameraFormatSelection() {
    let preferred = CameraFormatCapability(identifier: "b", width: 1920, height: 1080,
        minimumFPS: 24, maximumFPS: 60, codec: "h264", stabilizationSupported: true, hdrSupported: false)
    let lower = CameraFormatCapability(identifier: "a", width: 1280, height: 720,
        minimumFPS: 24, maximumFPS: 120, codec: "h264", stabilizationSupported: true, hdrSupported: false)
    #expect(CaptureFormatSelector.select(formats: [lower, preferred], policy: .sprintV1) == .preferred(preferred))
    let thirty = CameraFormatCapability(identifier: "30", width: 1920, height: 1080,
        minimumFPS: 24, maximumFPS: 30, codec: "h264", stabilizationSupported: true, hdrSupported: false)
    if case .unsupported = CaptureFormatSelector.select(formats: [thirty], policy: .sprintV1) {
        // Expected fail-closed result.
    } else {
        Issue.record("30 FPS must not silently fall back")
    }
}

@Test func recordingQualityIsReasonCoded() {
    let valid = VerifiedMediaProperties(width: 1920, height: 1080, nominalFPS: 59.94,
        measuredFPS: 59.94, timingVariationRatio: 0.01, durationSeconds: 8,
        estimatedFrameCount: 480, codec: "h264", orientation: "landscape",
        fileSizeBytes: 10_000, audioTrackPresent: false, readable: true, creationDate: nil)
    let preferred = RecordingQualityVerifier.classify(valid, protocol: .sideViewSprintV1)
    #expect(preferred.classification == .preferred)
    #expect(preferred.uploadAllowed && preferred.analysisAllowed)
    let thirty = VerifiedMediaProperties(width: 1920, height: 1080, nominalFPS: 30,
        measuredFPS: 30, timingVariationRatio: 0, durationSeconds: 8, estimatedFrameCount: 240,
        codec: "h264", orientation: "landscape", fileSizeBytes: 10_000,
        audioTrackPresent: true, readable: true, creationDate: nil)
    let rejected = RecordingQualityVerifier.classify(thirty, protocol: .sideViewSprintV1)
    #expect(rejected.classification == .unsupported)
    #expect(rejected.reasons.contains(.belowMinimumFrameRate))
    #expect(!rejected.uploadAllowed && !rejected.analysisAllowed)
}

@Test func mediaFingerprintStreamsAndDetectsStableContent() throws {
    let url = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    try Data("ava-video-fixture".utf8).write(to: url)
    defer { try? FileManager.default.removeItem(at: url) }
    let first = try MediaFingerprinter.sha256(fileURL: url, chunkSize: 3)
    let second = try MediaFingerprinter.sha256(fileURL: url, chunkSize: 32)
    #expect(first == second)
    #expect(first.byteCount == 17)
}

@Test func uploadReconciliationDoesNotBlindlyRestart() {
    let account = UUID()
    let upload = PersistedUpload(id: UUID(), accountID: account, athleteID: UUID(),
        localFileName: "video.mov", source: .camera, state: .uploading, uploadedBytes: 10,
        expectedBytes: 100, sha256: "digest", idempotencyKey: UUID(),
        serverSessionID: UUID(), updatedAt: Date())
    let completed = UploadReconciler.reconcile(local: upload, os: .missing, server: .complete,
        localFileExists: false, signedInAccountID: account, now: Date())
    #expect(completed == .acknowledgeCompletion)
    let foreign = UploadReconciler.reconcile(local: upload, os: .missing, server: .unknown,
        localFileExists: true, signedInAccountID: UUID(), now: Date())
    #expect(foreign == .quarantineForeignTask)
}

@Test func retryAndNetworkPoliciesFailSafely() {
    #expect(UploadNetworkPolicyEvaluator.evaluate(.wifiOnly,
        path: NetworkPathState(connected: true, wifi: false, expensive: true, constrained: false))
        == .wait(reason: "Waiting for Wi-Fi."))
    #expect(!UploadRetryPolicy.decision(for: .integrityMismatch, attempt: 0).retry)
    #expect(UploadRetryPolicy.decision(for: .timeout, attempt: 0, jitterUnit: 0.5).retry)
    #expect(!UploadRetryPolicy.decision(for: .timeout, attempt: 5).retry)
}

@Test func uploadAuthorizationRejectsExpiredUnsafeAndInsecureDestinations() throws {
    let now = Date()
    let valid = UploadAuthorization(uploadID: UUID(),
        destination: URL(string: "https://storage.example.test/upload?token=redacted")!,
        requiredHeaders: ["content-type": "video/quicktime"],
        expiresAt: now.addingTimeInterval(60), expectedBytes: 100)
    try valid.validate(now: now)
    #expect(throws: UploadFoundationError.expiredDestination) {
        try UploadAuthorization(uploadID: UUID(), destination: valid.destination,
            requiredHeaders: [:], expiresAt: now, expectedBytes: 100).validate(now: now)
    }
    #expect(throws: UploadFoundationError.invalidDestination) {
        try UploadAuthorization(uploadID: UUID(),
            destination: URL(string: "http://storage.example.test/upload")!,
            requiredHeaders: [:], expiresAt: now.addingTimeInterval(60),
            expectedBytes: 100).validate(now: now)
    }
    #expect(throws: UploadFoundationError.unsafeHeader) {
        try UploadAuthorization(uploadID: UUID(), destination: valid.destination,
            requiredHeaders: ["Authorization": "Bearer must-not-forward"],
            expiresAt: now.addingTimeInterval(60), expectedBytes: 100).validate(now: now)
    }
}

@Test func uploadProgressIsMonotonicAndRejectsStaleCallbacks() async throws {
    let tracker = UploadProgressTracker()
    let attempt = try await tracker.begin(totalBytes: 100)
    #expect(try await tracker.update(attempt: attempt, sentBytes: 25,
                                    totalBytes: 100).fraction == 0.25)
    await #expect(throws: UploadFoundationError.invalidProgress) {
        try await tracker.update(attempt: attempt, sentBytes: 20, totalBytes: 100)
    }
    try await tracker.cancel(attempt: attempt)
    await #expect(throws: UploadFoundationError.staleAttempt) {
        try await tracker.update(attempt: attempt, sentBytes: 100, totalBytes: 100)
    }
}

@Test func persistedUploadsRecoverByAccountAndExcludeTerminalWork() async throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = JSONUploadStore(root: directory)
    let account = UUID()
    let otherAccount = UUID()
    let pending = PersistedUpload(id: UUID(), accountID: account, athleteID: UUID(),
        localFileName: "source.mov", source: .photoLibrary, state: .uploading,
        uploadedBytes: 25, expectedBytes: 100, sha256: String(repeating: "a", count: 64),
        idempotencyKey: UUID(), serverSessionID: UUID(), updatedAt: Date())
    var completed = PersistedUpload(id: UUID(), accountID: account, athleteID: UUID(),
        localFileName: "complete.mov", source: .photoLibrary, state: .complete,
        uploadedBytes: 100, expectedBytes: 100, sha256: String(repeating: "b", count: 64),
        idempotencyKey: UUID(), serverSessionID: UUID(), updatedAt: Date())
    let foreign = PersistedUpload(id: UUID(), accountID: otherAccount, athleteID: UUID(),
        localFileName: "foreign.mov", source: .photoLibrary, state: .queued,
        uploadedBytes: 0, expectedBytes: 100, sha256: String(repeating: "c", count: 64),
        idempotencyKey: UUID(), serverSessionID: nil, updatedAt: Date())
    try await store.upsert(pending)
    try await store.upsert(completed)
    try await store.upsert(foreign)
    #expect(try await store.pending(accountID: account, limit: 10).map(\.id) == [pending.id])
    completed.state = .uploading
    try await store.upsert(completed)
    #expect(try await store.pending(accountID: account, limit: 10).count == 2)
    #expect(try await store.pending(accountID: otherAccount, limit: 10).map(\.id) == [foreign.id])
}

@Test func cancellationIsTerminalAgainstLateTransferCallbacks() {
    let cancelled = UploadStateMachine.transition(from: .uploading, event: .cancel)
    #expect(cancelled == .cancelled)
    #expect(UploadStateMachine.transition(from: cancelled,
        event: .uploadFinished) == .cancelled)
    #expect(UploadStateMachine.transition(from: cancelled,
        event: .verificationSucceeded) == .cancelled)
}

@Test func localUploadFoundationRecoversOneCanonicalAttempt() async throws {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let account = UUID()
    let uploadID = UUID()
    let idempotencyKey = UUID()
    var upload = PersistedUpload(id: uploadID, accountID: account, athleteID: UUID(),
        localFileName: "source.mov", source: .photoLibrary, state: .queued,
        uploadedBytes: 0, expectedBytes: 100, sha256: String(repeating: "d", count: 64),
        idempotencyKey: idempotencyKey, serverSessionID: nil, updatedAt: Date())
    let store = JSONUploadStore(root: root)
    try await store.upsert(upload)

    upload.state = UploadStateMachine.transition(from: upload.state, event: .prepare)
    upload.state = UploadStateMachine.transition(from: upload.state, event: .progress(40))
    upload.uploadedBytes = 40
    upload.serverSessionID = uploadID
    try await store.upsert(upload)

    let restored = try #require(await store.pending(accountID: account, limit: 1).first)
    #expect(restored.id == uploadID)
    #expect(restored.idempotencyKey == idempotencyKey)
    #expect(UploadReconciler.reconcile(local: restored, os: .missing,
        server: .open(uploadedBytes: 40, expiresAt: Date().addingTimeInterval(60)),
        localFileExists: true, signedInAccountID: account, now: Date()) == .restart)
    #expect(UploadReconciler.reconcile(local: restored, os: .completed,
        server: .complete, localFileExists: true, signedInAccountID: account,
        now: Date()) == .acknowledgeCompletion)
}

@Test func offlinePackageCommitIsAtomicAndAccountScoped() async throws {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = OfflineResultPackageStore(root: directory)
    let manifest = try decode("manifest-summary", as: ActiveManifestSummary.self)
    let report = try decode("report-summary", as: ReportSummary.self)
    let analysis = AnalysisRecord(contractVersion: "ava-analysis-v1", id: manifest.analysisID,
                                  athleteID: manifest.athleteID, state: "completed")
    let package = OfflineResultPackage(accountID: UUID(), analysis: analysis, manifest: manifest,
        report: report, synchronizedAt: Date(), integrityFingerprint: manifest.integrityFingerprint,
        complete: true)
    try await store.commit(package)
    let loaded = try await store.load(accountID: package.accountID, analysisID: analysis.id)
    #expect(loaded?.id == package.id)
    #expect(loaded?.manifest == package.manifest)
    #expect(loaded?.report == package.report)
    #expect(try await store.load(accountID: UUID(), analysisID: analysis.id) == nil)
}

func betaPackage(manifest: ActiveManifestSummary, recommendationTitles: [String] = ["First", "Second"],
                 rootHypothesis: String = "This pattern can be associated with recovery timing.",
                 projection: String = "A backend-provided expected range, not a guarantee.") -> MobileBetaResultPackage {
    let confidence = ConfidenceViewModel(level: .moderate, explanation: "Backend confidence.",
                                         factors: ["Recording quality"], limitations: ["One analysis"])
    let provenance = ResourceProvenance(manifestID: manifest.manifestID, snapshotID: UUID(),
        engineVersion: "coach-report-v1", contractVersion: "ava-mobile-coach-report-v1",
        generatedAt: Date(), activatedAt: Date())
    let report = CoachReportViewModel(title: "Coach Report", executiveSummary: "Activated summary.",
        findings: ["Measured finding"], strengths: [], limiters: [], priorities: recommendationTitles,
        maintenance: [], monitoring: [], unknowns: ["Strength not measured"],
        evidenceRequests: ["Additional assessment"], nextAssessment: nil,
        confidence: confidence, provenance: provenance)
    let recommendations = recommendationTitles.enumerated().map { index, title in
        RecommendationViewModel(id: "r\(index)", title: title, category: "technique",
            purpose: "Backend purpose", rationale: "Backend rationale",
            associatedMuscleGroups: ["hamstrings"], priorityExplanation: ["Backend order"],
            expectedReturn: nil, confidence: confidence, evidenceIDs: [],
            dependencies: [], contraindications: [], status: index == 0 ? .currentFocus : .secondary,
            version: "v1")
    }
    return MobileBetaResultPackage(contractVersion: "ava-mobile-beta-result-v1",
        accountID: UUID(), athleteID: manifest.athleteID, analysisID: manifest.analysisID,
        manifestID: manifest.manifestID, role: .athlete,
        home: HomeDashboardViewModel(currentFocus: recommendationTitles.first,
            highestPriority: recommendationTitles.first, latestAnalysisStatus: "Completed",
            recentChange: nil, maintenance: nil, monitoring: nil, nextAssessment: nil,
            actionRequired: nil, latestReportID: UUID(), lastSynchronizedAt: Date(), stale: false),
        history: [], report: report, observations: [],
        rootCauses: [RootCauseViewModel(id: "root", movementPattern: "Measured pattern",
            hypothesis: rootHypothesis, associatedMuscleGroups: ["hamstrings"],
            consequences: [], competingHypotheses: ["Alternative"], unknowns: ["Strength unknown"],
            evidenceRequests: ["Strength assessment"],
            diagnosisLimitation: "The footage does not confirm muscular weakness.",
            confidence: confidence)],
        recommendations: recommendations, optimization: nil, coachingState: nil, benchmark: nil,
        projection: ProjectionViewModel(measuredPerformance: "Measured result",
            expectedRange: projection, timeHorizon: "Eight weeks", assumptions: [],
            contributingFactors: [], limitingFactors: [],
            uncertaintyStatement: "Projections are not guarantees.", confidence: confidence),
        digitalTwin: [], progress: [], evidence: [], synchronizedAt: Date())
}

@Test func betaPackageIsManifestScopedAndPreservesRecommendationOrder() throws {
    let manifest = try decode("manifest-summary", as: ActiveManifestSummary.self)
    let package = betaPackage(manifest: manifest)
    try MobileBetaPackageValidator.validate(package, activeManifest: manifest)
    #expect(BetaPresentationSelector.recommendations(package).map(\.title) == ["First", "Second"])
}

@Test func mixedManifestAndUnsafeLanguageFailClosed() throws {
    let manifest = try decode("manifest-summary", as: ActiveManifestSummary.self)
    let different = ActiveManifestSummary(contractVersion: manifest.contractVersion,
        manifestID: UUID(), analysisID: manifest.analysisID, athleteID: manifest.athleteID,
        pipelineVersion: manifest.pipelineVersion, status: "active", authoritative: true,
        integrityFingerprint: manifest.integrityFingerprint, snapshotIndex: manifest.snapshotIndex)
    #expect(throws: BetaPackageValidationError.manifestMismatch) {
        try MobileBetaPackageValidator.validate(betaPackage(manifest: manifest), activeManifest: different)
    }
    #expect(throws: BetaPackageValidationError.unsafeDiagnosisLanguage) {
        try MobileBetaPackageValidator.validate(
            betaPackage(manifest: manifest, rootHypothesis: "Your hamstrings are weak."),
            activeManifest: manifest)
    }
}

@Test func projectionGuaranteeFailsClosed() throws {
    let manifest = try decode("manifest-summary", as: ActiveManifestSummary.self)
    #expect(throws: BetaPackageValidationError.unsafeProjectionLanguage) {
        try MobileBetaPackageValidator.validate(
            betaPackage(manifest: manifest, projection: "Guaranteed improvement"),
            activeManifest: manifest)
    }
}

@Test func betaFlagsDefaultClosedAndFeedbackIsBounded() {
    let flags = FeatureFlags()
    #expect(!flags.homeDashboardEnabled && !flags.coachReportEnabled)
    #expect(!flags.rootCauseEnabled && !flags.reportSharingEnabled)
    let feedback = BetaFeedback(category: .reportClarity, rating: 9,
        text: String(repeating: "x", count: 2_100), appVersion: "1", build: "1",
        environment: "staging", screenIdentifier: String(repeating: "s", count: 150),
        correlationID: UUID(), screenshotIncludedWithConsent: false)
    #expect(feedback.rating == 5)
    #expect(feedback.boundedText.count == 2_000)
    #expect(feedback.screenIdentifier.count == 100)
}

@Test func nativeEnvironmentRejectsInsecureAndReleaseLocalhost() throws {
    #expect(throws: NetworkFailure.self) {
        try NativeEnvironment.validatedBaseURL(value: "http://staging.example.com", debug: true)
    }
    #expect(throws: NetworkFailure.self) {
        try NativeEnvironment.validatedBaseURL(value: "https://localhost:3000", debug: false)
    }
    #expect(try NativeEnvironment.validatedBaseURL(
        value: "https://staging.example.com", debug: false).host == "staging.example.com")
}

@Test func mobileSafeResultEnvelopeDecodes() throws {
    let json = """
    {"data":{"contractVersion":"ava-mobile-safe-result-v1","status":"completed",
    "manifest":{"analysisId":"22222222-2222-2222-2222-222222222222",
    "sessionId":"11111111-1111-1111-1111-111111111111","analysisEngineVersion":"ava-sprint-60-v1",
    "poseVersion":"mediapipe","metricVersion":"v1","activatedAt":"2026-07-18T00:00:00Z",
    "fingerprint":"abc"},"metrics":[{"key":"zoneTimeS","value":1.2,"state":"derived"}],
    "unavailableMetrics":["peakVelocity"],"summary":"Measured summary.",
    "limitations":["No diagnosis."]},"error":null,
    "meta":{"requestId":"request-123","serverTime":"2026-07-18T00:00:00Z","apiVersion":"v1",
    "resourceVersion":"ava-mobile-safe-result-v1","retryable":false,"retryAfterSeconds":null}}
    """
    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
    let envelope = try decoder.decode(MobileAPIEnvelope<MobileSafeResult>.self,
                                      from: Data(json.utf8))
    #expect(envelope.data.manifest.analysisId == analysisID)
    #expect(envelope.data.unavailableMetrics == ["peakVelocity"])
}
