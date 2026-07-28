import Foundation

public enum ManifestValidationError:Error,Equatable,Sendable {
    case notAuthoritative,notActive,wrongAnalysis,wrongAthlete,unsupportedContract,unsupportedPipeline
    case incompleteManifest,invalidIntegrity
}
public protocol ActivatedIntelligenceServicing:Sendable {
    func activeManifest(analysisID:UUID,athleteID:UUID)async throws->ActiveManifestSummary
    func report(reference:SnapshotReference)async throws->ReportSummary
}
public enum ManifestValidator {
    public static func validate(_ manifest:ActiveManifestSummary,analysisID:UUID,athleteID:UUID,
      supportedContracts:Set<String>,supportedPipelines:Set<String>)throws{
        guard manifest.authoritative else{throw ManifestValidationError.notAuthoritative}
        guard manifest.status=="active" else{throw ManifestValidationError.notActive}
        guard manifest.analysisID==analysisID else{throw ManifestValidationError.wrongAnalysis}
        guard manifest.athleteID==athleteID else{throw ManifestValidationError.wrongAthlete}
        guard supportedContracts.contains(manifest.contractVersion) else{throw ManifestValidationError.unsupportedContract}
        guard supportedPipelines.contains(manifest.pipelineVersion) else{throw ManifestValidationError.unsupportedPipeline}
        guard !manifest.integrityFingerprint.isEmpty else{throw ManifestValidationError.invalidIntegrity}
        guard let report=manifest.snapshotIndex["coach_report"],report.engineID=="coach_report"
        else{throw ManifestValidationError.incompleteManifest}
    }
}
public actor ActivatedIntelligenceService:ActivatedIntelligenceServicing {
    private let network:NetworkServing
    public init(network:NetworkServing){self.network=network}
    public func activeManifest(analysisID:UUID,athleteID:UUID)async throws->ActiveManifestSummary{
        let value:ActiveManifestSummary=try await network.send(APIRequest(method:.GET,path:"analyses/\(analysisID)/manifest"))
        try ManifestValidator.validate(value,analysisID:analysisID,athleteID:athleteID,
          supportedContracts:["ava-mobile-manifest-v1"],supportedPipelines:["intelligence-pipeline-v1"])
        return value
    }
    public func report(reference:SnapshotReference)async throws->ReportSummary{
        guard reference.engineID=="coach_report",reference.contractVersion=="ava-mobile-report-v1"
        else{throw ManifestValidationError.unsupportedContract}
        return try await network.send(APIRequest(method:.GET,path:"snapshots/\(reference.snapshotID)/report"))
    }
}

