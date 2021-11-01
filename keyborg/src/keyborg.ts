/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    KEYBORG_FOCUSIN,
    KEYBORG_UPDATE,
    KeyEsc,
    KeyTab,
    _dismissTimeout
} from './constants';
import { disposeFocusEvent, setupFocusEvent } from './FocusEvent';
import {
    Keyborg,
    KeyborgFocusInEvent,
    KeyborgInternal,
    UpdateDetail,
    WindowWithKeyborg,
    WindowWithKeyborgFocusEvent
} from './types';

let _windowRef: (WindowWithKeyborg & WindowWithKeyborgFocusEvent) | undefined;

function getKeyborg(): KeyborgInternal {
    if (_windowRef?.__keyborg) {
        return _windowRef.__keyborg as KeyborgInternal;
    }
    throw new Error(
        `There's no keyborg defined yet, invoke ${createKeyborgIfMissing.name}`
    );
}

function getWindowRef(): WindowWithKeyborg & WindowWithKeyborgFocusEvent {
    if (_windowRef) {
        return _windowRef;
    }
    throw new Error(
        `There's no keyborg defined yet, invoke ${createKeyborgIfMissing.name}`
    );
}

export function setNavigatingWithKeyboard(value: boolean): void {
    const core = getKeyborg();
    if (core._isNavigatingWithKeyboard === value) {
        return;
    }
    core._isNavigatingWithKeyboard = value;
    core.dispatchEvent(
        new CustomEvent<UpdateDetail>(KEYBORG_UPDATE, {
            detail: { isNavigatingWithKeyboard: value }
        })
    );
}

/**
 * @returns Whether the user is navigating with keyboard
 */
export function isNavigatingWithKeyboard(): boolean {
    return getKeyborg()._isNavigatingWithKeyboard;
}

/**
 * creates a global keyborg instance if missing
 * otherwise returns global keyborg instance
 * @returns
 */
export function createKeyborgIfMissing(windowRef: Window): Keyborg {
    _windowRef = windowRef as WindowWithKeyborg & WindowWithKeyborgFocusEvent;
    if (!_windowRef.__keyborg) {
        _windowRef.__keyborg = createKeyborg();
    }
    return _windowRef.__keyborg;
}

function createKeyborg(): KeyborgInternal {
    const eventTarget = new EventTarget();
    const listeners = new Set<Function>();
    const keyborg: KeyborgInternal = {
        _isMouseUsed: false,
        _isNavigatingWithKeyboard: false,
        dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
        addEventListener: (type, listener) => {
            listeners.add(listener);
            eventTarget.addEventListener(type, listener);
            if (listeners.size > 0) {
                dangerouslyActivateCore();
            }
        },
        removeEventListener: (type, listener) => {
            listeners.delete(listener);
            if (listeners.size === 0) {
                dangerouslyDisposeCore();
            }
            eventTarget.removeEventListener(type, listener);
        }
    };
    return keyborg;
}

function scheduleCoreDismiss(): void {
    const core = getKeyborg();
    const windowRef = getWindowRef();

    if (core._timeoutID) {
        windowRef.clearTimeout(core._timeoutID);
        core._timeoutID = undefined;
    }

    const previousActiveElement = windowRef.document.activeElement;

    core._timeoutID = windowRef.setTimeout(() => {
        core._timeoutID = undefined;

        const currentActiveElement = windowRef.document.activeElement;

        if (
            previousActiveElement &&
            currentActiveElement &&
            previousActiveElement === currentActiveElement
        ) {
            // Esc was pressed, currently focused element hasn't changed.
            // Just dismiss the keyboard navigation mode.
            setNavigatingWithKeyboard(false);
        }
    }, _dismissTimeout);
}

function dangerouslyActivateCore(): void {
    const windowRef = getWindowRef();
    const { document } = windowRef;
    document.addEventListener(KEYBORG_FOCUSIN, handleFocusIn, true); // Capture!
    document.addEventListener('mousedown', handleMouseDown, true); // Capture!
    addEventListener('keydown', handleKeyDown, true); // Capture!
    setupFocusEvent(windowRef);
}

function dangerouslyDisposeCore(): void {
    const windowRef = getWindowRef();
    const core = getKeyborg();

    if (core._timeoutID) {
        windowRef.clearTimeout(core._timeoutID);
        core._timeoutID = undefined;
    }

    disposeFocusEvent(windowRef);

    const doc = windowRef.document;

    doc.removeEventListener(KEYBORG_FOCUSIN, handleFocusIn, true); // Capture!
    doc.removeEventListener('mousedown', handleMouseDown, true); // Capture!
    windowRef.removeEventListener('keydown', handleKeyDown, true); // Capture!
    windowRef.__keyborg = undefined;
}

function handleFocusIn(event: KeyborgFocusInEvent): void {
    const core = getKeyborg();
    if (core._isMouseUsed) {
        core._isMouseUsed = false;
        return;
    }

    if (isNavigatingWithKeyboard()) {
        return;
    }

    const details = event.details;

    if (!details.relatedTarget) {
        return;
    }

    if (
        details.isFocusedProgrammatically ||
        details.isFocusedProgrammatically === undefined
    ) {
        // The element is focused programmatically, or the programmatic focus detection
        // is not working.
        return;
    }

    setNavigatingWithKeyboard(true);
}

function handleMouseDown(event: MouseEvent): void {
    if (
        event.buttons === 0 ||
        (event.clientX === 0 &&
            event.clientY === 0 &&
            event.screenX === 0 &&
            event.screenY === 0)
    ) {
        // This is most likely an event triggered by the screen reader to perform
        // an action on an element, do not dismiss the keyboard navigation mode.
        return;
    }

    const core = getKeyborg();

    core._isMouseUsed = true;

    setNavigatingWithKeyboard(false);
}

function handleKeyDown(event: KeyboardEvent): void {
    const value = isNavigatingWithKeyboard();

    if (!value && event.keyCode === KeyTab) {
        setNavigatingWithKeyboard(true);
    } else if (value && event.keyCode === KeyEsc) {
        scheduleCoreDismiss();
    }
}
