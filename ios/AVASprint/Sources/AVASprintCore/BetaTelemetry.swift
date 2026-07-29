import Foundation

public enum BetaTelemetryEvent: String, CaseIterable, Sendable {
    case dashboardViewed, analysisOpened, reportOpened, reportSectionExpanded
    case recommendationViewed, priorityExplanationViewed, rootCauseViewed, evidenceViewed
    case progressViewed, offlineReportViewed, resultShared, actionRequiredViewed
    case feedbackSubmitted, unsupportedContractEncountered
}
public struct BetaTelemetryContext: Equatable, Sendable {
    public let appVersion: String
    public let build: String
    public let environment: String
    public let screen: String
    public let correlationID: UUID
    public let offline: Bool
}
public protocol BetaTelemetry: Sendable {
    func record(_ event: BetaTelemetryEvent, context: BetaTelemetryContext)
}
public struct PrivacySafeBetaTelemetry: BetaTelemetry {
    private let logger: Logging
    public init(logger: Logging) { self.logger = logger }
    public func record(_ event: BetaTelemetryEvent, context: BetaTelemetryContext) {
        logger.event(event.rawValue, metadata: [
            "appVersion": context.appVersion, "build": context.build,
            "environment": context.environment, "screen": String(context.screen.prefix(100)),
            "correlationID": context.correlationID.uuidString, "offline": String(context.offline)
        ])
    }
}
