/**
 * @fileoverview React integration for ContextUI via declarative component wrappers.
 * Provides ContextUIProvider, ContextItem, and the useContextUI hook.
 * @module context-ui/react
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useContext,
  createContext,
  createElement,
} from "react";
import type { ReactNode, CSSProperties, MutableRefObject } from "react";
import { ContextUI, EngineHolder, RelevanceResult } from "./core";

/**
 * Internal React context value shared between ContextUIProvider and ContextItem.
 * @template ContextType The shape of the context state.
 * @template VectorType The shape of the relevance vector.
 */
interface ReactEngineContextValue<ContextType, VectorType> {
  holder: EngineHolder<ContextType, VectorType>;
}

const ReactEngineContext = createContext<ReactEngineContextValue<
  unknown,
  unknown
> | null>(null);

/**
 * Props accepted by ContextUIProvider.
 * @template ContextType The shape of the global context state object.
 * @template VectorType The shape of the relevance vector attached to registered elements.
 */
export interface ContextUIProviderProps<ContextType, VectorType> {
  /**
   * Child elements rendered inside the anchor div.
   * Include ContextItem components alongside any visible anchor content.
   */
  children?: ReactNode;

  /**
   * The relevance algorithm. Called on every context update for each registered element.
   * Return a boolean or a RelevanceResult containing an optional preferred slot index.
   */
  relevance: (
    context: ContextType,
    vector: VectorType,
  ) => boolean | RelevanceResult;

  /**
   * Number of radial slots. Determines the maximum number of simultaneously
   * visible elements. Defaults to 12.
   */
  maxSlots?: number;

  /**
   * Radius in pixels from the anchor center to placed elements. Defaults to 150.
   */
  radius?: number;

  /**
   * Duration in milliseconds for entry and exit transitions. Defaults to 400.
   */
  animationDuration?: number;

  /**
   * CSS class applied to the rendered anchor div element.
   */
  className?: string;

  /**
   * Inline styles applied to the rendered anchor div element.
   */
  style?: CSSProperties;
}

/**
 * Renders the radial anchor element and provides the ContextUI engine to all
 * ContextItem descendants via React context. The rendered div is the anchor point
 * for the radial layout; apply className and style props to customize its appearance.
 *
 * The engine is initialized synchronously after the anchor div mounts using
 * useLayoutEffect, ensuring all ContextItem passive effects can register immediately.
 *
 * @template ContextType The shape of the global context state object.
 * @template VectorType The shape of the relevance vector attached to registered elements.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { updateContext } = useContextUI<AppContext>();
 *
 *   return (
 *     <ContextUIProvider
 *       relevance={(ctx, vec) => ctx.active === vec.id}
 *       maxSlots={8}
 *       radius={130}
 *       className="anchor"
 *       onClick={() => updateContext({ active: null })}
 *     >
 *       Open
 *       <ContextItem id="action1" vector={{ id: 'action1' }}>
 *         <button>Action</button>
 *       </ContextItem>
 *     </ContextUIProvider>
 *   );
 * }
 * ```
 */
export function ContextUIProvider<ContextType, VectorType>(
  props: ContextUIProviderProps<ContextType, VectorType>,
) {
  const {
    children,
    relevance,
    maxSlots,
    radius,
    animationDuration,
    className,
    style,
  } = props;

  const anchorRef = useRef<HTMLDivElement>(null);
  const holderRef: MutableRefObject<EngineHolder<ContextType, VectorType>> =
    useRef(new EngineHolder<ContextType, VectorType>());

  useLayoutEffect(() => {
    if (!anchorRef.current) return;

    const engine = new ContextUI<ContextType, VectorType>({
      anchor: anchorRef.current,
      relevanceAlgorithm: relevance,
      maxSlots,
      radius,
      animationDuration,
    });

    holderRef.current.setEngine(engine);

    return () => {
      holderRef.current.destroy();
    };
  }, []);

  const contextValue: ReactEngineContextValue<ContextType, VectorType> = {
    holder: holderRef.current,
  };

  return createElement(
    ReactEngineContext.Provider,
    { value: contextValue as ReactEngineContextValue<unknown, unknown> },
    createElement("div", { ref: anchorRef, className, style }, children),
  );
}

/**
 * Props accepted by ContextItem.
 * @template VectorType The shape of the relevance vector for this element.
 */
export interface ContextItemProps<VectorType> {
  /**
   * Unique identifier for this element within the engine registry.
   * Changing the id unmounts the old registration and creates a new one.
   */
  id: string;

  /**
   * The relevance vector passed to the relevance algorithm for this element.
   * Captured at registration time. To respond to vector changes, use
   * the engine's updateVector method via a separate effect, or change the id
   * to force a full re-registration.
   */
  vector: VectorType;

  /**
   * Content rendered inside the managed wrapper element.
   * This content travels with the element as the engine repositions it.
   */
  children?: ReactNode;

  /**
   * CSS class applied to the managed wrapper div.
   */
  className?: string;

  /**
   * Inline styles applied to the managed wrapper div.
   */
  style?: CSSProperties;
}

/**
 * Registers a child element with the nearest ContextUIProvider's engine.
 * Renders a div wrapper whose position is managed by the engine according to
 * the relevance algorithm output.
 *
 * Registration occurs in a passive effect (useEffect), which runs after the
 * parent's useLayoutEffect has initialized the engine. Items rendered during
 * the initial mount therefore always have a live engine to register with.
 *
 * When the component unmounts, it unregisters from the engine and triggers
 * the exit transition.
 *
 * @template VectorType The shape of the relevance vector for this element.
 *
 * @example
 * ```tsx
 * <ContextItem
 *   id="contact-alice"
 *   vector={{ type: 'contact', name: 'Alice' }}
 *   className="bubble"
 * >
 *   Alice
 * </ContextItem>
 * ```
 */
export function ContextItem<VectorType>(props: ContextItemProps<VectorType>) {
  const { id, vector, children, className, style } = props;
  const ctx = useContext(ReactEngineContext) as ReactEngineContextValue<
    unknown,
    VectorType
  > | null;
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctx || !nodeRef.current) return;
    ctx.holder.register(id, nodeRef.current, vector);
    return () => {
      ctx.holder.unregister(id);
    };
  }, [ctx, id]);

  return createElement("div", { ref: nodeRef, className, style }, children);
}

/**
 * Return type of the useContextUI hook.
 * @template ContextType The shape of the context state.
 */
export interface UseContextUIReturn<ContextType> {
  /**
   * Merges a partial context object into the engine state and triggers
   * a layout evaluation for all registered elements.
   *
   * @param ctx Partial context state to merge.
   */
  updateContext: (ctx: Partial<ContextType>) => void;
}

/**
 * Returns the updateContext function from the nearest ContextUIProvider in the
 * component tree. Must be called from a component rendered inside a ContextUIProvider.
 *
 * @template ContextType The shape of the context state.
 * @returns An object containing the updateContext function.
 *
 * @example
 * ```tsx
 * function SearchInput() {
 *   const { updateContext } = useContextUI<{ query: string }>();
 *   return (
 *     <input
 *       onChange={(e) => updateContext({ query: e.target.value })}
 *     />
 *   );
 * }
 * ```
 */
export function useContextUI<ContextType>(): UseContextUIReturn<ContextType> {
  const ctx = useContext(ReactEngineContext) as ReactEngineContextValue<
    ContextType,
    unknown
  > | null;

  return {
    updateContext: (newCtx: Partial<ContextType>) => {
      ctx?.holder.updateContext(newCtx);
    },
  };
}
