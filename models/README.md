# Model integrations

Each provider folder should hold provider-specific instructions, an adapter, capability metadata, and tests as integration matures.

The shared core must not assume every provider has the same context window, tools, pricing, authentication, or output format. Only advertise capabilities after they are configured and tested.

Current GPT and Grok adapters are interface-only placeholders. Additional provider folders should be added when implementation work begins.
