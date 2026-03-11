# Context UI

A framework-agnostic, TypeScript-first engine for building dynamic radial context interfaces.
Elements are registered with a relevance vector and a developer-defined algorithm determines
which elements surface around an anchor point based on a shared context state.

Context UI ships three integration surfaces: native web components for plain HTML, a pair of
declarative React components, and a Svelte action factory. All three share the same core engine.

---

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Core Concepts](#core-concepts)
- [Usage: Vanilla HTML](#usage-vanilla-html)
- [Usage: React](#usage-react)
- [Usage: Svelte](#usage-svelte)
- [API Reference](#api-reference)
  - [ContextUI Class](#contextui-class)
  - [EngineHolder Class](#engineholder-class)
  - [ContextUIConfig](#contextuiconfig)
  - [RelevanceResult](#relevanceresult)
  - [Web Components](#web-components)
  - [React: ContextUIProvider](#react-contextuiprovider)
  - [React: ContextItem](#react-contextitem)
  - [React: useContextUI](#react-usecontextui)
  - [Svelte: createContextUI](#svelte-createcontextui)
- [Design Suggestions](#design-suggestions)
- [Contributing: Writing a Framework Wrapper](#contributing-writing-a-framework-wrapper)

---

## Overview

Context UI decouples two concerns that are typically entangled in adaptive interface
implementations: the state of the world (context) and the conditions under which a UI element
is relevant (relevance vector). You define both shapes via TypeScript generics. The engine
handles slot allocation, radial positioning, animated entry and exit, and DOM lifecycle.

The radial layout places active elements at evenly distributed angles around an anchor element.
Up to `maxSlots` elements can be simultaneously visible, each occupying one angular position on
the circle defined by `radius`.

---

## Project Structure

```
.
├── package.json
├── src
│   ├── core.ts       # Engine class, EngineHolder, and web component definitions
│   ├── react.ts      # ContextUIProvider, ContextItem, and useContextUI hook
│   └── svelte.ts     # createContextUI factory returning Svelte actions
├── tsconfig.json
└── tsup.config.ts
```

---

## Installation

```bash
npm install context-ui
```

React and Svelte integrations are available as sub-path exports. Their peer dependencies
are optional; install only what your project requires.

```bash
npm install react        # for the React integration
npm install svelte       # for the Svelte integration
```

---

## Core Concepts

### ContextType

A developer-defined interface representing the global state of your application at any moment.
The engine holds a partial copy internally and merges updates incrementally via `updateContext`.

### VectorType

A developer-defined interface attached to each registered element describing the conditions
under which that element should be considered relevant.

### relevanceAlgorithm

The single integration point between context and visibility:

```typescript
(context: ContextType, vector: VectorType) => boolean | RelevanceResult;
```

Return `true` to show, `false` to hide, or a `RelevanceResult` to also specify a preferred
slot index for deterministic radial placement.

### Slots

The radial ring is divided into `maxSlots` equally spaced angular positions indexed from `0`
to `maxSlots - 1`. Slot `0` sits at the 3 o'clock position (angle 0 radians); indices
increase clockwise.

```
angle = slotIndex * (2 * PI / maxSlots)
```

---

## Usage: Vanilla HTML

Import the package via a script tag from a CDN or local build. The web components
`<context-ui>` and `<context-item>` are registered automatically when the module loads.

```html
<!DOCTYPE html>
<html>
  <head>
    <script type="module" src="./node_modules/context-ui/dist/core.js"></script>
  </head>
  <body>
    <context-ui
      id="ui"
      relevance="myRelevanceImplementation"
      max-slots="8"
      radius="120"
    >
      <context-item
        id="action-search"
        vector='{"type":"action","label":"Search"}'
      >
        <button class="bubble">Search</button>
      </context-item>
      <context-item id="action-edit" vector='{"type":"action","label":"Edit"}'>
        <button class="bubble">Edit</button>
      </context-item>
      <context-item id="action-share" vector='{"type":"info","label":"Share"}'>
        <button class="bubble">Share</button>
      </context-item>
    </context-ui>

    <button onclick="showActions()">Open</button>
    <button onclick="hideActions()">Close</button>

    <script>
      function myRelevanceImplementation(context, vector) {
        if (!context.open) return false;
        if (context.filter) return vector.type === context.filter;
        return true;
      }

      const ui = document.getElementById("ui");

      function showActions() {
        ui.updateContext({ open: true });
      }

      function hideActions() {
        ui.updateContext({ open: false });
      }
    </script>
  </body>
</html>
```

To provide the relevance function as a direct reference rather than a global name, assign it
to the `relevanceFn` property before the element connects:

```javascript
const ui = document.getElementById("ui");
ui.relevanceFn = function (context, vector) {
  return context.open && vector.type === "action";
};
```

---

## Usage: React

Import `ContextUIProvider`, `ContextItem`, and `useContextUI` from `context-ui/react`.
`ContextUIProvider` renders the anchor div and provides the engine to all descendants via
React context. `ContextItem` registers its wrapper div with the engine. `useContextUI`
exposes `updateContext` from anywhere inside the provider tree.

```tsx
import { ContextUIProvider, ContextItem, useContextUI } from "context-ui/react";

interface AppContext {
  mode: "browse" | "edit" | "idle";
}

interface ItemVector {
  visibleIn: AppContext["mode"][];
}

function relevance(ctx: AppContext, vec: ItemVector): boolean {
  return vec.visibleIn.includes(ctx.mode);
}

function Controls() {
  const { updateContext } = useContextUI<AppContext>();
  return (
    <div>
      <button onClick={() => updateContext({ mode: "browse" })}>Browse</button>
      <button onClick={() => updateContext({ mode: "edit" })}>Edit</button>
      <button onClick={() => updateContext({ mode: "idle" })}>Idle</button>
    </div>
  );
}

export function App() {
  return (
    <>
      <ContextUIProvider
        relevance={relevance}
        maxSlots={8}
        radius={130}
        className="anchor"
      >
        Open
        <ContextItem id="edit-btn" vector={{ visibleIn: ["browse", "edit"] }}>
          <button>Edit</button>
        </ContextItem>
        <ContextItem id="share-btn" vector={{ visibleIn: ["browse"] }}>
          <button>Share</button>
        </ContextItem>
        <ContextItem id="delete-btn" vector={{ visibleIn: ["edit"] }}>
          <button>Delete</button>
        </ContextItem>
      </ContextUIProvider>
      <Controls />
    </>
  );
}
```

The engine is initialized in a `useLayoutEffect` inside `ContextUIProvider`, which runs
before children's passive `useEffect` calls. Items registered in `useEffect` therefore
always find a live engine on first mount.

---

## Usage: Svelte

Import `createContextUI` from `context-ui/svelte`. Call it once in the component script
block to get the `anchor` action, `item` action, and `updateContext` function. All three
share a single engine instance through the factory closure.

```svelte
<script lang="ts">
  import { createContextUI } from 'context-ui/svelte';

  interface AppContext {
    open: boolean;
    filter: string | null;
  }

  interface ItemVector {
    type: string;
    label: string;
  }

  const ui = createContextUI<AppContext, ItemVector>({
    maxSlots: 8,
    radius: 120,
    relevanceAlgorithm(ctx, vec) {
      if (!ctx.open) return false;
      if (ctx.filter) return vec.type === ctx.filter;
      return true;
    },
  });

  let open = false;
  let filter: string | null = null;

  $: ui.updateContext({ open, filter });
</script>

<button use:ui.anchor on:click={() => (open = !open)}>
  {open ? 'Close' : 'Open'}
</button>

<div use:ui.item={{ id: 'search', vector: { type: 'action', label: 'Search' } }}>
  <button>Search</button>
</div>

<div use:ui.item={{ id: 'edit', vector: { type: 'action', label: 'Edit' } }}>
  <button>Edit</button>
</div>

<div use:ui.item={{ id: 'info', vector: { type: 'info', label: 'About' } }}>
  <button>About</button>
</div>
```

Dynamic lists integrate naturally with Svelte's `{#each}` block. The `item` action's
`update` lifecycle unregisters the old entry and re-registers with the new parameters
whenever the block re-renders:

```svelte
{#each contacts as contact (contact.id)}
  <div use:ui.item={{ id: contact.id, vector: contact }}>
    {contact.name}
  </div>
{/each}
```

---

## API Reference

### ContextUI Class

```typescript
class ContextUI<ContextType, VectorType>
```

The core engine. Manages registration, evaluation, slot allocation, and DOM transitions.

#### Constructor

```typescript
new ContextUI(config: ContextUIConfig<ContextType, VectorType>)
```

#### Methods

| Method              | Signature                                                                 | Description                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `registerElement`   | `(id: string, domNode: HTMLElement, relevanceVector: VectorType) => void` | Registers a DOM node. Adds the `context-ui-element` class. Not yet visible.                                                      |
| `unregisterElement` | `(id: string) => void`                                                    | Triggers the exit transition and removes the element from the registry.                                                          |
| `updateVector`      | `(id: string, newVector: VectorType) => void`                             | Replaces the relevance vector of a registered element and immediately re-evaluates its visibility without a full context update. |
| `updateContext`     | `(newContext: Partial<ContextType>) => void`                              | Shallow-merges the partial update and runs a full evaluation pass over all registered elements.                                  |
| `destroy`           | `() => void`                                                              | Removes all managed DOM nodes and clears all internal state.                                                                     |

---

### EngineHolder Class

```typescript
class EngineHolder<ContextType, VectorType>
```

A deferred engine proxy used internally by all framework integrations. Queues registration
calls made before the engine is initialized and replays them once `setEngine` is called.
Import and use this class when writing a new framework wrapper.

| Method          | Signature                                                     | Description                                                                    |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `setEngine`     | `(engine: ContextUI<ContextType, VectorType>) => void`        | Attaches an engine and flushes the pending registration queue.                 |
| `register`      | `(id: string, node: HTMLElement, vector: VectorType) => void` | Registers an element, or queues the call if the engine is not yet attached.    |
| `unregister`    | `(id: string) => void`                                        | Unregisters an element and removes any matching pending queue entry.           |
| `updateVector`  | `(id: string, vector: VectorType) => void`                    | Delegates to `ContextUI.updateVector`.                                         |
| `updateContext` | `(ctx: Partial<ContextType>) => void`                         | Delegates to `ContextUI.updateContext`.                                        |
| `destroy`       | `() => void`                                                  | Destroys the engine and clears all internal state including the pending queue. |

---

### ContextUIConfig

```typescript
interface ContextUIConfig<ContextType, VectorType>
```

| Property             | Type                                                                       | Required | Default         | Description                                                   |
| -------------------- | -------------------------------------------------------------------------- | -------- | --------------- | ------------------------------------------------------------- |
| `anchor`             | `HTMLElement`                                                              | Yes      |                 | Radial origin element.                                        |
| `container`          | `HTMLElement`                                                              | No       | `document.body` | Element into which managed nodes are appended when shown.     |
| `maxSlots`           | `number`                                                                   | No       | `12`            | Maximum simultaneously visible elements.                      |
| `radius`             | `number`                                                                   | No       | `150`           | Distance in pixels from anchor center to placed elements.     |
| `animationDuration`  | `number`                                                                   | No       | `400`           | Transition and DOM removal delay in milliseconds.             |
| `relevanceAlgorithm` | `(context: ContextType, vector: VectorType) => boolean \| RelevanceResult` | Yes      |                 | Visibility decision function invoked on every context update. |

---

### RelevanceResult

```typescript
interface RelevanceResult {
  isRelevant: boolean;
  slot?: number;
}
```

Return this instead of a plain boolean when slot placement should be deterministic. If the
preferred `slot` is already occupied, the engine falls back to random free slot assignment.

---

### Web Components

#### `<context-ui>`

The anchor element. Initializes and hosts the engine. Designed for use in plain HTML without
any build tooling.

| Attribute            | Type     | Default | Description                                                           |
| -------------------- | -------- | ------- | --------------------------------------------------------------------- |
| `relevance`          | `string` |         | Name of a `window`-scoped function to use as the relevance algorithm. |
| `max-slots`          | `number` | `12`    | Number of radial slots.                                               |
| `radius`             | `number` | `150`   | Radius in pixels.                                                     |
| `animation-duration` | `number` | `400`   | Transition duration in milliseconds.                                  |

| Property      | Type       | Description                                                                                          |
| ------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `relevanceFn` | `Function` | Assign directly to provide the algorithm without a global name. Takes precedence over the attribute. |

| Method          | Signature                                | Description                                      |
| --------------- | ---------------------------------------- | ------------------------------------------------ |
| `updateContext` | `(ctx: Record<string, unknown>) => void` | Merges a context update and triggers evaluation. |
| `getEngine`     | `() => ContextUI \| null`                | Returns the underlying engine instance.          |

#### `<context-item>`

Registers its first child element with the nearest `<context-ui>` ancestor's engine.
If there is no child element, the `<context-item>` itself is registered.

| Attribute | Type     | Required | Description                                                                                               |
| --------- | -------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `id`      | `string` | Yes      | Unique identifier passed to the engine registry.                                                          |
| `vector`  | `string` | No       | JSON-serialized relevance vector. Updating this attribute after mount calls `updateVector` on the engine. |

#### `defineElements()`

```typescript
function defineElements(): void;
```

Registers the `context-ui` and `context-item` custom elements. Called automatically on
module load in browser environments. Invoke manually when import-time side effects are
undesirable (SSR builds, test environments, certain bundler configurations).

---

### React: ContextUIProvider

```typescript
function ContextUIProvider<ContextType, VectorType>(
  props: ContextUIProviderProps<ContextType, VectorType>,
): JSX.Element;
```

| Prop                | Type                                                                | Required | Description                                           |
| ------------------- | ------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| `relevance`         | `(ctx: ContextType, vec: VectorType) => boolean \| RelevanceResult` | Yes      | The relevance algorithm.                              |
| `maxSlots`          | `number`                                                            | No       | Defaults to `12`.                                     |
| `radius`            | `number`                                                            | No       | Defaults to `150`.                                    |
| `animationDuration` | `number`                                                            | No       | Defaults to `400`.                                    |
| `className`         | `string`                                                            | No       | Applied to the rendered anchor div.                   |
| `style`             | `CSSProperties`                                                     | No       | Applied to the rendered anchor div.                   |
| `children`          | `ReactNode`                                                         | No       | Anchor content alongside `ContextItem` registrations. |

---

### React: ContextItem

```typescript
function ContextItem<VectorType>(
  props: ContextItemProps<VectorType>,
): JSX.Element;
```

| Prop        | Type            | Required | Description                                                                                                           |
| ----------- | --------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`        | `string`        | Yes      | Unique identifier within the engine registry. Changing this prop unmounts the old registration and creates a new one. |
| `vector`    | `VectorType`    | Yes      | Relevance vector captured at registration time.                                                                       |
| `className` | `string`        | No       | Applied to the rendered wrapper div.                                                                                  |
| `style`     | `CSSProperties` | No       | Applied to the rendered wrapper div.                                                                                  |
| `children`  | `ReactNode`     | No       | Content rendered inside the managed element.                                                                          |

---

### React: useContextUI

```typescript
function useContextUI<ContextType>(): {
  updateContext: (ctx: Partial<ContextType>) => void;
};
```

Returns `updateContext` from the nearest `ContextUIProvider`. Must be called from within
the provider tree.

---

### Svelte: createContextUI

```typescript
function createContextUI<ContextType, VectorType>(
  config: Omit<ContextUIConfig<ContextType, VectorType>, "anchor">,
): ContextUIActions<ContextType, VectorType>;
```

| Return field    | Type                                  | Description                                                                                                                                   |
| --------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `anchor`        | Svelte action                         | Apply with `use:ui.anchor`. Initializes the engine using the node as the radial origin.                                                       |
| `item`          | Svelte action                         | Apply with `use:ui.item={{ id, vector }}`. Registers the node with the engine. Handles parameter updates via the action's `update` lifecycle. |
| `updateContext` | `(ctx: Partial<ContextType>) => void` | Merges a context update and triggers evaluation. Use in a reactive statement for automatic synchronization.                                   |

---

## Design Suggestions

**Anchor sizing.** The anchor element's bounding rect center is the radial origin. A minimum
of 48x48px reduces positioning drift during window resize and meets touch target guidelines.

**Radius calibration.** At `maxSlots: 12` and `radius: 150`, adjacent elements are
approximately 78px apart at their centers (arc length = `2 * PI * radius / maxSlots`).
Scale radius proportionally when increasing element size or decreasing slot count to
prevent visual overlap.

**Slot determinism.** For interfaces where element identity should be spatially consistent
across context transitions, return a `RelevanceResult` with a fixed `slot` per element
rather than relying on random assignment. This prevents elements from jumping positions
as the visible set changes.

**Transition tuning.** The injected styles use `cubic-bezier(0.25, 1, 0.5, 1)` for
position and scale, producing an overshoot-free ease-out. Increasing the third parameter
toward `1.5` introduces spring-like overshoot. Opacity uses a linear curve shorter than
the position transition to create a staggered feel.

**Overriding default styles.** The `.context-ui-element`, `.context-ui-visible`, and
`.context-ui-default-bubble` classes are injected once into `document.head`. Override
any of these in your own stylesheet with higher specificity, or prevent injection entirely
by inserting a style element with id `context-ui-styles` before importing the module.

**Context update frequency.** `updateContext` runs a full evaluation pass over every
registered element. Debounce or throttle calls driven by high-frequency signals such as
`mousemove`, `scroll`, or `input` events before passing values to the engine.

**Multiple instances.** Each `createContextUI` call, each `ContextUIProvider`, and each
`<context-ui>` element manages a fully independent engine. Multiple instances with different
anchors, radii, and algorithms coexist on the same page without interference.

---

## Contributing: Writing a Framework Wrapper

All framework wrappers share a structural contract and a lifecycle pattern built around
`EngineHolder`.

### Structural contract

A wrapper exposes at minimum:

```typescript
interface ContextUIWrapperReturn<ContextType, VectorType> {
  updateContext: (ctx: Partial<ContextType>) => void;
  registerElement: (id: string, node: HTMLElement, vector: VectorType) => void;
  unregisterElement: (id: string) => void;
}
```

It accepts `Omit<ContextUIConfig<ContextType, VectorType>, 'anchor'>` because the anchor
is resolved by the framework's own DOM binding mechanism.

### The EngineHolder pattern

`EngineHolder` solves the ordering gap between item elements mounting and the anchor
resolving its engine. Use it in every wrapper:

```typescript
import { ContextUI, EngineHolder } from "context-ui";

const holder = new EngineHolder<ContextType, VectorType>();

// Run when the anchor node is available (useLayoutEffect, onMounted, action callback)
const engine = new ContextUI({ ...config, anchor: anchorNode });
holder.setEngine(engine);

// Safe to call before or after the anchor is ready
holder.register(id, itemNode, vector);

// Run during teardown
holder.destroy();
```

### Step-by-step for a new framework

**Step 1: Identify the anchor resolution pattern.**

Determine when the framework exposes the anchor DOM node. React uses a `ref` resolved in
`useLayoutEffect`. Svelte passes the node directly as the first argument to an action.
Vue resolves `templateRef.value` in `onMounted`.

**Step 2: Initialize the engine at that point.**

```typescript
const engine = new ContextUI({ ...config, anchor: resolvedNode });
holder.setEngine(engine);
```

**Step 3: Expose registration and context update APIs.**

Wrap `holder.register`, `holder.unregister`, and `holder.updateContext` in idioms
appropriate to the target framework.

**Step 4: Call holder.destroy() in the teardown hook.**

React: `useEffect` or `useLayoutEffect` cleanup return. Svelte: action `destroy` property.
Vue: `onUnmounted`.

**Step 5: Register the entry point in tsup.config.ts and package.json.**

```typescript
entry: {
  core: 'src/core.ts',
  react: 'src/react.ts',
  svelte: 'src/svelte.ts',
  vue: 'src/vue.ts',
},
external: ['react', 'svelte', 'vue'],
```

```json
"./vue": {
  "import": "./dist/vue.js",
  "require": "./dist/vue.cjs",
  "types": "./dist/vue.d.ts"
}
```

Add the framework as an optional peer dependency following the existing pattern in
`package.json`.

### Vue 3 reference skeleton

```typescript
import { onMounted, onUnmounted, ref } from "vue";
import type { Ref } from "vue";
import { ContextUI, EngineHolder } from "context-ui";
import type { ContextUIConfig, RelevanceResult } from "context-ui";

export function createContextUI<ContextType, VectorType>(
  config: Omit<ContextUIConfig<ContextType, VectorType>, "anchor">,
) {
  const holder = new EngineHolder<ContextType, VectorType>();
  const anchorRef: Ref<HTMLElement | null> = ref(null);

  onMounted(() => {
    if (anchorRef.value) {
      const engine = new ContextUI({ ...config, anchor: anchorRef.value });
      holder.setEngine(engine);
    }
  });

  onUnmounted(() => {
    holder.destroy();
  });

  return {
    anchorRef,
    updateContext: (ctx: Partial<ContextType>) => holder.updateContext(ctx),
    registerElement: (id: string, node: HTMLElement, vector: VectorType) =>
      holder.register(id, node, vector),
    unregisterElement: (id: string) => holder.unregister(id),
  };
}
```
