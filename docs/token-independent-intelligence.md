# Token-independent intelligence policy

AVA’s core coaching experience must operate with zero token-priced inference.

The Adaptive Coaching Engine is pure TypeScript with:

- no OpenAI, Anthropic, Gemini, Claude, GPT, or chatbot SDK;
- no prompts;
- no athlete-history transmission to a language model;
- no randomness;
- no network I/O;
- no generated free-form coaching;
- deterministic template explanations and notifications.

Each `CoachingState` asserts:

- server evaluation;
- cached serving on app open;
- zero external model calls;
- deterministic fallback availability.

Persistence rejects a state whose external-model-call count is not zero.

Optional future language capabilities must live outside this package, remain disabled by
default, be provider-agnostic, capped, cached, replaceable, and have a deterministic
fallback. `optionalLlmCoaching` is a separate feature flag and is false by default.

Disabling every external AI provider must not affect focus selection, priority evolution,
reports, recommendations, trends, benchmarks, Digital Twin history, caching, offline
state viewing, or deterministic notifications.

