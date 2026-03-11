/**
 * Represents the result of a developer defined relevance calculation.
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
  anchor: HTMLElement;
  container?: HTMLElement;
  maxSlots?: number;
  radius?: number;
  animationDuration?: number;
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
 * The core ContextUI class for managing dynamic radial interfaces.
 * @template ContextType The shape of the global context state object.
 * @template VectorType The shape of the relevance vector attached to registered elements.
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
   * Initializes the ContextUI engine.
   * @param config The configuration options for the UI engine.
   */
  constructor(config: ContextUIConfig<ContextType, VectorType>) {
    this.anchor = config.anchor;
    this.container = config.container || document.body;
    this.maxSlots = config.maxSlots || 12;
    this.radius = config.radius || 150;
    this.animDuration = config.animationDuration || 400;
    this.relevanceAlgorithm = config.relevanceAlgorithm;

    this.registry = new Map();
    this.activeElements = new Map();
    this.slots = new Array(this.maxSlots).fill(false);
    this.currentContext = {};

    this.injectStyles();
  }

  /**
   * Injects default CSS rules required for layout and transitions.
   */
  private injectStyles(): void {
    if (document.getElementById("context-ui-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "context-ui-styles";
    style.textContent = `
      .context-ui-element {
        position: fixed;
        z-index: 5;
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, -50%) scale(0.2);
        transition: top 0.4s cubic-bezier(0.25, 1, 0.5, 1), 
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
        text-align: left;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Registers a new UI element with the context engine.
   * @param id A unique identifier for the element.
   * @param domNode The HTML element to be managed.
   * @param relevanceVector Developer defined data representing the element conditions.
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
   * Removes an element from the engine registry and cleans up the DOM.
   * @param id The unique identifier of the element to remove.
   */
  public unregisterElement(id: string): void {
    this.hideElement(id);
    this.registry.delete(id);
  }

  /**
   * Updates the global context state and evaluates all registered elements.
   * @param newContext An object representing the updated context variables.
   */
  public updateContext(newContext: Partial<ContextType>): void {
    this.currentContext = { ...this.currentContext, ...newContext };
    this.evaluate();
  }

  /**
   * Evaluates all registered elements against the relevance algorithm.
   */
  private evaluate(): void {
    for (const [id, item] of this.registry.entries()) {
      const result = this.relevanceAlgorithm(
        this.currentContext as ContextType,
        item.relevanceVector,
      );

      const isRelevant =
        typeof result === "object" ? result.isRelevant : result;
      const preferredSlot =
        typeof result === "object" ? result.slot : undefined;
      const isActive = this.activeElements.has(id);

      if (isRelevant && !isActive) {
        this.showElement(item, preferredSlot);
      } else if (!isRelevant && isActive) {
        this.hideElement(id);
      } else if (isRelevant && isActive) {
        this.updateElementPosition(item, preferredSlot);
      }
    }
  }

  /**
   * Places an element into an available slot and triggers its entry transition.
   * @param item The registry item to display.
   * @param preferredSlot The optional requested index for placement.
   */
  private showElement(
    item: RegistryItem<VectorType>,
    preferredSlot?: number,
  ): void {
    let slotIndex = -1;
    const el = item.domNode;

    const existingTimeout = el.getAttribute("data-timeout-id");
    if (existingTimeout) {
      clearTimeout(parseInt(existingTimeout, 10));
      el.removeAttribute("data-timeout-id");
    }

    if (
      preferredSlot !== undefined &&
      preferredSlot >= 0 &&
      preferredSlot < this.maxSlots &&
      !this.slots[preferredSlot]
    ) {
      slotIndex = preferredSlot;
    } else {
      const freeSlots: number[] = [];
      this.slots.forEach((occupied, i) => {
        if (!occupied) {
          freeSlots.push(i);
        }
      });
      if (freeSlots.length === 0) {
        return;
      }
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
    const endX = cx + this.radius * Math.cos(angle);
    const endY = cy + this.radius * Math.sin(angle);

    el.style.left = `${endX}px`;
    el.style.top = `${endY}px`;
    el.classList.add("context-ui-visible");

    this.activeElements.set(item.id, el);
  }

  /**
   * Updates the coordinates of an already visible element if its preferred slot changes.
   * @param item The registry item to update.
   * @param preferredSlot The new requested index for placement.
   */
  private updateElementPosition(
    item: RegistryItem<VectorType>,
    preferredSlot?: number,
  ): void {
    if (preferredSlot === undefined) {
      return;
    }

    const el = item.domNode;
    const currentSlotString = el.getAttribute("data-slot");
    const currentSlot = currentSlotString
      ? parseInt(currentSlotString, 10)
      : -1;

    if (currentSlot !== preferredSlot && !this.slots[preferredSlot]) {
      if (currentSlot !== -1) {
        this.slots[currentSlot] = false;
      }
      this.slots[preferredSlot] = true;
      el.setAttribute("data-slot", preferredSlot.toString());

      const rect = this.anchor.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const angle = preferredSlot * ((2 * Math.PI) / this.maxSlots);
      const endX = cx + this.radius * Math.cos(angle);
      const endY = cy + this.radius * Math.sin(angle);

      el.style.left = `${endX}px`;
      el.style.top = `${endY}px`;
    }
  }

  /**
   * Triggers the exit transition and queues the element for DOM removal.
   * @param id The unique ID of the element to hide.
   */
  private hideElement(id: string): void {
    const el = this.activeElements.get(id);
    if (!el) {
      return;
    }

    this.activeElements.delete(id);

    const currentSlotString = el.getAttribute("data-slot");
    if (currentSlotString) {
      this.slots[parseInt(currentSlotString, 10)] = false;
    }

    const rect = this.anchor.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.classList.remove("context-ui-visible");

    const existingTimeout = el.getAttribute("data-timeout-id");
    if (existingTimeout) {
      clearTimeout(parseInt(existingTimeout, 10));
    }

    const timeoutId = window.setTimeout(() => {
      if (!this.activeElements.has(id) && el.parentElement) {
        el.remove();
      }
    }, this.animDuration);

    el.setAttribute("data-timeout-id", timeoutId.toString());
  }

  /**
   * Cleans up the engine instance and removes all managed elements from the DOM.
   */
  public destroy(): void {
    for (const item of this.registry.values()) {
      if (item.domNode.parentElement) {
        item.domNode.remove();
      }
    }
    this.registry.clear();
    this.activeElements.clear();
  }
}
