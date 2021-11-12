/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    disposeFocusEvent,
    KeyborgFocusInEvent,
    KEYBORG_FOCUSIN,
    setupFocusEvent,
    WindowWithKeyborgFocusEvent
} from './FocusEvent';

import {
    assertKeyborgActiveState,
    isKeyborgActiveState,
    KeyborgEventMap,
    KeyborgOptions,
    KeyborgTypestate,
    KEYBORG_UPDATE,
    UpdateDetail,
    WindowWithKeyborg
} from './types';

const KeyTab = 9;
const KeyEsc = 27;

let _windowRef: WindowWithKeyborg | undefined = undefined;

/**
 * creates a global keyborg instance if missing
 * otherwise returns global keyborg instance
 * @returns
 */
export function createKeyborgIfMissing(windowRef: Window, options?: Partial<KeyborgOptions>): Keyborg {
    _windowRef = windowRef as WindowWithKeyborg;
    if (!_windowRef.__keyborg) {
        _windowRef.__keyborg = new Keyborg(_windowRef, options);
    }
    return _windowRef.__keyborg;
}

export class Keyborg {
    private _state: KeyborgTypestate = {
        value: 'disposed',
        context: {
            windowRef: undefined,
            isMouseUsed: false,
            isNavigatingWithKeyboard: false,
            listeners: new Set<WeakRef<EventListener>>(),
            eventTarget: new EventTarget()
        }
    };
    private _options: KeyborgOptions;

    constructor(windowRef: Window, options?: Partial<KeyborgOptions>) {
        this._options = { dismissTimeout: 500, ...options };
        // activate listeners when keyborg instance is created
        this._dangerouslyActivate(windowRef);
    }

    public isNavigatingWithKeyboard() {
        return this._state.context.isNavigatingWithKeyboard;
    }

    public setNavigatingWithKeyboard(value: boolean) {
        if (this._state.context.isNavigatingWithKeyboard === value) {
            return;
        }
        this._state.context.isNavigatingWithKeyboard = value;
        this._state.context.eventTarget.dispatchEvent(
            new CustomEvent<UpdateDetail>(KEYBORG_UPDATE, {
                detail: { isNavigatingWithKeyboard: value }
            })
        );
    }

    public addEventListener<K extends keyof KeyborgEventMap>(
        type: K,
        listener: (ev: KeyborgEventMap[K]) => void
    ): void {
        this._state.context.listeners.add(new WeakRef(listener));
        this._state.context.eventTarget.addEventListener(type, listener);
    }

    public removeEventListener<K extends keyof KeyborgEventMap>(
        type: K,
        listener: (ev: KeyborgEventMap[K]) => void
    ): void {
        for (const ref of this._state.context.listeners) {
            const listenerOrUndef = ref.deref();
            if (listenerOrUndef === listener || listenerOrUndef === undefined) {
                this._state.context.listeners.delete(ref);
            }
        }
        // disposes keyborg instance if no one is listening to it
        if (this._state.context.listeners.size === 0) {
            this._dangerouslyDispose();
        }
        this._state.context.eventTarget.removeEventListener(type, listener);
    }

    /**
     * The prefix dangerously indicates that this method doesn't do any verification!
     *
     * Adds event listeners to document
     */
    private _dangerouslyActivate(windowRef: Window): void {
        this._state.value = 'active';
        this._state.context.windowRef = windowRef as WindowWithKeyborg &
            WindowWithKeyborgFocusEvent;
        const { document } = windowRef;
        document.addEventListener(KEYBORG_FOCUSIN, this._handleFocusIn, true); // Capture!
        document.addEventListener('mousedown', this._handleMouseDown, true); // Capture!
        addEventListener('keydown', this._handleKeyDown, true); // Capture!
        setupFocusEvent(this._state.context.windowRef);
        this._state.context.windowRef.__keyborg = this;
    }

    /**
     * The prefix dangerously indicates that this method doesn't do any verification!
     *
     * Removes event listeners from document, clears existing timeout,
     * and finally, removes this instance from window reference and also removes window reference
     */
    private _dangerouslyDispose(): void {
        if (isKeyborgActiveState(this._state)) {
            if (this._state.context.timeoutID) {
                this._state.context.windowRef.clearTimeout(
                    this._state.context.timeoutID
                );
                this._state.context.timeoutID = undefined;
            }

            disposeFocusEvent(this._state.context.windowRef);

            const doc = this._state.context.windowRef.document;

            doc.removeEventListener(KEYBORG_FOCUSIN, this._handleFocusIn, true); // Capture!
            doc.removeEventListener('mousedown', this._handleMouseDown, true); // Capture!
            this._state.context.windowRef.removeEventListener(
                'keydown',
                this._handleKeyDown,
                true
            ); // Capture!
            (_windowRef as WindowWithKeyborg).__keyborg = undefined;
            _windowRef = undefined;
        }
        this._state.value = 'disposed';
        this._state.context.windowRef = undefined;
    }

    /**
     * Schedules dismissing, which means setting navigating with keyboard to false,
     * most likely invoked when ESC is pressed
     */
    private _scheduleDismiss(): void {
        assertKeyborgActiveState(this._state, this._scheduleDismiss.name);
        if (this._state.context.timeoutID) {
            this._state.context.windowRef.clearTimeout(
                this._state.context.timeoutID
            );
            this._state.context.timeoutID = undefined;
        }

        const previousActiveElement = this._state.context.windowRef.document
            .activeElement;

        this._state.context.timeoutID = this._state.context.windowRef.setTimeout(
            () => {
                if (isKeyborgActiveState(this._state)) {
                    this._state.context.timeoutID = undefined;

                    const currentActiveElement = this._state.context.windowRef
                        .document.activeElement;

                    if (
                        previousActiveElement &&
                        currentActiveElement &&
                        previousActiveElement === currentActiveElement
                    ) {
                        // Esc was pressed, currently focused element hasn't changed.
                        // Just dismiss the keyboard navigation mode.
                        this.setNavigatingWithKeyboard(false);
                    }
                }
            },
            this._options.dismissTimeout
        );
    }

    /**
     * on mousedown
     *
     * sets the mouse has been used and is navigating with mouse
     *
     * the exception is for the case when it's a click simulation done by screen readers
     */
    private _handleMouseDown = (event: MouseEvent): void => {
        assertKeyborgActiveState(this._state, this._handleMouseDown.name);
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

        this._state.context.isMouseUsed = true;

        this.setNavigatingWithKeyboard(false);
    }

    private _handleFocusIn = (event: KeyborgFocusInEvent): void => {
        assertKeyborgActiveState(this._state, this._handleFocusIn.name);
        if (this._state.context.isMouseUsed) {
            this._state.context.isMouseUsed = false;
            return;
        }

        if (this.isNavigatingWithKeyboard()) {
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

        this.setNavigatingWithKeyboard(true);
    }

    /**
     * on keydown
     *
     * if keyborg is not navigating with keyboard and tab is pressed
     * set navigating with keyboard
     *
     * else if keyborg is navigating with keyboard and ESC is pressed
     * invoke scheduling dismiss
     */
    private _handleKeyDown = (event: KeyboardEvent): void => {
        assertKeyborgActiveState(this._state, this._handleKeyDown.name);
        if (
            !this._state.context.isNavigatingWithKeyboard &&
            event.keyCode === KeyTab
        ) {
            this.setNavigatingWithKeyboard(true);
        } else if (
            this._state.context.isNavigatingWithKeyboard &&
            event.keyCode === KeyEsc
        ) {
            this._scheduleDismiss();
        }
    }
}

/**
 * Gets global instance of keyborg and invokes setNavigatingWithKeyboard method
 * to force navigation value
 */
export function setNavigatingWithKeyboard(value: boolean): void {
    if (_windowRef?.__keyborg) {
        return _windowRef.__keyborg.setNavigatingWithKeyboard(value);
    }
    throw new Error(
        `There's no keyborg defined yet, invoke ${createKeyborgIfMissing.name} before ${setNavigatingWithKeyboard.name}`
    );
}

/**
 * Gets global instance of keyborg and invokes isNavigatingWithKeyboard method
 * @returns Whether the user is navigating with keyboard
 */
export function isNavigatingWithKeyboard(): boolean {
    if (_windowRef?.__keyborg) {
        return _windowRef.__keyborg.isNavigatingWithKeyboard();
    }
    throw new Error(
        `There's no keyborg defined yet, invoke ${createKeyborgIfMissing.name} before ${isNavigatingWithKeyboard.name}`
    );
}
