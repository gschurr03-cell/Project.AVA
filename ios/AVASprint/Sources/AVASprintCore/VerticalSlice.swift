import Foundation
public enum VerticalSliceState:Equatable,Sendable{
    case signedOut,loadingProfile,ready(AthleteSummary),mediaSelected(RecordingMetadata)
    case uploadQueued(UUID),uploading(Double),processing(MobilePipelineState)
    case report(ReportSummary,offline:Bool),recoverableFailure(String),terminalFailure(String)
}
public actor VerticalSliceCoordinator{
    private(set)public var state:VerticalSliceState = .signedOut
    private let dependencies:AppDependencies
    public init(dependencies:AppDependencies){self.dependencies=dependencies}
    public func load()async{
        guard let session=await dependencies.authentication.restore()else{state = .signedOut;return}
        state = .loadingProfile
        do{
            let athlete=try await dependencies.profile.currentAthlete();state = .ready(athlete)
            var cache=try await dependencies.offline.load(accountID:session.accountID);cache.athlete=athlete
            try await dependencies.offline.save(cache)
        }catch{
            if let cache=try? await dependencies.offline.load(accountID:session.accountID),
              let report=cache.reports.sorted(by:{$0.generatedAt>$1.generatedAt}).first{
                state = .report(report,offline:true)
            }else{state = .recoverableFailure("Profile unavailable.")}
        }
    }
    public func showCachedReport(accountID:UUID,reportID:UUID)async{
        do{let cache=try await dependencies.offline.load(accountID:accountID)
          guard let report=cache.reports.first(where:{$0.id==reportID})else{state = .recoverableFailure("Cached report unavailable.");return}
          state = .report(report,offline:true)
        }catch{state = .recoverableFailure("Offline data unavailable.")}
    }
    public func resolveCompletedAnalysis(accountID:UUID,analysis:AnalysisRecord)async{
        do{
            let manifest=try await dependencies.intelligence.activeManifest(analysisID:analysis.id,athleteID:analysis.athleteID)
            guard let reference=manifest.snapshotIndex["coach_report"]else{throw ManifestValidationError.incompleteManifest}
            let report=try await dependencies.intelligence.report(reference:reference)
            var cache=try await dependencies.offline.load(accountID:accountID)
            cache.manifests.removeAll{$0.analysisID==analysis.id};cache.manifests.append(manifest)
            cache.reports.removeAll{$0.id==report.id};cache.reports.append(report);cache.lastSuccessfulSync=Date()
            try await dependencies.offline.save(cache);state = .report(report,offline:false)
        }catch let error as ManifestValidationError{state = .terminalFailure("Authoritative result rejected: \(error)")}
        catch{state = .recoverableFailure("Result synchronization failed.")}
    }
}

