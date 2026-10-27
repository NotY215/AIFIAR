# Model integrations and model-specific guidance

Each provider folder may contain provider instructions, an adapter, capability metadata, and tests as the integration matures. Model-specific instruction folders are advisory workflow profiles, not platform policies or proof of a model's capabilities.

## Current provider folders

- `models/gpt/`: shared GPT workflow guidance and model-family profiles.
- `models/grok/`: AIFIAR-specific Grok workflow guidance.
- `models/PROVIDER_TEMPLATE.md`: starting point for future provider integrations.

The shared core must not assume every provider has the same context window, tools, pricing, authentication, or output format. Advertise capabilities only after the specific runtime/model configuration is verified.

The GPT model profiles cover the families requested by the project maintainer: GPT-5, GPT-5.5, GPT-5.6, GPT-6, and Astra Pro. The exact model active in a ChatGPT session may not be visible to an external repository reader. If it is not confirmed, use the shared `models/gpt/INSTRUCTIONS.md` and do not guess which version-specific file applies.

GPT and Grok adapter files in this repository are interface-only placeholders unless the implementation and tests show otherwise. Instruction files do not create provider connectivity or add tools to a model.
