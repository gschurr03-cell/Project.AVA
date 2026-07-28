# Training session library

Nine versioned templates define acceleration, maximal velocity, speed endurance, tempo,
strength, recovery, competition, taper and testing sessions. Templates contain ordered
warm-up/preparation/primary/secondary/lifting/accessory/cooldown blocks, required/optional
slots, compatible/incompatible objectives, duration, multidimensional expected load and
facility/equipment requirements.

`buildSessionFromTemplate` deterministically filters catalog choices by objective, safety,
training age, facilities/equipment and feature gates, then uses historical usage and stable
ID ordering. It records selected alternatives and source IDs.

