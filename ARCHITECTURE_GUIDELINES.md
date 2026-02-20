# Architecture Guidelines – Reserva el Día

This document defines mandatory architectural and product principles.
All features, refactors and architectural decisions must respect these rules.

The goal is to build a scalable, premium, and simple creative SaaS platform.

---

# 1. Product Philosophy

## 1.1 Radical Simplicity
- The product must feel simple even if the internal system is complex.
- The user should never see technical complexity.
- Advanced options must be progressively disclosed.

## 1.2 Premium Experience
- Every visual detail matters.
- Avoid generic-looking UI patterns.
- Maintain elegance and visual consistency.

## 1.3 Guided Over Manual
- Prefer guided flows and smart defaults over large configuration panels.
- Users should rarely face empty states without direction.

---

# 2. Architectural Principles

## 2.1 Modular Architecture (Mandatory)
- No complex logic inside large UI components.
- Extract logic into hooks, services, or utilities.
- Keep UI components focused on rendering only.
- Business logic must be isolated.

## 2.2 Separation of Concerns
- UI Layer: rendering and interaction only.
- State Layer: state management and synchronization.
- Domain Layer: business logic and transformations.
- Infrastructure Layer: Firebase, storage, APIs.

Never mix layers unnecessarily.

## 2.3 Scalability First
- No temporary hacks.
- Every feature must support future extensibility.
- Code must be written assuming templates, users and features will multiply.

---

# 3. Editor-Specific Rules

## 3.1 Canvas Stability
- The editor must remain predictable.
- Avoid hidden side effects.
- All transformations must be explicit and traceable.

## 3.2 Global Feature Control
- Animations and visual effects must be globally configurable.
- Nothing hardcoded inside templates without control flags.

## 3.3 Performance Discipline
- Avoid unnecessary re-renders.
- Avoid heavy computations inside render cycles.
- Use memoization when needed.

## 3.4 Mobile First Behavior
- Design mobile-first.
- Reflow logic must prioritize readability over visual complexity.
- Do not add visual effects that harm mobile performance.

---

# 4. Data & Backend Principles

## 4.1 Firestore Structure Discipline
- Collections must be predictable and normalized.
- Avoid deeply nested unpredictable structures.
- Data must be versionable when necessary.

## 4.2 HTML Generation
- Generated HTML must be clean and minimal.
- No unnecessary inline logic.
- Output must be production-ready and lightweight.

## 4.3 Security First
- All data access must respect user ownership.
- Never expose unnecessary data to the client.
- Storage paths must be user-scoped.

---

# 5. UX & Design Standards

## 5.1 Progressive Disclosure
- Show basic options first.
- Reveal advanced options only when necessary.

## 5.2 Smart Defaults
- Always prefer intelligent default values.
- Avoid forcing users to make trivial decisions.

## 5.3 Feedback & Micro-Interactions
- Provide subtle but clear feedback.
- Animations must enhance clarity, not decoration.

---

# 6. Dependency Policy

## 6.1 Minimize Dependencies
- Do not introduce external libraries without strong justification.
- Each dependency must reduce complexity, not increase it.

## 6.2 Long-Term Viability
- Avoid niche or poorly maintained libraries.
- Prefer stable, widely adopted solutions.

---

# 7. Code Quality Standards

## 7.1 Clarity Over Cleverness
- Write readable code.
- Avoid cryptic abstractions.

## 7.2 No Duplication
- Reuse utilities.
- Abstract repeated patterns.

## 7.3 Naming Discipline
- Descriptive names.
- No generic variables like "data", "item", "value" without context.

---

# 8. Decision Priority Order

When facing trade-offs, follow this order:

1. UX Simplicity
2. Mobile Performance
3. Scalability
4. Code Maintainability
5. Developer Convenience

Never invert this order without explicit justification.