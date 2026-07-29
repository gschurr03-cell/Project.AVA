import Foundation

public protocol SecureSessionStoring: Sendable {
    func load() async throws -> AuthenticationSession?
    func save(_ session: AuthenticationSession) async throws
    func clear() async throws
}
public protocol AuthenticationServicing: Sendable {
    func restore() async -> AuthenticationSession?
    func signIn(email:String,password:String) async throws -> AuthenticationSession
    func signOut() async
    func handleRedirect(_ url:URL) async throws
    func requestPasswordRecovery(email:String) async throws
    func requestAccountDeletion() async throws
}
public actor SessionCoordinator: AccessTokenProviding {
    private let store: SecureSessionStoring
    private let refresh: @Sendable (String) async throws -> AuthenticationSession
    private var session: AuthenticationSession?
    private var refreshTask: Task<AuthenticationSession,Error>?
    public init(store:SecureSessionStoring,refresh:@escaping @Sendable(String)async throws->AuthenticationSession) {
        self.store=store;self.refresh=refresh
    }
    public func restore() async throws { session=try await store.load() }
    public func restoredSession() -> AuthenticationSession? { session }
    public func set(_ value:AuthenticationSession)async throws{session=value;try await store.save(value)}
    public func clear()async{session=nil;refreshTask?.cancel();refreshTask=nil;try? await store.clear()}
    public func validAccessToken()async throws->String{
        guard let current=session else{throw NetworkFailure.unauthenticated}
        if current.expiresAt.timeIntervalSinceNow>60{return current.accessToken}
        if let task=refreshTask{return try await task.value.accessToken}
        let task=Task{try await refresh(current.refreshToken)};refreshTask=task
        do{let updated=try await task.value;refreshTask=nil;try await set(updated);return updated.accessToken}
        catch{refreshTask=nil;await clear();throw NetworkFailure.unauthenticated}
    }
}
public actor InMemorySecureSessionStore:SecureSessionStoring {
    private var value:AuthenticationSession?
    public init(){}
    public func load()async throws->AuthenticationSession?{value}
    public func save(_ session:AuthenticationSession)async throws{value=session}
    public func clear()async throws{value=nil}
}
#if canImport(Security)
import Security
public actor KeychainSessionStore:SecureSessionStoring {
    private let service:String,account="authenticated-session"
    public init(service:String){self.service=service}
    public func load()async throws->AuthenticationSession?{
        let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,
          kSecAttrAccount as String:account,kSecReturnData as String:true]
        var item:CFTypeRef?;let status=SecItemCopyMatching(query as CFDictionary,&item)
        if status==errSecItemNotFound{return nil};guard status==errSecSuccess,let data=item as? Data else{throw NetworkFailure.unknown}
        let decoder=JSONDecoder();decoder.dateDecodingStrategy = .iso8601;return try decoder.decode(AuthenticationSession.self,from:data)
    }
    public func save(_ session:AuthenticationSession)async throws{
        let encoder=JSONEncoder();encoder.dateEncodingStrategy = .iso8601;let data=try encoder.encode(session)
        let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account]
        SecItemDelete(query as CFDictionary)
        var add=query;add[kSecValueData as String]=data;add[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(add as CFDictionary,nil)==errSecSuccess else{throw NetworkFailure.unknown}
    }
    public func clear()async throws{SecItemDelete([kSecClass as String:kSecClassGenericPassword,
      kSecAttrService as String:service,kSecAttrAccount as String:account] as CFDictionary)}
}
#endif
