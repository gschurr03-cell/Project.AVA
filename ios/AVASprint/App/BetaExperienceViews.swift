#if os(iOS)
import SwiftUI
import AVASprintCore

struct BetaExperienceView: View {
    let package: MobileBetaResultPackage?
    var body: some View {
        TabView {
            NavigationStack { HomeDashboardScreen(package: package) }
                .tabItem { Label("Home", systemImage: "house") }
            NavigationStack { AnalyzeScreen(package: package) }
                .tabItem { Label("Analyze", systemImage: "video") }
            NavigationStack { ProgressScreen(package: package) }
                .tabItem { Label("Progress", systemImage: "chart.line.uptrend.xyaxis") }
            NavigationStack { CoachingScreen(package: package) }
                .tabItem { Label("Coaching", systemImage: "figure.run") }
            NavigationStack { ProfileScreen() }
                .tabItem { Label("Profile", systemImage: "person") }
        }
        .tint(AVATheme.brand)
        .preferredColorScheme(.dark)
    }
}

struct HomeDashboardScreen: View {
    let package: MobileBetaResultPackage?
    var body: some View {
        BetaPage(title: "Home") {
            if let value = package?.home {
                if value.stale { OfflineBanner(lastSync: value.lastSynchronizedAt) }
                if let action = value.actionRequired {
                    BetaCard(title: "Action required", systemImage: "exclamationmark.circle") {
                        Text(action)
                    }
                }
                BetaCard(title: "Current focus", systemImage: "scope") {
                    Text(value.currentFocus ?? "No current focus is available.")
                }
                BetaCard(title: "Highest-priority opportunity", systemImage: "arrow.up.right") {
                    Text(value.highestPriority ?? "Not available")
                    if let change = value.recentChange {
                        LabeledText(label: "Recent change", value: change)
                    }
                }
                BetaCard(title: "Latest analysis", systemImage: "waveform.path.ecg") {
                    Text(value.latestAnalysisStatus)
                    if let next = value.nextAssessment {
                        LabeledText(label: "Next assessment", value: next)
                    }
                }
                if let package {
                    NavigationLink("Open Coach Report") {
                        CoachReportScreen(report: package.report, observations: package.observations,
                            rootCauses: package.rootCauses, evidence: package.evidence,
                            benchmark: package.benchmark, projection: package.projection,
                            digitalTwin: package.digitalTwin)
                    }.buttonStyle(.borderedProminent)
                }
            } else {
                BetaEmptyState(title: "No synchronized results",
                               message: "Complete an analysis or reconnect to synchronize an activated report.",
                               systemImage: "tray")
            }
        }
    }
}

struct AnalyzeScreen: View {
    let package: MobileBetaResultPackage?
    var body: some View {
        BetaPage(title: "Analysis history") {
            if let history = package?.history, !history.isEmpty {
                ForEach(history) { item in
                    BetaCard(title: item.analysisType, systemImage: "figure.run") {
                        LabeledText(label: "Submitted", value: item.submittedAt.formatted(date: .abbreviated, time: .shortened))
                        LabeledText(label: "Status", value: item.processingStatus)
                        LabeledText(label: "Protocol", value: item.captureProtocol)
                        LabeledText(label: "Recording", value: item.recordingQuality.rawValue)
                        if let action = item.actionRequired { Text(action).accessibilityLabel("Action required: \(action)") }
                    }
                }
            } else {
                BetaEmptyState(title: "No analyses", message: "Your submitted analyses will appear here.",
                               systemImage: "clock.arrow.circlepath")
            }
        }
    }
}

struct CoachReportScreen: View {
    let report: CoachReportViewModel
    let observations: [ObservationViewModel]
    let rootCauses: [RootCauseViewModel]
    let evidence: [EvidenceViewModel]
    let benchmark: BenchmarkViewModel?
    let projection: ProjectionViewModel?
    let digitalTwin: [DigitalTwinDomain]
    var body: some View {
        BetaPage(title: report.title) {
            BetaCard(title: "Executive summary", systemImage: "doc.text") {
                Text(report.executiveSummary)
                ConfidenceView(confidence: report.confidence)
            }
            ReportListSection(title: "Key findings", values: report.findings)
            ReportListSection(title: "Strengths", values: report.strengths)
            ReportListSection(title: "Performance limiters", values: report.limiters)
            ReportListSection(title: "Current priorities", values: report.priorities)
            ForEach(observations) { ObservationCard(observation: $0) }
            ForEach(rootCauses) { RootCauseCard(rootCause: $0) }
            ReportListSection(title: "Unknowns", values: report.unknowns)
            ReportListSection(title: "Evidence requests", values: report.evidenceRequests)
            if !evidence.isEmpty {
                DisclosureGroup("Evidence") {
                    ForEach(evidence) { item in
                        VStack(alignment: .leading, spacing: AVATheme.spacingSmall) {
                            Text(item.title).font(.headline)
                            LabeledText(label: "Applicability", value: item.applicability)
                            LabeledText(label: "Limitations", value: item.limitations.joined(separator: " "))
                        }.padding(.vertical, AVATheme.spacingSmall)
                    }
                }.accessibilityAddTraits(.isHeader)
            }
            if let benchmark {
                BetaCard(title: "Benchmark context", systemImage: "person.2") {
                    LabeledText(label: "Comparison", value: benchmark.comparisonPopulation)
                    LabeledText(label: "Applicability", value: benchmark.applicability)
                    ReportListSection(title: "Limitations", values: benchmark.limitations)
                    ConfidenceView(confidence: benchmark.confidence)
                }
            }
            if let projection {
                BetaCard(title: "Performance projection", systemImage: "chart.line.uptrend.xyaxis") {
                    LabeledText(label: "Current measurement", value: projection.measuredPerformance)
                    LabeledText(label: "Expected range", value: projection.expectedRange)
                    LabeledText(label: "Time horizon", value: projection.timeHorizon)
                    Text(projection.uncertaintyStatement).font(.footnote)
                    ConfidenceView(confidence: projection.confidence)
                }
            }
            ForEach(digitalTwin) { domain in
                BetaCard(title: "Digital Twin · \(domain.title)", systemImage: "person.text.rectangle") {
                    ReportListSection(title: "Strengths", values: domain.strengths)
                    ReportListSection(title: "Current patterns", values: domain.currentPatterns)
                    ReportListSection(title: "Resolved patterns", values: domain.resolvedPatterns)
                    ReportListSection(title: "Evidence gaps", values: domain.evidenceGaps)
                }
            }
            BetaCard(title: "Version and provenance", systemImage: "checkmark.seal") {
                LabeledText(label: "Report version", value: report.provenance.contractVersion)
                LabeledText(label: "Generated", value: report.provenance.generatedAt.formatted())
            }
        }
    }
}

struct CoachingScreen: View {
    let package: MobileBetaResultPackage?
    var body: some View {
        BetaPage(title: "Coaching") {
            if let package {
                ForEach(package.recommendations) { recommendation in
                    BetaCard(title: recommendation.title, systemImage: "target") {
                        StatusText(recommendation.status.rawValue)
                        Text(recommendation.purpose)
                        LabeledText(label: "Why", value: recommendation.rationale)
                        ReportListSection(title: "Priority factors", values: recommendation.priorityExplanation)
                        if !recommendation.associatedMuscleGroups.isEmpty {
                            LabeledText(label: "Associated muscle groups",
                                        value: recommendation.associatedMuscleGroups.joined(separator: ", "))
                            Text("Association does not confirm muscular weakness.")
                                .font(.footnote).foregroundStyle(AVATheme.secondary)
                        }
                        ConfidenceView(confidence: recommendation.confidence)
                    }
                }
                if let optimization = package.optimization {
                    BetaCard(title: "Best use of training capacity", systemImage: "gauge.with.dots.needle.67percent") {
                        Text(optimization.selectedOpportunity).font(.headline)
                        Text(optimization.rationale)
                        LabeledText(label: "Expected upside", value: optimization.expectedUpside)
                        LabeledText(label: "Opportunity costs", value: optimization.opportunityCosts.joined(separator: " "))
                        ConfidenceView(confidence: optimization.confidence)
                    }
                }
                if let coaching = package.coachingState {
                    BetaCard(title: "Adaptive Coaching State", systemImage: "arrow.triangle.2.circlepath") {
                        ReportListSection(title: "Current focus", values: coaching.currentFocus)
                        ReportListSection(title: "Maintenance", values: coaching.maintenance)
                        ReportListSection(title: "Monitoring", values: coaching.monitoring)
                        ReportListSection(title: "Retired", values: coaching.retired)
                        ForEach(coaching.changes) { change in
                            LabeledText(label: change.title, value: change.reason)
                        }
                    }
                }
            } else {
                BetaEmptyState(title: "No coaching state", message: "Coaching appears after an activated result is synchronized.",
                               systemImage: "figure.run")
            }
        }
    }
}

struct ProgressScreen: View {
    let package: MobileBetaResultPackage?
    var body: some View {
        BetaPage(title: "Progress") {
            if let series = package?.progress, !series.isEmpty {
                ForEach(series) { item in
                    BetaCard(title: item.metric, systemImage: "chart.xyaxis.line") {
                        StatusText(item.trend.rawValue)
                        Text(item.trendExplanation)
                        Text(item.accessibleSummary).accessibilityLabel(item.accessibleSummary)
                        ForEach(item.points) { point in
                            HStack {
                                Text(point.date.formatted(date: .abbreviated, time: .omitted))
                                Spacer()
                                Text("\(point.value.formatted()) \(point.unit)")
                            }
                            if !point.comparable {
                                Text(point.comparabilityReason ?? "Not comparable")
                                    .font(.footnote).accessibilityLabel("Not comparable. \(point.comparabilityReason ?? "")")
                            }
                        }
                    }
                }
            } else {
                BetaEmptyState(title: "Insufficient history",
                               message: "Comparable activated analyses are required before a trend can be shown.",
                               systemImage: "chart.line.downtrend.xyaxis")
            }
        }
    }
}

struct ProfileScreen: View {
    var body: some View {
        BetaPage(title: "Profile") {
            BetaCard(title: "Athlete profile", systemImage: "person.crop.circle") {
                Text("Profile editing requires the versioned mobile account endpoint.")
                Text("Digital Twin conclusions cannot be edited from the app.")
                    .font(.footnote).foregroundStyle(AVATheme.secondary)
            }
        }
    }
}

struct ObservationCard: View {
    let observation: ObservationViewModel
    var body: some View {
        BetaCard(title: "Finding", systemImage: "waveform.path") {
            LabeledText(label: "Measured", value: observation.measured)
            if let interpretation = observation.interpretation {
                LabeledText(label: "Interpretation", value: interpretation)
            }
            LabeledText(label: "Associated factors", value: observation.associatedFactors.joined(separator: " "))
            LabeledText(label: "Unknown", value: observation.unknowns.joined(separator: " "))
            ConfidenceView(confidence: observation.confidence)
        }
    }
}
struct RootCauseCard: View {
    let rootCause: RootCauseViewModel
    var body: some View {
        BetaCard(title: "Possible contributing factor", systemImage: "point.3.connected.trianglepath.dotted") {
            LabeledText(label: "Movement pattern", value: rootCause.movementPattern)
            LabeledText(label: "Hypothesis", value: rootCause.hypothesis)
            LabeledText(label: "Associated muscle groups", value: rootCause.associatedMuscleGroups.joined(separator: ", "))
            LabeledText(label: "Competing hypotheses", value: rootCause.competingHypotheses.joined(separator: " "))
            LabeledText(label: "Limit", value: rootCause.diagnosisLimitation)
            ConfidenceView(confidence: rootCause.confidence)
        }
    }
}
struct ConfidenceView: View {
    let confidence: ConfidenceViewModel
    var body: some View {
        DisclosureGroup("Confidence: \(confidence.level.rawValue)") {
            Text(confidence.explanation)
            ReportListSection(title: "Contributing factors", values: confidence.factors)
            ReportListSection(title: "Limitations", values: confidence.limitations)
        }.accessibilityLabel("Confidence \(confidence.level.rawValue). \(confidence.explanation)")
    }
}
struct OfflineBanner: View {
    let lastSync: Date?
    var body: some View {
        Label(lastSync.map { "Offline copy from \($0.formatted())" } ?? "Offline copy",
              systemImage: "wifi.slash")
            .frame(maxWidth: .infinity, alignment: .leading).padding()
            .background(AVATheme.surface).clipShape(RoundedRectangle(cornerRadius: AVATheme.radius))
    }
}
struct BetaPage<Content: View>: View {
    let title: String
    let content: Content
    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title; self.content = content()
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: AVATheme.spacing) { content }
                .padding()
        }.background(AVATheme.background.ignoresSafeArea()).navigationTitle(title)
    }
}
struct BetaCard<Content: View>: View {
    let title: String
    let systemImage: String
    let content: Content
    init(title: String, systemImage: String, @ViewBuilder content: () -> Content) {
        self.title = title; self.systemImage = systemImage; self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: AVATheme.spacingSmall) {
            Label(title, systemImage: systemImage).font(.headline).accessibilityAddTraits(.isHeader)
            content
        }.frame(maxWidth: .infinity, alignment: .leading).padding()
            .background(AVATheme.surface).clipShape(RoundedRectangle(cornerRadius: AVATheme.radius))
    }
}
struct ReportListSection: View {
    let title: String
    let values: [String]
    var body: some View {
        if !values.isEmpty {
            VStack(alignment: .leading, spacing: AVATheme.spacingSmall) {
                Text(title).font(.headline).accessibilityAddTraits(.isHeader)
                ForEach(Array(values.enumerated()), id: \.offset) { pair in
                    Label(pair.element, systemImage: "circle.fill").labelStyle(BulletLabelStyle())
                }
            }
        }
    }
}
struct LabeledText: View {
    let label: String, value: String
    var body: some View { Text(label + ": ").bold() + Text(value) }
}
struct StatusText: View {
    let value: String
    init(_ value: String) { self.value = value }
    var body: some View {
        Label(value, systemImage: "info.circle").font(.subheadline)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(AVATheme.status).clipShape(Capsule())
    }
}
struct BetaEmptyState: View {
    let title: String, message: String, systemImage: String
    var body: some View {
        ContentUnavailableView(title, systemImage: systemImage, description: Text(message))
    }
}
struct BulletLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline) {
            configuration.icon.font(.system(size: 5)); configuration.title
        }
    }
}
enum AVATheme {
    static let background = Color(red: 0.035, green: 0.035, blue: 0.045)
    static let surface = Color(red: 0.09, green: 0.09, blue: 0.11)
    static let brand = Color(red: 0.84, green: 0.15, blue: 0.22)
    static let secondary = Color(red: 0.68, green: 0.69, blue: 0.72)
    static let status = Color.white.opacity(0.10)
    static let spacing: CGFloat = 16
    static let spacingSmall: CGFloat = 8
    static let radius: CGFloat = 16
}
#endif
