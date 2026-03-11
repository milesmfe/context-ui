import { ContextUI, ContextUIConfig } from "./core";

/**
 * Return type for the Svelte action.
 */
interface ContextUIActionReturn<ContextType, VectorType> {
  update?: (
    newConfig: Omit<ContextUIConfig<ContextType, VectorType>, "anchor">,
  ) => void;
  destroy?: () => void;
}

/**
 * A Svelte action to initialize a node as the ContextUI anchor.
 * @param node The HTML element serving as the anchor.
 * @param config The configuration object for the ContextUI engine.
 */
export function contextUIAnchor<ContextType, VectorType>(
  node: HTMLElement,
  config: Omit<ContextUIConfig<ContextType, VectorType>, "anchor">,
): ContextUIActionReturn<ContextType, VectorType> {
  let engine = new ContextUI({ ...config, anchor: node });

  // Attach the engine to the window or a store for child elements to access
  (window as any).__contextUIEngine = engine;

  return {
    destroy() {
      engine.destroy();
      delete (window as any).__contextUIEngine;
    },
  };
}

/**
 * A Svelte action to register child elements to the active engine.
 * @param node The HTML element to be registered.
 * @param params Object containing the id and relevance vector.
 */
export function contextUIElement<VectorType>(
  node: HTMLElement,
  params: { id: string; vector: VectorType },
): { destroy?: () => void } {
  const engine = (window as any).__contextUIEngine;

  if (engine) {
    node.classList.add("context-ui-default-bubble"); // Apply default styles
    engine.registerElement(params.id, node, params.vector);
  }

  return {
    destroy() {
      if (engine) {
        engine.unregisterElement(params.id);
      }
    },
  };
}
