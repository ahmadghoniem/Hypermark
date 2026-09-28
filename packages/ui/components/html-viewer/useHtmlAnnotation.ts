import { useState, useEffect, useCallback, useRef, type RefObject } from "react";
import { AnnotationType, type Annotation, type HtmlAnnotationTarget, type HtmlElementAnchor, type ImageAttachment } from "../../types";
import type { QuickLabel } from "../../utils/quickLabels";
import { getIdentity } from "../../utils/identity";
import type {
  CommentPopoverState,
  UseAnnotationHighlighterReturn,
} from "../../hooks/useAnnotationHighlighter";
import { BRIDGE_PROTOCOL_VERSION } from "./bridge-script";

const PREFIX = "hypermark-bridge-";

/** Outcome of comparing a bridge `ready` message's stamp with this parent. */
export interface BridgeProtocolVerdict {
  ok: boolean;
  /** The version this parent bundle speaks (`BRIDGE_PROTOCOL_VERSION`). */
  expected: number;
  /** The version the bridge reported; `undefined` when the ready carried none
   *  (a bridge asset built before the stamp existed, or a forged message). */
  reported: number | undefined;
}

/**
 * Compare a `ready` message against the parent's protocol version. A missing
 * stamp counts as a mismatch: the only way it can be absent is a bridge asset
 * older than the parent (or a page forging the message), which is exactly
 * the drift this check exists to name.
 */
export function checkBridgeProtocolVersion(data: unknown): BridgeProtocolVerdict {
  const raw = isRecord(data) ? data.protocolVersion : undefined;
  const reported = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
  return {
    ok: reported === BRIDGE_PROTOCOL_VERSION,
    expected: BRIDGE_PROTOCOL_VERSION,
    reported,
  };
}

/** The one console warning a mismatch produces; names both versions. */
export function formatBridgeProtocolWarning(
  verdict: BridgeProtocolVerdict,
  bridgeScriptUrl?: string,
): string {
  const reported = verdict.reported === undefined ? "none" : String(verdict.reported);
  const source = bridgeScriptUrl ? `the bridge script at ${bridgeScriptUrl}` : "the bridge script";
  return `[hypermark] HTML bridge protocol version mismatch: this viewer expects ${verdict.expected}, ${source} reported ${reported}. Serve the bridge-script asset from the same @hypermark/ui version as the viewer.`;
}

// Collision-proof annotation ids. `Date.now()` alone repeats within a millisecond,
// so two quick annotations could share a data-bind-id and clobber each other.
let htmlAnnSeq = 0;
function nextHtmlAnnId(): string {
  return `html-ann-${Date.now().toString(36)}-${(htmlAnnSeq++).toString(36)}`;
}

// Ids minted for locally created annotations (create-mark) live per hook
// instance (mintedIdsRef below), not per module: the unanchored union only
// consults them against the bridge of the instance that minted them (a
// remounted viewer restores from the host's list and never reports an id it
// was not asked for), and a module-wide set leaked every id ever minted into
// unrelated later instances of a long-lived host page.

function htmlCommentDraftKey(
  text: string,
  anchor?: HtmlElementAnchor | null,
  targetKey?: string,
): string {
  return `html-selection:${targetKey ?? JSON.stringify(anchor ?? null)}:${text}`;
}

interface BridgeSelectionMessage {
  type: `${typeof PREFIX}selection`;
  text: string;
  rect: BridgeRect;
  /** Serialized element anchor (pinpoint clicks) — validated, size-capped. */
  anchor?: HtmlElementAnchor;
  /** True when the selection came from a pinpoint click on an element. */
  pinpoint?: boolean;
  /** Bridge-assigned key for the primary target (multi-select bookkeeping). */
  targetKey?: string;
  /** Semantic label from the pinpoint hover cascade (chips + export). */
  targetLabel?: string;
}

/** One draft target in an in-flight multi-select comment. Index 0 is primary. */
export interface HtmlDraftTarget {
  key: string;
  label?: string;
  text: string;
  anchor: HtmlElementAnchor | null;
}

interface BridgeMultiTargetAddedMessage {
  type: `${typeof PREFIX}multi-target-added`;
  key: string;
  label?: string;
  text: string;
  anchor?: HtmlElementAnchor;
}

interface BridgeRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type BridgeMessage =
  | BridgeSelectionMessage
  | BridgeMultiTargetAddedMessage
  | { type: `${typeof PREFIX}multi-target-removed`; key: string }
  | { type: `${typeof PREFIX}pointer`; x: number; y: number; shift: boolean }
  | { type: `${typeof PREFIX}selection-clear` }
  | { type: `${typeof PREFIX}selection-rect`; rect: BridgeRect }
  | { type: `${typeof PREFIX}mark-click`; id: string }
  | { type: `${typeof PREFIX}unanchored`; ids: string[] }
  | { type: `${typeof PREFIX}resize`; height: number };

/** Dependencies and callbacks for the sandboxed HTML annotation bridge. */
export interface UseHtmlAnnotationOptions {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** Whether selection bridge messages may open composers or create annotations. */
  enabled?: boolean;
  annotations: Annotation[];
  onAddAnnotation?: (ann: Annotation) => void;
  onSelectAnnotation?: (id: string | null) => void;
  selectedAnnotationId: string | null;
  onResize?: (height: number) => void;
  /** Validated pointer positions relayed from inside the iframe while a
   *  pinpoint draft is open (iframe-local viewport coordinates), with the
   *  Shift state observed by the iframe (the parent cannot see modifiers
   *  held while the pointer lives in the sandbox). Drives the composer-yield
   *  fade in the host component. */
  onBridgePointer?: (x: number, y: number, shift: boolean) => void;
  /** Reports the full set of annotation ids that currently have NO live
   *  representation on the page — every target dead, or the restore never
   *  resolved (fail-closed anchors hide markers rather than guess). Called
   *  with the complete current set whenever it changes, including back to
   *  empty on recovery. Delivered in readOnly mode too: view-only surfaces
   *  are exactly where silently missing markers would go unnoticed. */
  onUnanchoredChange?: (ids: string[]) => void;
  /** Product cap on additional (shift-click) targets per comment, 0..16.
   *  Applied at the trust boundary, on submit, on restore, and carried to
   *  the bridge on arm-multi-select so the in-page toggle stops at the
   *  same number. Absent: the package's 16, and the arm message is unchanged. */
  maxAdditionalTargets?: number;
  /** scrollIntoView behavior for scroll-to (selecting an annotation).
   *  Absent: smooth, as before; pass 'auto' to honor reduced motion. */
  scrollBehavior?: 'smooth' | 'auto';
}

/** Clamp a host cap into the package's bound; anything unusable is the default. */
function resolveMaxAdditionalTargets(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return MAX_ADDITIONAL_TARGETS;
  return Math.max(0, Math.min(MAX_ADDITIONAL_TARGETS, Math.floor(value)));
}

function postToIframe(
  iframe: HTMLIFrameElement | null,
  msg: Record<string, unknown>,
) {
  iframe?.contentWindow?.postMessage(msg, "*");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Size caps for the anchor DTO — the bridge script runs inside a sandboxed
// iframe rendering arbitrary HTML, so everything it posts is validated and
// bounded before it can reach React state or the annotation model.
const MAX_ANCHOR_SELECTOR_LENGTH = 1024;
const MAX_ANCHOR_TAG_LENGTH = 64;
const MAX_ANCHOR_TEXT_LENGTH = 400;
// Multi-select caps: the additional-target array is bounded at the trust
// boundary (a hostile page cannot grow a draft past this), and the bridge's
// short target keys / 40-char hover labels get generous-but-hard ceilings.
const MAX_ADDITIONAL_TARGETS = 16;
const MAX_TARGET_KEY_LENGTH = 64;
const MAX_TARGET_LABEL_LENGTH = 64;
// Selection text is page-controlled too (a pinpoint click posts the element's
// entire textContent), so it gets the same treatment: truncated here — not
// rejected, a legitimate huge selection still annotates — before it can reach
// React state, drafts, exported feedback, or a share URL. Mirrors
// MAX_SELECTION_TEXT in bridge-script.ts; this side is the authoritative one.
const MAX_SELECTION_TEXT_LENGTH = 10000;

/** Truncate to the cap without ever splitting a UTF-16 surrogate pair (a
 * lone high surrogate becomes U+FFFD once UTF-8-encoded downstream). */
function capSelectionText(text: string): string {
  if (text.length <= MAX_SELECTION_TEXT_LENGTH) return text;
  let cut = MAX_SELECTION_TEXT_LENGTH;
  const last = text.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return text.slice(0, cut);
}

/**
 * Validate a bridge-posted normalized marker point. Fail-closed but additive:
 * a malformed point is DROPPED (the marker falls back to the target-rect
 * default) without rejecting the anchor it rides on; finite values are
 * clamped into the normalized 0..1 range.
 */
function parseAnchorPoint(value: unknown): { x: number; y: number } | undefined {
  if (!isRecord(value)) return undefined;
  const { x, y } = value;
  if (
    typeof x !== "number" || !Number.isFinite(x)
    || typeof y !== "number" || !Number.isFinite(y)
  ) {
    return undefined;
  }
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

/** Validate a bridge-posted element anchor. Exported for protocol tests. */
function parseHtmlElementAnchor(value: unknown): HtmlElementAnchor | null {
  if (!isRecord(value)) return null;
  const { selector, tagName, text } = value;
  if (
    typeof selector !== "string"
    || selector.length === 0
    || selector.length > MAX_ANCHOR_SELECTOR_LENGTH
    || typeof tagName !== "string"
    || tagName.length === 0
    || tagName.length > MAX_ANCHOR_TAG_LENGTH
  ) {
    return null;
  }
  const point = parseAnchorPoint(value.point);
  if (text === undefined) return { selector, tagName, ...(point ? { point } : {}) };
  if (typeof text !== "string" || text.length > MAX_ANCHOR_TEXT_LENGTH) return null;
  return { selector, tagName, text, ...(point ? { point } : {}) };
}

function parseTargetKey(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TARGET_KEY_LENGTH
    ? value
    : null;
}

function parseTargetLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Labels derive from page-controlled attributes (aria-label etc.), so a
  // hostile page can embed newlines that would become real markdown structure
  // in the exported feedback — collapse ALL whitespace at the trust boundary.
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return undefined;
  return collapsed.length > MAX_TARGET_LABEL_LENGTH
    ? collapsed.slice(0, MAX_TARGET_LABEL_LENGTH)
    : collapsed;
}

function parseBridgeRect(value: unknown): BridgeRect | null {
  if (!isRecord(value)) return null;
  const { top, left, width, height } = value;
  return typeof top === "number" && Number.isFinite(top)
    && typeof left === "number" && Number.isFinite(left)
    && typeof width === "number" && Number.isFinite(width)
    && typeof height === "number" && Number.isFinite(height)
    ? { top, left, width, height }
    : null;
}

/** Validate any bridge message. Exported for protocol tests. */
function parseBridgeMessage(value: unknown): BridgeMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  switch (value.type) {
    case `${PREFIX}selection`: {
      const rect = parseBridgeRect(value.rect);
      if (typeof value.text !== "string" || !rect) return null;
      return {
        type: value.type,
        text: capSelectionText(value.text),
        rect,
        anchor: parseHtmlElementAnchor(value.anchor) ?? undefined,
        pinpoint: value.pinpoint === true,
        targetKey: parseTargetKey(value.targetKey) ?? undefined,
        targetLabel: parseTargetLabel(value.targetLabel),
      };
    }
    case `${PREFIX}multi-target-added`: {
      const key = parseTargetKey(value.key);
      if (!key || typeof value.text !== "string") return null;
      return {
        type: value.type,
        key,
        label: parseTargetLabel(value.label),
        text: capSelectionText(value.text),
        anchor: parseHtmlElementAnchor(value.anchor) ?? undefined,
      };
    }
    case `${PREFIX}multi-target-removed`: {
      const key = parseTargetKey(value.key);
      return key ? { type: value.type, key } : null;
    }
    case `${PREFIX}pointer`:
      return typeof value.x === "number" && Number.isFinite(value.x)
        && typeof value.y === "number" && Number.isFinite(value.y)
        ? { type: value.type, x: value.x, y: value.y, shift: value.shift === true }
        : null;
    case `${PREFIX}selection-clear`:
      return { type: value.type };
    case `${PREFIX}selection-rect`: {
      const rect = parseBridgeRect(value.rect);
      return rect ? { type: value.type, rect } : null;
    }
    case `${PREFIX}mark-click`:
      // The id is page-controlled like every other bridge string: cap it like
      // the bridge's own sync validation does (256) so a hostile page cannot
      // ship an unbounded string into parent state via a forged mark-click.
      return typeof value.id === "string" && value.id.length <= 256
        ? { type: value.type, id: value.id }
        : null;
    case `${PREFIX}unanchored`: {
      // Bounded like the bridge's own emission (512 ids, 256 chars each); any
      // out-of-contract entry rejects the whole report — the real bridge
      // never sends one, so a violation means a forged message.
      if (!Array.isArray(value.ids) || value.ids.length > 512) return null;
      const unanchoredIds: string[] = [];
      for (const entry of value.ids) {
        if (typeof entry !== "string" || entry.length > 256) return null;
        unanchoredIds.push(entry);
      }
      return { type: value.type, ids: unanchoredIds };
    }
    case `${PREFIX}resize`:
      return typeof value.height === "number" && Number.isFinite(value.height)
        ? { type: value.type, height: value.height }
        : null;
    default:
      return null;
  }
}

/**
 * Adapt source-validated iframe messages to the existing annotation UI.
 *
 * Malformed bridge payloads are ignored; annotations are posted back through
 * the iframe protocol and reported through the supplied callbacks.
 */
export function useHtmlAnnotation({
  iframeRef,
  enabled = true,
  onAddAnnotation,
  onSelectAnnotation,
  selectedAnnotationId,
  onResize,
  onBridgePointer,
  onUnanchoredChange,
  maxAdditionalTargets,
  scrollBehavior,
}: UseHtmlAnnotationOptions): Omit<
  UseAnnotationHighlighterReturn,
  "highlighterRef" | "highlightRange" | "highlightMathElement"
> & {
  /** In-flight multi-select targets (index 0 = primary); empty outside pinpoint drafts. */
  draftTargets: HtmlDraftTarget[];
  /** Remove one draft target (chip X). Removing the last cancels the draft. */
  removeDraftTarget: (key: string) => void;
  /** Flash a draft target's pinned outline in the page (chip hover). */
  flashDraftTarget: (key: string) => void;
  /** Bumped after every target add/remove so the composer can refocus its textarea. */
  composerFocusToken: number;
  /** Composer quick label: submits the label with the same anchor and
   *  multi-select targets a typed comment would carry. */
  handleCommentQuickLabel: (label: QuickLabel) => void;
  /** Ids this module minted for locally created annotations (create-mark),
   *  for the unanchored union: a minted id the host never listed is a
   *  swapped-out local mark, not a host row. Read-only, stable identity. */
  createdAnnotationIds: ReadonlySet<string>;
} {
  const [commentPopover, setCommentPopover] = useState<CommentPopoverState | null>(null);
  const [draftTargets, setDraftTargets] = useState<HtmlDraftTarget[]>([]);
  const [composerFocusToken, setComposerFocusToken] = useState(0);

  const pendingTextRef = useRef<string>("");
  // Element anchor for the pending pinpoint selection — committed onto the
  // annotation so restoration can resolve the exact element again.
  const pendingAnchorRef = useRef<HtmlElementAnchor | null>(null);
  const draftTargetsRef = useRef<HtmlDraftTarget[]>(draftTargets);
  draftTargetsRef.current = draftTargets;
  const onBridgePointerRef = useRef(onBridgePointer);
  onBridgePointerRef.current = onBridgePointer;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // Ids this instance minted (see the module comment above nextHtmlAnnId);
  // released on unmount so nothing outlives the viewer that created it.
  const mintedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const minted = mintedIdsRef.current;
    return () => {
      minted.clear();
    };
  }, []);
  // Mirror the open comment state so the selection-clear handler can
  // tell whether the user is mid-compose and must keep the captured text alive.
  const commentPopoverRef = useRef(commentPopover);
  commentPopoverRef.current = commentPopover;

  const onAddRef = useRef(onAddAnnotation);
  onAddRef.current = onAddAnnotation;
  const onSelectRef = useRef(onSelectAnnotation);
  onSelectRef.current = onSelectAnnotation;
  const onUnanchoredChangeRef = useRef(onUnanchoredChange);
  onUnanchoredChangeRef.current = onUnanchoredChange;
  // The effective cap and whether the host set one: only an explicit cap
  // rides on arm-multi-select, so an unconfigured viewer posts today's message.
  const maxTargetsRef = useRef(resolveMaxAdditionalTargets(maxAdditionalTargets));
  maxTargetsRef.current = resolveMaxAdditionalTargets(maxAdditionalTargets);
  const hostCapRef = useRef(maxAdditionalTargets !== undefined);
  hostCapRef.current = maxAdditionalTargets !== undefined;

  const anchorRef = useRef<HTMLDivElement | null>(null);

  const post = useCallback(
    (msg: Record<string, unknown>) => {
      postToIframe(iframeRef.current, msg);
    },
    [iframeRef],
  );

  /**
   * Remove one draft target. Removing the primary promotes the next remaining
   * target (the composer's context text and pending anchor follow it);
   * removing the final target cancels the draft. The bridge performs the same
   * deterministic update on its side, so `remove-target` is ALWAYS posted:
   * for chip removals it drives the bridge, and for bridge-echoed removals it
   * is an idempotent no-op — which also resyncs the two sides if a hostile
   * page forged the removal message the bridge never actually performed.
   */
  const applyTargetRemoval = useCallback(
    (key: string) => {
      const targets = draftTargetsRef.current;
      const index = targets.findIndex((t) => t.key === key);
      if (index < 0) return;
      post({ type: `${PREFIX}remove-target`, key });
      const remaining = targets.filter((t) => t.key !== key);
      if (remaining.length === 0) {
        // Final target removed — the draft is cancelled (bridge side already
        // tore down its pinned state via toggle-off or the remove-target post).
        setDraftTargets([]);
        setCommentPopover(null);
        pendingTextRef.current = "";
        pendingAnchorRef.current = null;
        return;
      }
      if (index === 0) {
        // Primary removed — promote the next target: the comment's quoted
        // text and restoration anchor now belong to it.
        const next = remaining[0]!;
        pendingTextRef.current = next.text;
        pendingAnchorRef.current = next.anchor;
        setCommentPopover((prev) =>
          prev ? { ...prev, contextText: next.text, selectedText: next.text } : prev,
        );
      }
      setDraftTargets(remaining);
      setComposerFocusToken((t) => t + 1);
    },
    [post],
  );

  const getOrCreateAnchor = useCallback(() => {
    if (!anchorRef.current) {
      const div = document.createElement("div");
      div.style.position = "fixed";
      div.style.pointerEvents = "none";
      div.style.width = "1px";
      div.style.height = "1px";
      document.body.appendChild(div);
      anchorRef.current = div;
    }
    return anchorRef.current;
  }, []);

  const positionAnchor = useCallback(
    (bridgeRect: { top: number; left: number; width: number; height: number }) => {
      const iframe = iframeRef.current;
      if (!iframe) return null;
      const iframeRect = iframe.getBoundingClientRect();
      // Fresh anchor per selection. The toolbar/popover recompute position only
      // when their `element` node identity changes, so reusing one anchor div
      // leaves them pinned to the previous selection. Drop the old one first.
      if (anchorRef.current) anchorRef.current.remove();
      anchorRef.current = null;
      const anchor = getOrCreateAnchor();
      anchor.style.top = `${iframeRect.top + bridgeRect.top}px`;
      anchor.style.left = `${iframeRect.left + bridgeRect.left + bridgeRect.width / 2}px`;
      return anchor;
    },
    [iframeRef, getOrCreateAnchor],
  );

  useEffect(() => {
    function handler(e: MessageEvent<unknown>) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const message = parseBridgeMessage(e.data);
      if (!message) return;

      const type = message.type;

      if (
        !enabledRef.current
        && type !== `${PREFIX}mark-click`
        && type !== `${PREFIX}unanchored`
        && type !== `${PREFIX}resize`
      ) {
        return;
      }

      if (type === `${PREFIX}selection`) {
        pendingTextRef.current = message.text;
        pendingAnchorRef.current = message.anchor ?? null;
        setDraftTargets([]); // a new selection always starts a fresh draft
        const anchor = positionAnchor(message.rect);
        if (!anchor) return;

        if (message.pinpoint) {
          // Release iframe focus so the popover's textarea autofocus lands in the
          // parent (otherwise the iframe keeps focus and swallows further keys).
          iframeRef.current?.blur();
          setCommentPopover({
            anchorEl: anchor,
            contextText: message.text,
            selectedText: message.text,
            draftKey: htmlCommentDraftKey(message.text, message.anchor, message.targetKey),
          });
          // Pinpoint drafts arm shift-click multi-select: the clicked element
          // becomes the primary target of the (single) draft comment. The
          // bridge only accepts shift-toggles once THIS explicit arm arrives,
          // so drafts the composer does not mirror (quickLabel, redline) can
          // never accumulate pins the saved annotation would not carry.
          if (message.pinpoint && message.targetKey) {
            setDraftTargets([
              {
                key: message.targetKey,
                label: message.targetLabel,
                text: message.text,
                anchor: message.anchor ?? null,
              },
            ]);
            post({
              type: `${PREFIX}arm-multi-select`,
              key: message.targetKey,
              ...(hostCapRef.current ? { max: maxTargetsRef.current } : {}),
            });
          }
        } else {
          // A plain drag opens the composer on the selection. Release iframe
          // focus first, same as the pinpoint path, so the textarea can take it.
          iframeRef.current?.blur();
          setCommentPopover({
            anchorEl: anchor,
            contextText: message.text,
            selectedText: message.text,
            draftKey: htmlCommentDraftKey(message.text, message.anchor),
          });
        }
      }

      if (type === `${PREFIX}multi-target-added`) {
        // Only meaningful while a pinpoint draft composer is open. The array
        // cap is enforced HERE, at the trust boundary — a hostile page cannot
        // grow the draft past MAX_ADDITIONAL_TARGETS extra targets.
        const targets = draftTargetsRef.current;
        if (
          commentPopoverRef.current
          && targets.length > 0
          && targets.length < 1 + maxTargetsRef.current
          && !targets.some((t) => t.key === message.key)
        ) {
          setDraftTargets([
            ...targets,
            {
              key: message.key,
              label: message.label,
              text: message.text,
              anchor: message.anchor ?? null,
            },
          ]);
          setComposerFocusToken((t) => t + 1);
        }
      }

      if (type === `${PREFIX}multi-target-removed`) {
        applyTargetRemoval(message.key);
      }

      if (type === `${PREFIX}pointer`) {
        onBridgePointerRef.current?.(message.x, message.y, message.shift);
      }

      if (type === `${PREFIX}selection-clear`) {
        // Keep the captured text alive while a comment is open: the user
        // is composing, and the selection collapsing or scrolling out of view must
        // not drop the annotation on submit. It's overwritten on the next selection.
        if (!commentPopoverRef.current) {
          pendingTextRef.current = "";
          pendingAnchorRef.current = null;
        }
      }

      if (type === `${PREFIX}selection-rect`) {
        // The iframe content scrolled — move the anchor to the selection's new
        // position and nudge the toolbar/popover (which listen to window scroll) to
        // recompute, so they stay attached to the selection.
        const iframe = iframeRef.current;
        const anchor = anchorRef.current;
        if (!iframe || !anchor) return;
        const r = message.rect;
        const iframeRect = iframe.getBoundingClientRect();
        anchor.style.top = `${iframeRect.top + r.top}px`;
        anchor.style.left = `${iframeRect.left + r.left + r.width / 2}px`;
        window.dispatchEvent(new Event("scroll"));
      }

      if (type === `${PREFIX}mark-click`) {
        onSelectRef.current?.(message.id);
      }

      if (type === `${PREFIX}unanchored`) {
        onUnanchoredChangeRef.current?.(message.ids);
      }

      if (type === `${PREFIX}resize`) {
        onResize?.(message.height);
      }
    }

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (anchorRef.current) {
        anchorRef.current.remove();
        anchorRef.current = null;
      }
    };
  }, [post, iframeRef, positionAnchor, onResize, getOrCreateAnchor, applyTargetRemoval]);

  useEffect(() => {
    if (enabled) return;
    setCommentPopover(null);
    setDraftTargets([]);
    pendingTextRef.current = "";
    pendingAnchorRef.current = null;
    anchorRef.current?.remove();
    anchorRef.current = null;
    post({ type: `${PREFIX}cancel-selection` });
  }, [enabled, post]);

  useEffect(() => {
    if (selectedAnnotationId) {
      post({
        type: `${PREFIX}scroll-to`,
        id: selectedAnnotationId,
        // Only an explicit host preference rides along; the default message
        // is unchanged and the bridge scrolls smoothly as before.
        ...(scrollBehavior ? { behavior: scrollBehavior } : {}),
      });
    } else {
      post({
        type: `${PREFIX}focus-mark`,
        id: null,
      });
    }
  }, [selectedAnnotationId, post, scrollBehavior]);

  const handleCommentSubmit = useCallback(
    (comment: string, images?: ImageAttachment[]) => {
      if (!enabledRef.current) return;
      // Prefer the text captured when the popover opened — it can't be clobbered by
      // a later selection change or clear while the user is composing the comment.
      const text = commentPopoverRef.current?.selectedText || pendingTextRef.current;
      if (!text) return;

      // Multi-select: everything past the primary rides on the SAME comment.
      const targets = draftTargetsRef.current;
      const additionalTargets: HtmlAnnotationTarget[] | undefined =
        targets.length > 1
          ? targets.slice(1, 1 + maxTargetsRef.current).map((t) => ({
              label: t.label,
              text: t.text,
              anchor: t.anchor ?? undefined,
            }))
          : undefined;

      const id = nextHtmlAnnId();
      mintedIdsRef.current.add(id);
      post({ type: `${PREFIX}create-mark`, id, annotationType: "comment" });
      onAddRef.current?.({
        id,
        blockId: "",
        startOffset: 0,
        endOffset: 0,
        type: AnnotationType.COMMENT,
        text: comment,
        originalText: text,
        author: getIdentity(),
        createdA: Date.now(),
        images,
        htmlAnchor: pendingAnchorRef.current ?? undefined,
        htmlAdditionalTargets: additionalTargets,
      });

      setCommentPopover(null);
      setDraftTargets([]);
      pendingTextRef.current = "";
      pendingAnchorRef.current = null;
    },
    [post],
  );

  // The composer's quick labels (pinpoint clicks land straight in the
  // composer and never see the selection toolbar). Mirrors
  // handleCommentSubmit — same anchor, same multi-select targets — but
  // emits the label instead of typed prose.
  const handleCommentQuickLabel = useCallback((label: QuickLabel) => {
    if (!enabledRef.current) return;
    const text = commentPopoverRef.current?.selectedText || pendingTextRef.current;
    if (!text) return;

    const targets = draftTargetsRef.current;
    const additionalTargets: HtmlAnnotationTarget[] | undefined =
      targets.length > 1
        ? targets.slice(1, 1 + maxTargetsRef.current).map((t) => ({
            label: t.label,
            text: t.text,
            anchor: t.anchor ?? undefined,
          }))
        : undefined;

    const id = nextHtmlAnnId();
    mintedIdsRef.current.add(id);
    post({ type: `${PREFIX}create-mark`, id, annotationType: "comment" });
    onAddRef.current?.({
      id,
      blockId: "",
      startOffset: 0,
      endOffset: 0,
      type: AnnotationType.COMMENT,
      text: label.text,
      originalText: text,
      quickLabelTip: label.tip,
      author: getIdentity(),
      createdA: Date.now(),
      htmlAnchor: pendingAnchorRef.current ?? undefined,
      htmlAdditionalTargets: additionalTargets,
    });

    setCommentPopover(null);
    setDraftTargets([]);
    pendingTextRef.current = "";
    pendingAnchorRef.current = null;
  }, [post]);

  const handleCommentClose = useCallback(() => {
    post({ type: `${PREFIX}cancel-selection` });
    setCommentPopover(null);
    setDraftTargets([]);
    pendingTextRef.current = "";
    pendingAnchorRef.current = null;
  }, [post]);

  const removeDraftTarget = useCallback(
    (key: string) => {
      if (!enabledRef.current) return;
      applyTargetRemoval(key);
    },
    [applyTargetRemoval],
  );

  const flashDraftTarget = useCallback(
    (key: string) => {
      post({ type: `${PREFIX}flash-target`, key });
    },
    [post],
  );

  const removeHighlight = useCallback(
    (id: string) => {
      post({ type: `${PREFIX}remove-mark`, id });
    },
    [post],
  );

  const clearAllHighlights = useCallback(() => {
    post({ type: `${PREFIX}clear-marks` });
  }, [post]);

  const applyAnnotations = useCallback(
    (anns: Annotation[]) => {
      for (const ann of anns) {
        if (ann.type === AnnotationType.GLOBAL_COMMENT) continue;
        const annType = ann.type === AnnotationType.DELETION ? "deletion" : "comment";
        // Multi-target annotations restore every additional target as a pin
        // under the same id (same badge number). Anchor-only and capped.
        const additionalAnchors = (ann.htmlAdditionalTargets ?? [])
          .map((t) => t.anchor)
          .filter((a): a is HtmlElementAnchor => !!a)
          .slice(0, maxTargetsRef.current);
        post({
          type: `${PREFIX}find-and-mark`,
          id: ann.id,
          originalText: ann.originalText,
          annotationType: annType,
          // Anchor-first restore: the bridge resolves the serialized element
          // and scopes the text search to it, falling back to document-wide.
          anchor: ann.htmlAnchor,
          additionalAnchors: additionalAnchors.length ? additionalAnchors : undefined,
        });
      }
    },
    [post],
  );

  return {
    commentPopover,
    handleCommentSubmit,
    handleCommentQuickLabel,
    handleCommentClose,
    removeHighlight,
    clearAllHighlights,
    applyAnnotations,
    draftTargets,
    removeDraftTarget,
    flashDraftTarget,
    composerFocusToken,
    createdAnnotationIds: mintedIdsRef.current,
  };
}
