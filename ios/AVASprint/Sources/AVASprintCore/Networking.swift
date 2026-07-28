import Foundation

public enum NetworkFailure: Error, Equatable, Sendable {
    case unauthenticated, unauthorized, validation, notFound, conflict, rateLimited(Int?)
    case serverUnavailable, networkUnavailable, timeout, cancelled, decodingFailure
    case incompatibleContract, unknown
}
public enum HTTPMethod: String, Sendable { case GET, POST, PUT, PATCH, DELETE }
private struct MobileErrorEnvelope: Decodable {
    struct ErrorBody: Decodable { let code: String; let message: String }
    struct Metadata: Decodable { let retryAfterSeconds: Int? }
    let error: ErrorBody?
    let meta: Metadata
}
public struct APIRequest<Response: Decodable & Sendable>: Sendable {
    public let method: HTTPMethod
    public let path: String
    public let body: Data?
    public let idempotencyKey: UUID?
    public let timeout: TimeInterval
    public init(method: HTTPMethod, path: String, body: Data? = nil, idempotencyKey: UUID? = nil, timeout: TimeInterval = 30) {
        self.method=method; self.path=path; self.body=body; self.idempotencyKey=idempotencyKey; self.timeout=timeout
    }
}
public protocol AccessTokenProviding: Sendable { func validAccessToken() async throws -> String }
public protocol NetworkServing: Sendable { func send<Response>(_ request: APIRequest<Response>) async throws -> Response }
public actor APIClient: NetworkServing {
    private let baseURL: URL, session: URLSession, tokens: AccessTokenProviding
    private let decoder: JSONDecoder
    public init(baseURL: URL, session: URLSession = .shared, tokens: AccessTokenProviding) {
        self.baseURL=baseURL; self.session=session; self.tokens=tokens
        decoder=JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
    }
    public func send<Response>(_ request: APIRequest<Response>) async throws -> Response {
        guard request.method == .GET || request.idempotencyKey != nil else {
            throw NetworkFailure.validation
        }
        var urlRequest=URLRequest(url:baseURL.appending(path:request.path))
        urlRequest.httpMethod=request.method.rawValue; urlRequest.httpBody=request.body
        urlRequest.timeoutInterval=request.timeout
        urlRequest.setValue("Bearer \(try await tokens.validAccessToken())",forHTTPHeaderField:"Authorization")
        urlRequest.setValue(UUID().uuidString,forHTTPHeaderField:"X-Request-ID")
        urlRequest.setValue("v1",forHTTPHeaderField:"X-AVA-API-Version")
        urlRequest.setValue("application/json",forHTTPHeaderField:"Accept")
        if request.body != nil { urlRequest.setValue("application/json",forHTTPHeaderField:"Content-Type") }
        if let key=request.idempotencyKey { urlRequest.setValue(key.uuidString,forHTTPHeaderField:"Idempotency-Key") }
        do {
            let(data,response)=try await session.data(for:urlRequest)
            guard let http=response as? HTTPURLResponse else { throw NetworkFailure.unknown }
            guard (200..<300).contains(http.statusCode) else { throw Self.classify(status:http.statusCode,data:data,decoder:decoder) }
            do { return try decoder.decode(Response.self,from:data) } catch { throw NetworkFailure.decodingFailure }
        } catch is CancellationError { throw NetworkFailure.cancelled }
        catch let failure as NetworkFailure { throw failure }
        catch let error as URLError where error.code == .timedOut { throw NetworkFailure.timeout }
        catch let error as URLError where error.code == .notConnectedToInternet { throw NetworkFailure.networkUnavailable }
        catch { throw NetworkFailure.unknown }
    }
    static func classify(status:Int,data:Data,decoder:JSONDecoder)->NetworkFailure {
        let body=try? decoder.decode(MobileErrorEnvelope.self,from:data)
        switch status { case 401:return .unauthenticated;case 403:return .unauthorized;case 404:return .notFound
        case 409:return .conflict;case 422:return .validation;case 429:return .rateLimited(body?.meta.retryAfterSeconds)
        case 500...599:return .serverUnavailable;default:return .unknown }
    }
}
