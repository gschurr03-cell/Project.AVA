import Foundation

public struct OfflineEnvelope:Codable,Equatable,Sendable {
    public let localSchemaVersion:Int;public let accountID:UUID;public var athlete:AthleteSummary?
    public var analyses:[AnalysisRecord];public var manifests:[ActiveManifestSummary]
    public var reports:[ReportSummary];public var uploads:[PersistedUpload]
    public var queuedActionIDs:[UUID];public var lastSuccessfulSync:Date?
}
public protocol OfflineStoring:Sendable {
    func load(accountID:UUID)async throws->OfflineEnvelope
    func save(_ envelope:OfflineEnvelope)async throws
    func clear(accountID:UUID)async throws
}
public actor JSONOfflineStore:OfflineStoring {
    public static let schemaVersion=1
    private let directory:URL,encoder=JSONEncoder(),decoder=JSONDecoder()
    public init(directory:URL){self.directory=directory;encoder.dateEncodingStrategy = .iso8601;decoder.dateDecodingStrategy = .iso8601}
    public func load(accountID:UUID)async throws->OfflineEnvelope{
        let url=file(accountID);guard FileManager.default.fileExists(atPath:url.path)else{
          return OfflineEnvelope(localSchemaVersion:Self.schemaVersion,accountID:accountID,athlete:nil,
            analyses:[],manifests:[],reports:[],uploads:[],queuedActionIDs:[],lastSuccessfulSync:nil)}
        let value=try decoder.decode(OfflineEnvelope.self,from:Data(contentsOf:url))
        guard value.localSchemaVersion==Self.schemaVersion,value.accountID==accountID else{throw NetworkFailure.incompatibleContract}
        return value
    }
    public func save(_ envelope:OfflineEnvelope)async throws{
        guard envelope.localSchemaVersion==Self.schemaVersion else{throw NetworkFailure.incompatibleContract}
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        let data=try encoder.encode(envelope),temporary=directory.appending(path:"\(envelope.accountID).tmp")
        try data.write(to:temporary,options:.atomic)
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey:FileProtectionType.completeUntilFirstUserAuthentication],
          ofItemAtPath:temporary.path)
        #endif
        let destination=file(envelope.accountID);try? FileManager.default.removeItem(at:destination)
        try FileManager.default.moveItem(at:temporary,to:destination)
    }
    public func clear(accountID:UUID)async throws{try? FileManager.default.removeItem(at:file(accountID))}
    private func file(_ id:UUID)->URL{directory.appending(path:"\(id.uuidString).json")}
}
public enum SyncTrigger:String,Sendable {case signIn,foreground,connectivityRestored,uploadCompleted,pushNotification,manualRefresh,backgroundRefresh}
public protocol ConnectivityServicing:Sendable{var isConnected:Bool{get async}}
public actor SyncCoordinator {
    private var running=false
    private let offline:OfflineStoring,connectivity:ConnectivityServicing
    private let synchronize:@Sendable(UUID,SyncTrigger)async throws->Void
    public init(offline:OfflineStoring,connectivity:ConnectivityServicing,
      synchronize:@escaping @Sendable(UUID,SyncTrigger)async throws->Void){
      self.offline=offline;self.connectivity=connectivity;self.synchronize=synchronize}
    public func run(accountID:UUID,trigger:SyncTrigger)async throws{
        guard !running else{return};guard await connectivity.isConnected else{return}
        running=true;defer{running=false};try Task.checkCancellation();try await synchronize(accountID,trigger)
    }
}

