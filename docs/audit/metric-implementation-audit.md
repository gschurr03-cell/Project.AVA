# Metric implementation audit

## Inventory and status

| Metric family | Implementation | Scientific status |
| --- | --- | --- |
| FPS/timestamps | Probe, classification, source/analysis clocks | Engineering validated |
| Zone time / average velocity | Physical gate/calibration paths | Partial; coach review only |
| Step count/frequency | Contact/event segmentation | Fixture validated |
| Step/stride length | Calibration + pose displacement | Partial |
| Contact/flight time | Frame/timestamp events | Experimental/unvalidated |
| Trunk/knee/hip/ankle angles | 2D pose geometry | Unvalidated; non-diagnostic |
| Asymmetry | Side comparisons with trust gates | Fixture only |
| Peak/top velocity | Multiple definitions/insufficient reference | Hidden/not authoritative |
| Performance score | Derived presentation model | Not scientifically validated |
| Projection/PB potential | Deterministic experimental models | Not athlete-facing |

## Canonical policy

Every metric must persist definition/version, units, source FPS, analysis FPS, timestamp
source, calibration, model, warnings, confidence and availability. Missing/untrusted values
must be null/withheld—not zero. Histories compare only compatible definitions and
provenance. Metric implementation and scientific claim status are independent.

The worker mapper and newer measurement contracts improve provenance; legacy UI comments
and comparison paths still acknowledge zero placeholders and require consolidation.
