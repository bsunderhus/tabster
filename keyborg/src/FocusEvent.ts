/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
 export interface KeyborgFocus {
    (): void;
    /**
     * This is the native `focus` function that is retained so that it can be restored when keyborg is disposed
     */
    __keyborgNativeFocus(options?: FocusOptions | undefined): void;
}

/**
 * @internal
 */
 export interface KeyborgFocusEventData {
    focusInHandler(e: FocusEvent): void;
    lastFocusedProgrammatically?: WeakRef<HTMLElement>;
}

/**
 * Extends the global window with keyborg focus event data
 * @internal
 */
 export interface WindowWithKeyborgFocusEvent extends Window {
    HTMLElement: typeof HTMLElement;
    __keyborgData?: KeyborgFocusEventData;
}

/**
 * @internal
 */
 export interface KeyborgFocusInEventDetails {
    relatedTarget?: HTMLElement;
    isFocusedProgrammatically?: boolean;
}

/**
 * @internal
 */
 export interface KeyborgFocusInEvent extends Event {
    details: KeyborgFocusInEventDetails;
}

 export const KEYBORG_FOCUSIN = 'keyborg:focusin' as const;

 function canOverrideNativeFocus(
    windowRef: WindowWithKeyborgFocusEvent
): boolean {
    const HTMLElement = windowRef.HTMLElement;
    const originalFocus = HTMLElement.prototype.focus;

    let isCustomFocusCalled = false;

    HTMLElement.prototype.focus = function focus(): void {
        isCustomFocusCalled = true;
    };

    const btn = windowRef.document.createElement('button');

    btn.focus();

    HTMLElement.prototype.focus = originalFocus;

    return isCustomFocusCalled;
}

 let _canOverrideNativeFocus = false;

/**
 * Guarantees that the native `focus` will be used
 */
 export function nativeFocus(element: HTMLElement): void {
    const focus = element.focus as KeyborgFocus;

    if (focus.__keyborgNativeFocus) {
        focus.__keyborgNativeFocus.call(element);
    } else {
        element.focus();
    }
}

/**
 * @param windowRef The window that stores keyborg focus events
 * @returns The last element focused with element.focus()
 */
 export function getLastFocusedProgrammatically(
    windowRef: WindowWithKeyborgFocusEvent
): HTMLElement | null | undefined {
    const keyborgNativeFocusEvent = windowRef.__keyborgData;

    return keyborgNativeFocusEvent
        ? keyborgNativeFocusEvent.lastFocusedProgrammatically?.deref() || null
        : undefined;
}

/**
 * Overrides the native `focus` and setups the keyborg focus event
 */
 export function setupFocusEvent(windowRef: WindowWithKeyborgFocusEvent): void {
    if (!_canOverrideNativeFocus) {
        _canOverrideNativeFocus = canOverrideNativeFocus(windowRef);
    }

    const originalFocus = windowRef.HTMLElement.prototype.focus;

    if ((originalFocus as KeyborgFocus).__keyborgNativeFocus) {
        // Already set up.
        return;
    }

    windowRef.HTMLElement.prototype.focus = focus;

    const data: KeyborgFocusEventData = (windowRef.__keyborgData = {
        focusInHandler: (e: FocusEvent) => {
            const target = e.target as HTMLElement;
            if (!target) {
                return;
            }

            const event = document.createEvent(
                'HTMLEvents'
            ) as KeyborgFocusInEvent;

            event.initEvent(KEYBORG_FOCUSIN, true, true);

            const details: KeyborgFocusInEventDetails = {
                relatedTarget: (e.relatedTarget as HTMLElement) || undefined
            };

            if (_canOverrideNativeFocus || data.lastFocusedProgrammatically) {
                details.isFocusedProgrammatically =
                    target === data.lastFocusedProgrammatically?.deref();

                data.lastFocusedProgrammatically = undefined;
            }

            event.details = details;

            target.dispatchEvent(event);
        }
    });

    windowRef.document.addEventListener(
        'focusin',
        windowRef.__keyborgData.focusInHandler,
        true
    );

    function focus(this: HTMLElement) {
        const keyborgNativeFocusEvent = (windowRef as WindowWithKeyborgFocusEvent)
            .__keyborgData;

        if (keyborgNativeFocusEvent) {
            keyborgNativeFocusEvent.lastFocusedProgrammatically = new WeakRef(
                this
            );
        }

        return originalFocus.apply(this, arguments);
    }

    (focus as KeyborgFocus).__keyborgNativeFocus = originalFocus;
}

/**
 * Removes keyborg event listeners and custom focus override
 * @param win The window that stores keyborg focus events
 */
 export function disposeFocusEvent(win: Window): void {
    const windowRef = win as WindowWithKeyborgFocusEvent;
    const proto = windowRef.HTMLElement.prototype;
    const origFocus = (proto.focus as KeyborgFocus).__keyborgNativeFocus;
    const keyborgNativeFocusEvent = windowRef.__keyborgData;

    if (keyborgNativeFocusEvent) {
        windowRef.document.removeEventListener(
            'focusin',
            keyborgNativeFocusEvent.focusInHandler,
            true
        );
        delete windowRef.__keyborgData;
    }

    if (origFocus) {
        proto.focus = origFocus;
    }
}
