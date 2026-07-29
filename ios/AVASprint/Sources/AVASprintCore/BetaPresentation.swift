import Foundation

public enum AccountRole: String, Codable, Sendable { case athlete, coach, internalTester }
public enum ConfidenceLevel: String, Codable, Sendable {
    case high, moderate, low, insufficientEvidence, notEvaluated
}
public struct ConfidenceViewModel: Codable, Equatable, Sendable {
    public let level: ConfidenceLevel
    public let explanation: String
    public let factors: [String]
    public let limitations: [String]
}
public struct ResourceProvenance: Codable, Equatable, Sendable {
    public let manifestID: UUID
    public let snapshotID: UUID
    public let engineVersion: String
    public let contractVersion: String
    public let generatedAt: Date
    public let activatedAt: Date
}
public struct EvidenceViewModel: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let evidenceType: String
    public let sourceCategory: String
    public let publicationYear: Int?
    public let population: String?
    public let outcome: String
    public let applicability: String
    public let quality: String
    public let limitations: [String]
    public let safeURL: URL?
}
public struct ObservationViewModel: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let measured: String
    public let interpretation: String?
    public let associatedFactors: [String]
    public let unknowns: [String]
    public let evidenceIDs: [String]
    public let confidence: ConfidenceViewModel
}
public struct RootCauseViewModel: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let movementPattern: String
    public let hypothesis: String
    public let associatedMuscleGroups: [String]
    public let consequences: [String]
    public let competingHypotheses: [String]
    public let unknowns: [String]
    public let evidenceRequests: [String]
    public let diagnosisLimitation: String
    public let confidence: ConfidenceViewModel
}
public enum RecommendationStatus: String, Codable, Sendable {
    case currentFocus, secondary, maintenance, monitoring, retired, blocked, awaitingEvidence
}
public struct RecommendationViewModel: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let category: String
    public let purpose: String
    public let rationale: String
    public let associatedMuscleGroups: [String]
    public let priorityExplanation: [String]
    public let expectedReturn: String?
    public let confidence: ConfidenceViewModel
    public let evidenceIDs: [String]
    public let dependencies: [String]
    public let contraindications: [String]
    public let status: RecommendationStatus
    public let version: String
}
public struct OptimizationViewModel: Codable, Equatable, Sendable {
    public let selectedOpportunity: String
    public let rationale: String
    public let expectedUpside: String
    public let timeHorizon: String
    public let dependencies: [String]
    public let interactionEffects: [String]
    public let opportunityCosts: [String]
    public let deferredOpportunities: [String]
    public let modifiers: [String]
    public let confidence: ConfidenceViewModel
}
public struct CoachingStateChange: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let occurredAt: Date
    public let title: String
    public let reason: String
}
public struct CoachingStateViewModel: Codable, Equatable, Sendable {
    public let currentFocus: [String]
    public let secondary: [String]
    public let maintenance: [String]
    public let monitoring: [String]
    public let retired: [String]
    public let seasonContext: String?
    public let competitionContext: String?
    public let changes: [CoachingStateChange]
    public let confidence: ConfidenceViewModel
}
public struct BenchmarkViewModel: Codable, Equatable, Sendable {
    public let comparisonPopulation: String
    public let context: String
    public let strengths: [String]
    public let gaps: [String]
    public let applicability: String
    public let limitations: [String]
    public let confidence: ConfidenceViewModel
}
public struct ProjectionViewModel: Codable, Equatable, Sendable {
    public let measuredPerformance: String
    public let expectedRange: String
    public let timeHorizon: String
    public let assumptions: [String]
    public let contributingFactors: [String]
    public let limitingFactors: [String]
    public let uncertaintyStatement: String
    public let confidence: ConfidenceViewModel
}
public struct DigitalTwinDomain: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let strengths: [String]
    public let currentPatterns: [String]
    public let resolvedPatterns: [String]
    public let evidenceGaps: [String]
    public let confidence: ConfidenceViewModel
}
public enum TrendState: String, Codable, Sendable {
    case improving, stable, regressing, insufficientData, noncomparable, confidenceReduced
}
public struct ProgressPoint: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let date: Date
    public let value: Double
    public let unit: String
    public let analysisType: String
    public let captureProtocol: String
    public let confidence: ConfidenceLevel
    public let comparable: Bool
    public let comparabilityReason: String?
}
public struct ProgressSeriesViewModel: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let metric: String
    public let unit: String
    public let trend: TrendState
    public let trendExplanation: String
    public let points: [ProgressPoint]
    public let accessibleSummary: String
}
public struct AnalysisHistoryItem: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let submittedAt: Date
    public let completedAt: Date?
    public let activatedAt: Date?
    public let analysisType: String
    public let captureProtocol: String
    public let processingStatus: String
    public let recordingQuality: RecordingQualityClass
    public let activeManifestID: UUID?
    public let reportAvailable: Bool
    public let offlineAvailable: Bool
    public let actionRequired: String?
}
public struct CoachReportViewModel: Codable, Equatable, Sendable {
    public let title: String
    public let executiveSummary: String
    public let findings: [String]
    public let strengths: [String]
    public let limiters: [String]
    public let priorities: [String]
    public let maintenance: [String]
    public let monitoring: [String]
    public let unknowns: [String]
    public let evidenceRequests: [String]
    public let nextAssessment: String?
    public let confidence: ConfidenceViewModel
    public let provenance: ResourceProvenance
}
public struct HomeDashboardViewModel: Codable, Equatable, Sendable {
    public let currentFocus: String?
    public let highestPriority: String?
    public let latestAnalysisStatus: String
    public let recentChange: String?
    public let maintenance: String?
    public let monitoring: String?
    public let nextAssessment: String?
    public let actionRequired: String?
    public let latestReportID: UUID?
    public let lastSynchronizedAt: Date?
    public let stale: Bool
}
public struct MobileBetaResultPackage: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let accountID: UUID
    public let athleteID: UUID
    public let analysisID: UUID
    public let manifestID: UUID
    public let role: AccountRole
    public let home: HomeDashboardViewModel
    public let history: [AnalysisHistoryItem]
    public let report: CoachReportViewModel
    public let observations: [ObservationViewModel]
    public let rootCauses: [RootCauseViewModel]
    public let recommendations: [RecommendationViewModel]
    public let optimization: OptimizationViewModel?
    public let coachingState: CoachingStateViewModel?
    public let benchmark: BenchmarkViewModel?
    public let projection: ProjectionViewModel?
    public let digitalTwin: [DigitalTwinDomain]
    public let progress: [ProgressSeriesViewModel]
    public let evidence: [EvidenceViewModel]
    public let synchronizedAt: Date
}

public enum BetaPackageValidationError: Error, Equatable, Sendable {
    case unsupportedContract, manifestMismatch, analysisMismatch, athleteMismatch
    case unsafeEvidenceURL, unsafeProjectionLanguage, unsafeDiagnosisLanguage, missingRequiredReport
}
public enum MobileBetaPackageValidator {
    public static func validate(_ package: MobileBetaResultPackage,
                                activeManifest: ActiveManifestSummary) throws {
        guard package.contractVersion == "ava-mobile-beta-result-v1" else {
            throw BetaPackageValidationError.unsupportedContract
        }
        guard package.manifestID == activeManifest.manifestID,
              package.report.provenance.manifestID == activeManifest.manifestID else {
            throw BetaPackageValidationError.manifestMismatch
        }
        guard package.analysisID == activeManifest.analysisID else {
            throw BetaPackageValidationError.analysisMismatch
        }
        guard package.athleteID == activeManifest.athleteID else {
            throw BetaPackageValidationError.athleteMismatch
        }
        guard !package.report.executiveSummary.isEmpty else {
            throw BetaPackageValidationError.missingRequiredReport
        }
        if package.evidence.contains(where: { evidence in
            guard let url = evidence.safeURL else { return false }
            return url.scheme != "https"
        }) { throw BetaPackageValidationError.unsafeEvidenceURL }
        let projectionText = [package.projection?.expectedRange,
                              package.projection?.uncertaintyStatement].compactMap { $0 }.joined(separator: " ")
        if projectionText.localizedCaseInsensitiveContains("guaranteed") {
            throw BetaPackageValidationError.unsafeProjectionLanguage
        }
        let rootText = package.rootCauses.flatMap {
            [$0.hypothesis, $0.diagnosisLimitation] + $0.associatedMuscleGroups
        }.joined(separator: " ")
        let prohibited = ["you have an injury", "definitive cause", "are weak", "is weak"]
        if prohibited.contains(where: { rootText.localizedCaseInsensitiveContains($0) }) {
            throw BetaPackageValidationError.unsafeDiagnosisLanguage
        }
    }
}

public enum BetaPresentationSelector {
    public static func recommendations(_ package: MobileBetaResultPackage,
                                       status: RecommendationStatus? = nil) -> [RecommendationViewModel] {
        guard let status else { return package.recommendations }
        return package.recommendations.filter { $0.status == status }
    }
    public static func history(_ package: MobileBetaResultPackage, page: Int,
                               pageSize: Int, analysisType: String? = nil) -> [AnalysisHistoryItem] {
        guard page >= 0, pageSize > 0 else { return [] }
        let filtered = analysisType.map { value in
            package.history.filter { $0.analysisType == value }
        } ?? package.history
        let start = min(filtered.count, page * pageSize)
        return Array(filtered.dropFirst(start).prefix(pageSize))
    }
}

public enum FeedbackCategory: String, Codable, CaseIterable, Sendable {
    case capture, upload, analysisStatus, reportClarity, recommendationClarity
    case progress, design, performance, bug, privacyConcern, other
}
public struct BetaFeedback: Codable, Equatable, Sendable {
    public let contractVersion: String
    public let category: FeedbackCategory
    public let rating: Int?
    public let boundedText: String
    public let appVersion: String
    public let build: String
    public let environment: String
    public let screenIdentifier: String
    public let correlationID: UUID
    public let screenshotIncludedWithConsent: Bool
    public init(category: FeedbackCategory, rating: Int?, text: String, appVersion: String,
                build: String, environment: String, screenIdentifier: String,
                correlationID: UUID, screenshotIncludedWithConsent: Bool) {
        self.contractVersion = "ava-beta-feedback-v1"; self.category = category
        self.rating = rating.map { min(5, max(1, $0)) }
        self.boundedText = String(text.prefix(2_000))
        self.appVersion = appVersion; self.build = build; self.environment = environment
        self.screenIdentifier = String(screenIdentifier.prefix(100))
        self.correlationID = correlationID
        self.screenshotIncludedWithConsent = screenshotIncludedWithConsent
    }
}
