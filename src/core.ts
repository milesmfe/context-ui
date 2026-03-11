/**
 * @fileoverview Core ContextUI engine, deferred engine holder, and web component definitions.
 * @module context-ui
 */

/**
 * The result shape returned by a relevance algorithm when explicit slot placement is required.
 * When only a boolean is needed, the algorithm may return true or false directly.
 */
export interface RelevanceResult {
  isRelevant: boolean;
  slot?: number;
}

/**
 * Configuration object for the ContextUI engine.
 * @template ContextType The shape of the global context state object.
 * @template VectorType The shape of the relevance vector attached to registered elements.
 */
export interface ContextUIConfig<ContextType, VectorType> {
  /**
   * The HTMLElement that serves as the radial origin point for layout calculations.
   * All element positions are derived from the center of this element's bounding rect.
   */
  anchor: HTMLElement;

  /**
   * The container element into which managed elements are appended when shown.
   * Defaults to document.body.
   */
  container?: HTMLElement;

  /**
   * The number of evenly spaced angular positions on the radial ring.
   * Determines the maximum number of simultaneously visible elements. Defaults to 12.
   */
  maxSlots?: number;

  /**
   * The distance in pixels from the anchor center to the center of each placed element.
   * Defaults to 150.
   */
  radius?: number;

  /**
   * Duration in milliseconds for entry and exit CSS transitions.
   * Also controls the delay before a departing element is removed from the DOM. Defaults to 400.
   */
  animationDuration?: number;

  /**
   * Developer-defined function invoked on every context update for every registered element.
   * Return true or false to show or hide, or a RelevanceResult to also specify a preferred slot.
   */
  relevanceAlgorithm: (
    context: ContextType,
    vector: VectorType,
  ) => boolean | RelevanceResult;
}

/**
 * Internal representation of a registered UI element.
 * @template VectorType The shape of the relevance vector.
 */
interface RegistryItem<VectorType> {
  id: string;
  domNode: HTMLElement;
  relevanceVector: VectorType;
}

/**
 * The core ContextUI engine. Manages element registration, radial slot allocation,
 * context-driven visibility evaluation, and CSS transition lifecycle.
 *
 * @template ContextType The shape of the global context state object.
 * @template VectorType The shape of the relevance vector attached to registered elements.
 *
 * @example
 * ```typescript
 * const engine = new ContextUI({
 *   anchor: document.getElementById('anchor')!,
 *   relevanceAlgorithm: (ctx, vec) => ctx.category === vec.category,
 * });
 * engine.registerElement('btn1', myElement, { category: 'action' });
 * engine.updateContext({ category: 'action' });
 * ```
 */
export class ContextUI<ContextType, VectorType> {
  private anchor: HTMLElement;
  private container: HTMLElement;
  private maxSlots: number;
  private radius: number;
  private animDuration: number;
  private relevanceAlgorithm: (
    context: ContextType,
    vector: VectorType,
  ) => boolean | RelevanceResult;

  private registry: Map<string, RegistryItem<VectorType>>;
  private activeElements: Map<string, HTMLElement>;
  private slots: boolean[];
  private currentContext: Partial<ContextType>;

  /**
   * Creates a new ContextUI engine instance and injects required styles.
   * @param config Engine configuration object.
   */
  constructor(config: ContextUIConfig<ContextType, VectorType>) {
    this.anchor = config.anchor;
    this.container = config.container ?? document.body;
    this.maxSlots = config.maxSlots ?? 12;
    this.radius = config.radius ?? 150;
    this.animDuration = config.animationDuration ?? 400;
    this.relevanceAlgorithm = config.relevanceAlgorithm;
    this.registry = new Map();
    this.activeElements = new Map();
    this.slots = new Array(this.maxSlots).fill(false);
    this.currentContext = {};
    this.injectStyles();
  }

  /**
   * Injects the required CSS rules into document.head exactly once.
   * Controlled by the presence of a style element with id context-ui-styles.
   */
  private injectStyles(): void {
    if (document.getElementById("context-ui-styles")) return;

    const style = document.createElement("style");
    style.id = "context-ui-styles";
    style.textContent = `
      .context-ui-element {
        position: fixed;
        z-index: 5;
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, -50%) scale(0.2);
        transition:
          top 0.4s cubic-bezier(0.25, 1, 0.5, 1),
          left 0.4s cubic-bezier(0.25, 1, 0.5, 1),
          opacity 0.3s ease,
          transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);
      }
      .context-ui-visible {
        opacity: 1;
        pointer-events: auto;
        transform: translate(-50%, -50%) scale(1);
      }
      .context-ui-default-bubble {
        background: #3a3a3c;
        color: #ffffff;
        padding: 12px 18px;
        border-radius: 20px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Registers a DOM element with the engine under a unique identifier and relevance vector.
   * The element is assigned the context-ui-element class and stored in the registry.
   * It is not appended to the DOM or made visible until a context update triggers relevance.
   *
   * @param id Unique identifier for the element.
   * @param domNode The HTML element to manage.
   * @param relevanceVector Developer-defined data describing the conditions under which this element is relevant.
   */
  public registerElement(
    id: string,
    domNode: HTMLElement,
    relevanceVector: VectorType,
  ): void {
    domNode.classList.add("context-ui-element");
    this.registry.set(id, { id, domNode, relevanceVector });
  }

  /**
   * Replaces the relevance vector of a registered element without removing it from the registry.
   * Immediately triggers a re-evaluation of that element's visibility.
   *
   * @param id The unique identifier of the element.
   * @param newVector The replacement relevance vector.
   */
  public updateVector(id: string, newVector: VectorType): void {
    const item = this.registry.get(id);
    if (!item) return;
    item.relevanceVector = newVector;
    this.evaluateItem(id, item);
  }

  /**
   * Removes an element from the registry and triggers its exit transition.
   * @param id The unique identifier of the element to remove.
   */
  public unregisterElement(id: string): void {
    this.hideElement(id);
    this.registry.delete(id);
  }

  /**
   * Merges a partial context update into the current state and re-evaluates all registered elements.
   * @param newContext Partial context object to merge into the current state.
   */
  public updateContext(newContext: Partial<ContextType>): void {
    this.currentContext = { ...this.currentContext, ...newContext };
    this.evaluate();
  }

  /**
   * Runs the relevance algorithm against every registered element and updates visibility.
   */
  private evaluate(): void {
    for (const [id, item] of this.registry.entries()) {
      this.evaluateItem(id, item);
    }
  }

  /**
   * Evaluates a single registry entry and updates its visibility state.
   * @param id The element's unique identifier.
   * @param item The registry entry to evaluate.
   */
  private evaluateItem(id: string, item: RegistryItem<VectorType>): void {
    const result = this.relevanceAlgorithm(
      this.currentContext as ContextType,
      item.relevanceVector,
    );

    const isRelevant = typeof result === "object" ? result.isRelevant : result;
    const preferredSlot = typeof result === "object" ? result.slot : undefined;
    const isActive = this.activeElements.has(id);

    if (isRelevant && !isActive) {
      this.showElement(item, preferredSlot);
    } else if (!isRelevant && isActive) {
      this.hideElement(id);
    } else if (isRelevant && isActive) {
      this.updateElementPosition(item, preferredSlot);
    }
  }

  /**
   * Assigns a slot index, appends the element to the container, and triggers the entry transition.
   * @param item The registry entry to display.
   * @param preferredSlot Optional preferred slot index. Falls back to a random free slot if occupied or absent.
   */
  private showElement(
    item: RegistryItem<VectorType>,
    preferredSlot?: number,
  ): void {
    const el = item.domNode;

    const existingTimeout = el.getAttribute("data-timeout-id");
    if (existingTimeout) {
      clearTimeout(parseInt(existingTimeout, 10));
      el.removeAttribute("data-timeout-id");
    }

    let slotIndex = -1;

    if (
      preferredSlot !== undefined &&
      preferredSlot >= 0 &&
      preferredSlot < this.maxSlots &&
      !this.slots[preferredSlot]
    ) {
      slotIndex = preferredSlot;
    } else {
      const freeSlots = this.slots
        .map((occupied, i) => (occupied ? -1 : i))
        .filter((i) => i !== -1);
      if (freeSlots.length === 0) return;
      slotIndex = freeSlots[Math.floor(Math.random() * freeSlots.length)];
    }

    this.slots[slotIndex] = true;
    el.setAttribute("data-slot", slotIndex.toString());

    const rect = this.anchor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;

    if (!el.parentElement) {
      this.container.appendChild(el);
    }

    void el.offsetWidth;

    const angle = slotIndex * ((2 * Math.PI) / this.maxSlots);
    el.style.left = `${cx + this.radius * Math.cos(angle)}px`;
    el.style.top = `${cy + this.radius * Math.sin(angle)}px`;
    el.classList.add("context-ui-visible");

    this.activeElements.set(item.id, el);
  }

  /**
   * Moves an already-visible element to a different slot if the preferred slot has changed
   * and the target slot is unoccupied.
   * @param item The registry entry to reposition.
   * @param preferredSlot The new preferred slot index.
   */
  private updateElementPosition(
    item: RegistryItem<VectorType>,
    preferredSlot?: number,
  ): void {
    if (preferredSlot === undefined) return;

    const el = item.domNode;
    const currentSlotStr = el.getAttribute("data-slot");
    const currentSlot = currentSlotStr ? parseInt(currentSlotStr, 10) : -1;

    if (currentSlot !== preferredSlot && !this.slots[preferredSlot]) {
      if (currentSlot !== -1) this.slots[currentSlot] = false;
      this.slots[preferredSlot] = true;
      el.setAttribute("data-slot", preferredSlot.toString());

      const rect = this.anchor.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = preferredSlot * ((2 * Math.PI) / this.maxSlots);

      el.style.left = `${cx + this.radius * Math.cos(angle)}px`;
      el.style.top = `${cy + this.radius * Math.sin(angle)}px`;
    }
  }

  /**
   * Triggers the exit transition and schedules the element for DOM removal after
   * the animation duration has elapsed.
   * @param id The unique identifier of the element to hide.
   */
  private hideElement(id: string): void {
    const el = this.activeElements.get(id);
    if (!el) return;

    this.activeElements.delete(id);

    const slotStr = el.getAttribute("data-slot");
    if (slotStr) this.slots[parseInt(slotStr, 10)] = false;

    const rect = this.anchor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.classList.remove("context-ui-visible");

    const existingTimeout = el.getAttribute("data-timeout-id");
    if (existingTimeout) clearTimeout(parseInt(existingTimeout, 10));

    const timeoutId = window.setTimeout(() => {
      if (!this.activeElements.has(id) && el.parentElement) {
        el.remove();
      }
    }, this.animDuration);

    el.setAttribute("data-timeout-id", timeoutId.toString());
  }

  /**
   * Removes all managed elements from the DOM and clears all internal state.
   * Call this during component or page teardown.
   */
  public destroy(): void {
    for (const item of this.registry.values()) {
      if (item.domNode.parentElement) item.domNode.remove();
    }
    this.registry.clear();
    this.activeElements.clear();
  }
}

/**
 * A deferred engine holder that queues element registrations made before the engine
 * is initialized, then flushes them when the engine becomes available.
 *
 * This is used internally by all framework integrations to resolve the ordering gap
 * between item elements mounting and the anchor element resolving its engine instance.
 *
 * @template ContextType The shape of the context state.
 * @template VectorType The shape of the relevance vector.
 */
export class EngineHolder<ContextType, VectorType> {
  private engine: ContextUI<ContextType, VectorType> | null = null;
  private pending: Array<{
    id: string;
    node: HTMLElement;
    vector: VectorType;
  }> = [];

  /**
   * Attaches an initialized engine and flushes all pending registration calls.
   * @param engine An initialized ContextUI engine instance.
   */
  setEngine(engine: ContextUI<ContextType, VectorType>): void {
    this.engine = engine;
    for (const entry of this.pending) {
      this.engine.registerElement(entry.id, entry.node, entry.vector);
    }
    this.pending = [];
  }

  /**
   * Registers an element. If the engine is not yet attached, the call is queued
   * and replayed when setEngine is called.
   * @param id Unique element identifier.
   * @param node The HTMLElement to register.
   * @param vector The relevance vector for the element.
   */
  register(id: string, node: HTMLElement, vector: VectorType): void {
    if (this.engine) {
      this.engine.registerElement(id, node, vector);
    } else {
      this.pending.push({ id, node, vector });
    }
  }

  /**
   * Unregisters an element by ID. Also removes any matching entry from the pending queue.
   * @param id Unique element identifier.
   */
  unregister(id: string): void {
    this.engine?.unregisterElement(id);
    this.pending = this.pending.filter((e) => e.id !== id);
  }

  /**
   * Replaces the relevance vector of a registered element and triggers re-evaluation.
   * @param id Unique element identifier.
   * @param vector The new relevance vector.
   */
  updateVector(id: string, vector: VectorType): void {
    this.engine?.updateVector(id, vector);
  }

  /**
   * Merges a partial context update into the engine.
   * @param ctx Partial context state to merge.
   */
  updateContext(ctx: Partial<ContextType>): void {
    this.engine?.updateContext(ctx);
  }

  /**
   * Destroys the engine and clears all internal state including the pending queue.
   */
  destroy(): void {
    this.engine?.destroy();
    this.engine = null;
    this.pending = [];
  }
}

/**
 * Custom element that initializes the ContextUI engine and acts as the radial anchor.
 * Registered as the tag name context-ui.
 *
 * Attributes:
 *   relevance {string}           Name of a function available on window to use as the relevance algorithm.
 *   max-slots {number}           Number of radial slots. Defaults to 12.
 *   radius {number}              Radius in pixels from anchor center. Defaults to 150.
 *   animation-duration {number}  Transition duration in milliseconds. Defaults to 400.
 *
 * Properties:
 *   relevanceFn {Function}  Assign directly to provide the algorithm without requiring a global name.
 *
 * Methods:
 *   updateContext(ctx)  Merges ctx into the engine state and triggers evaluation.
 *   getEngine()         Returns the underlying ContextUI instance, or null if not yet mounted.
 *
 * @example
 * ```html
 * <context-ui relevance="myRelevanceImplementation" max-slots="8" radius="120">
 *   <context-item id="action1" vector='{"type":"action"}'>
 *     <button>Do Something</button>
 *   </context-item>
 * </context-ui>
 *
 * <script>
 *   function myRelevanceImplementation(context, vector) {
 *     return context.active === vector.type;
 *   }
 *   document.querySelector('context-ui').updateContext({ active: 'action' });
 * </script>
 * ```
 */
export class ContextUIElement extends HTMLElement {
  /**
   * Assign a function reference directly to bypass the window lookup performed
   * when the relevance attribute is a string.
   */
  public relevanceFn?: (
    ctx: unknown,
    vec: unknown,
  ) => boolean | RelevanceResult;

  private engine: ContextUI<unknown, unknown> | null = null;

  connectedCallback(): void {
    const fn = this.relevanceFn ?? this.resolveRelevanceFn();

    if (!fn) {
      console.warn(
        'ContextUI: no relevance function resolved. Provide the "relevance" attribute as a window function name, or set the "relevanceFn" property directly.',
      );
      return;
    }

    this.engine = new ContextUI({
      anchor: this,
      relevanceAlgorithm: fn,
      maxSlots: this.getIntAttr("max-slots", 12),
      radius: this.getIntAttr("radius", 150),
      animationDuration: this.getIntAttr("animation-duration", 400),
    });
  }

  disconnectedCallback(): void {
    this.engine?.destroy();
    this.engine = null;
  }

  /**
   * Returns the underlying ContextUI engine instance, or null if the element
   * has not yet connected to the DOM.
   */
  getEngine(): ContextUI<unknown, unknown> | null {
    return this.engine;
  }

  /**
   * Merges the given context object into the engine state and triggers a layout evaluation.
   * @param ctx Partial context state object to merge.
   */
  updateContext(ctx: Record<string, unknown>): void {
    this.engine?.updateContext(ctx);
  }

  private resolveRelevanceFn():
    | ((ctx: unknown, vec: unknown) => boolean | RelevanceResult)
    | null {
    const name = this.getAttribute("relevance");
    if (!name) return null;
    const fn = (window as unknown as Record<string, unknown>)[name];
    return typeof fn === "function"
      ? (fn as (ctx: unknown, vec: unknown) => boolean | RelevanceResult)
      : null;
  }

  private getIntAttr(name: string, fallback: number): number {
    const val = this.getAttribute(name);
    if (val === null) return fallback;
    const parsed = parseInt(val, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
}

/**
 * Custom element that registers its first child element with the nearest
 * context-ui ancestor's engine. Registered as the tag name context-item.
 *
 * Attributes:
 *   id {string}      Required. Unique identifier passed to the engine registry.
 *   vector {string}  JSON-serialized relevance vector. Defaults to an empty object.
 *                    Updating this attribute after mount triggers an engine vector update.
 *
 * @example
 * ```html
 * <context-item id="contact-alice" vector='{"type":"contact","name":"Alice"}'>
 *   <div class="bubble">Alice</div>
 * </context-item>
 * ```
 */
export class ContextItemElement extends HTMLElement {
  private engine: ContextUI<unknown, unknown> | null = null;
  private isConnected_ = false;

  static get observedAttributes(): string[] {
    return ["vector"];
  }

  connectedCallback(): void {
    customElements.whenDefined("context-ui").then(() => {
      if (!this.isConnected) return;
      const parent = this.closest("context-ui") as ContextUIElement | null;
      const parentEngine = parent?.getEngine();
      if (parentEngine) {
        this.connectToEngine(parentEngine);
      }
    });
  }

  disconnectedCallback(): void {
    const id = this.getAttribute("id");
    if (this.engine && id) {
      this.engine.unregisterElement(id);
    }
    this.engine = null;
    this.isConnected_ = false;
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    newValue: string | null,
  ): void {
    if (name === "vector" && this.isConnected_ && this.engine) {
      const id = this.getAttribute("id");
      if (!id || !newValue) return;
      try {
        this.engine.updateVector(id, JSON.parse(newValue));
      } catch {
        console.warn(
          `ContextItem id="${id}": invalid JSON in vector attribute after update.`,
        );
      }
    }
  }

  /**
   * Registers this element's first child with the provided engine instance.
   * Called by the parent context-ui element once its engine is initialized,
   * or directly by framework integrations.
   * @param engine The ContextUI engine instance to register with.
   */
  connectToEngine(engine: ContextUI<unknown, unknown>): void {
    if (this.isConnected_) return;

    const id = this.getAttribute("id");
    if (!id) {
      console.warn('ContextItem: the "id" attribute is required.');
      return;
    }

    const vectorAttr = this.getAttribute("vector");
    let vector: unknown = {};
    if (vectorAttr) {
      try {
        vector = JSON.parse(vectorAttr);
      } catch {
        console.warn(
          `ContextItem id="${id}": invalid JSON in vector attribute at mount. Using empty object.`,
        );
      }
    }

    const target = (this.firstElementChild as HTMLElement | null) ?? this;
    this.engine = engine;
    engine.registerElement(id, target, vector);
    this.isConnected_ = true;
  }
}

/**
 * Registers the context-ui and context-item custom elements with the browser's
 * CustomElementRegistry if they have not already been defined.
 * Called automatically when this module is imported in a browser context.
 * Invoke manually in environments where import-time side effects are undesirable,
 * such as SSR builds or test environments.
 */
export function defineElements(): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get("context-item")) {
    customElements.define("context-item", ContextItemElement);
  }
  if (!customElements.get("context-ui")) {
    customElements.define("context-ui", ContextUIElement);
  }
}

if (typeof window !== "undefined") {
  defineElements();
}
