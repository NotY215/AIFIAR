# Routing and parallelism

```mermaid
flowchart TD
 A[Task graph] --> B[Validate dependencies]
 B --> C[Find ready tasks]
 C --> D[Filter models by capability and policy]
 D --> E[Estimate latency and cost]
 E --> F{Parallel work beneficial and safe?}
 F -->|Yes| G[Run independent tasks concurrently]
 F -->|No| H[Choose one suitable candidate]
 G --> I[Collect results]
 H --> I
 I --> J[Validate outputs and dependencies]
 J --> C
```

Routing signals include task kind, tool access, context needs, provider availability, rate limits, budget, privacy rules, and evaluated performance on similar tasks. Do not assume a model is best because of its brand or name.

Do not let multiple agents edit the same shared working tree concurrently. Prefer isolated worktrees or patch proposals. Parallelism can reduce latency but can increase total tokens and cost. Model consensus is not a substitute for source evidence or tests.
