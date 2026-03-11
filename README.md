# Context UI

A framework-agnostic, TypeScript-first engine for building dynamic radial context interfaces. Elements are registered with a relevance vector and a developer-defined algorithm determines which elements surface around an anchor point based on a shared context state.

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Implementation Guide](#implementation-guide)
  - [Vanilla TypeScript](#vanilla-typescript)
  - [React](#react)
  - [Svelte](#svelte)
- [API Reference](#api-reference)
  - [ContextUI Class](#contextui-class)
  - [ContextUIConfig](#contextuiconfig)
  - [RelevanceResult](#relevanceresult)
  - [useContextUI (React)](#usecontextui-react)
  - [contextUIAnchor (Svelte)](#contextuianchor-svelte)
  - [contextUIElement (Svelte)](#contextui-element-svelte)
- [Design Suggestions](#design-suggestions)
- [Contributing: Writing a Framework Wrapper](#contributing-writing-a-framework-wrapper)

---

## Overview

Context UI decouples two concerns that are typically entangled in adaptive interface implementations: the state of the world (context) and the conditions under which a UI element is relevant (relevance vector). You define both shapes via TypeScript generics. The engine handles slot allocation, radial positioning, animated entry and exit, and DOM lifecycle.

The radial layout places active elements at evenly distributed angles around an anchor element. Up to `maxSlots` elements can be simultaneously visible, each occupying one angular position on the circle defined by `radius`.

---

## Project Structure

```
.
├── package-lock.json
├── package.json
├── src
│   ├── core.ts       # Framework-agnostic engine class
│   ├── react.ts      # React hook wrapper
│   └── svelte.ts     # Svelte action wrappers
├── tsconfig.json
└── tsup.config.ts
```

The build produces three independent entry points under `dist/`, each available as both ESM and CJS with bundled type declarations.

---

## Installation

```bash
npm install context-ui
```

React and Svelte integrations are available as sub-path exports. The peer dependencies for each are optional; install only what your project requires.

```bash
# React
npm install react

# Svelte
npm install svelte
```

---

## Core Concepts

### ContextType

`ContextType` is a developer-defined interface representing the global state of your application at any given moment. Examples include the current user input, selected category, scroll depth, or any derived signal. The engine holds a partial copy of this state internally and merges updates incrementally via `updateContext`.

### VectorType

`VectorType` is a developer-defined interface attached to each registered element. It encodes the conditions under which that element should be considered relevant. The engine passes both the current context and an element's vector to the `relevanceAlgorithm` on every context update.

### relevanceAlgorithm

The `relevanceAlgorithm` function is the single point of integration between context and visibility. Its signature is:

```typescript
(context: ContextType, vector: VectorType) => boolean | RelevanceResult;
```

Returning `true` causes the element to appear. Returning `false` causes it to disappear. Returning a `RelevanceResult` object allows you to also specify a preferred radial slot index, giving you deterministic positioning instead of random slot assignment.

### Slots

The radial ring is divided into `maxSlots` evenly spaced angular positions. Each slot can hold one element. Slots are indexed from `0` to `maxSlots - 1`, and their angles are calculated as:

```
angle = slotIndex * (2 * PI / maxSlots)
```

Slot `0` is positioned at the 3 o'clock position (angle 0 radians). Indices increase clockwise.

---

## Implementation Guide

### Vanilla TypeScript

Instantiate `ContextUI` directly. Define your context and vector shapes, write the relevance algorithm, and call `updateContext` whenever your application state changes.

```typescript
import { ContextUI } from "context-ui";

interface AppContext {
  activeCategory: string;
  inputLength: number;
}

interface ItemVector {
  category: string;
  minInputLength: number;
}

const anchor = document.getElementById("anchor")!;

const engine = new ContextUI<AppContext, ItemVector>({
  anchor,
  maxSlots: 8,
  radius: 120,
  animationDuration: 350,
  relevanceAlgorithm(context, vector) {
    const categoryMatch = context.activeCategory === vector.category;
    const inputSufficient = (context.inputLength ?? 0) >= vector.minInputLength;
    return categoryMatch && inputSufficient;
  },
});

const bubble = document.createElement("div");
bubble.classList.add("context-ui-default-bubble");
bubble.textContent = "Suggestion A";

engine.registerElement("suggestion-a", bubble, {
  category: "search",
  minInputLength: 3,
});

// Trigger evaluation
engine.updateContext({ activeCategory: "search", inputLength: 5 });

// Cleanup
window.addEventListener("beforeunload", () => engine.destroy());
```

### React

Use the `useContextUI` hook. The hook returns refs for the anchor and optional container elements, and exposes `updateContext`, `registerElement`, and `unregisterElement` as stable function references.

```tsx
import { useContextUI } from "context-ui/react";
import { useRef, useEffect } from "react";

interface AppContext {
  mode: "browse" | "edit" | "idle";
}

interface ItemVector {
  visibleIn: AppContext["mode"][];
}

export function RadialMenu() {
  const {
    anchorRef,
    containerRef,
    updateContext,
    registerElement,
    unregisterElement,
  } = useContextUI<AppContext, ItemVector>({
    maxSlots: 6,
    radius: 100,
    relevanceAlgorithm(context, vector) {
      return vector.visibleIn.includes(context.mode);
    },
  });

  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editRef.current) {
      registerElement("edit-action", editRef.current, {
        visibleIn: ["browse"],
      });
    }
    return () => unregisterElement("edit-action");
  }, []);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        ref={anchorRef}
        style={{
          width: 48,
          height: 48,
          background: "#333",
          borderRadius: "50%",
        }}
      />
      <div ref={editRef} className="context-ui-default-bubble">
        Edit
      </div>
      <button onClick={() => updateContext({ mode: "browse" })}>
        Browse Mode
      </button>
      <button onClick={() => updateContext({ mode: "idle" })}>Idle Mode</button>
    </div>
  );
}
```

Note that the engine is initialised once on mount and destroyed on unmount. The `config` object is passed into a `useEffect` dependency array; provide a stable reference (e.g. via `useMemo`) if your config values are dynamic to avoid unnecessary engine re-instantiation.

### Svelte

Two Svelte actions are provided: `contextUIAnchor` and `contextUIElement`. The anchor action initialises the engine and attaches it to `window.__contextUIEngine`. The element action reads from that global reference to register child nodes.

```svelte
<script lang="ts">
  import { contextUIAnchor, contextUIElement } from "context-ui/svelte";

  interface AppContext {
    hovered: boolean;
  }

  interface ItemVector {
    requiresHover: boolean;
  }

  let engine: any;

  const config = {
    maxSlots: 8,
    radius: 130,
    relevanceAlgorithm(context: AppContext, vector: ItemVector) {
      return vector.requiresHover === context.hovered;
    },
  };

  function handleMouseEnter() {
    engine?.updateContext({ hovered: true });
  }

  function handleMouseLeave() {
    engine?.updateContext({ hovered: false });
  }
</script>

<div
  use:contextUIAnchor={config}
  bind:this={engine}
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
  style="width: 48px; height: 48px; background: #333; border-radius: 50%;"
/>

<div use:contextUIElement={{ id: "tooltip-a", vector: { requiresHover: true } }}>
  Option A
</div>
```

The `window.__contextUIEngine` pattern used in `svelte.ts` is a pragmatic bridge that avoids Svelte store boilerplate for this use case. In production, consider wrapping the engine reference in a Svelte writable store and exporting it from the anchor action return value to remove the global dependency.

---

## API Reference

### ContextUI Class

```typescript
class ContextUI<ContextType, VectorType>
```

The primary engine class. Manages registration, evaluation, slot allocation, and DOM transitions.

#### Constructor

```typescript
new ContextUI(config: ContextUIConfig<ContextType, VectorType>)
```

#### Methods

| Method              | Signature                                                                 | Description                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerElement`   | `(id: string, domNode: HTMLElement, relevanceVector: VectorType) => void` | Registers a DOM node with the engine. The node is assigned the `context-ui-element` class and stored in the internal registry. It is not yet appended to the DOM at this stage. |
| `unregisterElement` | `(id: string) => void`                                                    | Triggers the exit transition for the element if active, then removes it from the registry.                                                                                      |
| `updateContext`     | `(newContext: Partial<ContextType>) => void`                              | Performs a shallow merge of `newContext` into the internal context state, then runs a full evaluation pass over the registry.                                                   |
| `destroy`           | `() => void`                                                              | Removes all managed DOM nodes and clears the registry and active element maps. Call this during component or page teardown.                                                     |

---

### ContextUIConfig

```typescript
interface ContextUIConfig<ContextType, VectorType>
```

| Property             | Type                                                                       | Required | Default         | Description                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------- | -------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anchor`             | `HTMLElement`                                                              | Yes      |                 | The DOM element that serves as the origin point of the radial layout. All element positions are calculated relative to the centre of its bounding rect.               |
| `container`          | `HTMLElement`                                                              | No       | `document.body` | The DOM element into which managed elements are appended.                                                                                                             |
| `maxSlots`           | `number`                                                                   | No       | `12`            | The number of angular positions on the radial ring. Determines the maximum number of simultaneously visible elements.                                                 |
| `radius`             | `number`                                                                   | No       | `150`           | The distance in pixels from the anchor centre to the centre of each placed element.                                                                                   |
| `animationDuration`  | `number`                                                                   | No       | `400`           | Duration in milliseconds for entry and exit CSS transitions. Also controls the delay before a departing element is removed from the DOM.                              |
| `relevanceAlgorithm` | `(context: ContextType, vector: VectorType) => boolean \| RelevanceResult` | Yes      |                 | Called on every `updateContext` invocation for every registered element. Return `true` or `{ isRelevant: true }` to show, `false` or `{ isRelevant: false }` to hide. |

---

### RelevanceResult

```typescript
interface RelevanceResult {
  isRelevant: boolean;
  slot?: number;
}
```

When `slot` is defined and the target slot is unoccupied, the element is placed at that angular index. If the target slot is occupied, the engine falls back to random free slot assignment. If no slots are available, the element is not shown.

---

### useContextUI (React)

```typescript
function useContextUI<ContextType, VectorType>(
  config: Omit<
    ContextUIConfig<ContextType, VectorType>,
    "anchor" | "container"
  >,
): {
  anchorRef: RefObject<HTMLDivElement>;
  containerRef: RefObject<HTMLDivElement>;
  updateContext: (newContext: Partial<ContextType>) => void;
  registerElement: (
    id: string,
    node: HTMLElement | null,
    vector: VectorType,
  ) => void;
  unregisterElement: (id: string) => void;
};
```

A React hook that manages the `ContextUI` engine lifecycle. The engine is created once when `anchorRef.current` becomes non-null and destroyed on component unmount.

| Return Value        | Description                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `anchorRef`         | Attach to the element that should serve as the radial anchor.                                                 |
| `containerRef`      | Attach to the element into which context elements will be appended. If not attached, `document.body` is used. |
| `updateContext`     | Triggers a context merge and layout evaluation. Safe to call from event handlers.                             |
| `registerElement`   | Registers a DOM node with the engine. Typically called inside a `useEffect` after a ref resolves.             |
| `unregisterElement` | Removes an element from the engine. Call this in the cleanup return of the `useEffect` that registered it.    |

---

### contextUIAnchor (Svelte)

```typescript
function contextUIAnchor<ContextType, VectorType>(
  node: HTMLElement,
  config: Omit<ContextUIConfig<ContextType, VectorType>, "anchor">,
): { destroy?: () => void };
```

A Svelte action applied to the anchor element. Instantiates the engine with `node` as the anchor and attaches it to `window.__contextUIEngine`. Calls `engine.destroy()` and removes the global reference when the node is destroyed.

---

### contextUIElement (Svelte)

```typescript
function contextUIElement<VectorType>(
  node: HTMLElement,
  params: { id: string; vector: VectorType },
): { destroy?: () => void };
```

A Svelte action applied to any element intended for registration. Reads `window.__contextUIEngine` and calls `registerElement`. Applies the `context-ui-default-bubble` class automatically. Calls `unregisterElement` when the node is destroyed.

---

## Design Suggestions

**Anchor sizing.** The anchor element's bounding rect centre is used as the origin for all calculations. A visually small but interaction-sized anchor (e.g. 48x48px minimum) reduces positioning drift on resize and touch targets.

**Radius calibration.** At `maxSlots: 12` and `radius: 150`, adjacent elements are approximately 78px apart at their centres (arc length = `2 * PI * radius / maxSlots`). For larger elements such as cards, increase the radius proportionally or reduce `maxSlots` to avoid overlap.

**Slot determinism.** For interfaces where element identity should be spatially consistent across context transitions (e.g. a persistent radial menu), always return a `RelevanceResult` with a fixed `slot` value per element rather than relying on random slot assignment.

**Transition tuning.** The injected styles use `cubic-bezier(0.25, 1, 0.5, 1)` for position and scale, producing an overshoot-free ease-out. If you want spring-like overshoot, increase the third parameter toward `1.5`. The opacity transition is intentionally linear and shorter than the position transition; changing both independently controls perceived element weight.

**Overriding default styles.** The `.context-ui-element`, `.context-ui-visible`, and `.context-ui-default-bubble` classes are injected once into `document.head` via a `<style>` tag with id `context-ui-styles`. You can override any of these rules in your own stylesheet by applying specificity rules, or by replacing the injected styles entirely after construction.

**Context update frequency.** `updateContext` triggers a full evaluation pass over every registered element. For high-frequency signals such as `mousemove` or `scroll`, debounce or throttle calls to `updateContext` before passing values to the engine.

**Multiple instances.** Each `ContextUI` instance is entirely self-contained. Multiple instances with different anchors, radii, and relevance algorithms can coexist on the same page without interference.

---

## Contributing: Writing a Framework Wrapper

The framework wrappers in `src/react.ts` and `src/svelte.ts` follow a consistent pattern. A wrapper has three responsibilities:

1. Instantiate `ContextUI` when the anchor node becomes available.
2. Expose `updateContext`, `registerElement`, and `unregisterElement` to consumer code.
3. Call `engine.destroy()` when the component or directive is torn down.

### Structural contract

Any wrapper must satisfy this interface at minimum:

```typescript
interface ContextUIWrapperReturn<ContextType, VectorType> {
  updateContext: (ctx: Partial<ContextType>) => void;
  registerElement: (id: string, node: HTMLElement, vector: VectorType) => void;
  unregisterElement: (id: string) => void;
}
```

The wrapper accepts a config object of type `Omit<ContextUIConfig<ContextType, VectorType>, "anchor">` since the anchor is resolved by the framework's own ref or directive mechanism.

### Step-by-step for a new framework

**Step 1: Identify the anchor resolution pattern.**

Frameworks expose DOM nodes differently. React uses refs (`useRef`), Svelte uses actions (node passed directly as first argument), Vue uses template refs resolved in `onMounted`. Identify where in your framework's lifecycle the anchor `HTMLElement` is first available.

**Step 2: Instantiate the engine at that point.**

```typescript
const engine = new ContextUI({ ...config, anchor: resolvedNode });
```

Store the engine reference in a mutable variable, ref, or reactive primitive that persists across renders but does not trigger re-renders itself.

**Step 3: Expose context and registration APIs.**

Wrap `engine.updateContext`, `engine.registerElement`, and `engine.unregisterElement` in functions appropriate to your framework's idiom. In React these become stable function references. In Svelte they can be returned from the action or attached to the window reference. In Vue they would typically be returned from a composable.

**Step 4: Destroy the engine on teardown.**

Every framework provides a teardown hook: React's `useEffect` cleanup return, Svelte action's `destroy` property, Vue's `onUnmounted`. Call `engine.destroy()` there unconditionally.

**Step 5: Add the entry point to tsup.config.ts and package.json.**

Add your source file as a named entry in `tsup.config.ts`:

```typescript
entry: {
  core: "src/core.ts",
  react: "src/react.ts",
  svelte: "src/svelte.ts",
  vue: "src/vue.ts",        // your addition
},
```

Register the sub-path export in `package.json`:

```json
"./vue": {
  "import": "./dist/vue.js",
  "require": "./dist/vue.cjs",
  "types": "./dist/vue.d.ts"
}
```

Add the framework as a peer dependency with the `optional: true` meta flag, matching the existing pattern in `package.json`.

**Step 6: Add the framework as an external in tsup.config.ts.**

```typescript
external: ["react", "svelte", "vue"],
```

This prevents the framework runtime from being bundled into the output.

### Vue 3 example skeleton

```typescript
import { onMounted, onUnmounted, ref, Ref } from "vue";
import { ContextUI, ContextUIConfig } from "./core";

export function useContextUI<ContextType, VectorType>(
  config: Omit<
    ContextUIConfig<ContextType, VectorType>,
    "anchor" | "container"
  >,
) {
  const anchorRef: Ref<HTMLElement | null> = ref(null);
  let engine: ContextUI<ContextType, VectorType> | null = null;

  onMounted(() => {
    if (anchorRef.value) {
      engine = new ContextUI({ ...config, anchor: anchorRef.value });
    }
  });

  onUnmounted(() => {
    engine?.destroy();
    engine = null;
  });

  const updateContext = (ctx: Partial<ContextType>) =>
    engine?.updateContext(ctx);

  const registerElement = (id: string, node: HTMLElement, vector: VectorType) =>
    engine?.registerElement(id, node, vector);

  const unregisterElement = (id: string) => engine?.unregisterElement(id);

  return { anchorRef, updateContext, registerElement, unregisterElement };
}
```

This skeleton follows the same lifecycle contract as the React hook and is sufficient to support the full API surface.
