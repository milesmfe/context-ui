import { useEffect, useRef, RefObject } from "react";
import { ContextUI, ContextUIConfig } from "./core";

/**
 * React Hook for integrating the ContextUI engine.
 * @template ContextType The shape of the global context state object.
 * @template VectorType The shape of the relevance vector attached to registered elements.
 * @param config The ContextUI configuration object excluding the anchor reference.
 */
export function useContextUI<ContextType, VectorType>(
  config: Omit<
    ContextUIConfig<ContextType, VectorType>,
    "anchor" | "container"
  >,
) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ContextUI<ContextType, VectorType> | null>(null);

  useEffect(() => {
    if (anchorRef.current && !engineRef.current) {
      engineRef.current = new ContextUI({
        ...config,
        anchor: anchorRef.current,
        container: containerRef.current || document.body,
      });
    }

    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [config]);

  /**
   * Updates the context and triggers a layout recalculation.
   */
  const updateContext = (newContext: Partial<ContextType>): void => {
    engineRef.current?.updateContext(newContext);
  };

  /**
   * Registers a DOM element directly with the engine.
   */
  const registerElement = (
    id: string,
    node: HTMLElement | null,
    vector: VectorType,
  ): void => {
    if (node && engineRef.current) {
      engineRef.current.registerElement(id, node, vector);
    }
  };

  /**
   * Unregisters a DOM element from the engine.
   */
  const unregisterElement = (id: string): void => {
    engineRef.current?.unregisterElement(id);
  };

  return {
    anchorRef,
    containerRef,
    updateContext,
    registerElement,
    unregisterElement,
  };
}
