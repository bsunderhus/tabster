/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { KEYBORG_UPDATE } from './constants';

export interface KeyborgEventMap {
    [KEYBORG_UPDATE]: UpdateEvent;
}

/**
 * @internal
 */
export interface KeyborgInternal extends Keyborg {
    _timeoutID?: number;
    _isMouseUsed: boolean;
    _isNavigatingWithKeyboard: boolean;
}

export interface Keyborg extends EventTarget {
    addEventListener<K extends keyof KeyborgEventMap>(
        type: K,
        listener: (ev: KeyborgEventMap[K]) => void
    ): void;
    removeEventListener<K extends keyof KeyborgEventMap>(
        type: K,
        listener: (ev: KeyborgEventMap[K]) => void
    ): void;
    dispatchEvent<K extends keyof KeyborgEventMap>(
        event: KeyborgEventMap[K]
    ): boolean;
}

/**
 * @internal
 */
export interface WindowWithKeyborg extends Window {
    __keyborg?: Keyborg;
}

export type UpdateDetail = { isNavigatingWithKeyboard: boolean };
export type UpdateEvent = CustomEvent<UpdateDetail>;

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
