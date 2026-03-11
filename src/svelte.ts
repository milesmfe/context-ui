/**
 * @fileoverview Svelte integration for ContextUI via a factory function that returns
 * a pair of Svelte actions sharing a single engine instance through a closure-held EngineHolder.
 * @module context-ui/svelte
 */

import { ContextUI, ContextUIConfig, EngineHolder } from "./core";

/**
 * Parameters passed to the item Svelte action.
 * @template VectorType The shape of the relevance vector for this element.
 */
export interface ContextItemParams<VectorType> {
  /**
   * Unique identifier for this element within the engine registry.
   */
  id: string;

  /**
   * The relevance vector for this element, passed to the relevance algorithm on every evaluation.
   */
  vector: VectorType;
}

/**
 * The object returned by createContextUI containing a pair of Svelte actions
 * and an updateContext function.
 * @template ContextType The shape of the global context state object.
 * @template VectorType The shape of the relevance vector attached to registered elements.
 */
export interface ContextUIActions<ContextType, VectorType> {
  /**
   * Svelte action applied to the anchor element. Initializes the ContextUI engine using
   * that node as the radial origin and attaches the engine to the shared EngineHolder.
   * The engine is destroyed when the node is removed from the DOM.
   *
   * Apply this action to exactly one element per createContextUI instance.
   *
   * @example
   * ```svelte
   * <div use:ui.anchor class="anchor">Open</div>
   * ```
   */
  anchor: (node: HTMLElement) => { destroy: () => void };

  /**
   * Svelte action applied to any element to register it with the engine.
   * Accepts an id and vector, and responds to parameter updates through the action's
   * update lifecycle, unregistering the old entry and registering a new one when params change.
   * Unregisters the element when the node is removed from the DOM.
   *
   * If the anchor action has not yet run when this action mounts, the registration is
   * queued internally and replayed once the engine is initialized.
   *
   * @example
   * ```svelte
   * <div use:ui.item={{ id: 'action1', vector: { type: 'action' } }}>
   *   <button>Do Something</button>
   * </div>
   *
   * {#each contacts as contact (contact.id)}
   *   <div use:ui.item={{ id: contact.id, vector: contact }}>
   *     {contact.name}
   *   </div>
   * {/each}
   * ```
   */
  item: (
    node: HTMLElement,
    params: ContextItemParams<VectorType>,
  ) => {
    update: (newParams: ContextItemParams<VectorType>) => void;
    destroy: () => void;
  };

  /**
   * Merges a partial context update into the engine state and triggers a layout evaluation.
   * Call this from a reactive statement to keep the engine synchronized with component state.
   *
   * @param ctx Partial context state to merge.
   *
   * @example
   * ```svelte
   * <script>
   *   let focus = null;
   *   let query = '';
   *   $: ui.updateContext({ focus, query });
   * </script>
   * ```
   */
  updateContext: (ctx: Partial<ContextType>) => void;
}

/**
 * Creates a self-contained ContextUI integration for Svelte applications.
 *
 * Returns a pair of Svelte actions (anchor and item) and an updateContext function that
 * all share a single EngineHolder instance through a closure. The engine is initialized
 * when the anchor action mounts and destroyed when it tears down. Item actions may mount
 * before the anchor in child components; registrations are queued and flushed automatically.
 *
 * @param config Engine configuration excluding the anchor, which is resolved by the anchor action.
 * @returns An object containing the anchor action, item action, and updateContext function.
 *
 * @template ContextType The shape of the global context state object.
 * @template VectorType The shape of the relevance vector attached to registered elements.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { createContextUI } from 'context-ui/svelte';
 *
 *   interface AppContext { active: string | null }
 *   interface ItemVector { id: string }
 *
 *   const ui = createContextUI<AppContext, ItemVector>({
 *     maxSlots: 8,
 *     radius: 130,
 *     relevanceAlgorithm: (ctx, vec) => ctx.active === vec.id,
 *   });
 *
 *   let active: string | null = null;
 *   $: ui.updateContext({ active });
 * </script>
 *
 * <button use:ui.anchor on:click={() => (active = null)}>
 *   {active ?? 'Open'}
 * </button>
 *
 * <div use:ui.item={{ id: 'search', vector: { id: 'search' } }}>
 *   <button on:click={() => (active = 'search')}>Search</button>
 * </div>
 *
 * {#each contacts as c (c.id)}
 *   <div use:ui.item={{ id: c.id, vector: { id: c.id } }}>
 *     {c.name}
 *   </div>
 * {/each}
 * ```
 */
export function createContextUI<ContextType, VectorType>(
  config: Omit<ContextUIConfig<ContextType, VectorType>, "anchor">,
): ContextUIActions<ContextType, VectorType> {
  const holder = new EngineHolder<ContextType, VectorType>();

  /**
   * Svelte action that initializes the ContextUI engine with the given node as the anchor.
   * @param node The HTML element to use as the radial layout origin.
   */
  function anchor(node: HTMLElement): { destroy: () => void } {
    const engine = new ContextUI<ContextType, VectorType>({
      ...config,
      anchor: node,
    });

    holder.setEngine(engine);

    return {
      destroy(): void {
        holder.destroy();
      },
    };
  }

  /**
   * Svelte action that registers the given node with the engine under the provided
   * id and vector. Handles parameter updates and teardown automatically.
   * @param node The HTML element to register with the engine.
   * @param params Registration parameters including the id and relevance vector.
   */
  function item(
    node: HTMLElement,
    params: ContextItemParams<VectorType>,
  ): {
    update: (newParams: ContextItemParams<VectorType>) => void;
    destroy: () => void;
  } {
    holder.register(params.id, node, params.vector);

    return {
      update(newParams: ContextItemParams<VectorType>): void {
        holder.unregister(params.id);
        params = newParams;
        holder.register(newParams.id, node, newParams.vector);
      },
      destroy(): void {
        holder.unregister(params.id);
      },
    };
  }

  /**
   * Merges a partial context update into the engine state and triggers evaluation.
   * @param ctx Partial context state to merge.
   */
  function updateContext(ctx: Partial<ContextType>): void {
    holder.updateContext(ctx);
  }

  return { anchor, item, updateContext };
}
