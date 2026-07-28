import Foundation

public enum UploadEvent: Sendable { case prepare, connectivityLost, connectivityRestored, progress(Int64), uploadFinished, verificationSucceeded, submissionQueued, completed, retryableFailure, permanentFailure, pause, cancel }
public enum UploadStateMachine {
    public static func transition(from:UploadState,event:UploadEvent)->UploadState {
        switch(from,event){
        case(.queued,.prepare):.preparing
        case(.preparing,.connectivityLost),(.uploading,.connectivityLost):.waitingForConnectivity
        case(.waitingForConnectivity,.connectivityRestored),(.preparing,.progress),(.paused,.connectivityRestored):.uploading
        case(.uploading,.uploadFinished):.verifying
        case(.verifying,.verificationSucceeded):.uploaded
        case(.uploaded,.submissionQueued):.submissionPending
        case(.submissionPending,.completed):.complete
        case(_, .retryableFailure):.recoverableFailure
        case(_, .permanentFailure):.terminalFailure
        case(.uploading,.pause):.paused
        case(_, .cancel):.cancelled
        default:from
        }
    }
}
public protocol UploadPersisting:Sendable {
    func upsert(_ upload:PersistedUpload)async throws
    func pending(accountID:UUID,limit:Int)async throws->[PersistedUpload]
    func remove(id:UUID)async throws
}
public protocol UploadServicing:Sendable {
    func enqueue(fileURL:URL,athleteID:UUID,accountID:UUID,source:MediaSource)async throws->PersistedUpload
    func reconcile(accountID:UUID)async
    func cancel(id:UUID)async
}
public enum LocalMediaState:String,Codable,Sendable {
    case temporaryCapture,validatedLocalAsset,queuedForUpload,uploading,uploaded
    case awaitingServerVerification,safeToDelete,retainedByUser,deletionFailed
}
public struct LocalMediaRecord:Codable,Equatable,Sendable {
    public let id:UUID;public let accountID:UUID;public let fileName:String
    public var state:LocalMediaState;public let byteCount:Int64;public let createdAt:Date
}
public enum MediaCleanupPolicy {
    public static func canDelete(_ record:LocalMediaRecord,storagePressure:Bool)->Bool{
        guard storagePressure else{return record.state == .safeToDelete}
        return record.state == .safeToDelete && record.state != .retainedByUser
    }
}
public struct CaptureGuidance:Codable,Equatable,Sendable {
    public let requiredOrientation:String;public let minimumFPS:Double;public let minimumWidth:Int
    public let placement:String;public let framing:String;public let lighting:String
    public let calibrationVisibility:String;public let expectedDirection:String
    public let maximumDurationSeconds:Double
    public static let sprint60=CaptureGuidance(requiredOrientation:"landscape",minimumFPS:59,
      minimumWidth:1280,placement:"Stable side view with the full sprint zone visible.",
      framing:"Keep the athlete fully visible through the measured segment.",
      lighting:"Use even light and avoid strong backlighting.",calibrationVisibility:"Keep calibration gates visible.",
      expectedDirection:"Record one consistent lateral sprint direction.",maximumDurationSeconds:60)
}

