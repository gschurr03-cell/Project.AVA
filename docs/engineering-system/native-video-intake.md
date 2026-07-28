# Native video intake

Existing AVFoundation inspection reads dimensions, transform/orientation, duration, nominal
FPS, sampled timestamps/measured FPS, timing variation, codec, file size and audio presence
off the main actor. SHA-256 is streamed rather than loading the video into memory.

Eligibility uses the existing server-aligned capture protocol: supported H.264/HEVC video,
duration/size/resolution/orientation limits and the 60 FPS-class policy. Passing intake means
only that the file is technically supported. Recording-quality analysis, scientific metric
eligibility and successful biomechanics analysis remain separate server-authoritative
outcomes.

Platform picker/camera UI requires full Xcode and remains unvalidated. Selected files must be
copied into the account-scoped app container before durable upload state is created.
