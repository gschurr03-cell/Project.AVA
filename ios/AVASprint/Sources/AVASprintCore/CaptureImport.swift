import Foundation
#if os(iOS)
import AVFoundation
import PhotosUI
import UniformTypeIdentifiers
import UIKit

public final class SprintCaptureController:NSObject,@unchecked Sendable{
    public let session=AVCaptureSession()
    private let output=AVCaptureMovieFileOutput()
    public func configure60FPS()throws{
        session.beginConfiguration();defer{session.commitConfiguration()}
        guard let device=AVCaptureDevice.default(.builtInWideAngleCamera,for:.video,position:.back)
        else{throw CaptureError.cameraUnavailable}
        let input=try AVCaptureDeviceInput(device:device)
        guard session.canAddInput(input),session.canAddOutput(output)else{throw CaptureError.configurationFailed}
        session.addInput(input);session.addOutput(output);session.sessionPreset = .hd1920x1080
        guard let format=device.formats.first(where:{$0.videoSupportedFrameRateRanges.contains{$0.maxFrameRate>=60}})
        else{throw CaptureError.sixtyFPSUnavailable}
        try device.lockForConfiguration();device.activeFormat=format
        device.activeVideoMinFrameDuration=CMTime(value:1,timescale:60)
        device.activeVideoMaxFrameDuration=CMTime(value:1,timescale:60);device.unlockForConfiguration()
    }
    public func start(to url:URL,delegate:AVCaptureFileOutputRecordingDelegate){output.startRecording(to:url,recordingDelegate:delegate)}
    public func stop(){if output.isRecording{output.stopRecording()}}
    public enum CaptureError:Error{case cameraUnavailable,configurationFailed,sixtyFPSUnavailable}
}
public enum RuntimeCameraCapabilities {
    public static func evaluate() -> DeviceCaptureCapabilities {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera],
            mediaType: .video, position: .back)
        let devices = discovery.devices
        let formats = devices.flatMap { device in
            device.formats.map { format -> CameraFormatCapability in
                let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
                let ranges = format.videoSupportedFrameRateRanges
                return CameraFormatCapability(
                    identifier: "\(device.uniqueID):\(format.formatDescription.mediaSubType)",
                    width: Int(dimensions.width), height: Int(dimensions.height),
                    minimumFPS: ranges.map(\.minFrameRate).min() ?? 0,
                    maximumFPS: ranges.map(\.maxFrameRate).max() ?? 0,
                    codec: format.formatDescription.mediaSubType == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange ? "h264" : "hevc",
                    stabilizationSupported: format.isVideoStabilizationModeSupported(.standard),
                    hdrSupported: format.isVideoHDRSupported)
            }
        }
        let storage = (try? URL.applicationSupportDirectory.resourceValues(
            forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            .volumeAvailableCapacityForImportantUsage) ?? 0
        return DeviceCaptureCapabilities(
            modelIdentifier: UIDevice.current.model,
            cameraIdentifiers: devices.map(\.uniqueID), formats: formats,
            thermalState: String(ProcessInfo.processInfo.thermalState.rawValue),
            availableStorageBytes: storage)
    }
}
public enum MediaInspector{
    public static func inspect(url:URL,source:MediaSource)async throws->RecordingMetadata{
        let asset=AVURLAsset(url:url),tracks=try await asset.loadTracks(withMediaType:.video)
        guard let track=tracks.first else{throw NetworkFailure.validation}
        let size=try await track.load(.naturalSize),duration=try await asset.load(.duration)
        let nominal=try await track.load(.nominalFrameRate)
        let values=try url.resourceValues(forKeys:[.fileSizeKey])
        return RecordingMetadata(contractVersion:"ava-recording-v1",source:source,
          nominalFrameRate:Double(nominal),measuredFrameRate:nil,width:Int(abs(size.width)),height:Int(abs(size.height)),
          durationSeconds:duration.seconds,orientation:"derived_from_transform",codec:"inspected_by_backend",
          fileSizeBytes:Int64(values.fileSize ?? 0),captureDeviceModel:nil,stabilizationMode:nil)
    }
}

public enum VerifiedMediaInspector {
    public static func inspect(url: URL, maximumTimingSamples: Int = 300) async throws -> VerifiedMediaProperties {
        guard url.isFileURL else { throw NetworkFailure.validation }
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .creationDateKey])
        guard let fileSize = values.fileSize, fileSize > 0 else { throw NetworkFailure.validation }
        let asset = AVURLAsset(url: url)
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        guard let track = videoTracks.first else { throw NetworkFailure.validation }
        let audioPresent = !(try await asset.loadTracks(withMediaType: .audio)).isEmpty
        let natural = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let display = natural.applying(transform)
        let duration = try await asset.load(.duration).seconds
        let nominal = Double(try await track.load(.nominalFrameRate))
        guard duration.isFinite, duration > 0 else { throw NetworkFailure.validation }

        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else { throw NetworkFailure.decoding }
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? NetworkFailure.decoding }
        var timestamps: [Double] = []
        while timestamps.count < maximumTimingSamples, let sample = output.copyNextSampleBuffer() {
            let timestamp = CMSampleBufferGetPresentationTimeStamp(sample).seconds
            if timestamp.isFinite { timestamps.append(timestamp) }
        }
        reader.cancelReading()
        let intervals = zip(timestamps.dropFirst(), timestamps).map { current, previous in
            current - previous
        }
        let positive = intervals.filter { $0 > 0 }
        let mean = positive.isEmpty ? nil : positive.reduce(0, +) / Double(positive.count)
        let variance = mean.flatMap { average -> Double? in
            guard !positive.isEmpty else { return nil }
            return positive.reduce(0) { $0 + pow($1 - average, 2) } / Double(positive.count)
        }
        let measured = (timestamps.count > 1 && timestamps.last! > timestamps.first!)
            ? Double(timestamps.count - 1) / (timestamps.last! - timestamps.first!) : nil
        let variation = mean.flatMap { average in
            guard average > 0, let variance else { return nil }
            return sqrt(variance) / average
        }
        let formatDescriptions = try await track.load(.formatDescriptions)
        let codec = formatDescriptions.first.map { codecName(CMFormatDescriptionGetMediaSubType($0)) } ?? "unknown"
        let orientation = abs(display.width) >= abs(display.height) ? "landscape" : "portrait"
        return VerifiedMediaProperties(
            width: Int(abs(display.width)), height: Int(abs(display.height)),
            naturalWidth: Int(abs(natural.width)), naturalHeight: Int(abs(natural.height)),
            nominalFPS: nominal, measuredFPS: measured,
            minimumFrameDurationSeconds: positive.min(), timingVariationRatio: variation,
            durationSeconds: duration,
            estimatedFrameCount: measured.map { Int(($0 * duration).rounded()) },
            codec: codec, orientation: orientation, fileSizeBytes: Int64(fileSize),
            audioTrackPresent: audioPresent, readable: true, creationDate: values.creationDate)
    }
    private static func codecName(_ value: FourCharCode) -> String {
        switch value {
        case kCMVideoCodecType_H264: return "h264"
        case kCMVideoCodecType_HEVC: return "hevc"
        default:
            let bytes: [UInt8] = [
                UInt8((value >> 24) & 0xff), UInt8((value >> 16) & 0xff),
                UInt8((value >> 8) & 0xff), UInt8(value & 0xff)
            ]
            return String(bytes: bytes, encoding: .ascii) ?? "unknown"
        }
    }
}
#endif
