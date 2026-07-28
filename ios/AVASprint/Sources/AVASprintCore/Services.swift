import Foundation
public protocol AthleteProfileServicing:Sendable{func currentAthlete()async throws->AthleteSummary}
public protocol AnalysisServicing:Sendable{
    func submit(_ request:AnalysisSubmission)async throws->AnalysisRecord
    func status(analysisID:UUID)async throws->PipelineStatus
}
public protocol Logging:Sendable{func event(_ name:String,metadata:[String:String])}
public struct RedactingLogger:Logging{
    public init(){}
    public func event(_ name:String,metadata:[String:String]){
        let forbidden=["token","password","video","fullname","notes","report","signedurl","uploadurl"]
        let safe=metadata.filter{item in !forbidden.contains{item.key.lowercased().contains($0)}}
        #if DEBUG
        print("[AVA] \(name) \(safe)")
        #endif
    }
}
public enum DeepLink:Equatable,Sendable{case analysis(UUID),report(UUID),uploadRecovery,authentication(URL),unknown}
public enum DeepLinkRouter{
    public static func parse(_ url:URL)->DeepLink{
        if url.host=="auth"{return .authentication(url)}
        let parts=url.pathComponents.filter{$0 != "/"}
        if parts.count==2,let id=UUID(uuidString:parts[1]){
            if parts[0]=="analysis"{return .analysis(id)}
            if parts[0]=="report"{return .report(id)}
        }
        if url.host=="upload-recovery"{return .uploadRecovery}
        return .unknown
    }
}
public enum NotificationKind:String,Codable,Sendable{
    case analysisCompleted,analysisFailed,recordingActionRequired,uploadInterrupted,newCoachingPlan,accountSecurityAlert
}
public struct SafeNotificationPayload:Codable,Equatable,Sendable{
    public let contractVersion:String;public let kind:NotificationKind
    public let analysisID:UUID?;public let route:String
}
public enum NotificationRouter{
    public static func route(_ payload:SafeNotificationPayload)->DeepLink{
        guard payload.contractVersion=="ava-notification-v1" else{return .unknown}
        if let id=payload.analysisID{
            return payload.kind == .analysisCompleted ? .report(id):.analysis(id)
        }
        return .unknown
    }
}
public struct AppDiagnostics:Codable,Equatable,Sendable{
    public let appVersion:String,build:String,environment:String,apiReachability:String
    public let authenticationCategory:String,connectivity:String
    public let queuedUploads:Int,failedUploads:Int,lastSync:Date?,localSchemaVersion:Int
    public let supportedAPIContract:String,enabledFlags:[String],notificationPermission:String
    public let cameraPermission:String,storageBytes:Int64,manifestIDPrefix:String?
}
public struct AppDependencies:Sendable{
    public let authentication:AuthenticationServicing
    public let network:NetworkServing
    public let profile:AthleteProfileServicing
    public let upload:UploadServicing
    public let analysis:AnalysisServicing
    public let intelligence:ActivatedIntelligenceServicing
    public let offline:OfflineStoring
    public let connectivity:ConnectivityServicing
    public let logger:Logging
    public let flags:FeatureFlags
    public init(authentication:AuthenticationServicing,network:NetworkServing,profile:AthleteProfileServicing,
      upload:UploadServicing,analysis:AnalysisServicing,intelligence:ActivatedIntelligenceServicing,
      offline:OfflineStoring,connectivity:ConnectivityServicing,logger:Logging,flags:FeatureFlags){
      self.authentication=authentication;self.network=network;self.profile=profile;self.upload=upload
      self.analysis=analysis;self.intelligence=intelligence;self.offline=offline
      self.connectivity=connectivity;self.logger=logger;self.flags=flags}
}
