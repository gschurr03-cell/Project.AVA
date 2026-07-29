import Foundation

public struct CameraFormatCapability: Codable, Equatable, Sendable {
    public let identifier: String
    public let width: Int
    public let height: Int
    public let minimumFPS: Double
    public let maximumFPS: Double
    public let codec: String
    public let stabilizationSupported: Bool
    public let hdrSupported: Bool
    public init(identifier: String, width: Int, height: Int, minimumFPS: Double,
                maximumFPS: Double, codec: String, stabilizationSupported: Bool,
                hdrSupported: Bool) {
        self.identifier = identifier; self.width = width; self.height = height
        self.minimumFPS = minimumFPS; self.maximumFPS = maximumFPS; self.codec = codec
        self.stabilizationSupported = stabilizationSupported; self.hdrSupported = hdrSupported
    }
}

public struct DeviceCaptureCapabilities: Codable, Equatable, Sendable {
    public let modelIdentifier: String
    public let cameraIdentifiers: [String]
    public let formats: [CameraFormatCapability]
    public let thermalState: String
    public let availableStorageBytes: Int64
    public init(modelIdentifier: String, cameraIdentifiers: [String],
                formats: [CameraFormatCapability], thermalState: String,
                availableStorageBytes: Int64) {
        self.modelIdentifier = modelIdentifier; self.cameraIdentifiers = cameraIdentifiers
        self.formats = formats; self.thermalState = thermalState
        self.availableStorageBytes = availableStorageBytes
    }
}

public struct CaptureFormatPolicy: Codable, Equatable, Sendable {
    public let preferredWidth: Int
    public let preferredHeight: Int
    public let minimumWidth: Int
    public let minimumHeight: Int
    public let requiredFPS: Double
    public let permittedCodecs: Set<String>
    public let stabilizationRequired: Bool
    public static let sprintV1 = CaptureFormatPolicy(
        preferredWidth: 1920, preferredHeight: 1080, minimumWidth: 1280,
        minimumHeight: 720, requiredFPS: 60, permittedCodecs: ["h264", "hevc"],
        stabilizationRequired: false
    )
}

public enum CaptureFormatSelection: Equatable, Sendable {
    case preferred(CameraFormatCapability)
    case lowerResolution(CameraFormatCapability)
    case unsupported(reason: String)
}

public enum CaptureFormatSelector {
    public static func select(formats: [CameraFormatCapability],
                              policy: CaptureFormatPolicy) -> CaptureFormatSelection {
        let eligible = formats.filter {
            $0.maximumFPS >= policy.requiredFPS &&
            $0.width >= policy.minimumWidth && $0.height >= policy.minimumHeight &&
            policy.permittedCodecs.contains($0.codec.lowercased()) &&
            (!policy.stabilizationRequired || $0.stabilizationSupported)
        }.sorted {
            let leftPreferred = $0.width >= policy.preferredWidth && $0.height >= policy.preferredHeight
            let rightPreferred = $1.width >= policy.preferredWidth && $1.height >= policy.preferredHeight
            if leftPreferred != rightPreferred { return leftPreferred }
            if $0.width * $0.height != $1.width * $1.height {
                return $0.width * $0.height > $1.width * $1.height
            }
            if $0.maximumFPS != $1.maximumFPS { return $0.maximumFPS > $1.maximumFPS }
            return $0.identifier < $1.identifier
        }
        guard let selected = eligible.first else {
            return .unsupported(reason: "No rear-camera format meets 60 FPS, resolution, and codec requirements.")
        }
        if selected.width >= policy.preferredWidth && selected.height >= policy.preferredHeight {
            return .preferred(selected)
        }
        return .lowerResolution(selected)
    }
}

public struct CaptureProtocol: Codable, Equatable, Sendable {
    public let id: String
    public let version: Int
    public let backendCompatibilityVersion: String
    public let analysisType: String
    public let cameraAngle: String
    public let orientation: String
    public let minimumFPS: Double
    public let preferredFPS: Double
    public let minimumWidth: Int
    public let minimumHeight: Int
    public let preferredWidth: Int
    public let preferredHeight: Int
    public let permittedCodecs: Set<String>
    public let calibrationMethod: String
    public let expectedZoneLayout: String
    public let minimumDurationSeconds: Double
    public let maximumDurationSeconds: Double
    public let maximumFileBytes: Int64
    public let guidanceSteps: [String]
    public static let sideViewSprintV1 = CaptureProtocol(
        id: "ava.side-view-sprint", version: 1, backendCompatibilityVersion: "ava-mobile-v1",
        analysisType: "sprint", cameraAngle: "lateral_side_view", orientation: "landscape",
        minimumFPS: 59, preferredFPS: 60, minimumWidth: 1280, minimumHeight: 720,
        preferredWidth: 1920, preferredHeight: 1080, permittedCodecs: ["h264", "hevc"],
        calibrationMethod: "visible_physical_gates", expectedZoneLayout: "full_measured_zone",
        minimumDurationSeconds: 2, maximumDurationSeconds: 60, maximumFileBytes: 1_500_000_000,
        guidanceSteps: [
            "Mount the rear camera horizontally at approximately hip height.",
            "Keep the full sprint and calibration zone visible with no digital zoom.",
            "Use even lighting and strong athlete-to-background contrast.",
            "Keep the phone stationary and record the athlete from the side.",
            "Start before the athlete enters and stop after the athlete exits."
        ])
}

public struct RequestedCaptureProperties: Codable, Equatable, Sendable {
    public let captureProtocolID: String
    public let captureProtocolVersion: Int
    public let width: Int
    public let height: Int
    public let framesPerSecond: Double
    public let codec: String
    public let stabilization: String
    public let selectedFormatIdentifier: String
    public let orientation: String
    public init(captureProtocolID: String, captureProtocolVersion: Int, width: Int,
                height: Int, framesPerSecond: Double, codec: String, stabilization: String,
                selectedFormatIdentifier: String, orientation: String) {
        self.captureProtocolID = captureProtocolID
        self.captureProtocolVersion = captureProtocolVersion
        self.width = width; self.height = height; self.framesPerSecond = framesPerSecond
        self.codec = codec; self.stabilization = stabilization
        self.selectedFormatIdentifier = selectedFormatIdentifier
        self.orientation = orientation
    }
}

public struct VerifiedMediaProperties: Codable, Equatable, Sendable {
    public let width: Int
    public let height: Int
    public let naturalWidth: Int?
    public let naturalHeight: Int?
    public let nominalFPS: Double
    public let measuredFPS: Double?
    public let minimumFrameDurationSeconds: Double?
    public let timingVariationRatio: Double?
    public let durationSeconds: Double
    public let estimatedFrameCount: Int?
    public let codec: String
    public let orientation: String
    public let fileSizeBytes: Int64
    public let audioTrackPresent: Bool
    public let readable: Bool
    public let creationDate: Date?
    public init(width: Int, height: Int, naturalWidth: Int? = nil, naturalHeight: Int? = nil,
                nominalFPS: Double, measuredFPS: Double?,
                minimumFrameDurationSeconds: Double? = nil, timingVariationRatio: Double?,
                durationSeconds: Double,
                estimatedFrameCount: Int?, codec: String, orientation: String,
                fileSizeBytes: Int64, audioTrackPresent: Bool, readable: Bool,
                creationDate: Date?) {
        self.width = width; self.height = height; self.nominalFPS = nominalFPS
        self.naturalWidth = naturalWidth; self.naturalHeight = naturalHeight
        self.measuredFPS = measuredFPS; self.timingVariationRatio = timingVariationRatio
        self.minimumFrameDurationSeconds = minimumFrameDurationSeconds
        self.durationSeconds = durationSeconds; self.estimatedFrameCount = estimatedFrameCount
        self.codec = codec; self.orientation = orientation; self.fileSizeBytes = fileSizeBytes
        self.audioTrackPresent = audioTrackPresent; self.readable = readable
        self.creationDate = creationDate
    }
}

public enum RecordingQualityClass: String, Codable, Sendable {
    case preferred, acceptable, reducedConfidence, unsupported, corrupt, verificationIncomplete
}
public enum RecordingQualityReason: String, Codable, Sendable {
    case verifiedPreferred, lowerResolution, variableFrameRate, irregularTiming
    case belowMinimumFrameRate, unsupportedCodec, unsupportedOrientation, durationOutOfRange
    case oversized, unreadable, missingVideoTrack, zeroByte, incompleteMetadata
}
public struct RecordingQuality: Codable, Equatable, Sendable {
    public let classification: RecordingQualityClass
    public let reasons: [RecordingQualityReason]
    public let uploadAllowed: Bool
    public let analysisAllowed: Bool
    public let requiresAcknowledgement: Bool
    public let explanation: String
}

public enum RecordingQualityVerifier {
    public static func classify(_ media: VerifiedMediaProperties?,
                                protocol captureProtocol: CaptureProtocol) -> RecordingQuality {
        guard let media else {
            return result(.verificationIncomplete, [.incompleteMetadata], false, false, false,
                          "Recording verification did not finish.")
        }
        guard media.readable else {
            return result(.corrupt, [.unreadable], false, false, false,
                          "The recording cannot be read.")
        }
        guard media.fileSizeBytes > 0 else {
            return result(.corrupt, [.zeroByte], false, false, false,
                          "The recording file is empty.")
        }
        var blocking: [RecordingQualityReason] = []
        let fps = media.measuredFPS ?? media.nominalFPS
        if fps < captureProtocol.minimumFPS { blocking.append(.belowMinimumFrameRate) }
        if !captureProtocol.permittedCodecs.contains(media.codec.lowercased()) { blocking.append(.unsupportedCodec) }
        if media.orientation != captureProtocol.orientation { blocking.append(.unsupportedOrientation) }
        if !(captureProtocol.minimumDurationSeconds...captureProtocol.maximumDurationSeconds).contains(media.durationSeconds) {
            blocking.append(.durationOutOfRange)
        }
        if media.fileSizeBytes > captureProtocol.maximumFileBytes { blocking.append(.oversized) }
        if !blocking.isEmpty {
            return result(.unsupported, blocking, false, false, false,
                          "This recording does not meet AVA's capture requirements.")
        }
        var warnings: [RecordingQualityReason] = []
        if media.width < captureProtocol.preferredWidth || media.height < captureProtocol.preferredHeight {
            warnings.append(.lowerResolution)
        }
        if let variation = media.timingVariationRatio, variation > 0.05 {
            warnings.append(.irregularTiming)
        } else if media.measuredFPS != nil, abs(media.nominalFPS - fps) > 0.25 {
            warnings.append(.variableFrameRate)
        }
        if !warnings.isEmpty {
            return result(.reducedConfidence, warnings, true, true, true,
                          "AVA can analyze this recording with reduced recording confidence.")
        }
        let preferred = media.width >= captureProtocol.preferredWidth &&
            media.height >= captureProtocol.preferredHeight && fps >= captureProtocol.preferredFPS - 0.1
        return result(preferred ? .preferred : .acceptable,
                      [preferred ? .verifiedPreferred : .lowerResolution], true, true, false,
                      preferred ? "Recording verified for AVA analysis." : "Recording is acceptable for AVA analysis.")
    }
    private static func result(_ classification: RecordingQualityClass,
                               _ reasons: [RecordingQualityReason], _ upload: Bool,
                               _ analysis: Bool, _ acknowledgement: Bool,
                               _ explanation: String) -> RecordingQuality {
        RecordingQuality(classification: classification, reasons: reasons,
                         uploadAllowed: upload, analysisAllowed: analysis,
                         requiresAcknowledgement: acknowledgement, explanation: explanation)
    }
}
